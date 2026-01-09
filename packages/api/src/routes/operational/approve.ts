import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema, SuccessResponseSchema } from '../../schemas/common';
import { withTransaction } from '../../utils/db.utils';
import { recordApproval } from '@polyladder/lifecycle';
import { ApprovalType } from '@polyladder/types';
import { createApprovalEventRepository } from '@polyladder/db';

const ApproveParamsSchema = Type.Object({
  id: Type.String(),
});

const ApproveBodySchema = Type.Object({
  dataType: Type.Union([
    Type.Literal('meaning'),
    Type.Literal('utterance'),
    Type.Literal('rule'),
    Type.Literal('exercise'),
  ]),
  notes: Type.Optional(Type.String()),
});

type ApproveParams = Static<typeof ApproveParamsSchema>;
type ApproveBody = Static<typeof ApproveBodySchema>;

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

      const client = await fastify.db.connect();

      try {
        await withTransaction(client, async (txClient) => {
          const itemResult = await txClient.query(
            `SELECT * FROM validated WHERE id = $1 AND data_type = $2 FOR UPDATE`,
            [id, dataType]
          );

          if (itemResult.rows.length === 0) {
            throw new Error(`Item not found in validated table`);
          }

          const approvalEventRepo = createApprovalEventRepository(txClient);

          await recordApproval(approvalEventRepo, {
            itemId: id,
            itemType: dataType,
            operatorId,
            approvalType: ApprovalType.MANUAL,
            notes,
          });

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
