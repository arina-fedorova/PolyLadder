import { Pool } from 'pg';

export interface PipelineEventParams {
  itemId: string;
  itemType: 'draft' | 'candidate' | 'validated' | 'pipeline' | 'task';
  eventType: string;
  stage?: string;
  status?: string;
  fromStage?: string;
  toStage?: string;
  fromStatus?: string;
  toStatus?: string;
  success?: boolean;
  errorMessage?: string;
  durationMs?: number;
  payload?: Record<string, unknown>;
  documentId?: string;
  chunkId?: string;
  topicId?: string;
  mappingId?: string;
  dataType?: string;
  source?: string;
}

export class PipelineEventLogger {
  constructor(private readonly pool: Pool) {}

  async logEvent(params: PipelineEventParams): Promise<string> {
    const taskId = await this.ensureTask(params);
    const eventId = await this.createEvent(taskId, params);
    await this.updateTaskStatus(taskId, params);
    return eventId;
  }

  private async ensureTask(params: PipelineEventParams): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `SELECT id FROM pipeline_tasks 
       WHERE item_id = $1 AND item_type = $2
       LIMIT 1`,
      [params.itemId, params.itemType]
    );

    if (result.rows.length > 0) {
      return result.rows[0].id;
    }

    const insertResult = await this.pool.query<{ id: string }>(
      `INSERT INTO pipeline_tasks 
       (item_id, item_type, data_type, current_status, current_stage, source, 
        document_id, chunk_id, topic_id, mapping_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        params.itemId,
        params.itemType,
        params.dataType || 'rule',
        params.status || 'pending',
        params.stage || 'DRAFT',
        params.source || null,
        params.documentId || null,
        params.chunkId || null,
        params.topicId || null,
        params.mappingId || null,
        JSON.stringify(params.payload || {}),
      ]
    );

    return insertResult.rows[0].id;
  }

  private async createEvent(taskId: string, params: PipelineEventParams): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO pipeline_events 
       (task_id, item_id, item_type, event_type, stage, status,
        from_stage, to_stage, from_status, to_status,
        success, error_message, duration_ms, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        taskId,
        params.itemId,
        params.itemType,
        params.eventType,
        params.stage || null,
        params.status || null,
        params.fromStage || null,
        params.toStage || null,
        params.fromStatus || null,
        params.toStatus || null,
        params.success ?? null,
        params.errorMessage || null,
        params.durationMs || null,
        JSON.stringify(params.payload || {}),
      ]
    );

    return result.rows[0].id;
  }

  private async updateTaskStatus(taskId: string, params: PipelineEventParams): Promise<void> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.toStage) {
      updates.push(`current_stage = $${paramIndex++}`);
      values.push(params.toStage);
    }

    if (params.toStatus) {
      updates.push(`current_status = $${paramIndex++}`);
      values.push(params.toStatus);
    }

    if (params.errorMessage) {
      updates.push(`error_message = $${paramIndex++}`);
      values.push(params.errorMessage);
    }

    if (params.success === false && params.errorMessage) {
      updates.push(`retry_count = retry_count + 1`);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(taskId);

      await this.pool.query(
        `UPDATE pipeline_tasks 
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex}`,
        values
      );
    }
  }

  async getTaskHistory(itemId: string, itemType: string): Promise<Array<Record<string, unknown>>> {
    interface EventRow {
      [key: string]: unknown;
    }

    const result = await this.pool.query<EventRow>(
      `SELECT e.*, t.current_stage, t.current_status
       FROM pipeline_events e
       JOIN pipeline_tasks t ON e.task_id = t.id
       WHERE e.item_id = $1 AND e.item_type = $2
       ORDER BY e.created_at ASC`,
      [itemId, itemType]
    );

    return result.rows as Array<Record<string, unknown>>;
  }

  async getTaskByItemId(itemId: string, itemType: string): Promise<Record<string, unknown> | null> {
    interface TaskRow {
      [key: string]: unknown;
    }

    const result = await this.pool.query<TaskRow>(
      `SELECT t.*, 
              COUNT(e.id) as event_count,
              MAX(e.created_at) as last_event_at
       FROM pipeline_tasks t
       LEFT JOIN pipeline_events e ON e.task_id = t.id
       WHERE t.item_id = $1 AND t.item_type = $2
       GROUP BY t.id
       LIMIT 1`,
      [itemId, itemType]
    );

    return (result.rows[0] as Record<string, unknown>) || null;
  }
}
