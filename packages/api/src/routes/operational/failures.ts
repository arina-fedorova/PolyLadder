import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema, PaginationQuerySchema } from '../../schemas/common';

const FailureItemSchema = Type.Object({
  id: Type.String(),
  itemId: Type.String(),
  dataType: Type.String(),
  state: Type.String(),
  errorMessage: Type.String(),
  failedAt: Type.String(),
});

const FailuresQuerySchema = Type.Intersect([
  PaginationQuerySchema,
  Type.Object({
    dataType: Type.Optional(Type.String()),
    state: Type.Optional(Type.String()),
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

const RetryResponseSchema = Type.Object({
  success: Type.Boolean(),
  message: Type.String(),
});

const BulkRetryBodySchema = Type.Object({
  failureIds: Type.Array(Type.String()),
});

const BulkRetryResponseSchema = Type.Object({
  success: Type.Boolean(),
  retriedCount: Type.Number(),
});

interface FailureRow {
  id: string;
  item_id: string;
  data_type: string;
  state: string;
  error_message: string;
  failed_at: Date;
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
      const { dataType, state, since } = request.query;

      const conditions: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (dataType) {
        conditions.push(`data_type = $${paramIndex++}`);
        values.push(dataType);
      }

      if (state) {
        conditions.push(`state = $${paramIndex++}`);
        values.push(state);
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
        `SELECT id, item_id, data_type, state, error_message, failed_at
         FROM pipeline_failures
         ${whereClause}
         ORDER BY failed_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      );

      const items = failuresResult.rows.map((row) => ({
        id: row.id,
        itemId: row.item_id,
        dataType: row.data_type,
        state: row.state,
        errorMessage: row.error_message,
        failedAt: row.failed_at.toISOString(),
      }));

      return reply.status(200).send({
        items,
        total,
        limit,
        offset,
      });
    }
  );

  fastify.post<{ Params: { id: string } }>(
    '/failures/:id/retry',
    {
      preHandler: [authMiddleware],
      schema: {
        params: Type.Object({
          id: Type.String(),
        }),
        response: {
          200: RetryResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
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

      const { id } = request.params;

      const failureResult = await fastify.db.query<FailureRow>(
        `SELECT id, item_id, data_type, state FROM pipeline_failures WHERE id = $1`,
        [id]
      );

      if (failureResult.rows.length === 0) {
        return reply.status(404).send({
          error: {
            statusCode: 404,
            message: 'Failure not found',
            requestId: request.id,
            code: 'NOT_FOUND',
          },
        });
      }

      const failure = failureResult.rows[0];

      const tableMap: Record<string, string> = {
        meaning: 'candidate_meanings',
        utterance: 'candidate_utterances',
        rule: 'candidate_rules',
        exercise: 'candidate_exercises',
      };

      const tableName = tableMap[failure.data_type];
      if (tableName) {
        await fastify.db.query(
          `UPDATE ${tableName} SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [failure.item_id]
        );
      }

      await fastify.db.query(`DELETE FROM pipeline_failures WHERE id = $1`, [id]);

      return reply.status(200).send({
        success: true,
        message: 'Item queued for revalidation',
      });
    }
  );

  fastify.post<{ Body: Static<typeof BulkRetryBodySchema> }>(
    '/failures/bulk-retry',
    {
      preHandler: [authMiddleware],
      schema: {
        body: BulkRetryBodySchema,
        response: {
          200: BulkRetryResponseSchema,
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

      const { failureIds } = request.body;

      if (failureIds.length === 0) {
        return reply.status(200).send({
          success: true,
          retriedCount: 0,
        });
      }

      const failuresResult = await fastify.db.query<FailureRow>(
        `SELECT id, item_id, data_type FROM pipeline_failures WHERE id = ANY($1)`,
        [failureIds]
      );

      const tableMap: Record<string, string> = {
        meaning: 'candidate_meanings',
        utterance: 'candidate_utterances',
        rule: 'candidate_rules',
        exercise: 'candidate_exercises',
      };

      for (const failure of failuresResult.rows) {
        const tableName = tableMap[failure.data_type];
        if (tableName) {
          await fastify.db.query(
            `UPDATE ${tableName} SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [failure.item_id]
          );
        }
      }

      await fastify.db.query(`DELETE FROM pipeline_failures WHERE id = ANY($1)`, [failureIds]);

      return reply.status(200).send({
        success: true,
        retriedCount: failuresResult.rows.length,
      });
    }
  );
};

export default failuresRoute;
