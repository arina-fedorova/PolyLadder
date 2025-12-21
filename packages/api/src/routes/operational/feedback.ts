import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema, SuccessResponseSchema } from '../../schemas/common';
import { FeedbackService } from '../../services/feedback.service';

const CreateFeedbackSchema = Type.Object({
  itemId: Type.String({ format: 'uuid' }),
  itemType: Type.Union([Type.Literal('draft'), Type.Literal('candidate'), Type.Literal('mapping')]),
  action: Type.Union([Type.Literal('reject'), Type.Literal('revise'), Type.Literal('flag')]),
  category: Type.Union([
    Type.Literal('incorrect_content'),
    Type.Literal('wrong_level'),
    Type.Literal('poor_quality'),
    Type.Literal('missing_context'),
    Type.Literal('grammatical_error'),
    Type.Literal('inappropriate'),
    Type.Literal('duplicate'),
    Type.Literal('off_topic'),
    Type.Literal('other'),
  ]),
  comment: Type.String({ minLength: 10, maxLength: 2000 }),
  suggestedCorrection: Type.Optional(Type.String({ maxLength: 2000 })),
});

const CreateTemplateSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }),
  category: Type.Union([
    Type.Literal('incorrect_content'),
    Type.Literal('wrong_level'),
    Type.Literal('poor_quality'),
    Type.Literal('missing_context'),
    Type.Literal('grammatical_error'),
    Type.Literal('inappropriate'),
    Type.Literal('duplicate'),
    Type.Literal('off_topic'),
    Type.Literal('other'),
  ]),
  templateText: Type.String({ minLength: 10, maxLength: 2000 }),
});

const BulkRejectSchema = Type.Object({
  itemIds: Type.Array(Type.String({ format: 'uuid' })),
  itemType: Type.Union([Type.Literal('draft'), Type.Literal('candidate'), Type.Literal('mapping')]),
  category: Type.String(),
  comment: Type.String(),
});

type CreateFeedbackInput = Static<typeof CreateFeedbackSchema>;
type CreateTemplateInput = Static<typeof CreateTemplateSchema>;
type BulkRejectInput = Static<typeof BulkRejectSchema>;

export const feedbackRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const feedbackService = new FeedbackService(fastify.db);

  fastify.post<{ Body: CreateFeedbackInput }>(
    '/feedback',
    {
      preHandler: [authMiddleware],
      schema: {
        body: CreateFeedbackSchema,
        response: {
          201: Type.Object({
            success: Type.Literal(true),
            id: Type.String(),
          }),
          400: ErrorResponseSchema,
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

      const input = request.body;

      const feedbackId = await feedbackService.createFeedback({
        itemId: input.itemId,
        itemType: input.itemType,
        operatorId: request.user.userId,
        action: input.action,
        category: input.category,
        comment: input.comment,
        suggestedCorrection: input.suggestedCorrection,
      });

      return reply.status(201).send({ success: true, id: feedbackId });
    }
  );

  fastify.get<{ Params: { itemId: string } }>(
    '/feedback/item/:itemId',
    {
      preHandler: [authMiddleware],
      schema: {
        params: Type.Object({
          itemId: Type.String({ format: 'uuid' }),
        }),
        response: {
          200: Type.Object({
            feedback: Type.Array(Type.Any()),
            versions: Type.Array(Type.Any()),
          }),
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

      const { itemId } = request.params;

      const feedback = await feedbackService.getFeedbackForItem(itemId);
      const versions = await feedbackService.getItemVersions(itemId);

      return reply.send({ feedback, versions });
    }
  );

  fastify.get<{ Querystring: { days?: number } }>(
    '/feedback/stats',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: Type.Object({
          days: Type.Optional(Type.Number({ minimum: 1, maximum: 365 })),
        }),
        response: {
          200: Type.Object({
            totalFeedback: Type.Number(),
            byCategory: Type.Record(Type.String(), Type.Number()),
            byOperator: Type.Record(Type.String(), Type.Number()),
            retrySuccessRate: Type.Number(),
          }),
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

      const { days = 30 } = request.query;
      const stats = await feedbackService.getStats(days);
      return reply.send(stats);
    }
  );

  fastify.get<{ Querystring: { category?: string } }>(
    '/feedback/templates',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: Type.Object({
          category: Type.Optional(Type.String()),
        }),
        response: {
          200: Type.Object({
            templates: Type.Array(Type.Any()),
          }),
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

      const { category } = request.query;
      const templates = await feedbackService.getTemplates(category);
      return reply.send({ templates });
    }
  );

  fastify.post<{ Body: CreateTemplateInput }>(
    '/feedback/templates',
    {
      preHandler: [authMiddleware],
      schema: {
        body: CreateTemplateSchema,
        response: {
          201: Type.Object({
            success: Type.Literal(true),
            id: Type.String(),
          }),
          400: ErrorResponseSchema,
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

      const input = request.body;

      const templateId = await feedbackService.createTemplate({
        name: input.name,
        category: input.category,
        templateText: input.templateText,
        createdBy: request.user.userId,
      });

      return reply.status(201).send({ success: true, id: templateId });
    }
  );

  fastify.post<{ Params: { id: string } }>(
    '/feedback/templates/:id/use',
    {
      preHandler: [authMiddleware],
      schema: {
        params: Type.Object({
          id: Type.String({ format: 'uuid' }),
        }),
        response: {
          200: SuccessResponseSchema,
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

      const { id } = request.params;
      await feedbackService.incrementTemplateUse(id);
      return reply.send({ success: true });
    }
  );

  fastify.get<{ Querystring: { status?: string; limit?: number } }>(
    '/feedback/retry-queue',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: Type.Object({
          status: Type.Optional(Type.String()),
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
        }),
        response: {
          200: Type.Object({
            items: Type.Array(Type.Any()),
          }),
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

      const { status = 'pending', limit = 20 } = request.query;

      const result = await fastify.db.query(
        `SELECT r.*, f.comment, f.category, f.suggested_correction
         FROM retry_queue r
         JOIN operator_feedback f ON r.feedback_id = f.id
         WHERE r.status = $1
         ORDER BY r.scheduled_at
         LIMIT $2`,
        [status, limit]
      );

      return reply.send({ items: result.rows });
    }
  );

  fastify.post<{ Body: BulkRejectInput }>(
    '/feedback/bulk-reject',
    {
      preHandler: [authMiddleware],
      schema: {
        body: BulkRejectSchema,
        response: {
          200: Type.Object({
            rejected: Type.Number(),
            total: Type.Number(),
          }),
          400: ErrorResponseSchema,
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

      const { itemIds, itemType, category, comment } = request.body;

      let rejected = 0;
      const errors: string[] = [];

      for (const itemId of itemIds) {
        try {
          await feedbackService.createFeedback({
            itemId,
            itemType,
            operatorId: request.user.userId,
            action: 'reject',
            category,
            comment,
          });
          rejected++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          request.log.error({ itemId, error: errorMessage }, `Failed to reject ${itemId}`);
          errors.push(errorMessage);
        }
      }

      return reply.send({
        rejected,
        total: itemIds.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  );
};
