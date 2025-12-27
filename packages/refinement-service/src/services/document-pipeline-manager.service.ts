import { Pool } from 'pg';
import { logger } from '../utils/logger';

export interface DocumentPipeline {
  id: string;
  documentId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  currentStage: string;
  errorMessage: string | null;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentTask {
  id: string;
  pipelineId: string;
  taskType: 'extract' | 'chunk' | 'map' | 'transform' | 'validate' | 'approve';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  itemId: string | null;
  dependsOnTaskId: string | null;
  errorMessage: string | null;
  retryCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskParams {
  pipelineId: string;
  taskType: 'extract' | 'chunk' | 'map' | 'transform' | 'validate' | 'approve';
  itemId?: string;
  dependsOnTaskId?: string;
  metadata?: Record<string, unknown>;
}

export interface CreatePipelineParams {
  documentId: string;
  metadata?: Record<string, unknown>;
}

interface PipelineRow {
  id: string;
  document_id: string;
  status: string;
  current_stage: string;
  error_message: string | null;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface TaskRow {
  id: string;
  pipeline_id: string;
  task_type: string;
  status: string;
  item_id: string | null;
  depends_on_task_id: string | null;
  error_message: string | null;
  retry_count: number;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Document Pipeline Manager
 * Manages pipelines and tasks for DOCUMENT PROCESSING (NOT content processing)
 * Uses: pipelines and document_processing_tasks tables
 */
export class DocumentPipelineManager {
  constructor(private readonly pool: Pool) {}

  async createPipeline(params: CreatePipelineParams): Promise<DocumentPipeline> {
    const result = await this.pool.query<DocumentPipeline>(
      `INSERT INTO pipelines (document_id, status, current_stage, metadata)
       VALUES ($1, 'pending', 'created', $2)
       RETURNING *`,
      [params.documentId, JSON.stringify(params.metadata || {})]
    );

    const pipeline = this.mapPipeline(result.rows[0]);

    logger.info(
      { pipelineId: pipeline.id, documentId: params.documentId },
      'Document pipeline created'
    );

    return pipeline;
  }

  async getPipeline(pipelineId: string): Promise<DocumentPipeline | null> {
    const result = await this.pool.query<PipelineRow>(`SELECT * FROM pipelines WHERE id = $1`, [
      pipelineId,
    ]);

    return result.rows.length > 0 ? this.mapPipeline(result.rows[0]) : null;
  }

  async getPipelinesByStatus(
    status: 'pending' | 'processing' | 'completed' | 'failed',
    limit: number = 10
  ): Promise<DocumentPipeline[]> {
    const result = await this.pool.query<PipelineRow>(
      `SELECT * FROM pipelines
       WHERE status = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [status, limit]
    );

    return result.rows.map((row) => this.mapPipeline(row));
  }

  async updatePipelineStage(
    pipelineId: string,
    stage: string,
    status?: 'pending' | 'processing' | 'completed' | 'failed'
  ): Promise<void> {
    const shouldSetStartedAt = stage !== 'created';

    if (status) {
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

  async completePipeline(
    pipelineId: string,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
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

    logger.info(
      { pipelineId, success, errorMessage },
      success ? 'Pipeline completed successfully' : 'Pipeline failed'
    );
  }

  async createTask(params: CreateTaskParams): Promise<DocumentTask> {
    const result = await this.pool.query<TaskRow>(
      `INSERT INTO document_processing_tasks
       (pipeline_id, task_type, status, item_id, depends_on_task_id, metadata)
       VALUES ($1, $2, 'pending', $3, $4, $5)
       RETURNING *`,
      [
        params.pipelineId,
        params.taskType,
        params.itemId || null,
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

    logger.info(
      { taskId: task.id, pipelineId: params.pipelineId, taskType: params.taskType },
      'Task created'
    );

    return task;
  }

  async getNextTask(pipelineId: string): Promise<DocumentTask | null> {
    const result = await this.pool.query<TaskRow>(
      `SELECT t.*
       FROM document_processing_tasks t
       WHERE t.pipeline_id = $1
         AND t.status = 'pending'
         AND (
           t.depends_on_task_id IS NULL
           OR EXISTS (
             SELECT 1 FROM document_processing_tasks dep
             WHERE dep.id = t.depends_on_task_id
               AND dep.status = 'completed'
           )
         )
       ORDER BY t.created_at ASC
       LIMIT 1`,
      [pipelineId]
    );

    return result.rows.length > 0 ? this.mapTask(result.rows[0]) : null;
  }

  async getPipelineTasks(pipelineId: string): Promise<DocumentTask[]> {
    const result = await this.pool.query<TaskRow>(
      `SELECT * FROM document_processing_tasks
       WHERE pipeline_id = $1
       ORDER BY created_at ASC`,
      [pipelineId]
    );

    return result.rows.map((row) => this.mapTask(row));
  }

  async updateTaskStatus(params: {
    taskId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    errorMessage?: string;
  }): Promise<void> {
    const { taskId, status, errorMessage } = params;

    const updates: string[] = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const values: Array<string | number> = [taskId, status];
    let paramIndex = 3;

    if (status === 'processing') {
      updates.push(`started_at = COALESCE(started_at, CURRENT_TIMESTAMP)`);
    } else if (status === 'completed' || status === 'failed') {
      updates.push(`completed_at = CURRENT_TIMESTAMP`);
    }

    if (errorMessage) {
      updates.push(`error_message = $${paramIndex++}`);
      values.push(errorMessage);
    }

    if (status === 'failed') {
      updates.push(`retry_count = retry_count + 1`);
    }

    await this.pool.query(
      `UPDATE document_processing_tasks
       SET ${updates.join(', ')}
       WHERE id = $1`,
      values
    );

    logger.info({ taskId, status, errorMessage }, 'Task status updated');
  }

  async retryFailedTasks(pipelineId: string, maxRetries: number = 3): Promise<number> {
    const result = await this.pool.query(
      `UPDATE document_processing_tasks
       SET status = 'pending',
           error_message = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE pipeline_id = $1
         AND status = 'failed'
         AND retry_count < $2
       RETURNING id`,
      [pipelineId, maxRetries]
    );

    const retriedCount = result.rowCount || 0;

    if (retriedCount > 0) {
      await this.pool.query(
        `UPDATE pipelines
         SET status = 'processing',
             error_message = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [pipelineId]
      );

      logger.info({ pipelineId, retriedCount }, 'Failed tasks retried');
    }

    return retriedCount;
  }

  private mapPipeline(row: PipelineRow): DocumentPipeline {
    return {
      id: row.id,
      documentId: row.document_id,
      status: row.status as DocumentPipeline['status'],
      currentStage: row.current_stage,
      errorMessage: row.error_message,
      totalTasks: row.total_tasks,
      completedTasks: row.completed_tasks,
      failedTasks: row.failed_tasks,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapTask(row: TaskRow): DocumentTask {
    return {
      id: row.id,
      pipelineId: row.pipeline_id,
      taskType: row.task_type as DocumentTask['taskType'],
      status: row.status as DocumentTask['status'],
      itemId: row.item_id,
      dependsOnTaskId: row.depends_on_task_id,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
