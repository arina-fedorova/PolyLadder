import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema, SuccessResponseSchema } from '../../schemas/common';
import { withTransaction } from '../../utils/db.utils';

const ApproveParamsSchema = Type.Object({
  id: Type.String(),
});

const ApproveBodySchema = Type.Object({
  tableName: Type.String(),
  notes: Type.Optional(Type.String()),
});

type ApproveParams = Static<typeof ApproveParamsSchema>;
type ApproveBody = Static<typeof ApproveBodySchema>;

const VALID_TABLES = ['meanings', 'utterances', 'rules', 'exercises'] as const;
type ValidTable = (typeof VALID_TABLES)[number];

function isValidTable(name: string): name is ValidTable {
  return VALID_TABLES.includes(name as ValidTable);
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
      const { tableName, notes } = request.body;
      const operatorId = request.user.userId;

      if (!isValidTable(tableName)) {
        return reply.status(400).send({
          error: {
            statusCode: 400,
            message: `Invalid table name: ${tableName}. Valid tables: ${VALID_TABLES.join(', ')}`,
            requestId: request.id,
            code: 'INVALID_TABLE',
          },
        });
      }

      const client = await fastify.db.connect();

      try {
        await withTransaction(client, async (txClient) => {
          const validatedTable = `validated_${tableName}`;
          const approvedTable = `approved_${tableName}`;

          const itemResult = await txClient.query(
            `SELECT * FROM ${validatedTable} WHERE id = $1 FOR UPDATE`,
            [id]
          );

          if (itemResult.rows.length === 0) {
            throw new Error(`Item not found in ${validatedTable}`);
          }

          const item = itemResult.rows[0] as Record<string, unknown>;

          const columnNames = Object.keys(item).filter((k) => k !== 'id');
          const columnPlaceholders = columnNames.map((_, i) => `$${i + 1}`);
          const columnValues = columnNames.map((k) => item[k]);

          await txClient.query(
            `INSERT INTO ${approvedTable} (${columnNames.join(', ')})
             VALUES (${columnPlaceholders.join(', ')})`,
            columnValues
          );

          await txClient.query(`DELETE FROM ${validatedTable} WHERE id = $1`, [id]);

          await txClient.query(
            `INSERT INTO approval_events (item_id, item_type, operator_id, approval_type, notes, created_at)
             VALUES ($1, $2, $3, 'MANUAL', $4, CURRENT_TIMESTAMP)`,
            [id, tableName, operatorId, notes ?? null]
          );

          await txClient.query(
            `UPDATE review_queue
             SET reviewed_at = CURRENT_TIMESTAMP, review_decision = 'approved'
             WHERE item_id = $1 AND table_name = $2`,
            [id, tableName]
          );
        });

        request.log.info({ itemId: id, tableName, operatorId }, 'Item approved');

        return reply.status(200).send({
          success: true,
          message: 'Item approved successfully',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Approval failed';
        request.log.error({ err: error, itemId: id, tableName }, 'Approval failed');

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
