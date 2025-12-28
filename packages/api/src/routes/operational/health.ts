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

      const draftResult = await fastify.db.query<{ data_type: string; count: string }>(
        `SELECT data_type, COUNT(*) as count 
         FROM pipeline_tasks 
         WHERE current_stage = 'DRAFT' AND current_status != 'failed'
         GROUP BY data_type`
      );

      const candidateResult = await fastify.db.query<{ data_type: string; count: string }>(
        `SELECT data_type, COUNT(*) as count 
         FROM pipeline_tasks 
         WHERE current_stage = 'CANDIDATE' AND current_status != 'failed'
         GROUP BY data_type`
      );

      const validatedResult = await fastify.db.query<{ data_type: string; count: string }>(
        `SELECT data_type, COUNT(*) as count 
         FROM pipeline_tasks 
         WHERE current_stage = 'VALIDATED' AND current_status != 'failed'
         GROUP BY data_type`
      );

      const approvedMeanings = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count 
         FROM approved_meanings am
         LEFT JOIN deprecations d ON d.item_id = am.id AND d.item_type = 'meaning'
         WHERE d.id IS NULL`
      );
      const approvedUtterances = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count 
         FROM approved_utterances au
         LEFT JOIN deprecations d ON d.item_id = au.id::varchar AND d.item_type = 'utterance'
         WHERE d.id IS NULL`
      );
      const approvedRules = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count 
         FROM approved_rules ar
         LEFT JOIN deprecations d ON d.item_id = ar.id AND d.item_type = 'rule'
         WHERE d.id IS NULL`
      );
      const approvedExercises = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count 
         FROM approved_exercises ae
         LEFT JOIN deprecations d ON d.item_id = ae.id::varchar AND d.item_type = 'exercise'
         WHERE d.id IS NULL`
      );

      const typeMapping: Record<string, keyof PipelineHealth['byContentType']> = {
        meaning: 'vocabulary',
        utterance: 'vocabulary',
        rule: 'grammar',
        exercise: 'orthography',
      };

      const byContentType: PipelineHealth['byContentType'] = {
        vocabulary: { draft: 0, candidate: 0, validated: 0, approved: 0 },
        grammar: { draft: 0, candidate: 0, validated: 0, approved: 0 },
        orthography: { draft: 0, candidate: 0, validated: 0, approved: 0 },
      };

      const totals = { draft: 0, candidate: 0, validated: 0, approved: 0 };

      for (const row of draftResult.rows) {
        const contentType = typeMapping[row.data_type];
        if (contentType) {
          const count = parseInt(row.count, 10);
          byContentType[contentType].draft += count;
          totals.draft += count;
        }
      }

      for (const row of candidateResult.rows) {
        const contentType = typeMapping[row.data_type];
        if (contentType) {
          const count = parseInt(row.count, 10);
          byContentType[contentType].candidate += count;
          totals.candidate += count;
        }
      }

      for (const row of validatedResult.rows) {
        const contentType = typeMapping[row.data_type];
        if (contentType) {
          const count = parseInt(row.count, 10);
          byContentType[contentType].validated += count;
          totals.validated += count;
        }
      }

      const approvedMeaningsCount = parseInt(approvedMeanings.rows[0]?.count ?? '0', 10);
      const approvedUtterancesCount = parseInt(approvedUtterances.rows[0]?.count ?? '0', 10);
      const approvedRulesCount = parseInt(approvedRules.rows[0]?.count ?? '0', 10);
      const approvedExercisesCount = parseInt(approvedExercises.rows[0]?.count ?? '0', 10);

      byContentType.vocabulary.approved = approvedMeaningsCount + approvedUtterancesCount;
      byContentType.grammar.approved = approvedRulesCount;
      byContentType.orthography.approved = approvedExercisesCount;
      totals.approved =
        approvedMeaningsCount +
        approvedUtterancesCount +
        approvedRulesCount +
        approvedExercisesCount;

      const failuresResult = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count
         FROM pipeline_failures
         WHERE failed_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'`
      );

      const metricsResult = await fastify.db.query<{
        items_processed: string;
      }>(
        `SELECT 
           COALESCE(SUM(items_processed), 0) as items_processed
         FROM pipeline_metrics
         WHERE recorded_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'`
      );

      const serviceResult = await fastify.db.query<{ last_checkpoint: Date }>(
        `SELECT last_checkpoint
         FROM service_state
         WHERE service_name = 'refinement_service'`
      );

      const stuckDrafts = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM drafts WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '7 days'`
      );
      const stuckCandidates = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM candidates WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '7 days'`
      );

      const lastCheckpoint = serviceResult.rows[0]?.last_checkpoint ?? null;
      const itemsProcessedToday = parseInt(metricsResult.rows[0]?.items_processed ?? '0', 10);
      const failedCount = parseInt(failuresResult.rows[0]?.count ?? '0', 10);
      const stuckItems =
        parseInt(stuckDrafts.rows[0]?.count ?? '0', 10) +
        parseInt(stuckCandidates.rows[0]?.count ?? '0', 10);

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
