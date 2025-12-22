import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema } from '../../schemas/common';

const ActivityLogEntrySchema = Type.Object({
  id: Type.String(),
  itemType: Type.Union([
    Type.Literal('vocabulary'),
    Type.Literal('grammar'),
    Type.Literal('orthography'),
  ]),
  itemId: Type.String(),
  fromState: Type.String(),
  toState: Type.String(),
  operatorEmail: Type.Optional(Type.String()),
  timestamp: Type.String(),
  action: Type.Union([
    Type.Literal('approved'),
    Type.Literal('rejected'),
    Type.Literal('auto-promoted'),
  ]),
});

const ActivityLogResponseSchema = Type.Object({
  activities: Type.Array(ActivityLogEntrySchema),
});

type ActivityLogEntry = Static<typeof ActivityLogEntrySchema>;

const activityLogRoute: FastifyPluginAsync = async function (fastify) {
  await Promise.resolve();

  fastify.get(
    '/activity-log',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: Type.Object({
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
        }),
        response: {
          200: ActivityLogResponseSchema,
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

      const { limit = 10 } = request.query as { limit?: number };

      const result = await fastify.db.query<{
        id: string;
        item_type: string;
        item_id: string;
        operator_id: string | null;
        approval_type: string;
        notes: string | null;
        created_at: Date;
        operator_email: string | null;
      }>(
        `SELECT 
           ae.id,
           ae.item_type,
           ae.item_id,
           ae.operator_id,
           ae.approval_type,
           ae.notes,
           ae.created_at,
           u.email as operator_email
         FROM approval_events ae
         LEFT JOIN users u ON ae.operator_id = u.id
         ORDER BY ae.created_at DESC
         LIMIT $1`,
        [limit]
      );

      const activities: ActivityLogEntry[] = result.rows.map((row) => {
        let itemType: 'vocabulary' | 'grammar' | 'orthography' = 'vocabulary';
        if (row.item_type === 'meaning' || row.item_type === 'utterance') {
          itemType = 'vocabulary';
        } else if (row.item_type === 'rule') {
          itemType = 'grammar';
        } else if (row.item_type === 'exercise') {
          itemType = 'orthography';
        }

        let action: 'approved' | 'rejected' | 'auto-promoted' = 'auto-promoted';
        if (row.approval_type === 'MANUAL') {
          if (row.notes && row.notes.length > 0) {
            action = 'rejected';
          } else {
            action = 'approved';
          }
        } else if (row.approval_type === 'AUTOMATIC') {
          action = 'auto-promoted';
        }

        return {
          id: row.id,
          itemType,
          itemId: row.item_id,
          fromState: 'VALIDATED',
          toState: action === 'rejected' ? 'REJECTED' : 'APPROVED',
          operatorEmail: row.operator_email ?? undefined,
          timestamp: new Date(row.created_at).toISOString(),
          action,
        };
      });

      return reply.status(200).send({ activities });
    }
  );
};

export default activityLogRoute;
