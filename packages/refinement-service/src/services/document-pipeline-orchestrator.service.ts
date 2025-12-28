import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { DocumentPipelineManager, type DocumentTask } from './document-pipeline-manager.service';
import { DocumentProcessorService } from './document-processor.service';
import { SemanticMapperService } from './semantic-mapper.service';
import { ContentTransformerService } from './content-transformer.service';
import { PromotionWorker } from './promotion-worker.service';

export class DocumentPipelineOrchestrator {
  private pipelineManager: DocumentPipelineManager;
  private documentProcessor: DocumentProcessorService;
  private semanticMapper: SemanticMapperService | null;
  private contentTransformer: ContentTransformerService | null;
  private promotionWorker: PromotionWorker;

  constructor(
    private readonly pool: Pool,
    semanticMapper: SemanticMapperService | null,
    contentTransformer: ContentTransformerService | null,
    promotionWorker: PromotionWorker
  ) {
    this.pipelineManager = new DocumentPipelineManager(pool);
    this.documentProcessor = new DocumentProcessorService(pool);
    this.semanticMapper = semanticMapper;
    this.contentTransformer = contentTransformer;
    this.promotionWorker = promotionWorker;
  }

  async processActivePipelines(): Promise<number> {
    let processedCount = 0;

    const processingPipelines = await this.pipelineManager.getPipelinesByStatus('processing', 10);

    for (const pipeline of processingPipelines) {
      try {
        const processed = await this.processPipeline(pipeline.id);
        if (processed) {
          processedCount++;
        }
      } catch (error) {
        logger.error(
          { pipelineId: pipeline.id, error: (error as Error).message },
          'Failed to process pipeline'
        );

        await this.pipelineManager.completePipeline(pipeline.id, false, (error as Error).message);
      }
    }

    const mappingPipelines = await this.pool.query<{ id: string }>(
      `SELECT id FROM pipelines
       WHERE status = 'completed'
         AND (current_stage = 'mapping' OR current_stage = 'transforming' OR current_stage = 'completed')
       LIMIT 10`
    );

    for (const row of mappingPipelines.rows) {
      try {
        const processed = await this.processPipeline(row.id);
        if (processed) {
          processedCount++;
        }
      } catch (error) {
        logger.error(
          { pipelineId: row.id, error: (error as Error).message },
          'Failed to process mapping pipeline'
        );
      }
    }

    const pendingPipelines = await this.pipelineManager.getPipelinesByStatus('pending', 5);

    for (const pipeline of pendingPipelines) {
      try {
        await this.startPipeline(pipeline.id);
        processedCount++;
      } catch (error) {
        logger.error(
          { pipelineId: pipeline.id, error: (error as Error).message },
          'Failed to start pipeline'
        );
      }
    }

    return processedCount;
  }

  async startPipeline(pipelineId: string): Promise<void> {
    const pipeline = await this.pipelineManager.getPipeline(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }

    if (pipeline.status !== 'pending') {
      return;
    }

    logger.info({ pipelineId, documentId: pipeline.documentId }, 'Starting pipeline');

    await this.pipelineManager.updatePipelineStage(pipelineId, 'extracting', 'processing');

    await this.processDocumentExtraction(pipeline.documentId, pipelineId);
  }

  async processPipeline(pipelineId: string): Promise<boolean> {
    const pipeline = await this.pipelineManager.getPipeline(pipelineId);
    if (!pipeline) {
      return false;
    }

    if (
      pipeline.currentStage === 'mapping' ||
      pipeline.currentStage === 'transforming' ||
      pipeline.currentStage === 'completed'
    ) {
      await this.createTransformationTasksForConfirmedMappings(pipelineId);
    }

    if (pipeline.status === 'failed') {
      return false;
    }

    const nextTask = await this.pipelineManager.getNextTask(pipelineId);

    if (!nextTask) {
      const allTasks = await this.pipelineManager.getPipelineTasks(pipelineId);
      const allCompleted = allTasks.every((t) => t.status === 'completed');
      const anyFailed = allTasks.some((t) => t.status === 'failed');

      if (anyFailed) {
        await this.pipelineManager.completePipeline(pipelineId, false, 'Some tasks failed');
        return false;
      }

      if (allCompleted && allTasks.length > 0) {
        const pipelineResult = await this.pool.query<{ document_id: string }>(
          `SELECT document_id FROM pipelines WHERE id = $1`,
          [pipelineId]
        );

        if (pipelineResult.rows.length > 0) {
          const documentId = pipelineResult.rows[0].document_id;

          const confirmedMappingsResult = await this.pool.query<{ count: string }>(
            `SELECT COUNT(*) as count
             FROM content_topic_mappings m
             JOIN raw_content_chunks c ON c.id = m.chunk_id
             WHERE c.document_id = $1
               AND m.status = 'confirmed'
               AND NOT EXISTS (
                 SELECT 1 FROM document_processing_tasks t
                 WHERE t.pipeline_id = $2
                   AND t.task_type = 'transform'
                   AND t.item_id = m.id
               )`,
            [documentId, pipelineId]
          );

          const confirmedMappingsCount = parseInt(
            confirmedMappingsResult.rows[0]?.count || '0',
            10
          );

          if (confirmedMappingsCount > 0) {
            logger.info(
              { pipelineId, confirmedMappings: confirmedMappingsCount },
              'Pipeline has confirmed mappings waiting for transformation - will process on next cycle'
            );
            return false;
          }
        }

        const pipelineTasksResult = await this.pool.query<{
          count: number;
          approved_count: number;
        }>(
          `SELECT
             COUNT(*) as count,
             COUNT(*) FILTER (WHERE current_stage = 'APPROVED') as approved_count
           FROM pipeline_tasks
           WHERE pipeline_id = $1`,
          [pipelineId]
        );

        const { count, approved_count } = pipelineTasksResult.rows[0] || {
          count: 0,
          approved_count: 0,
        };

        if (count > 0 && approved_count < count) {
          logger.info(
            { pipelineId, totalContent: count, approvedContent: approved_count },
            'Pipeline document processing complete, waiting for content approval'
          );
          return false;
        }

        await this.pipelineManager.completePipeline(pipelineId, true);
        return false;
      }

      return false;
    }

    await this.processTask(nextTask);
    return true;
  }

