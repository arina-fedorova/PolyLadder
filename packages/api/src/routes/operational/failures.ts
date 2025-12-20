import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema, PaginationQuerySchema } from '../../schemas/common';

const FailureItemSchema = Type.Object({
  id: Type.String(),
  itemId: Type.String(),
  tableName: Type.String(),
  stage: Type.String(),
  errorMessage: Type.String(),
  failedAt: Type.String(),
  retryCount: Type.Number(),
});

const FailuresQuerySchema = Type.Intersect([
  PaginationQuerySchema,
  Type.Object({
    tableName: Type.Optional(Type.String()),
    stage: Type.Optional(Type.String()),
    since: Type.Optional(Type.String()),
  }),
]);

type FailuresQuery = Static<typeof FailuresQuerySchema>;

const FailuresResponseSchema = Type.Object({
  items: Type.Array(FailureItemSchema),
  total: Type.Number(),
  limit: Type.Number(),
  offset: Type.Number(),
});

interface FailureRow {
  id: string;
  item_id: string;
  table_name: string;
  stage: string;
  error_message: string;
  failed_at: Date;
  retry_count: number;
}

const failuresRoute: FastifyPluginAsync = async function (fastify) {
  await Promise.resolve();

  fastify.get<{ Querystring: FailuresQuery }>(
    '/failures',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: FailuresQuerySchema,
        response: {
          200: FailuresResponseSchema,
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

      const limit = request.query.limit ?? 20;
      const offset = request.query.offset ?? 0;
      const { tableName, stage, since } = request.query;

      const conditions: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (tableName) {
        conditions.push(`table_name = $${paramIndex++}`);
        values.push(tableName);
      }

      if (stage) {
        conditions.push(`stage = $${paramIndex++}`);
        values.push(stage);
      }

      if (since) {
        conditions.push(`failed_at > $${paramIndex++}`);
        values.push(since);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM pipeline_failures ${whereClause}`,
        values
      );
      const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

      const failuresResult = await fastify.db.query<FailureRow>(
        `SELECT id, item_id, table_name, stage, error_message, failed_at, retry_count
         FROM pipeline_failures
         ${whereClause}
         ORDER BY failed_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      );

      const items = failuresResult.rows.map((row) => ({
        id: row.id,
        itemId: row.item_id,
        tableName: row.table_name,
        stage: row.stage,
        errorMessage: row.error_message,
        failedAt: row.failed_at.toISOString(),
        retryCount: row.retry_count,
      }));

      return reply.status(200).send({
        items,
        total,
        limit,
        offset,
      });
    }
  );
};

export default failuresRoute;
