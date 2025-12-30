import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema, SuccessResponseSchema } from '../../schemas/common';
import { withTransaction } from '../../utils/db.utils';

const RejectParamsSchema = Type.Object({
  id: Type.String(),
});

const RejectBodySchema = Type.Object({
  dataType: Type.Union([
    Type.Literal('meaning'),
    Type.Literal('utterance'),
    Type.Literal('rule'),
    Type.Literal('exercise'),
  ]),
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
            message: `Invalid data type: ${String(dataType)}. Valid types: ${VALID_DATA_TYPES.join(', ')}`,
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

      const validatedItemResult = await fastify.db.query<{
        id: string;
        validated_data: Record<string, unknown>;
      }>(`SELECT id, validated_data FROM validated WHERE id = $1 AND data_type = $2`, [
        id,
        dataType,
      ]);

      if (validatedItemResult.rows.length === 0) {
        return reply.status(404).send({
          error: {
            statusCode: 404,
            message: `Item not found in validated table`,
            requestId: request.id,
            code: 'NOT_FOUND',
          },
        });
      }

      const validatedItem = validatedItemResult.rows[0];
      const client = await fastify.db.connect();

      try {
        await withTransaction(client, async (txClient) => {
          await txClient.query(
            `INSERT INTO rejected_items (validated_id, data_type, operator_id, reason, rejected_data)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, dataType, operatorId, reason, JSON.stringify(validatedItem.validated_data)]
          );

          await txClient.query(
            `UPDATE review_queue
             SET reviewed_at = CURRENT_TIMESTAMP, review_decision = 'reject'
             WHERE item_id = $1`,
            [id]
          );

          await txClient.query(`DELETE FROM validated WHERE id = $1`, [id]);
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Rejection failed';
        request.log.error({ err: error, itemId: id, dataType }, 'Rejection failed');

        return reply.status(400).send({
          error: {
            statusCode: 400,
            message,
            requestId: request.id,
            code: 'REJECTION_FAILED',
          },
        });
      } finally {
        client.release();
      }

      request.log.info({ itemId: id, dataType, operatorId, reason }, 'Item rejected');

      return reply.status(200).send({
        success: true,
        message: 'Item rejected and removed from validated queue',
      });
    }
  );
};

export default rejectRoute;
