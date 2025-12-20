import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema } from '../../schemas/common';

const TableStatsSchema = Type.Object({
  tableName: Type.String(),
  draft: Type.Number(),
  candidate: Type.Number(),
  validated: Type.Number(),
  approved: Type.Number(),
});

const PipelineHealthSchema = Type.Object({
  pipeline: Type.Object({
    draft: Type.Number(),
    candidate: Type.Number(),
    validated: Type.Number(),
    approved: Type.Number(),
  }),
  byTable: Type.Array(TableStatsSchema),
  recentActivity: Type.Object({
    last24h: Type.Object({
      created: Type.Number(),
      approved: Type.Number(),
      failed: Type.Number(),
    }),
  }),
  serviceStatus: Type.Object({
    refinementService: Type.Object({
      status: Type.Union([
        Type.Literal('healthy'),
        Type.Literal('unhealthy'),
        Type.Literal('unknown'),
      ]),
      lastCheckpoint: Type.Union([Type.String(), Type.Null()]),
    }),
  }),
});

type PipelineHealth = Static<typeof PipelineHealthSchema>;

const healthRoute: FastifyPluginAsync = async function (fastify) {
  await Promise.resolve();

  fastify.get(
    '/health',
    {
      preHandler: [authMiddleware],
      schema: {
        response: {
          200: PipelineHealthSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
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

      const totals = {
        draft: 0,
        candidate: 0,
        validated: 0,
        approved: 0,
      };

      const byTable: PipelineHealth['byTable'] = [];

      const tables = ['meanings', 'utterances', 'rules', 'exercises'];

      for (const tableName of tables) {
        const draftResult = await fastify.db.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM draft_${tableName}`
        );
        const candidateResult = await fastify.db.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM candidate_${tableName}`
        );
        const validatedResult = await fastify.db.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM validated_${tableName}`
        );
        const approvedResult = await fastify.db.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM approved_${tableName}`
        );

        const stats = {
          tableName,
          draft: parseInt(draftResult.rows[0]?.count ?? '0', 10),
          candidate: parseInt(candidateResult.rows[0]?.count ?? '0', 10),
          validated: parseInt(validatedResult.rows[0]?.count ?? '0', 10),
          approved: parseInt(approvedResult.rows[0]?.count ?? '0', 10),
        };

        byTable.push(stats);
        totals.draft += stats.draft;
        totals.candidate += stats.candidate;
        totals.validated += stats.validated;
        totals.approved += stats.approved;
      }

      const failuresResult = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count
         FROM pipeline_failures
         WHERE failed_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'`
      );

      const metricsResult = await fastify.db.query<{
        items_processed: string;
        items_approved: string;
      }>(
        `SELECT 
           COALESCE(SUM(items_processed), 0) as items_processed,
           COALESCE(SUM(items_approved), 0) as items_approved
         FROM pipeline_metrics
         WHERE recorded_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'`
      );

      const serviceResult = await fastify.db.query<{ last_checkpoint: Date }>(
        `SELECT last_checkpoint
         FROM service_state
         WHERE service_name = 'refinement_service'`
      );

      const lastCheckpoint = serviceResult.rows[0]?.last_checkpoint ?? null;
      let status: 'healthy' | 'unhealthy' | 'unknown' = 'unknown';

      if (lastCheckpoint) {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        status = new Date(lastCheckpoint) > fiveMinutesAgo ? 'healthy' : 'unhealthy';
      }

      return reply.status(200).send({
        pipeline: totals,
        byTable,
        recentActivity: {
          last24h: {
            created: parseInt(metricsResult.rows[0]?.items_processed ?? '0', 10),
            approved: parseInt(metricsResult.rows[0]?.items_approved ?? '0', 10),
            failed: parseInt(failuresResult.rows[0]?.count ?? '0', 10),
          },
        },
        serviceStatus: {
          refinementService: {
            status,
            lastCheckpoint: lastCheckpoint ? new Date(lastCheckpoint).toISOString() : null,
          },
        },
      });
    }
  );
};

export default healthRoute;
