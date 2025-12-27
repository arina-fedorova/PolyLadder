import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { PipelineEventLogger } from './pipeline-event-logger.service';

/**
 * Pipeline Manager Service
 *
 * Manages document pipelines - each document has exactly ONE pipeline
 * containing all processing tasks from upload to approval.
 *
 * Pipeline Stages:
 * 1. created → extracting → chunking → mapping → transforming → validating → approving → completed
 *
 * Each stage can have multiple tasks, tracked in pipeline_tasks table.
 */

export interface Pipeline {
  id: string;
  documentId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  currentStage: string;
  progressPercentage: number;
  errorMessage: string | null;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

export interface PipelineTask {
  id: string;
  pipelineId: string;
  itemId: string;
  itemType: string;
  dataType: string;
  taskType: string;
  currentStatus: string;
  currentStage: string;
  errorMessage: string | null;
  retryCount: number;
  dependsOnTaskId: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

export interface CreatePipelineParams {
  documentId: string;
  metadata?: Record<string, unknown>;
}

export interface CreateTaskParams {
  pipelineId: string;
  itemId: string;
  itemType: 'draft' | 'candidate' | 'validated' | 'chunk' | 'mapping';
  dataType: string;
  taskType: 'extract' | 'chunk' | 'map' | 'transform' | 'validate' | 'approve';
  currentStage: string;
  dependsOnTaskId?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateTaskStatusParams {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stage?: string;
  errorMessage?: string;
}

export class PipelineManager {
  private eventLogger: PipelineEventLogger;

  constructor(private readonly pool: Pool) {
    this.eventLogger = new PipelineEventLogger(pool);
  }

  /**
   * Create a new pipeline for a document
   * This is called when a document is uploaded
   */
  async createPipeline(params: CreatePipelineParams): Promise<Pipeline> {
    const result = await this.pool.query<Pipeline>(
      `INSERT INTO pipelines (document_id, status, current_stage, metadata)
       VALUES ($1, 'pending', 'created', $2)
       RETURNING *`,
      [params.documentId, JSON.stringify(params.metadata || {})]
    );

    const pipeline = this.mapPipeline(result.rows[0]);

    logger.info(
      { pipelineId: pipeline.id, documentId: params.documentId },
      'Pipeline created'
    );

    // Log pipeline creation event
    await this.eventLogger.logEvent({
      itemId: pipeline.id,
      itemType: 'pipeline',
      eventType: 'pipeline_created',
      stage: 'created',
      status: 'pending',
      success: true,
      payload: {
        documentId: params.documentId,
        metadata: params.metadata,
      },
    });

    return pipeline;
  }

  /**
   * Get pipeline by ID
   */
  async getPipeline(pipelineId: string): Promise<Pipeline | null> {
    const result = await this.pool.query<Pipeline>(
      `SELECT * FROM pipelines WHERE id = $1`,
      [pipelineId]
    );

    return result.rows[0] ? this.mapPipeline(result.rows[0]) : null;
  }

  /**
   * Get pipeline by document ID
   */
  async getPipelineByDocumentId(documentId: string): Promise<Pipeline | null> {
    const result = await this.pool.query<Pipeline>(
      `SELECT * FROM pipelines WHERE document_id = $1`,
      [documentId]
    );

    return result.rows[0] ? this.mapPipeline(result.rows[0]) : null;
  }

  /**
   * Get or create pipeline for document
   * Ensures exactly one pipeline exists per document
   */
  async getOrCreatePipeline(documentId: string): Promise<Pipeline> {
    const existing = await this.getPipelineByDocumentId(documentId);
    if (existing) {
      return existing;
    }

    return await this.createPipeline({ documentId });
  }

  /**
   * Update pipeline stage
   */
  async updatePipelineStage(
    pipelineId: string,
    stage: string,
    status?: 'pending' | 'processing' | 'completed' | 'failed'
  ): Promise<void> {
    // Set started_at if moving away from 'created' stage
    const shouldSetStartedAt = stage !== 'created';

    if (status) {
      // With status parameter
      await this.pool.query(
        `UPDATE pipelines
         SET current_stage = $2,
             status = $3,
             started_at = COALESCE(started_at, $4),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [pipelineId, stage, status, shouldSetStartedAt ? new Date() : null]
      );
    } else {
      // Without status parameter
      await this.pool.query(
        `UPDATE pipelines
         SET current_stage = $2,
             started_at = COALESCE(started_at, $3),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [pipelineId, stage, shouldSetStartedAt ? new Date() : null]
      );
    }

    logger.info({ pipelineId, stage, status }, 'Pipeline stage updated');
  }