  private async processTask(task: DocumentTask): Promise<void> {
    logger.info(
      { taskId: task.id, taskType: task.taskType, pipelineId: task.pipelineId },
      'Processing task'
    );

    await this.pipelineManager.updateTaskStatus({
      taskId: task.id,
      status: 'processing',
    });

    try {
      switch (task.taskType) {
        case 'extract':
          await this.executeExtractionTask(task);
          break;
        case 'chunk':
          await this.executeChunkingTask(task);
          break;
        case 'map':
          await this.executeMappingTask(task);
          break;
        case 'transform':
          await this.executeTransformationTask(task);
          break;
        case 'validate':
          await this.executeValidationTask(task);
          break;
        case 'approve':
          await this.executeApprovalTask(task);
          break;
        default:
          throw new Error(`Unknown task type: ${task.taskType as string}`);
      }

      await this.pipelineManager.updateTaskStatus({
        taskId: task.id,
        status: 'completed',
      });
    } catch (error) {
      logger.error(
        { taskId: task.id, taskType: task.taskType, error: (error as Error).message },
        'Task failed'
      );

      await this.pipelineManager.updateTaskStatus({
        taskId: task.id,
        status: 'failed',
        errorMessage: (error as Error).message,
      });

      throw error;
    }
  }

  private async processDocumentExtraction(documentId: string, pipelineId: string): Promise<void> {
    const docResult = await this.pool.query<{ id: string; status: string }>(
      `SELECT id, status FROM document_sources WHERE id = $1`,
      [documentId]
    );

    const doc = docResult.rows[0];
    if (!doc || doc.status !== 'pending') {
      return;
    }

    const task = await this.pipelineManager.createTask({
      pipelineId,
      itemId: documentId,
      taskType: 'extract',
    });

    logger.info({ taskId: task.id, documentId }, 'Created extraction task');
  }

  private async executeExtractionTask(task: DocumentTask): Promise<void> {
    const documentId = task.itemId;
    if (!documentId) {
      throw new Error('Document ID is required for extraction task');
    }

    await this.documentProcessor.extractText(documentId);

    await this.pipelineManager.createTask({
      pipelineId: task.pipelineId,
      itemId: documentId,
      taskType: 'chunk',
      dependsOnTaskId: task.id,
    });

    await this.pipelineManager.updatePipelineStage(task.pipelineId, 'chunking');
  }

  private async executeChunkingTask(task: DocumentTask): Promise<void> {
    const documentId = task.itemId;
    if (!documentId) {
      throw new Error('Document ID is required for chunking task');
    }

    await this.documentProcessor.chunkDocument(documentId);

    const chunksResult = await this.pool.query<{ id: string }>(
      `SELECT id FROM raw_content_chunks WHERE document_id = $1 LIMIT 1`,
      [documentId]
    );

    if (chunksResult.rows.length > 0 && this.semanticMapper) {
      await this.pipelineManager.createTask({
        pipelineId: task.pipelineId,
        itemId: documentId,
        taskType: 'map',
        dependsOnTaskId: task.id,
      });

      await this.pipelineManager.updatePipelineStage(task.pipelineId, 'mapping');
    }
  }

  private async executeMappingTask(task: DocumentTask): Promise<void> {
    if (!this.semanticMapper) {
      throw new Error('Semantic mapper not configured');
    }

    const documentId = task.itemId;
    if (!documentId) {
      throw new Error('Document ID is required for mapping task');
    }

    const docResult = await this.pool.query<{ level_id: string }>(
      `SELECT
        COALESCE(
          (SELECT l.id FROM curriculum_levels l
           WHERE l.language = d.language AND l.cefr_level = d.target_level LIMIT 1),
          (SELECT l.id FROM curriculum_levels l
           WHERE l.language = d.language AND l.cefr_level = 'A1' LIMIT 1)
        ) as level_id
       FROM document_sources d
       WHERE d.id = $1`,
      [documentId]
    );

    const levelId = docResult.rows[0]?.level_id;
    if (!levelId) {
      throw new Error('Cannot find curriculum level for document');
    }

    await this.semanticMapper.mapChunksToTopics(documentId, levelId);

    await this.pipelineManager.updatePipelineStage(task.pipelineId, 'mapping');

    logger.info(
      { pipelineId: task.pipelineId, documentId },
      'Mapping completed - waiting for operator to confirm mappings'
    );
  }

