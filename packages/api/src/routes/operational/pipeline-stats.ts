import { FastifyPluginAsync } from 'fastify';
import { authMiddleware } from '../../middleware/auth';

interface PipelineStats {
  drafts: number;
  candidates: number;
  validated: number;
  approved: {
    rules: number;
    exercises: number;
    meanings: number;
    utterances: number;
  };
}

const pipelineStatsRoute: FastifyPluginAsync = async function (fastify) {
  fastify.get<Record<string, never>>(
    '/pipeline-stats',
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

      const draftsResult = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM drafts
         WHERE id NOT IN (SELECT draft_id FROM candidates)`
      );

      const candidatesResult = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM candidates
         WHERE id NOT IN (SELECT candidate_id FROM validated)`
      );

      const validatedResult = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM validated
         WHERE id::varchar NOT IN (SELECT item_id FROM approval_events)`
      );

      const rulesResult = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM approved_rules`
      );

      const exercisesResult = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM approved_exercises`
      );

      const meaningsResult = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM approved_meanings`
      );

      const utterancesResult = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM approved_utterances`
      );

      const stats: PipelineStats = {
        drafts: parseInt(draftsResult.rows[0]?.count || '0', 10),
        candidates: parseInt(candidatesResult.rows[0]?.count || '0', 10),
        validated: parseInt(validatedResult.rows[0]?.count || '0', 10),
        approved: {
          rules: parseInt(rulesResult.rows[0]?.count || '0', 10),
          exercises: parseInt(exercisesResult.rows[0]?.count || '0', 10),
          meanings: parseInt(meaningsResult.rows[0]?.count || '0', 10),
          utterances: parseInt(utterancesResult.rows[0]?.count || '0', 10),
        },
      };

      return reply.send(stats);
    }
  );

  await Promise.resolve();
};

export default pipelineStatsRoute;
