import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { ReviewSessionService } from '../../services/review/review-session.service';

// Query schemas
const QueueQuerySchema = Type.Object({
  language: Type.Optional(Type.String({ minLength: 2, maxLength: 2 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 50 })),
});

type QueueQuery = Static<typeof QueueQuerySchema>;

const StartSessionQuerySchema = Type.Object({
  language: Type.Optional(Type.String({ minLength: 2, maxLength: 2 })),
});

type StartSessionQuery = Static<typeof StartSessionQuerySchema>;

// Request schemas
const SubmitReviewRequestSchema = Type.Object({
  itemId: Type.String(),
  itemType: Type.String(),
  rating: Type.Union([
    Type.Literal('again'),
    Type.Literal('hard'),
    Type.Literal('good'),
    Type.Literal('easy'),
  ]),
  responseTimeMs: Type.Number({ minimum: 0 }),
  wasCorrect: Type.Boolean(),
  sessionId: Type.Optional(Type.String({ format: 'uuid' })),
});

type SubmitReviewRequest = Static<typeof SubmitReviewRequestSchema>;

// Response schemas
const QueueItemSchema = Type.Object({
  id: Type.String(),
  itemType: Type.String(),
  itemId: Type.String(),
  dueDate: Type.String(),
  intervalDays: Type.Number(),
  easeFactor: Type.Number(),
  repetitions: Type.Number(),
  content: Type.Object({
    wordText: Type.Optional(Type.String()),
    translation: Type.Optional(Type.String()),
    definition: Type.Optional(Type.String()),
    audioUrl: Type.Optional(Type.String()),
    level: Type.Optional(Type.String()),
  }),
});

const QueueResponseSchema = Type.Object({
  total: Type.Number(),
  items: Type.Array(QueueItemSchema),
  nextReviewAt: Type.Union([Type.String(), Type.Null()]),
});

const StartSessionResponseSchema = Type.Object({
  sessionId: Type.String({ format: 'uuid' }),
  itemsInQueue: Type.Number(),
  startedAt: Type.String(),
});

const SubmitReviewResponseSchema = Type.Object({
  success: Type.Boolean(),
  nextReview: Type.Object({
    dueDate: Type.String(),
    interval: Type.Number(),
    repetitions: Type.Number(),
    easeFactor: Type.Number(),
  }),
});

const SessionStatsSchema = Type.Object({
  sessionId: Type.String({ format: 'uuid' }),
  itemsReviewed: Type.Number(),
  correctCount: Type.Number(),
  accuracyPct: Type.Number(),
  durationSeconds: Type.Number(),
  avgResponseTimeMs: Type.Number(),
  status: Type.Union([
    Type.Literal('active'),
    Type.Literal('completed'),
    Type.Literal('abandoned'),
  ]),
  startedAt: Type.String(),
  completedAt: Type.Union([Type.String(), Type.Null()]),
});

const SessionHistoryResponseSchema = Type.Object({
  sessions: Type.Array(SessionStatsSchema),
});

const reviewRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const reviewService = new ReviewSessionService(fastify.db);

  /**
   * GET /learning/review/queue
   * Get items due for review
   */
  fastify.get<{ Querystring: QueueQuery }>(
    '/review/queue',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: QueueQuerySchema,
        response: {
          200: QueueResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language, limit = 50 } = request.query;

      const result = await reviewService.getQueue(userId, language, limit);

      return reply.status(200).send({
        total: result.total,
        items: result.items.map((item) => ({
          ...item,
          dueDate: item.dueDate.toISOString(),
        })),
        nextReviewAt: result.nextReviewAt,
      });
    }
  );

  /**
   * POST /learning/review/session/start
   * Start a new review session
   */
  fastify.post<{ Querystring: StartSessionQuery }>(
    '/review/session/start',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: StartSessionQuerySchema,
        response: {
          200: StartSessionResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.query;

      const result = await reviewService.startSession(userId, language);

      request.log.info(
        { userId, sessionId: result.sessionId, itemsInQueue: result.itemsInQueue },
        'Review session started'
      );

      return reply.status(200).send(result);
    }
  );

  /**
   * POST /learning/review/submit
   * Submit a review and update SRS schedule
   */
  fastify.post<{ Body: SubmitReviewRequest }>(
    '/review/submit',
    {
      preHandler: [authMiddleware],
      schema: {
        body: SubmitReviewRequestSchema,
        response: {
          200: SubmitReviewResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { itemId, itemType, rating, responseTimeMs, wasCorrect, sessionId } = request.body;

      try {
        const result = await reviewService.submitReview(userId, {
          itemId,
          itemType,
          rating,
          responseTimeMs,
          wasCorrect,
          sessionId,
        });

        request.log.info(
          { userId, itemId, rating, nextInterval: result.nextReview.interval },
          'Review submitted'
        );

        return reply.status(200).send(result);
      } catch (error) {
        if ((error as Error).message?.includes('SRS item not found')) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: `Item ${itemId} not found in review queue`,
          });
        }
        throw error;
      }
    }
  );

  /**
   * GET /learning/review/session/:sessionId
   * Get session stats
   */
  fastify.get<{ Params: { sessionId: string } }>(
    '/review/session/:sessionId',
    {
      preHandler: [authMiddleware],
      schema: {
        params: Type.Object({
          sessionId: Type.String({ format: 'uuid' }),
        }),
        response: {
          200: SessionStatsSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { sessionId } = request.params;

      const result = await reviewService.getSession(sessionId, userId);

      if (!result) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Session not found',
        });
      }

      return reply.status(200).send(result);
    }
  );

  /**
   * POST /learning/review/session/:sessionId/complete
   * Complete a review session
   */
  fastify.post<{ Params: { sessionId: string } }>(
    '/review/session/:sessionId/complete',
    {
      preHandler: [authMiddleware],
      schema: {
        params: Type.Object({
          sessionId: Type.String({ format: 'uuid' }),
        }),
        response: {
          200: SessionStatsSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { sessionId } = request.params;

      const result = await reviewService.completeSession(sessionId, userId);

      if (!result) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Session not found or already completed',
        });
      }

      request.log.info(
        { userId, sessionId, itemsReviewed: result.itemsReviewed, accuracyPct: result.accuracyPct },
        'Review session completed'
      );

      return reply.status(200).send(result);
    }
  );

  /**
   * GET /learning/review/session/active
   * Get user's active session (if any)
   */
  fastify.get(
    '/review/session/active',
    {
      preHandler: [authMiddleware],
      schema: {
        response: {
          200: Type.Union([SessionStatsSchema, Type.Null()]),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;

      const result = await reviewService.getActiveSession(userId);

      return reply.status(200).send(result);
    }
  );

  /**
   * GET /learning/review/history
   * Get user's session history
   */
  fastify.get<{ Querystring: { limit?: number } }>(
    '/review/history',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: Type.Object({
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 10 })),
        }),
        response: {
          200: SessionHistoryResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { limit = 10 } = request.query;

      const sessions = await reviewService.getSessionHistory(userId, limit);

      return reply.status(200).send({ sessions });
    }
  );
};

export default reviewRoutes;
