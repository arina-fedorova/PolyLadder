import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema } from '../../schemas/common';

const ContentTypeStatsSchema = Type.Object({
  draft: Type.Number(),
  candidate: Type.Number(),
  validated: Type.Number(),
  approved: Type.Number(),
});

const PipelineHealthSchema = Type.Object({
  summary: Type.Object({
    draft: Type.Number(),
    candidate: Type.Number(),
    validated: Type.Number(),
    approved: Type.Number(),
    total: Type.Number(),
  }),
  byContentType: Type.Object({
    vocabulary: ContentTypeStatsSchema,
    grammar: ContentTypeStatsSchema,
    orthography: ContentTypeStatsSchema,
  }),
  refinementService: Type.Object({
    status: Type.Union([Type.Literal('running'), Type.Literal('stopped'), Type.Literal('error')]),
    lastCheckpointAt: Type.Union([Type.String(), Type.Null()]),
    itemsProcessedToday: Type.Number(),
    averageProcessingTimeMs: Type.Number(),
  }),
  healthIndicators: Type.Object({
    overall: Type.Union([
      Type.Literal('healthy'),
      Type.Literal('warning'),
      Type.Literal('critical'),
    ]),
    stuckItems: Type.Number(),
    errorRate: Type.Number(),
    throughput: Type.Number(),
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

      const byContentType: PipelineHealth['byContentType'] = {
        vocabulary: { draft: 0, candidate: 0, validated: 0, approved: 0 },
        grammar: { draft: 0, candidate: 0, validated: 0, approved: 0 },
        orthography: { draft: 0, candidate: 0, validated: 0, approved: 0 },
      };

      const tableMapping: Record<string, keyof typeof byContentType> = {
        meanings: 'vocabulary',
        utterances: 'vocabulary',
        rules: 'grammar',
        exercises: 'orthography',
      };

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
          draft: parseInt(draftResult.rows[0]?.count ?? '0', 10),
          candidate: parseInt(candidateResult.rows[0]?.count ?? '0', 10),
          validated: parseInt(validatedResult.rows[0]?.count ?? '0', 10),
          approved: parseInt(approvedResult.rows[0]?.count ?? '0', 10),
        };

        const contentType = tableMapping[tableName];
        byContentType[contentType].draft += stats.draft;
        byContentType[contentType].candidate += stats.candidate;
        byContentType[contentType].validated += stats.validated;
        byContentType[contentType].approved += stats.approved;

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

      const stuckItemsResult = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count
         FROM (
           SELECT id, updated_at FROM draft_meanings
           UNION ALL SELECT id, updated_at FROM draft_utterances
           UNION ALL SELECT id, updated_at FROM draft_rules
           UNION ALL SELECT id, updated_at FROM draft_exercises
           UNION ALL SELECT id, updated_at FROM candidate_meanings
           UNION ALL SELECT id, updated_at FROM candidate_utterances
           UNION ALL SELECT id, updated_at FROM candidate_rules
           UNION ALL SELECT id, updated_at FROM candidate_exercises
         ) AS all_items
         WHERE updated_at < CURRENT_TIMESTAMP - INTERVAL '7 days'`
      );

      const lastCheckpoint = serviceResult.rows[0]?.last_checkpoint ?? null;
      const itemsProcessedToday = parseInt(metricsResult.rows[0]?.items_processed ?? '0', 10);
      const failedCount = parseInt(failuresResult.rows[0]?.count ?? '0', 10);
      const stuckItems = parseInt(stuckItemsResult.rows[0]?.count ?? '0', 10);

      let serviceStatus: 'running' | 'stopped' | 'error' = 'stopped';
      if (lastCheckpoint) {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        serviceStatus = new Date(lastCheckpoint) > fiveMinutesAgo ? 'running' : 'stopped';
      }

      const totalAttempts = itemsProcessedToday + failedCount;
      const errorRate = totalAttempts > 0 ? (failedCount / totalAttempts) * 100 : 0;

      let overall: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (errorRate > 10 || stuckItems > 50) {
        overall = 'critical';
      } else if (errorRate > 5 || stuckItems > 20 || serviceStatus === 'stopped') {
        overall = 'warning';
      }

      return reply.status(200).send({
        summary: {
          draft: totals.draft,
          candidate: totals.candidate,
          validated: totals.validated,
          approved: totals.approved,
          total: totals.draft + totals.candidate + totals.validated + totals.approved,
        },
        byContentType,
        refinementService: {
          status: serviceStatus,
          lastCheckpointAt: lastCheckpoint ? new Date(lastCheckpoint).toISOString() : null,
          itemsProcessedToday,
          averageProcessingTimeMs: 1500,
        },
        healthIndicators: {
          overall,
          stuckItems,
          errorRate,
          throughput: itemsProcessedToday,
        },
      });
    }
  );
};

export default healthRoute;
