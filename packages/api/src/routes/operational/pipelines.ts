import { FastifyPluginAsync } from 'fastify';
import { authMiddleware } from '../../middleware/auth';

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
  fastify.get<{ Querystring: PipelineQuery }>(
    '/pipelines',
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

      const tasksResult = await fastify.db.query<{
        id: string;
        pipeline_id: string | null;
        item_id: string;
        item_type: string;
        data_type: string;
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

      // Count validated items from review_queue (deduplicated)
      const validatedCountResult = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM (
          SELECT DISTINCT ON (
            CASE
              WHEN v.data_type = 'meaning' THEN v.validated_data->>'word'
              WHEN v.data_type = 'utterance' THEN v.validated_data->>'text'
              WHEN v.data_type = 'rule' THEN v.validated_data->>'title'
              WHEN v.data_type = 'exercise' THEN v.validated_data->>'prompt'
              ELSE v.id::text
            END || '|' || COALESCE(v.validated_data->>'language', 'EN') || '|' || COALESCE(v.validated_data->>'level', 'A1')
          ) v.id
          FROM review_queue rq
          JOIN validated v ON v.id = rq.item_id
          JOIN candidates c ON v.candidate_id = c.id
          JOIN drafts d ON c.draft_id = d.id
          WHERE rq.reviewed_at IS NULL
            AND d.document_id = $1
            AND NOT EXISTS (SELECT 1 FROM approval_events ae WHERE ae.item_id = v.id::varchar)
        ) subq`,
        [pipeline.document_id]
      );

      // Count approved items from approval_events
      const approvedCountResult = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(DISTINCT ae.item_id) as count
         FROM approval_events ae
         JOIN validated v ON v.id = ae.item_id::uuid
         JOIN candidates c ON v.candidate_id = c.id
         JOIN drafts d ON c.draft_id = d.id
         WHERE d.document_id = $1`,
        [pipeline.document_id]
      );

      // Count drafts and candidates from content lifecycle
      const draftCountResult = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM drafts WHERE document_id = $1`,
        [pipeline.document_id]
      );

      const candidateCountResult = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM candidates c
         JOIN drafts d ON c.draft_id = d.id
         WHERE d.document_id = $1`,
        [pipeline.document_id]
      );

      const contentStats = {
        draft: parseInt(draftCountResult.rows[0]?.count || '0', 10),
        candidate: parseInt(candidateCountResult.rows[0]?.count || '0', 10),
        validated: parseInt(validatedCountResult.rows[0]?.count || '0', 10),
        approved: parseInt(approvedCountResult.rows[0]?.count || '0', 10),
        total: 0,
      };

      contentStats.total =
        contentStats.draft +
        contentStats.candidate +
        contentStats.validated +
        contentStats.approved;

      return reply.send({
        pipeline,
        tasks: tasksResult.rows,
        events: eventsResult.rows,
        contentStats,
      });
    }
  );

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

      await fastify.db.query(
        `DELETE FROM content_topic_mappings
         WHERE chunk_id IN (SELECT id FROM raw_content_chunks WHERE document_id = $1)`,
        [documentId]
      );
      await fastify.db.query(`DELETE FROM raw_content_chunks WHERE document_id = $1`, [documentId]);

      await fastify.db.query(`DELETE FROM document_processing_tasks WHERE pipeline_id = $1`, [
        pipelineId,
      ]);

      const retriableTasksResult = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count
         FROM pipeline_tasks
         WHERE pipeline_id = $1
           AND current_status = 'failed'
           AND retry_count < 3`,
        [pipelineId]
      );
      const retriableCount = parseInt(retriableTasksResult.rows[0]?.count || '0', 10);

      await fastify.db.query(
        `UPDATE pipeline_tasks
         SET current_status = 'pending',
             error_message = NULL,
             retry_count = retry_count + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE pipeline_id = $1
           AND current_status = 'failed'
           AND retry_count < 3`,
        [pipelineId]
      );

      if (force) {
        await fastify.db.query(`DELETE FROM pipeline_tasks WHERE pipeline_id = $1`, [pipelineId]);
      }

      await fastify.db.query(
        `UPDATE pipelines
         SET status = 'processing',
             current_stage = 'created',
             error_message = NULL,
             total_tasks = 0,
             completed_tasks = 0,
             failed_tasks = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [pipelineId]
      );

      const retriedCount = retriableCount;

      return reply.send({
        success: true,
        message: `Retried ${retriedCount} failed tasks`,
        pipelineId,
        retriedTasks: retriedCount,
      });
    }
  );

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

      const client = await fastify.db.connect();
      try {
        await client.query('BEGIN');

        // FIRST: Find all validated items to delete BEFORE modifying any foreign keys
        const validatedIdsResult = await client.query<{ id: string; data_type: string }>(
          `SELECT v.id, v.data_type
           FROM validated v
           JOIN candidates c ON v.candidate_id = c.id
           JOIN drafts d ON c.draft_id = d.id
           WHERE d.document_id = $1
             AND NOT EXISTS (
               SELECT 1 FROM approval_events ae WHERE ae.item_id = v.id::varchar
             )`,
          [pipeline.document_id]
        );

        const validatedIds = validatedIdsResult.rows.map((row) => row.id);

        await client.query(
          `INSERT INTO pipeline_events
           (task_id, item_id, item_type, event_type, stage, status, success, payload)
           VALUES (NULL, $1, 'pipeline', 'pipeline_cancelled', 'cancelled', 'cancelled', true, $2)`,
          [
            pipelineId,
            JSON.stringify({
              deletedBy: request.user?.userId,
              documentId: pipeline.document_id,
              filename: pipeline.original_filename,
              validatedItemsToDelete: validatedIds.length,
            }),
          ]
        );

        // Delete validated items from review queue and validated table
        if (validatedIds.length > 0) {
          await client.query(`DELETE FROM review_queue WHERE item_id = ANY($1)`, [validatedIds]);
          await client.query(`DELETE FROM validated WHERE id = ANY($1)`, [validatedIds]);
        }

        const chunkIdsResult = await client.query<{ id: string }>(
          `SELECT id FROM raw_content_chunks WHERE document_id = $1`,
          [pipeline.document_id]
        );
        const chunkIds = chunkIdsResult.rows.map((row) => row.id);

        if (chunkIds.length > 0) {
          const mappingIdsResult = await client.query<{ id: string }>(
            `SELECT id FROM content_topic_mappings WHERE chunk_id = ANY($1)`,
            [chunkIds]
          );
          const mappingIds = mappingIdsResult.rows.map((row) => row.id);

          if (mappingIds.length > 0) {
            const transformationJobIdsResult = await client.query<{ id: string }>(
              `SELECT id FROM transformation_jobs WHERE mapping_id = ANY($1)`,
              [mappingIds]
            );
            const transformationJobIds = transformationJobIdsResult.rows.map((row) => row.id);

            if (transformationJobIds.length > 0) {
              await client.query(
                `UPDATE drafts SET transformation_job_id = NULL WHERE transformation_job_id = ANY($1)`,
                [transformationJobIds]
              );
            }

            await client.query(`DELETE FROM transformation_jobs WHERE mapping_id = ANY($1)`, [
              mappingIds,
            ]);
          }

          await client.query(`DELETE FROM content_topic_mappings WHERE chunk_id = ANY($1)`, [
            chunkIds,
          ]);
        }

        await client.query(`DELETE FROM raw_content_chunks WHERE document_id = $1`, [
          pipeline.document_id,
        ]);

        await client.query(`DELETE FROM pipelines WHERE id = $1`, [pipelineId]);

        await client.query(`DELETE FROM document_sources WHERE id = $1`, [pipeline.document_id]);

        await client.query('COMMIT');

        return reply.send({
          success: true,
          message: 'Pipeline and document deleted',
          pipelineId,
        });
      } catch (error) {
        await client.query('ROLLBACK');
        request.log.error({ err: error, pipelineId }, 'Failed to delete pipeline');
        throw error;
      } finally {
        client.release();
      }
    }
  );
};
