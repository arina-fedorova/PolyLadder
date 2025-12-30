import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { DocumentPipelineManager, type DocumentTask } from './document-pipeline-manager.service';
import { DocumentProcessorService } from './document-processor.service';
import { SemanticSplitService } from './semantic-split.service';
import { ContentTransformerService } from './content-transformer.service';
import { PromotionWorker } from './promotion-worker.service';

export class DocumentPipelineOrchestrator {
  private pipelineManager: DocumentPipelineManager;
  private documentProcessor: DocumentProcessorService;
  private semanticSplitService: SemanticSplitService | null;
  private contentTransformer: ContentTransformerService | null;
  private promotionWorker: PromotionWorker;

  constructor(
    private readonly pool: Pool,
    semanticSplitService: SemanticSplitService | null,
    contentTransformer: ContentTransformerService | null,
    promotionWorker: PromotionWorker
  ) {
    this.pipelineManager = new DocumentPipelineManager(pool);
    this.documentProcessor = new DocumentProcessorService(pool);
    this.semanticSplitService = semanticSplitService;
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

          // Check if all drafts are processed (have candidates)
          const unprocessedDraftsResult = await this.pool.query<{ count: string }>(
            `SELECT COUNT(*) as count
             FROM drafts d
             WHERE d.document_id = $1
               AND NOT EXISTS (
                 SELECT 1 FROM candidates c WHERE c.draft_id = d.id
               )`,
            [documentId]
          );

          const unprocessedDraftsCount = parseInt(
            unprocessedDraftsResult.rows[0]?.count || '0',
            10
          );

          if (unprocessedDraftsCount > 0) {
            logger.info(
              { pipelineId, unprocessedDrafts: unprocessedDraftsCount },
              'Pipeline has unprocessed drafts - waiting for normalization'
            );
            return false;
          }

          const unprocessedCandidatesResult = await this.pool.query<{ count: string }>(
            `SELECT COUNT(*) as count
             FROM candidates c
             JOIN drafts d ON d.id = c.draft_id
             WHERE d.document_id = $1
               AND NOT EXISTS (
                 SELECT 1 FROM validated v WHERE v.candidate_id = c.id
               )
               AND NOT EXISTS (
                 SELECT 1 FROM document_processing_tasks t
                 WHERE t.pipeline_id = $2
                   AND t.task_type = 'transform'
                   AND t.item_id = c.id
               )`,
            [documentId, pipelineId]
          );

          const unprocessedCandidatesCount = parseInt(
            unprocessedCandidatesResult.rows[0]?.count || '0',
            10
          );

          if (unprocessedCandidatesCount > 0) {
            await this.createTransformationTasksForCandidates(pipelineId, documentId);
            logger.info(
              { pipelineId, candidatesToTransform: unprocessedCandidatesCount },
              'Created transformation tasks for candidates'
            );
            return true;
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
    if (!doc) {
      logger.warn({ documentId }, 'Document not found for extraction');
      return;
    }

    if (doc.status !== 'pending' && doc.status !== 'extracting' && doc.status !== 'chunking') {
      logger.info(
        { documentId, status: doc.status },
        'Document already processed or in incompatible status, skipping extraction task creation'
      );
      return;
    }

    const existingTaskResult = await this.pool.query<{ id: string }>(
      `SELECT id FROM document_processing_tasks
       WHERE pipeline_id = $1
         AND task_type = 'extract'
         AND status IN ('pending', 'processing')`,
      [pipelineId]
    );

    if (existingTaskResult.rows.length > 0) {
      logger.info(
        { documentId, pipelineId, taskId: existingTaskResult.rows[0].id },
        'Extraction task already exists, skipping creation'
      );
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
      `SELECT id FROM raw_content_chunks WHERE document_id = $1`,
      [documentId]
    );

    if (chunksResult.rows.length > 0 && this.semanticSplitService) {
      for (const chunk of chunksResult.rows) {
        await this.pipelineManager.createTask({
          pipelineId: task.pipelineId,
          itemId: chunk.id,
          taskType: 'map',
          dependsOnTaskId: task.id,
        });
      }

      await this.pipelineManager.updatePipelineStage(task.pipelineId, 'mapping');
    }
  }

  private async executeMappingTask(task: DocumentTask): Promise<void> {
    if (!this.semanticSplitService) {
      throw new Error('Semantic split service not configured');
    }

    const chunkId = task.itemId;
    if (!chunkId) {
      throw new Error('Chunk ID is required for mapping task');
    }

    const draftsCreated = await this.semanticSplitService.splitChunk(chunkId, task.pipelineId);

    if (draftsCreated > 0) {
      logger.info(
        { pipelineId: task.pipelineId, chunkId, draftsCreated },
        'Semantic split completed - drafts created'
      );
    } else {
      logger.info(
        { pipelineId: task.pipelineId, chunkId },
        'Semantic split completed - no drafts created (may already exist or no matching topics)'
      );
    }

    const remainingChunksResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM raw_content_chunks c
       JOIN pipelines p ON p.document_id = c.document_id
       WHERE p.id = $1
         AND NOT EXISTS (
           SELECT 1 FROM document_processing_tasks t
           WHERE t.pipeline_id = $1
             AND t.task_type = 'map'
             AND t.status = 'completed'
             AND t.item_id = c.id
         )`,
      [task.pipelineId]
    );

    const remainingChunks = parseInt(remainingChunksResult.rows[0]?.count || '0', 10);

    if (remainingChunks === 0) {
      await this.pipelineManager.updatePipelineStage(task.pipelineId, 'draft_review');
      logger.info(
        { pipelineId: task.pipelineId },
        'All chunks processed - waiting for draft review'
      );
    }
  }

  private async executeTransformationTask(task: DocumentTask): Promise<void> {
    if (!this.contentTransformer) {
      throw new Error('Content transformer not configured');
    }

    const candidateId = task.itemId;
    if (!candidateId) {
      throw new Error('Candidate ID is required for transformation task');
    }

    const result = await this.contentTransformer.transformCandidate(candidateId);

    if (!result) {
      logger.warn({ candidateId }, 'Transformation returned no result');
      return;
    }

    logger.info(
      {
        pipelineId: task.pipelineId,
        candidateId,
        validatedId: result.validatedId,
      },
      'Candidate transformed to validated'
    );

    const remainingCandidatesResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM candidates c
       JOIN drafts d ON d.id = c.draft_id
       JOIN pipelines p ON p.document_id = d.document_id
       WHERE p.id = $1
         AND NOT EXISTS (
           SELECT 1 FROM validated v WHERE v.candidate_id = c.id
         )`,
      [task.pipelineId]
    );

    const remainingCandidates = parseInt(remainingCandidatesResult.rows[0]?.count || '0', 10);

    if (remainingCandidates === 0) {
      await this.pipelineManager.updatePipelineStage(task.pipelineId, 'validating');
      logger.info(
        { pipelineId: task.pipelineId },
        'All candidates transformed - moving to validation stage'
      );
    }
  }

