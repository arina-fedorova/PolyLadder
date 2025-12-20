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
        data_type: string;
        item_id: string;
        from_state: string;
        to_state: string;
        operator_email: string | null;
        event_timestamp: Date;
        action: string;
      }>(
        `SELECT 
           id,
           data_type,
           item_id,
           from_state,
           to_state,
           operator_email,
           event_timestamp,
           action
         FROM approval_events
         ORDER BY event_timestamp DESC
         LIMIT $1`,
        [limit]
      );

      const activities: ActivityLogEntry[] = result.rows.map((row) => {
        let itemType: 'vocabulary' | 'grammar' | 'orthography' = 'vocabulary';
        if (row.data_type === 'meaning' || row.data_type === 'utterance') {
          itemType = 'vocabulary';
        } else if (row.data_type === 'rule') {
          itemType = 'grammar';
        } else if (row.data_type === 'exercise') {
          itemType = 'orthography';
        }

        let action: 'approved' | 'rejected' | 'auto-promoted' = 'auto-promoted';
        if (row.action === 'approve') {
          action = 'approved';
        } else if (row.action === 'reject') {
          action = 'rejected';
        }

        return {
          id: row.id,
          itemType,
          itemId: row.item_id,
          fromState: row.from_state,
          toState: row.to_state,
          operatorEmail: row.operator_email ?? undefined,
          timestamp: new Date(row.event_timestamp).toISOString(),
          action,
        };
      });

      return reply.status(200).send({ activities });
    }
  );
};

export default activityLogRoute;
