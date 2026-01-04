import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { MixedSessionService } from '../../services/practice/mixed-session.service';

const MixingStrategySchema = Type.Union([
  Type.Literal('equal'),
  Type.Literal('weighted'),
  Type.Literal('random'),
]);

const PracticeTypeSchema = Type.Union([Type.Literal('recall'), Type.Literal('recognition')]);

const StartSessionRequestSchema = Type.Object({
  practiceTypes: Type.Array(PracticeTypeSchema, { minItems: 1, maxItems: 2 }),
  itemsPerLanguage: Type.Optional(Type.Number({ minimum: 5, maximum: 50, default: 10 })),
  mixingStrategy: Type.Optional(MixingStrategySchema),
  totalItems: Type.Optional(Type.Number({ minimum: 5, maximum: 100, default: 20 })),
});

type StartSessionRequest = Static<typeof StartSessionRequestSchema>;

const MixedItemContentSchema = Type.Object({
  text: Type.String(),
  definition: Type.Union([Type.String(), Type.Null()]),
  audioUrl: Type.Union([Type.String(), Type.Null()]),
  level: Type.String(),
});

const MixedExerciseItemSchema = Type.Object({
  id: Type.String(),
  language: Type.String(),
  practiceType: PracticeTypeSchema,
  meaningId: Type.String(),
  content: MixedItemContentSchema,
  estimatedDifficulty: Type.Number({ minimum: 1, maximum: 5 }),
});

const StartSessionResponseSchema = Type.Object({
  sessionId: Type.String(),
  languages: Type.Array(Type.String()),
  mixingStrategy: MixingStrategySchema,
  items: Type.Array(MixedExerciseItemSchema),
});

const SubmitAttemptRequestSchema = Type.Object({
  sessionId: Type.String({ format: 'uuid' }),
  itemId: Type.String(),
  itemType: Type.String(),
  language: Type.String(),
  isCorrect: Type.Boolean(),
  timeSpent: Type.Number({ minimum: 0, maximum: 600 }),
});

type SubmitAttemptRequest = Static<typeof SubmitAttemptRequestSchema>;

const SubmitAttemptResponseSchema = Type.Object({
  success: Type.Boolean(),
  completedItems: Type.Number(),
});

const LanguagePerformanceSchema = Type.Object({
  language: Type.String(),
  itemsAttempted: Type.Number(),
  correctAnswers: Type.Number(),
  averageTime: Type.Number(),
  accuracy: Type.Number(),
});

const SessionSummarySchema = Type.Object({
  sessionId: Type.String(),
  totalItems: Type.Number(),
  totalCorrect: Type.Number(),
  totalTime: Type.Number(),
  languageBreakdown: Type.Array(LanguagePerformanceSchema),
  switchingEfficiency: Type.Number(),
});

const GetSummaryResponseSchema = Type.Object({
  summary: SessionSummarySchema,
});

const SessionHistoryItemSchema = Type.Object({
  sessionId: Type.String(),
  languages: Type.Array(Type.String()),
  totalItems: Type.Number(),
  completedItems: Type.Number(),
  switchingEfficiency: Type.Union([Type.Number(), Type.Null()]),
  createdAt: Type.String(),
  completedAt: Type.Union([Type.String(), Type.Null()]),
});

const GetHistoryResponseSchema = Type.Object({
  sessions: Type.Array(SessionHistoryItemSchema),
});

export const mixedRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const mixedService = new MixedSessionService(fastify.db);

  /**
   * POST /learning/mixed/start
   * Start a new mixed language practice session
   */
  fastify.post<{
    Body: StartSessionRequest;
  }>(
    '/mixed/start',
    {
      preHandler: [authMiddleware],
      schema: {
        body: StartSessionRequestSchema,
        response: {
          200: StartSessionResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const {
        practiceTypes,
        itemsPerLanguage = 10,
        mixingStrategy = 'equal',
        totalItems = 20,
      } = request.body;

      const session = await mixedService.createMixedSession({
        userId,
        practiceTypes,
        itemsPerLanguage,
        mixingStrategy,
        totalItems,
      });

      return reply.code(200).send(session);
    }
  );

  /**
   * POST /learning/mixed/submit
   * Submit an attempt for a mixed session item
   */
  fastify.post<{
    Body: SubmitAttemptRequest;
  }>(
    '/mixed/submit',
    {
      preHandler: [authMiddleware],
      schema: {
        body: SubmitAttemptRequestSchema,
        response: {
          200: SubmitAttemptResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { sessionId, itemId, itemType, language, isCorrect, timeSpent } = request.body;

      const result = await mixedService.recordMixedAttempt(
        sessionId,
        itemId,
        itemType,
        language,
        isCorrect,
        timeSpent
      );

      return reply.code(200).send(result);
    }
  );

  /**
   * GET /learning/mixed/summary/:sessionId
   * Get summary of a mixed practice session
   */
  fastify.get<{
    Params: { sessionId: string };
  }>(
    '/mixed/summary/:sessionId',
    {
      preHandler: [authMiddleware],
      schema: {
        params: Type.Object({
          sessionId: Type.String({ format: 'uuid' }),
        }),
        response: {
          200: GetSummaryResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { sessionId } = request.params;

      const summary = await mixedService.generateSessionSummary(sessionId);

      return reply.code(200).send({ summary });
    }
  );

  /**
   * GET /learning/mixed/history
   * Get user's mixed practice session history
   */
  fastify.get<{
    Querystring: { limit?: number };
  }>(
    '/mixed/history',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: Type.Object({
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 10 })),
        }),
        response: {
          200: GetHistoryResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { limit = 10 } = request.query;

      const sessions = await mixedService.getUserMixedSessionHistory(userId, limit);

      return reply.code(200).send({
        sessions: sessions.map((s) => ({
          ...s,
          createdAt: s.createdAt.toISOString(),
          completedAt: s.completedAt?.toISOString() || null,
        })),
      });
    }
  );
};

export default mixedRoutes;
