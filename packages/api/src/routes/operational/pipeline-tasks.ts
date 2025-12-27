import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middleware/auth';

interface PipelineTaskQuery {
  page?: string;
  limit?: string;
  status?: string;
  stage?: string;
  dataType?: string;
}

interface PipelineTaskParams {
  taskId: string;
}

interface RetryTaskBody {
  force?: boolean;
}

export async function pipelineTasksRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: PipelineTaskQuery }>(
    '/pipeline-tasks',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const query = request.query;
      const page = parseInt(query.page || '1', 10);
      const limit = Math.min(parseInt(query.limit || '50', 10), 100);
      const offset = (page - 1) * limit;

      let whereClause = 'WHERE 1=1';
      const params: unknown[] = [];
      let paramIndex = 1;

      if (query.status) {
        whereClause += ` AND t.current_status = $${paramIndex++}`;
        params.push(query.status);
      }

      if (query.stage) {
        whereClause += ` AND t.current_stage = $${paramIndex++}`;
        params.push(query.stage);
      }

      if (query.dataType) {
        whereClause += ` AND t.data_type = $${paramIndex++}`;
        params.push(query.dataType);
      }

      const result = await fastify.db.query<{
        id: string;
        item_id: string;
        item_type: string;
        data_type: string;
        current_status: string;
        current_stage: string;
        source: string | null;
        document_name: string | null;
        topic_name: string | null;
        error_message: string | null;
        retry_count: number;
        created_at: string;
        updated_at: string;
        event_count: string;
        last_event_at: string | null;
      }>(
        `SELECT 
          t.*,
          COUNT(e.id) as event_count,
          MAX(e.created_at) as last_event_at,
          d.original_filename as document_name,
          ct.name as topic_name
        FROM pipeline_tasks t
        LEFT JOIN pipeline_events e ON e.task_id = t.id
        LEFT JOIN document_sources d ON t.document_id = d.id
        LEFT JOIN curriculum_topics ct ON t.topic_id = ct.id
        ${whereClause}
        GROUP BY t.id, d.original_filename, ct.name
        ORDER BY t.created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...params, limit, offset]
      );

      const countResult = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(DISTINCT t.id) as count
         FROM pipeline_tasks t
         ${whereClause}`,
        params
      );

      return reply.send({
        tasks: result.rows,
        total: parseInt(countResult.rows[0].count, 10),
        page,
        limit,
      });
    }
  );

  fastify.get<{ Params: PipelineTaskParams }>(
    '/pipeline-tasks/:taskId',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { taskId } = request.params;

      const taskResult = await fastify.db.query(
        `SELECT 
          t.*,
          d.original_filename as document_name,
          ct.name as topic_name,
          ct.content_type as topic_type
        FROM pipeline_tasks t
        LEFT JOIN document_sources d ON t.document_id = d.id
        LEFT JOIN curriculum_topics ct ON t.topic_id = ct.id
        WHERE t.id = $1`,
        [taskId]
      );

      if (taskResult.rows.length === 0) {
        return reply.code(404).send({ error: { message: 'Task not found' } });
      }

      const task = taskResult.rows[0];

      const eventsResult = await fastify.db.query<{
        id: string;
        task_id: string | null;
        item_id: string;
        item_type: string;
        event_type: string;
        stage: string | null;
        status: string | null;
        from_stage: string | null;
        to_stage: string | null;
        from_status: string | null;
        to_status: string | null;
        success: boolean | null;
        error_message: string | null;
        duration_ms: number | null;
        payload: Record<string, unknown>;
        created_at: string;
      }>(
        `SELECT *
         FROM pipeline_events
         WHERE task_id = $1
         ORDER BY created_at ASC`,
        [taskId]
      );

      return reply.send({
        task,
        events: eventsResult.rows,
      });
    }
  );

  fastify.get<{ Params: { itemId: string }; Querystring: { itemType: string } }>(
    '/pipeline-tasks/item/:itemId',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { itemId } = request.params;
      const itemType = request.query.itemType || 'draft';

      const taskResult = await fastify.db.query(
        `SELECT 
          t.*,
          d.original_filename as document_name,
          ct.name as topic_name
        FROM pipeline_tasks t
        LEFT JOIN document_sources d ON t.document_id = d.id
        LEFT JOIN curriculum_topics ct ON t.topic_id = ct.id
        WHERE t.item_id = $1 AND t.item_type = $2
        ORDER BY t.created_at DESC
        LIMIT 1`,
        [itemId, itemType]
      );

      if (taskResult.rows.length === 0) {
        return reply.code(404).send({ error: { message: 'Task not found' } });
      }

      const task = taskResult.rows[0];

      const eventsResult = await fastify.db.query<{
        id: string;
        task_id: string | null;
        item_id: string;
        item_type: string;
        event_type: string;
        stage: string | null;
        status: string | null;
        from_stage: string | null;
        to_stage: string | null;
        from_status: string | null;
        to_status: string | null;
        success: boolean | null;
        error_message: string | null;
        duration_ms: number | null;
        payload: Record<string, unknown>;
        created_at: string;
      }>(
        `SELECT *
         FROM pipeline_events
         WHERE item_id = $1 AND item_type = $2
         ORDER BY created_at ASC`,
        [itemId, itemType]
      );

      return reply.send({
        task,
        events: eventsResult.rows,
      });
    }
  );

  fastify.post<{ Params: PipelineTaskParams; Body: RetryTaskBody }>(
    '/pipeline-tasks/:taskId/retry',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { taskId } = request.params;
      const { force = false } = request.body;

      const taskResult = await fastify.db.query<{
        id: string;
        item_id: string;
        item_type: string;
        current_stage: string;
        current_status: string;
        error_message: string | null;
      }>(
        `SELECT id, item_id, item_type, current_stage, current_status, error_message
         FROM pipeline_tasks
         WHERE id = $1`,
        [taskId]
      );

      if (taskResult.rows.length === 0) {
        return reply.code(404).send({ error: { message: 'Task not found' } });
      }

      const task = taskResult.rows[0];

      if (task.current_status !== 'failed' && !force) {
        return reply.code(400).send({
          error: {
            message: `Task is not in failed status. Current status: ${task.current_status}`,
          },
        });
      }

      await fastify.db.query(
        `UPDATE pipeline_tasks
         SET current_status = 'pending',
             error_message = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [taskId]
      );

      await fastify.db.query(
        `INSERT INTO pipeline_events 
         (task_id, item_id, item_type, event_type, stage, status, from_status, to_status, success, payload)
         VALUES ($1, $2, $3, 'task_retry', $4, 'pending', $5, 'pending', true, $6)`,
        [
          taskId,
          task.item_id,
          task.item_type,
          task.current_stage,
          task.current_status,
          JSON.stringify({ force, retriedBy: 'operator' }),
        ]
      );

      return reply.send({
        success: true,
        message: 'Task queued for retry',
        taskId,
      });
    }
  );

  fastify.delete<{ Params: PipelineTaskParams }>(
    '/pipeline-tasks/:taskId',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { taskId } = request.params;

      const taskResult = await fastify.db.query<{
        id: string;
        item_id: string;
        item_type: string;
        current_stage: string;
      }>(
        `SELECT id, item_id, item_type, current_stage
         FROM pipeline_tasks
         WHERE id = $1`,
        [taskId]
      );

      if (taskResult.rows.length === 0) {
        return reply.code(404).send({ error: { message: 'Task not found' } });
      }

      const task = taskResult.rows[0];

      await fastify.db.query('BEGIN');

      try {
        await fastify.db.query(
          `INSERT INTO pipeline_events 
           (task_id, item_id, item_type, event_type, stage, status, from_status, to_status, success, payload)
           VALUES ($1, $2, $3, 'task_deleted', $4, 'deleted', $4, 'deleted', true, $5)`,
          [
            taskId,
            task.item_id,
            task.item_type,
            task.current_stage,
            JSON.stringify({ deletedBy: 'operator' }),
          ]
        );

        await fastify.db.query('DELETE FROM pipeline_tasks WHERE id = $1', [taskId]);

        const tableName =
          task.item_type === 'draft'
            ? 'drafts'
            : task.item_type === 'candidate'
              ? 'candidates'
              : 'validated';

        await fastify.db.query(`DELETE FROM ${tableName} WHERE id = $1`, [task.item_id]);

        await fastify.db.query('COMMIT');

        return reply.send({
          success: true,
          message: 'Task and associated item deleted',
          taskId,
        });
      } catch (error) {
        await fastify.db.query('ROLLBACK');
        throw error;
      }
    }
  );
}

