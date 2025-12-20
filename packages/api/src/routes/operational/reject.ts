import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema, SuccessResponseSchema } from '../../schemas/common';

const RejectParamsSchema = Type.Object({
  id: Type.String(),
});

const RejectBodySchema = Type.Object({
  dataType: Type.String(),
  reason: Type.String({ minLength: 10, maxLength: 500 }),
});

type RejectParams = Static<typeof RejectParamsSchema>;
type RejectBody = Static<typeof RejectBodySchema>;

const VALID_DATA_TYPES = ['meaning', 'utterance', 'rule', 'exercise'] as const;
type ValidDataType = (typeof VALID_DATA_TYPES)[number];

function isValidDataType(name: string): name is ValidDataType {
  return VALID_DATA_TYPES.includes(name as ValidDataType);
}

const rejectRoute: FastifyPluginAsync = async function (fastify) {
  await Promise.resolve();

  fastify.post<{ Params: RejectParams; Body: RejectBody }>(
    '/reject/:id',
    {
      preHandler: [authMiddleware],
      schema: {
        params: RejectParamsSchema,
        body: RejectBodySchema,
        response: {
          200: SuccessResponseSchema,
          400: ErrorResponseSchema,
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
      const { dataType, reason } = request.body;
      const operatorId = request.user.userId;

      if (!isValidDataType(dataType)) {
        return reply.status(400).send({
          error: {
            statusCode: 400,
            message: `Invalid data type: ${dataType}. Valid types: ${VALID_DATA_TYPES.join(', ')}`,
            requestId: request.id,
            code: 'INVALID_DATA_TYPE',
          },
        });
      }

      const itemResult = await fastify.db.query(
        `SELECT id FROM validated WHERE id = $1 AND data_type = $2`,
        [id, dataType]
      );

      if (itemResult.rows.length === 0) {
        return reply.status(404).send({
          error: {
            statusCode: 404,
            message: `Item not found in validated table`,
            requestId: request.id,
            code: 'NOT_FOUND',
          },
        });
      }

      await fastify.db.query(`DELETE FROM validated WHERE id = $1`, [id]);

      await fastify.db.query(
        `INSERT INTO approval_events (item_id, item_type, operator_id, approval_type, notes, created_at)
         VALUES ($1, $2, $3, 'MANUAL', $4, CURRENT_TIMESTAMP)`,
        [id, dataType, operatorId, reason]
      );

      await fastify.db.query(
        `UPDATE review_queue
         SET reviewed_at = CURRENT_TIMESTAMP, review_decision = 'reject'
         WHERE item_id = $1`,
        [id]
      );

      request.log.info({ itemId: id, dataType, operatorId, reason }, 'Item rejected');

      return reply.status(200).send({
        success: true,
        message: 'Item rejected and removed from validated queue',
      });
    }
  );
};

export default rejectRoute;