  private async executeValidationTask(_task: DocumentTask): Promise<void> {
    await this.promotionWorker.processBatch(10);
  }

  private async executeApprovalTask(_task: DocumentTask): Promise<void> {}

  private async createTransformationTasksForCandidates(
    pipelineId: string,
    documentId: string
  ): Promise<void> {
    const candidatesResult = await this.pool.query<{ id: string }>(
      `SELECT c.id
       FROM candidates c
       JOIN drafts d ON d.id = c.draft_id
       WHERE d.document_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM validated v WHERE v.candidate_id = c.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM document_processing_tasks t
           WHERE t.pipeline_id = $2
             AND t.task_type = 'transform'
             AND t.item_id = c.id
         )`,
      [documentId, pipelineId]
    );

    for (const row of candidatesResult.rows) {
      await this.pipelineManager.createTask({
        pipelineId,
        itemId: row.id,
        taskType: 'transform',
      });

      logger.info({ candidateId: row.id, pipelineId }, 'Created transformation task for candidate');
    }

    if (candidatesResult.rows.length > 0) {
      await this.pipelineManager.updatePipelineStage(pipelineId, 'transforming', 'processing');
      logger.info(
        { pipelineId, tasksCreated: candidatesResult.rows.length },
        'Created transformation tasks for candidates'
      );
    }
  }
}
