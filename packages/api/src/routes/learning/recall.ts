import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { RecallPracticeService } from '../../services/vocabulary/recall-practice.service';

const LanguageQuerySchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 2 }),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 20 })),
});

type LanguageQuery = Static<typeof LanguageQuerySchema>;

const DueWordSchema = Type.Object({
  meaningId: Type.String(),
  word: Type.String(),
  definition: Type.String(),
  audioUrl: Type.Union([Type.String(), Type.Null()]),
  cefrLevel: Type.Union([
    Type.Literal('A0'),
    Type.Literal('A1'),
    Type.Literal('A2'),
    Type.Literal('B1'),
    Type.Literal('B2'),
    Type.Literal('C1'),
    Type.Literal('C2'),
  ]),
  lastReviewedAt: Type.Union([Type.String(), Type.Null()]),
  nextReviewAt: Type.String(),
});

const DueWordsResponseSchema = Type.Object({
  words: Type.Array(DueWordSchema),
  count: Type.Number(),
});

const ReviewRequestSchema = Type.Object({
  meaningId: Type.String(),
  quality: Type.Union([
    Type.Literal(0),
    Type.Literal(1),
    Type.Literal(2),
    Type.Literal(3),
    Type.Literal(4),
    Type.Literal(5),
  ]),
});

type ReviewRequest = Static<typeof ReviewRequestSchema>;

const ReviewResponseSchema = Type.Object({
  nextReviewAt: Type.String(),
  interval: Type.Number(),
  repetitions: Type.Number(),
});

const StatsResponseSchema = Type.Object({
  stats: Type.Object({
    totalItems: Type.Number(),
    dueNow: Type.Number(),
    dueToday: Type.Number(),
    learned: Type.Number(),
  }),
});

export const recallRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const recallService = new RecallPracticeService(fastify.db);

  /**
   * GET /learning/recall/due
   * Get words due for recall practice
   */
  fastify.get<{
    Querystring: LanguageQuery;
  }>(
    '/recall/due',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: LanguageQuerySchema,
        response: {
          200: DueWordsResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language, limit = 20 } = request.query;

      // Initialize learning words into SRS if not already done
      await recallService.initializeLearningWords(userId, language);

      // Get due words
      const words = await recallService.getDueWords(userId, language, limit);

      return reply.code(200).send({
        words,
        count: words.length,
      });
    }
  );

  /**
   * POST /learning/recall/review
   * Submit review result for a word
   */
  fastify.post<{
    Body: ReviewRequest;
  }>(
    '/recall/review',
    {
      preHandler: [authMiddleware],
      schema: {
        body: ReviewRequestSchema,
        response: {
          200: ReviewResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { meaningId, quality } = request.body;

      const result = await recallService.submitReview(userId, meaningId, quality);

      return reply.code(200).send({
        nextReviewAt: result.nextReviewAt,
        interval: result.interval,
        repetitions: result.repetitions,
      });
    }
  );

  /**
   * GET /learning/recall/stats
   * Get recall practice statistics
   */
  fastify.get<{
    Querystring: { language: string };
  }>(
    '/recall/stats',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: Type.Object({
          language: Type.String({ minLength: 2, maxLength: 2 }),
        }),
        response: {
          200: StatsResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.query;

      const stats = await recallService.getStats(userId, language);

      return reply.code(200).send({ stats });
    }
  );
};

export default recallRoutes;
