import { FastifyPluginAsync } from 'fastify';
import { authMiddleware } from '../../middleware/auth';

/**
 * Pipelines API Routes
 *
 * Operator-facing API for viewing and managing document pipelines.
 * Each document has exactly ONE pipeline containing all processing tasks.
 */

interface PipelineQuery {
  page?: string;
  limit?: string;
  status?: string;
  documentId?: string;
}

interface PipelineParams {
  pipelineId: string;
}

interface RetryPipelineBody {
  force?: boolean;
}

// eslint-disable-next-line @typescript-eslint/require-await
export const pipelinesRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /operational/pipelines
   *
   * List all pipelines with filters
   * Returns pipelines with document info and progress
   */
  fastify.get<{ Querystring: PipelineQuery }>(
    '/pipelines',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      // Check operator role
      if (request.user?.role !== 'operator') {
        return reply.status(403).send({
          error: {
            statusCode: 403,
            message: 'Operator role required',
            requestId: request.id,
            code: 'FORBIDDEN',
          },
        });
      }

      const query = request.query;
      const page = parseInt(query.page || '1', 10);
      const limit = Math.min(parseInt(query.limit || '50', 10), 100);
      const offset = (page - 1) * limit;

      let whereClause = 'WHERE 1=1';
      const params: unknown[] = [];
      let paramIndex = 1;

      if (query.status) {
        whereClause += ` AND p.status = $${paramIndex++}`;
        params.push(query.status);
      }

      if (query.documentId) {
        whereClause += ` AND p.document_id = $${paramIndex++}`;
        params.push(query.documentId);
      }

      const result = await fastify.db.query<{
        id: string;
        document_id: string;
        status: string;
        current_stage: string;
        progress_percentage: number;
        error_message: string | null;
        total_tasks: number;
        completed_tasks: number;
        failed_tasks: number;
        started_at: string | null;
        completed_at: string | null;
        created_at: string;
        updated_at: string;
        original_filename: string;
        language: string;
        target_level: string;
        document_type: string;
        uploader_email: string | null;
      }>(
        `SELECT
          p.*,
          d.original_filename,
          d.language,
          d.target_level,
          d.document_type,
          u.email as uploader_email
        FROM pipelines p
        JOIN document_sources d ON d.id = p.document_id
        LEFT JOIN users u ON u.id = d.uploaded_by
        ${whereClause}
        ORDER BY p.created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...params, limit, offset]
      );

      const countResult = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count
         FROM pipelines p
         ${whereClause}`,
        params
      );

      return reply.send({
        pipelines: result.rows,
        total: parseInt(countResult.rows[0].count, 10),
        page,
        limit,
      });
    }
  );

  /**
   * GET /operational/pipelines/:pipelineId
   *
   * Get detailed pipeline info with all tasks and events
   */
  fastify.get<{ Params: PipelineParams }>(
    '/pipelines/:pipelineId',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      if (request.user?.role !== 'operator') {
        return reply.status(403).send({
          error: {
            statusCode: 403,
            message: 'Operator role required',
            requestId: request.id,
            code: 'FORBIDDEN',
          },
        });
      }

      const { pipelineId } = request.params;

      // Get pipeline info
      const pipelineResult = await fastify.db.query<{
        id: string;
        document_id: string;
        status: string;
        current_stage: string;
        progress_percentage: number;
        error_message: string | null;
        total_tasks: number;
        completed_tasks: number;
        failed_tasks: number;
        started_at: string | null;
        completed_at: string | null;
        created_at: string;
        updated_at: string;
        original_filename: string;
        language: string;
        target_level: string;
        document_type: string;
        document_status: string;
        uploader_email: string | null;
      }>(
        `SELECT
          p.*,
          d.original_filename,
          d.language,
          d.target_level,
          d.document_type,
          d.status as document_status,
          u.email as uploader_email
        FROM pipelines p
        JOIN document_sources d ON d.id = p.document_id
        LEFT JOIN users u ON u.id = d.uploaded_by
        WHERE p.id = $1`,
        [pipelineId]
      );

      if (pipelineResult.rows.length === 0) {
        return reply.code(404).send({
          error: { message: 'Pipeline not found' },
        });
      }

      const pipeline = pipelineResult.rows[0];

      // Get all tasks for this pipeline
      const tasksResult = await fastify.db.query<{
        id: string;
        pipeline_id: string | null;
        item_id: string;
        item_type: string;
        data_type: string;
        task_type: string | null;
        current_status: string;
        current_stage: string;
        document_name: string | null;
        topic_name: string | null;
        error_message: string | null;
        retry_count: number;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT
          t.*,
          d.original_filename as document_name,
          ct.name as topic_name
        FROM pipeline_tasks t
        LEFT JOIN document_sources d ON t.document_id = d.id
        LEFT JOIN curriculum_topics ct ON t.topic_id = ct.id
        WHERE t.pipeline_id = $1
        ORDER BY t.created_at ASC`,
        [pipelineId]
      );

      // Get timeline events for the pipeline
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
        `SELECT
          e.*
        FROM pipeline_events e
        WHERE e.item_id = $1 OR e.task_id IN (
          SELECT id FROM pipeline_tasks WHERE pipeline_id = $1
        )
        ORDER BY e.created_at ASC`,
        [pipelineId]
      );

      // Get content lifecycle statistics (DRAFT → CANDIDATE → VALIDATED → APPROVED)
      const contentStatsResult = await fastify.db.query<{
        current_stage: string;
        count: string;
      }>(
        `SELECT current_stage, COUNT(*) as count
         FROM pipeline_tasks
         WHERE pipeline_id = $1
         GROUP BY current_stage
         ORDER BY
           CASE current_stage
             WHEN 'DRAFT' THEN 1
             WHEN 'CANDIDATE' THEN 2
             WHEN 'VALIDATED' THEN 3
             WHEN 'APPROVED' THEN 4
             ELSE 5
           END`,
        [pipelineId]
      );

      const contentStats = {
        draft: 0,
        candidate: 0,
        validated: 0,
        approved: 0,
        total: 0,
      };

      for (const row of contentStatsResult.rows) {
        const count = parseInt(row.count, 10);
        contentStats.total += count;

        switch (row.current_stage) {
          case 'DRAFT':
            contentStats.draft = count;
            break;
          case 'CANDIDATE':
            contentStats.candidate = count;
            break;
          case 'VALIDATED':
            contentStats.validated = count;
            break;
          case 'APPROVED':
            contentStats.approved = count;
            break;
        }
      }

      return reply.send({
        pipeline,
        tasks: tasksResult.rows,
        events: eventsResult.rows,
        contentStats,
      });
    }
  );

  /**
   * GET /operational/pipelines/document/:documentId
   *
   * Get pipeline by document ID
   */
  fastify.get<{ Params: { documentId: string } }>(
    '/pipelines/document/:documentId',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      if (request.user?.role !== 'operator') {
        return reply.status(403).send({
          error: {
            statusCode: 403,
            message: 'Operator role required',
            requestId: request.id,
            code: 'FORBIDDEN',
          },
        });
      }

      const { documentId } = request.params;

      const pipelineResult = await fastify.db.query<{
        id: string;
        document_id: string;
        status: string;
        current_stage: string;
        progress_percentage: number;
        error_message: string | null;
        total_tasks: number;
        completed_tasks: number;
        failed_tasks: number;
        started_at: string | null;
        completed_at: string | null;
        created_at: string;
        updated_at: string;
        original_filename: string;
        language: string;
        target_level: string;
      }>(
        `SELECT
          p.*,
          d.original_filename,
          d.language,
          d.target_level
        FROM pipelines p
        JOIN document_sources d ON d.id = p.document_id
        WHERE p.document_id = $1`,
        [documentId]
      );

      if (pipelineResult.rows.length === 0) {
        return reply.code(404).send({
          error: { message: 'Pipeline not found for document' },
        });
      }

      return reply.send({
        pipeline: pipelineResult.rows[0],
      });
    }
  );

  /**
   * POST /operational/pipelines/:pipelineId/retry
   *
   * Retry failed tasks in a pipeline
   */
  fastify.post<{ Params: PipelineParams; Body: RetryPipelineBody }>(
    '/pipelines/:pipelineId/retry',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      if (request.user?.role !== 'operator') {
        return reply.status(403).send({
          error: {
            statusCode: 403,
            message: 'Operator role required',
            requestId: request.id,
            code: 'FORBIDDEN',
          },
        });
      }

      const { pipelineId } = request.params;
      const { force = false } = request.body;

      // Check pipeline exists
      const pipelineResult = await fastify.db.query<{
        id: string;
        status: string;
      }>(`SELECT id, status FROM pipelines WHERE id = $1`, [pipelineId]);

      if (pipelineResult.rows.length === 0) {
        return reply.code(404).send({
          error: { message: 'Pipeline not found' },
        });
      }

      const pipeline = pipelineResult.rows[0];

      if (pipeline.status !== 'failed' && !force) {
        return reply.code(400).send({
          error: {
            message: `Pipeline is not in failed status. Current status: ${pipeline.status}`,
          },
        });
      }

      // Get the document_id for this pipeline
      const docResult = await fastify.db.query<{ document_id: string }>(
        `SELECT document_id FROM pipelines WHERE id = $1`,
        [pipelineId]
      );

      if (docResult.rows.length === 0) {
        return reply.code(404).send({
          error: { message: 'Pipeline not found' },
        });
      }

      const documentId = docResult.rows[0].document_id;

      // Clean up old data from previous attempts to avoid constraint violations
      // Delete mappings first (foreign key dependency)
      await fastify.db.query(
        `DELETE FROM content_topic_mappings
         WHERE chunk_id IN (SELECT id FROM raw_content_chunks WHERE document_id = $1)`,
        [documentId]
      );
      // Then delete chunks
      await fastify.db.query(`DELETE FROM raw_content_chunks WHERE document_id = $1`, [documentId]);

      // Delete all tasks for this pipeline (we'll recreate them)
      await fastify.db.query(`DELETE FROM document_processing_tasks WHERE pipeline_id = $1`, [
        pipelineId,
      ]);

      // Reset pipeline status to pending so it gets picked up by orchestrator
      await fastify.db.query(
        `UPDATE pipelines
         SET status = 'pending',
             current_stage = 'created',
             error_message = NULL,
             total_tasks = 0,
             completed_tasks = 0,
             failed_tasks = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [pipelineId]
      );

      const retriedCount = 1; // We're retrying the entire pipeline

      return reply.send({
        success: true,
        message: `Retried ${retriedCount} failed tasks`,
        pipelineId,
        retriedTasks: retriedCount,
      });
    }
  );

  /**
   * DELETE /operational/pipelines/:pipelineId
   *
   * Cancel and delete a pipeline
   * WARNING: This will delete the document and all associated data
   */
  fastify.delete<{ Params: PipelineParams }>(
    '/pipelines/:pipelineId',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      if (request.user?.role !== 'operator') {
        return reply.status(403).send({
          error: {
            statusCode: 403,
            message: 'Operator role required',
            requestId: request.id,
            code: 'FORBIDDEN',
          },
        });
      }

      const { pipelineId } = request.params;

      // Get pipeline with document
      const pipelineResult = await fastify.db.query<{
        id: string;
        document_id: string;
        original_filename: string;
      }>(
        `SELECT p.id, p.document_id, d.original_filename
         FROM pipelines p
         JOIN document_sources d ON d.id = p.document_id
         WHERE p.id = $1`,
        [pipelineId]
      );

      if (pipelineResult.rows.length === 0) {
        return reply.code(404).send({
          error: { message: 'Pipeline not found' },
        });
      }

      const pipeline = pipelineResult.rows[0];

      await fastify.db.query('BEGIN');

      try {
        // Log deletion event
        await fastify.db.query(
          `INSERT INTO pipeline_events
           (task_id, item_id, item_type, event_type, stage, status, success, payload)
           VALUES (NULL, $1, 'pipeline', 'pipeline_cancelled', 'cancelled', 'cancelled', true, $2)`,
          [
            pipelineId,
            JSON.stringify({
              deletedBy: request.user?.userId,
              documentId: pipeline.document_id,
              filename: pipeline.original_filename,
            }),
          ]
        );

        // Delete document (cascade will delete pipeline, tasks, events)
        await fastify.db.query(`DELETE FROM document_sources WHERE id = $1`, [
          pipeline.document_id,
        ]);

        await fastify.db.query('COMMIT');

        return reply.send({
          success: true,
          message: 'Pipeline and document deleted',
          pipelineId,
        });
      } catch (error) {
        await fastify.db.query('ROLLBACK');
        throw error;
      }
    }
  );
};
