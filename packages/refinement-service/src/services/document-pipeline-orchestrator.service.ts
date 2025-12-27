import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { DocumentPipelineManager } from './document-pipeline-manager.service';
import { DocumentProcessorService } from './document-processor.service';
import { SemanticMapperService } from './semantic-mapper.service';
import { ContentTransformerService } from './content-transformer.service';
import { PromotionWorker } from './promotion-worker.service';

/**
 * Document Pipeline Orchestrator
 *
 * Orchestrates the complete document processing pipeline:
 * 1. Document Upload → Create Pipeline
 * 2. Extract Text → Create extraction tasks
 * 3. Chunk Text → Create chunking tasks
 * 4. Map Chunks to Topics → Create mapping tasks
 * 5. Transform to Learning Content → Create transformation tasks (draft creation)
 * 6. Validate Content → Promote drafts → candidates → validated
 * 7. Approve Content → Move to approved tables
 *
 * Each stage creates tasks in the pipeline, ensuring full traceability.
 */

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

  /**
   * Process all active pipelines
   * This is called in the main loop
   */
  async processActivePipelines(): Promise<number> {
    let processedCount = 0;

    // Get all processing pipelines
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

        await this.pipelineManager.completePipeline(
          pipeline.id,
          false,
          (error as Error).message
        );
      }
    }

    // Also check for pending pipelines and start them
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

  /**
   * Start a pending pipeline
   */
  async startPipeline(pipelineId: string): Promise<void> {
    const pipeline = await this.pipelineManager.getPipeline(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }

    if (pipeline.status !== 'pending') {
      return; // Already started
    }

    logger.info({ pipelineId, documentId: pipeline.documentId }, 'Starting pipeline');

    // Update pipeline to processing
    await this.pipelineManager.updatePipelineStage(pipelineId, 'extracting', 'processing');

    // Start document extraction
    await this.processDocumentExtraction(pipeline.documentId, pipelineId);
  }

  /**
   * Process a single pipeline - execute next available task
   */
  async processPipeline(pipelineId: string): Promise<boolean> {
    const pipeline = await this.pipelineManager.getPipeline(pipelineId);
    if (!pipeline) {
      return false;
    }

    // Check if pipeline is in terminal state
    if (pipeline.status === 'completed' || pipeline.status === 'failed') {
      return false;
    }

    // Get next task to process (respects dependencies)
    const nextTask = await this.pipelineManager.getNextTask(pipelineId);

    if (!nextTask) {
      // No more tasks - check if all completed
      const allTasks = await this.pipelineManager.getPipelineTasks(pipelineId);
      const allCompleted = allTasks.every(t => t.status === 'completed');
      const anyFailed = allTasks.some(t => t.status === 'failed');

      if (anyFailed) {
        await this.pipelineManager.completePipeline(pipelineId, false, 'Some tasks failed');
        return false;
      }

      if (allCompleted && allTasks.length > 0) {
        await this.pipelineManager.completePipeline(pipelineId, true);
        return false;
      }

      return false; // Still waiting for tasks to be created
    }

    // Process the task based on its type
    await this.processTask(nextTask);
    return true;
  }

  /**
   * Process a single task
   */
  private async processTask(task: any): Promise<void> {
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
          throw new Error(`Unknown task type: ${task.taskType}`);
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

  /**
   * Stage 1: Extract text from document
   */
  private async processDocumentExtraction(documentId: string, pipelineId: string): Promise<void> {
    // Check if document is in pending status
    const docResult = await this.pool.query(
      `SELECT id, status FROM document_sources WHERE id = $1`,
      [documentId]
    );

    const doc = docResult.rows[0];
    if (!doc || doc.status !== 'pending') {
      return;
    }

    // Create extraction task
    const task = await this.pipelineManager.createTask({
      pipelineId,
      itemId: documentId,
      taskType: 'extract',
    });

    logger.info({ taskId: task.id, documentId }, 'Created extraction task');
  }

  private async executeExtractionTask(task: any): Promise<void> {
    const documentId = task.itemId;

    // Use DocumentProcessorService to extract
    await this.documentProcessor.extractText(documentId);

    // After extraction, create chunking task
    await this.pipelineManager.createTask({
      pipelineId: task.pipelineId,
      itemId: documentId,
      taskType: 'chunk',
      dependsOnTaskId: task.id, // Depends on extraction
    });

    await this.pipelineManager.updatePipelineStage(task.pipelineId, 'chunking');
  }

  private async executeChunkingTask(task: any): Promise<void> {
    const documentId = task.itemId;

    // Use DocumentProcessorService to chunk
    await this.documentProcessor.chunkDocument(documentId);

    // After chunking, check if we need mapping
    const chunksResult = await this.pool.query(
      `SELECT id FROM raw_content_chunks WHERE document_id = $1 LIMIT 1`,
      [documentId]
    );

    if (chunksResult.rows.length > 0 && this.semanticMapper) {
      // Create mapping task for the document
      await this.pipelineManager.createTask({
        pipelineId: task.pipelineId,
        itemId: documentId,
        taskType: 'map',
        dependsOnTaskId: task.id,
      });

      await this.pipelineManager.updatePipelineStage(task.pipelineId, 'mapping');
    }
  }

  private async executeMappingTask(task: any): Promise<void> {
    if (!this.semanticMapper) {
      throw new Error('Semantic mapper not configured');
    }

    const documentId = task.itemId;

    // Get level_id for mapping
    const docResult = await this.pool.query(
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

    // Map chunks to topics
    await this.semanticMapper.mapChunksToTopics(documentId, levelId);

    // After mapping, create transformation tasks for confirmed mappings
    await this.pool.query(
      `SELECT id FROM content_topic_mappings
       WHERE chunk_id IN (SELECT id FROM raw_content_chunks WHERE document_id = $1)
       AND status = 'auto_mapped'`,
      [documentId]
    );

    // Create transformation tasks for each mapping (after they're confirmed)
    // For now, just update pipeline stage
    await this.pipelineManager.updatePipelineStage(task.pipelineId, 'transforming');
  }

  private async executeTransformationTask(task: any): Promise<void> {
    if (!this.contentTransformer) {
      throw new Error('Content transformer not configured');
    }

    const mappingId = task.itemId;

    // Transform mapping to learning content
    await this.contentTransformer.transformMapping(mappingId);

    // Transformation creates drafts - promotion worker will handle draft→candidate→validated
    await this.pipelineManager.updatePipelineStage(task.pipelineId, 'validating');
  }

  private async executeValidationTask(_task: any): Promise<void> {
    // Run promotion worker to validate candidates
    await this.promotionWorker.processBatch(10);
  }

  private async executeApprovalTask(_task: any): Promise<void> {
    // This would be manual approval by operator
    // For auto-approval, implement here
  }

  /**
   * Create transformation tasks when mappings are confirmed
   * Called from semantic mapper after confirmation
   */
  async createTransformationTasksForMapping(mappingId: string): Promise<void> {
    // Get the document_id and pipeline_id for this mapping
    const result = await this.pool.query(
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

    // Create transformation task
    await this.pipelineManager.createTask({
      pipelineId: pipeline_id,
      itemId: mappingId,
      taskType: 'transform',
    });

    logger.info({ mappingId, pipelineId: pipeline_id }, 'Created transformation task');
  }
}
