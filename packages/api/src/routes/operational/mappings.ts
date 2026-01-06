import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth';

interface MappingQueryParams {
  page?: string;
  limit?: string;
}

interface CountRow {
  count: string;
}

interface TransformationCostRow {
  total_cost: string | null;
  total_tokens: string | null;
  total_jobs: string;
}

export const mappingRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();

  fastify.get(
    '/mappings/review',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const query = request.query as MappingQueryParams;
      const page = parseInt(query.page || '1', 10);
      const limit = Math.min(parseInt(query.limit || '10', 10), 100);
      const offset = (page - 1) * limit;

      const result = await fastify.db.query(
        `SELECT m.*, 
                c.cleaned_text as chunk_text,
                c.chunk_type,
                t.name as topic_name,
                t.content_type as topic_type,
                d.original_filename as document_name
         FROM content_topic_mappings m
         JOIN raw_content_chunks c ON m.chunk_id = c.id
         JOIN curriculum_topics t ON m.topic_id = t.id
         JOIN document_sources d ON c.document_id = d.id
         WHERE m.status = 'auto_mapped'
         ORDER BY m.confidence_score DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const countResult = await fastify.db.query<CountRow>(
        `SELECT COUNT(*) FROM content_topic_mappings WHERE status = 'auto_mapped'`
      );

      const totalCount = countResult.rows[0]?.count ?? '0';
      return reply.send({
        mappings: result.rows,
        total: parseInt(totalCount, 10),
        page,
        limit,
      });
    }
  );

  fastify.post(
    '/mappings/:id/confirm',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      await fastify.db.query(
        `UPDATE content_topic_mappings 
         SET status = 'confirmed', confirmed_by = $1, confirmed_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [request.user?.userId, id]
      );

      return reply.send({ success: true });
    }
  );

  fastify.post(
    '/mappings/:id/reject',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      await fastify.db.query(
        `UPDATE content_topic_mappings SET status = 'rejected' WHERE id = $1`,
        [id]
      );

      return reply.send({ success: true });
    }
  );

  fastify.post(
    '/mappings/bulk-confirm',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { ids } = z.object({ ids: z.array(z.string().uuid()) }).parse(request.body);

      await fastify.db.query(
        `UPDATE content_topic_mappings 
         SET status = 'confirmed', confirmed_by = $1, confirmed_at = CURRENT_TIMESTAMP
         WHERE id = ANY($2)`,
        [request.user?.userId, ids]
      );

      return reply.send({ success: true, confirmed: ids.length });
    }
  );

  fastify.post(
    '/mappings/:id/remap',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { topicId } = z.object({ topicId: z.string().uuid() }).parse(request.body);

      await fastify.db.query(
        `UPDATE content_topic_mappings 
         SET topic_id = $1, status = 'manual', confidence_score = 1.0
         WHERE id = $2`,
        [topicId, id]
      );

      return reply.send({ success: true });
    }
  );

  fastify.get(
    '/mappings/stats',
    {
      preHandler: [authMiddleware],
    },
    async (_request, reply) => {
      const result = await fastify.db.query(`
        SELECT 
          status,
          COUNT(*) as count,
          AVG(confidence_score) as avg_confidence
        FROM content_topic_mappings
        GROUP BY status
      `);

      const costResult = await fastify.db.query<TransformationCostRow>(`
        SELECT 
          SUM(cost_usd) as total_cost,
          SUM(tokens_input + tokens_output) as total_tokens,
          COUNT(*) as total_jobs
        FROM transformation_jobs
        WHERE completed_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
      `);

      const defaultCosts = { total_cost: null, total_tokens: null, total_jobs: '0' };
      return reply.send({
        mappingStats: result.rows,
        transformationCosts: costResult.rows[0] ?? defaultCosts,
      });
    }
  );

  fastify.get(
    '/transformation-jobs',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const query = request.query as MappingQueryParams;
      const page = parseInt(query.page || '1', 10);
      const limit = Math.min(parseInt(query.limit || '50', 10), 100);
      const offset = (page - 1) * limit;

      const result = await fastify.db.query(
        `
        SELECT
          j.*,
          m.chunk_id,
          m.topic_id,
          m.confidence_score as mapping_confidence,
          t.name as topic_name,
          t.content_type as topic_type,
          c.cleaned_text as chunk_text,
          d.original_filename as document_name
        FROM transformation_jobs j
        JOIN content_topic_mappings m ON j.mapping_id = m.id
        JOIN curriculum_topics t ON m.topic_id = t.id
        JOIN raw_content_chunks c ON m.chunk_id = c.id
        JOIN document_sources d ON c.document_id = d.id
        ORDER BY j.created_at DESC
        LIMIT $1 OFFSET $2
      `,
        [limit, offset]
      );

      const countResult = await fastify.db.query<CountRow>(
        `SELECT COUNT(*) FROM transformation_jobs`
      );

      const jobsCount = countResult.rows[0]?.count ?? '0';
      return reply.send({
        jobs: result.rows,
        total: parseInt(jobsCount, 10),
        page,
        limit,
      });
    }
  );

  fastify.post(
    '/transformation-jobs/:id/retry',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      await fastify.db.query('BEGIN');

      try {
        const jobResult = await fastify.db.query<{
          id: string;
          mapping_id: string;
          status: string;
        }>(`SELECT id, mapping_id, status FROM transformation_jobs WHERE id = $1`, [id]);

        if (jobResult.rows.length === 0) {
          await fastify.db.query('ROLLBACK');
          return reply.status(404).send({
            error: {
              statusCode: 404,
              message: 'Transformation job not found',
              requestId: request.id,
              code: 'NOT_FOUND',
            },
          });
        }

        const job = jobResult.rows[0];

        await fastify.db.query(`DELETE FROM drafts WHERE transformation_job_id = $1`, [id]);

        await fastify.db.query(`DELETE FROM transformation_jobs WHERE id = $1`, [id]);

        await fastify.db.query('COMMIT');

        return reply.send({
          success: true,
          message: 'Transformation job deleted. It will be recreated on next processing cycle.',
          mappingId: job.mapping_id,
        });
      } catch (error) {
        await fastify.db.query('ROLLBACK');
        throw error;
      }
    }
  );

  fastify.delete(
    '/transformation-jobs/:id',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      await fastify.db.query('BEGIN');

      try {
        const jobResult = await fastify.db.query<{
          id: string;
          mapping_id: string;
          status: string;
        }>(`SELECT id, mapping_id, status FROM transformation_jobs WHERE id = $1`, [id]);

        if (jobResult.rows.length === 0) {
          await fastify.db.query('ROLLBACK');
          return reply.status(404).send({
            error: {
              statusCode: 404,
              message: 'Transformation job not found',
              requestId: request.id,
              code: 'NOT_FOUND',
            },
          });
        }

        await fastify.db.query(`DELETE FROM drafts WHERE transformation_job_id = $1`, [id]);

        await fastify.db.query(`DELETE FROM transformation_jobs WHERE id = $1`, [id]);

        await fastify.db.query('COMMIT');

        return reply.send({
          success: true,
          message: 'Transformation job deleted',
        });
      } catch (error) {
        await fastify.db.query('ROLLBACK');
        throw error;
      }
    }
  );
};
