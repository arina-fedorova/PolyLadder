import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema } from '../../schemas/common';

const TrendsQuerySchema = Type.Object({
  timeRange: Type.Optional(
    Type.Union([Type.Literal('7d'), Type.Literal('30d'), Type.Literal('90d')])
  ),
});

type TrendsQuery = Static<typeof TrendsQuerySchema>;

const TrendDataPointSchema = Type.Object({
  date: Type.String(),
  meaning: Type.Number(),
  utterance: Type.Number(),
  rule: Type.Number(),
  exercise: Type.Number(),
  total: Type.Number(),
});

const TrendsResponseSchema = Type.Object({
  trends: Type.Array(TrendDataPointSchema),
  timeRange: Type.String(),
});

interface TrendRow {
  date: Date;
  meaning: string;
  utterance: string;
  rule: string;
  exercise: string;
}

const failureTrendsRoute: FastifyPluginAsync = async function (fastify) {
  await Promise.resolve();

  fastify.get<{ Querystring: TrendsQuery }>(
    '/failures/trends',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: TrendsQuerySchema,
        response: {
          200: TrendsResponseSchema,
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

      const timeRange = request.query.timeRange ?? '7d';

      let interval = '7 days';
      if (timeRange === '30d') {
        interval = '30 days';
      } else if (timeRange === '90d') {
        interval = '90 days';
      }

      const query = `
        WITH date_series AS (
          SELECT generate_series(
            (CURRENT_DATE - INTERVAL '${interval}')::date,
            CURRENT_DATE,
            INTERVAL '1 day'
          )::date as date
        ),
        failure_counts AS (
          SELECT
            DATE(failed_at) as date,
            data_type,
            COUNT(*) as count
          FROM pipeline_failures
          WHERE failed_at > CURRENT_TIMESTAMP - INTERVAL '${interval}'
          GROUP BY DATE(failed_at), data_type
        )
        SELECT
          ds.date,
          COALESCE(SUM(CASE WHEN fc.data_type = 'meaning' THEN fc.count ELSE 0 END), 0) as meaning,
          COALESCE(SUM(CASE WHEN fc.data_type = 'utterance' THEN fc.count ELSE 0 END), 0) as utterance,
          COALESCE(SUM(CASE WHEN fc.data_type = 'rule' THEN fc.count ELSE 0 END), 0) as rule,
          COALESCE(SUM(CASE WHEN fc.data_type = 'exercise' THEN fc.count ELSE 0 END), 0) as exercise
        FROM date_series ds
        LEFT JOIN failure_counts fc ON ds.date = fc.date
        GROUP BY ds.date
        ORDER BY ds.date ASC
      `;

      const result = await fastify.db.query<TrendRow>(query);

      const trends = result.rows.map((row) => {
        const meaning = parseInt(String(row.meaning), 10);
        const utterance = parseInt(String(row.utterance), 10);
        const rule = parseInt(String(row.rule), 10);
        const exercise = parseInt(String(row.exercise), 10);

        return {
          date: row.date.toISOString().split('T')[0],
          meaning,
          utterance,
          rule,
          exercise,
          total: meaning + utterance + rule + exercise,
        };
      });

      return reply.status(200).send({
        trends,
        timeRange,
      });
    }
  );
};

export default failureTrendsRoute;