  /**
   * Mark pipeline as completed
   */
  async completePipeline(pipelineId: string, success: boolean, errorMessage?: string): Promise<void> {
    await this.pool.query(
      `UPDATE pipelines
       SET status = $2,
           current_stage = 'completed',
           completed_at = CURRENT_TIMESTAMP,
           error_message = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [pipelineId, success ? 'completed' : 'failed', errorMessage || null]
    );

    await this.eventLogger.logEvent({
      itemId: pipelineId,
      itemType: 'pipeline',
      eventType: success ? 'pipeline_completed' : 'pipeline_failed',
      stage: 'completed',
      status: success ? 'completed' : 'failed',
      success,
      errorMessage,
      payload: {},
    });

    logger.info(
      { pipelineId, success, errorMessage },
      success ? 'Pipeline completed successfully' : 'Pipeline failed'
    );
  }

  /**
   * Create a task within a pipeline
   */
  async createTask(params: CreateTaskParams): Promise<PipelineTask> {
    const result = await this.pool.query<PipelineTask>(
      `INSERT INTO pipeline_tasks
       (pipeline_id, item_id, item_type, data_type, task_type, current_status, current_stage, depends_on_task_id, metadata)
       VALUES ($1::uuid, $2::uuid, $3::text, $4::text, $5::text, 'pending', $6::text, $7::uuid, $8::jsonb)
       RETURNING *`,
      [
        params.pipelineId,
        params.itemId,
        params.itemType,
        params.dataType,
        params.taskType,
        params.currentStage,
        params.dependsOnTaskId || null,
        JSON.stringify(params.metadata || {}),
      ]
    );

    // Update pipeline total_tasks count
    await this.pool.query(
      `UPDATE pipelines
       SET total_tasks = total_tasks + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [params.pipelineId]
    );

    const task = this.mapTask(result.rows[0]);

    logger.debug(
      { taskId: task.id, pipelineId: params.pipelineId, taskType: params.taskType },
      'Pipeline task created'
    );

    return task;
  }

  /**
   * Update task status
   * Automatically updates pipeline status via trigger
   */
  async updateTaskStatus(params: UpdateTaskStatusParams): Promise<void> {
    const updates: string[] = ['current_status = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const values: unknown[] = [params.taskId, params.status];
    let paramIndex = 3;

    if (params.stage) {
      updates.push(`current_stage = $${paramIndex++}`);
      values.push(params.stage);
    }

    if (params.errorMessage !== undefined) {
      updates.push(`error_message = $${paramIndex++}`);
      values.push(params.errorMessage);
    }

    if (params.status === 'failed') {
      updates.push(`retry_count = retry_count + 1`);
    }

    await this.pool.query(
      `UPDATE pipeline_tasks
       SET ${updates.join(', ')}
       WHERE id = $1`,
      values
    );

    // Log task status change
    await this.eventLogger.logEvent({
      itemId: params.taskId,
      itemType: 'task',
      eventType: 'task_status_changed',
      status: params.status,
      stage: params.stage,
      success: params.status === 'completed',
      errorMessage: params.errorMessage,
      payload: {},
    });

    logger.debug({ taskId: params.taskId, status: params.status }, 'Task status updated');
  }

  /**
   * Get all tasks for a pipeline
   */
  async getPipelineTasks(pipelineId: string): Promise<PipelineTask[]> {
    const result = await this.pool.query<PipelineTask>(
      `SELECT * FROM pipeline_tasks
       WHERE pipeline_id = $1
       ORDER BY created_at ASC`,
      [pipelineId]
    );

    return result.rows.map((row) => this.mapTask(row));
  }

  /**
   * Get next task to process (respects dependencies)
   */
  async getNextTask(pipelineId: string): Promise<PipelineTask | null> {
    const result = await this.pool.query<PipelineTask>(
      `SELECT t.*
       FROM pipeline_tasks t
       WHERE t.pipeline_id = $1
         AND t.current_status = 'pending'
         AND (
           t.depends_on_task_id IS NULL
           OR EXISTS (
             SELECT 1
             FROM pipeline_tasks dep
             WHERE dep.id = t.depends_on_task_id
               AND dep.current_status = 'completed'
           )
         )
       ORDER BY t.created_at ASC
       LIMIT 1`,
      [pipelineId]
    );

    return result.rows[0] ? this.mapTask(result.rows[0]) : null;
  }

  /**
   * Get pipelines by status
   */
  async getPipelinesByStatus(
    status: 'pending' | 'processing' | 'completed' | 'failed',
    limit = 50
  ): Promise<Pipeline[]> {
    const result = await this.pool.query<Pipeline>(
      `SELECT p.*, d.original_filename, d.language, d.target_level
       FROM pipelines p
       JOIN document_sources d ON d.id = p.document_id
       WHERE p.status = $1
       ORDER BY p.created_at DESC
       LIMIT $2`,
      [status, limit]
    );

    return result.rows.map((row) => this.mapPipeline(row));
  }

  /**
   * Retry failed tasks in a pipeline
   */
  async retryFailedTasks(pipelineId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `UPDATE pipeline_tasks
       SET current_status = 'pending',
           error_message = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE pipeline_id = $1
         AND current_status = 'failed'
         AND retry_count < 3
       RETURNING id`,
      [pipelineId]
    );

    const retriedCount = result.rowCount || 0;

    if (retriedCount > 0) {
      // Reset pipeline status if it was failed
      await this.pool.query(
        `UPDATE pipelines
         SET status = 'processing',
             error_message = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'failed'`,
        [pipelineId]
      );

      logger.info({ pipelineId, retriedCount }, 'Failed tasks retried');
    }

    return retriedCount;
  }

  private mapPipeline(row: any): Pipeline {
    return {
      id: row.id,
      documentId: row.document_id,
      status: row.status,
      currentStage: row.current_stage,
      progressPercentage: row.progress_percentage,
      errorMessage: row.error_message,
      totalTasks: row.total_tasks,
      completedTasks: row.completed_tasks,
      failedTasks: row.failed_tasks,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
    };
  }

  private mapTask(row: any): PipelineTask {
    return {
      id: row.id,
      pipelineId: row.pipeline_id,
      itemId: row.item_id,
      itemType: row.item_type,
      dataType: row.data_type,
      taskType: row.task_type,
      currentStatus: row.current_status,
      currentStage: row.current_stage,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      dependsOnTaskId: row.depends_on_task_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
    };
  }
}
