import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema, SuccessResponseSchema } from '../../schemas/common';
import { withTransaction } from '../../utils/db.utils';

const ApproveParamsSchema = Type.Object({
  id: Type.String(),
});

const ApproveBodySchema = Type.Object({
  dataType: Type.String(),
  notes: Type.Optional(Type.String()),
});

type ApproveParams = Static<typeof ApproveParamsSchema>;
type ApproveBody = Static<typeof ApproveBodySchema>;

const VALID_DATA_TYPES = ['meaning', 'utterance', 'rule', 'exercise'] as const;
type ValidDataType = (typeof VALID_DATA_TYPES)[number];

function isValidDataType(name: string): name is ValidDataType {
  return VALID_DATA_TYPES.includes(name as ValidDataType);
}

const approveRoute: FastifyPluginAsync = async function (fastify) {
  await Promise.resolve();

  fastify.post<{ Params: ApproveParams; Body: ApproveBody }>(
    '/approve/:id',
    {
      preHandler: [authMiddleware],
      schema: {
        params: ApproveParamsSchema,
        body: ApproveBodySchema,
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
      const { dataType, notes } = request.body;
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

      const client = await fastify.db.connect();

      try {
        await withTransaction(client, async (txClient) => {
          // Check item exists in validated table
          const itemResult = await txClient.query(
            `SELECT * FROM validated WHERE id = $1 AND data_type = $2 FOR UPDATE`,
            [id, dataType]
          );

          if (itemResult.rows.length === 0) {
            throw new Error(`Item not found in validated table`);
          }

          const item = itemResult.rows[0] as Record<string, unknown>;
          const validatedData = item.validated_data;

          // Insert into approved table based on data type
          const approvedTable = `approved_${dataType}`;
          await txClient.query(
            `INSERT INTO ${approvedTable} SELECT * FROM jsonb_populate_record(null::${approvedTable}, $1::jsonb)`,
            [JSON.stringify(validatedData)]
          );

          await txClient.query(`DELETE FROM validated WHERE id = $1`, [id]);

          await txClient.query(
            `INSERT INTO approval_events (item_id, item_type, operator_id, approval_type, notes, created_at)
             VALUES ($1, $2, $3, 'MANUAL', $4, CURRENT_TIMESTAMP)`,
            [id, dataType, operatorId, notes ?? null]
          );

          await txClient.query(
            `UPDATE review_queue
             SET reviewed_at = CURRENT_TIMESTAMP, review_decision = 'approve'
             WHERE item_id = $1`,
            [id]
          );
        });

        request.log.info({ itemId: id, dataType, operatorId }, 'Item approved');

        return reply.status(200).send({
          success: true,
          message: 'Item approved successfully',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Approval failed';
        request.log.error({ err: error, itemId: id, dataType }, 'Approval failed');

        return reply.status(400).send({
          error: {
            statusCode: 400,
            message,
            requestId: request.id,
            code: 'APPROVAL_FAILED',
          },
        });
      } finally {
        client.release();
      }
    }
  );
};

export default approveRoute;