  private async executeTransformationTask(task: DocumentTask): Promise<void> {
    if (!this.contentTransformer) {
      throw new Error('Content transformer not configured');
    }

    const mappingId = task.itemId;
    if (!mappingId) {
      throw new Error('Mapping ID is required for transformation task');
    }

    await this.contentTransformer.transformMapping(mappingId);

    const transformationJobResult = await this.pool.query<{ id: string }>(
      `SELECT id FROM transformation_jobs WHERE mapping_id = $1`,
      [mappingId]
    );

    if (transformationJobResult.rows.length === 0) {
      logger.warn({ mappingId }, 'No transformation job found for mapping');
      return;
    }

    const transformationJobId = transformationJobResult.rows[0].id;

    const draftsResult = await this.pool.query<{
      id: string;
      data_type: string;
      item_type: string;
    }>(
      `SELECT id, data_type, 'draft' as item_type
       FROM drafts
       WHERE transformation_job_id = $1`,
      [transformationJobId]
    );

    for (const draft of draftsResult.rows) {
      logger.info(
        {
          pipelineId: task.pipelineId,
          draftId: draft.id,
          dataType: draft.data_type,
          mappingId,
        },
        'Creating pipeline_task for draft'
      );

      await this.pool.query(
        `INSERT INTO pipeline_tasks
         (pipeline_id, item_id, item_type, data_type, current_status, current_stage, mapping_id)
         VALUES ($1, $2, $3, $4, 'pending', 'DRAFT', $5)`,
        [task.pipelineId, draft.id, draft.item_type, draft.data_type, mappingId]
      );

      logger.info(
        { draftId: draft.id, dataType: draft.data_type, pipelineId: task.pipelineId },
        'Created pipeline task for draft - will track DRAFT → CANDIDATE → VALIDATED → APPROVED'
      );
    }

    await this.pipelineManager.updatePipelineStage(task.pipelineId, 'validating');
  }

  private async executeValidationTask(_task: DocumentTask): Promise<void> {
    await this.promotionWorker.processBatch(10);
  }

  private async executeApprovalTask(_task: DocumentTask): Promise<void> {}

  async createTransformationTasksForMapping(mappingId: string): Promise<void> {
    const result = await this.pool.query<{
      document_id: string;
      pipeline_id: string;
    }>(
      `SELECT
        c.document_id,
        p.id as pipeline_id
       FROM content_topic_mappings m
       JOIN raw_content_chunks c ON c.id = m.chunk_id
       JOIN pipelines p ON p.document_id = c.document_id
       WHERE m.id = $1`,
      [mappingId]
    );

    if (result.rows.length === 0) {
      return;
    }

    const { pipeline_id } = result.rows[0];

    await this.pipelineManager.createTask({
      pipelineId: pipeline_id,
      itemId: mappingId,
      taskType: 'transform',
    });

    logger.info({ mappingId, pipelineId: pipeline_id }, 'Created transformation task');
  }

  private async createTransformationTasksForConfirmedMappings(pipelineId: string): Promise<void> {
    const pipelineResult = await this.pool.query<{ document_id: string }>(
      `SELECT document_id FROM pipelines WHERE id = $1`,
      [pipelineId]
    );

    if (pipelineResult.rows.length === 0) {
      return;
    }

    const documentId = pipelineResult.rows[0].document_id;

    const mappingsResult = await this.pool.query<{ id: string }>(
      `SELECT m.id
       FROM content_topic_mappings m
       JOIN raw_content_chunks c ON c.id = m.chunk_id
       WHERE c.document_id = $1
         AND m.status = 'confirmed'
         AND NOT EXISTS (
           SELECT 1 FROM document_processing_tasks t
           WHERE t.pipeline_id = $2
             AND t.task_type = 'transform'
             AND t.item_id = m.id
         )`,
      [documentId, pipelineId]
    );

    for (const row of mappingsResult.rows) {
      await this.pipelineManager.createTask({
        pipelineId,
        itemId: row.id,
        taskType: 'transform',
      });

      logger.info(
        { mappingId: row.id, pipelineId },
        'Created transformation task for confirmed mapping'
      );
    }

    if (mappingsResult.rows.length > 0) {
      await this.pipelineManager.updatePipelineStage(pipelineId, 'transforming', 'processing');
      logger.info(
        { pipelineId, tasksCreated: mappingsResult.rows.length },
        'Re-opened completed pipeline for transformation'
      );
    }
  }
}
