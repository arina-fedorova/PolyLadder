import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema, PaginationQuerySchema } from '../../schemas/common';

const ReviewQueueItemSchema = Type.Object({
  id: Type.String(),
  itemId: Type.String(),
  tableName: Type.String(),
  priority: Type.Number(),
  queuedAt: Type.String(),
  reason: Type.Union([Type.String(), Type.Null()]),
});

const ReviewQueueResponseSchema = Type.Object({
  items: Type.Array(ReviewQueueItemSchema),
  total: Type.Number(),
  limit: Type.Number(),
  offset: Type.Number(),
});

type PaginationQuery = Static<typeof PaginationQuerySchema>;

interface ReviewQueueRow {
  id: string;
  item_id: string;
  table_name: string;
  priority: number;
  queued_at: Date;
  reason: string | null;
}

const reviewQueueRoute: FastifyPluginAsync = async function (fastify) {
  await Promise.resolve();

  fastify.get<{ Querystring: PaginationQuery }>(
    '/review-queue',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: PaginationQuerySchema,
        response: {
          200: ReviewQueueResponseSchema,
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

      const countResult = await fastify.db.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM review_queue WHERE reviewed_at IS NULL'
      );
      const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

      const itemsResult = await fastify.db.query<ReviewQueueRow>(
        `SELECT id, item_id, table_name, priority, queued_at, reason
         FROM review_queue
         WHERE reviewed_at IS NULL
         ORDER BY priority ASC, queued_at ASC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const items = itemsResult.rows.map((row) => ({
        id: row.id,
        itemId: row.item_id,
        tableName: row.table_name,
        priority: row.priority,
        queuedAt: row.queued_at.toISOString(),
        reason: row.reason,
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

export default reviewQueueRoute;
