import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { VocabularyAnalyticsService } from '../../services/analytics';

// Query schemas
const LanguageQuerySchema = Type.Object({
  language: Type.Optional(Type.String({ minLength: 2, maxLength: 5 })),
});

type LanguageQuery = Static<typeof LanguageQuerySchema>;

const TrendsQuerySchema = Type.Object({
  language: Type.Optional(Type.String({ minLength: 2, maxLength: 5 })),
  days: Type.Optional(Type.Number({ minimum: 1, maximum: 365, default: 30 })),
});

type TrendsQuery = Static<typeof TrendsQuerySchema>;

const WordsQuerySchema = Type.Object({
  state: Type.Union([Type.Literal('unknown'), Type.Literal('learning'), Type.Literal('known')]),
  language: Type.Optional(Type.String({ minLength: 2, maxLength: 5 })),
  offset: Type.Optional(Type.Number({ minimum: 0, default: 0 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 50 })),
});

type WordsQuery = Static<typeof WordsQuerySchema>;

const WordIdParamsSchema = Type.Object({
  meaningId: Type.String(),
});

type WordIdParams = Static<typeof WordIdParamsSchema>;

// Response schemas
const LanguageBreakdownSchema = Type.Object({
  language: Type.String(),
  totalWords: Type.Number(),
  unknown: Type.Number(),
  learning: Type.Number(),
  known: Type.Number(),
});

const CEFRDistributionSchema = Type.Object({
  level: Type.String(),
  count: Type.Number(),
});

const RecentWordSchema = Type.Object({
  meaningId: Type.String(),
  text: Type.String(),
  language: Type.String(),
  learnedAt: Type.String(),
});

const VocabularyStatsResponseSchema = Type.Object({
  totalWords: Type.Number(),
  byState: Type.Object({
    unknown: Type.Number(),
    learning: Type.Number(),
    known: Type.Number(),
  }),
  byLanguage: Type.Array(LanguageBreakdownSchema),
  byCEFR: Type.Array(CEFRDistributionSchema),
  recentlyLearned: Type.Array(RecentWordSchema),
});

const VocabularyTrendSchema = Type.Object({
  date: Type.String(),
  totalWords: Type.Number(),
  learning: Type.Number(),
  known: Type.Number(),
});

const TrendsResponseSchema = Type.Object({
  trends: Type.Array(VocabularyTrendSchema),
});

const VelocityResponseSchema = Type.Object({
  wordsPerDay: Type.Number(),
  wordsPerWeek: Type.Number(),
  wordsThisWeek: Type.Number(),
  wordsLastWeek: Type.Number(),
  trend: Type.Union([
    Type.Literal('increasing'),
    Type.Literal('stable'),
    Type.Literal('decreasing'),
  ]),
});

const WordDetailsSchema = Type.Object({
  meaningId: Type.String(),
  text: Type.String(),
  language: Type.String(),
  state: Type.Union([Type.Literal('unknown'), Type.Literal('learning'), Type.Literal('known')]),
  cefrLevel: Type.String(),
  totalReviews: Type.Number(),
  successfulReviews: Type.Number(),
  lastReviewedAt: Type.Union([Type.String(), Type.Null()]),
  nextReviewAt: Type.Union([Type.String(), Type.Null()]),
  easeFactor: Type.Number(),
  interval: Type.Number(),
});

const PaginatedWordsResponseSchema = Type.Object({
  words: Type.Array(WordDetailsSchema),
  total: Type.Number(),
});

export const vocabularyAnalyticsRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const analyticsService = new VocabularyAnalyticsService(fastify.db);

  /**
   * GET /analytics/vocabulary/stats
   * Get overall vocabulary statistics
   */
  fastify.get<{ Querystring: LanguageQuery }>(
    '/vocabulary/stats',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: LanguageQuerySchema,
        response: {
          200: VocabularyStatsResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.query;

      const stats = await analyticsService.getVocabularyStats(userId, language);

      return reply.code(200).send({
        totalWords: stats.totalWords,
        byState: stats.byState,
        byLanguage: stats.byLanguage,
        byCEFR: stats.byCEFR,
        recentlyLearned: stats.recentlyLearned.map((w) => ({
          meaningId: w.meaningId,
          text: w.text,
          language: w.language,
          learnedAt: w.learnedAt.toISOString(),
        })),
      });
    }
  );

  /**
   * GET /analytics/vocabulary/trends
   * Get vocabulary learning trends over time
   */
  fastify.get<{ Querystring: TrendsQuery }>(
    '/vocabulary/trends',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: TrendsQuerySchema,
        response: {
          200: TrendsResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language, days = 30 } = request.query;

      const trends = await analyticsService.getVocabularyTrends(userId, language, days);

      return reply.code(200).send({ trends });
    }
  );

  /**
   * GET /analytics/vocabulary/velocity
   * Get learning velocity (words per day/week)
   */
  fastify.get<{ Querystring: LanguageQuery }>(
    '/vocabulary/velocity',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: LanguageQuerySchema,
        response: {
          200: VelocityResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.query;

      const velocity = await analyticsService.getLearningVelocity(userId, language);

      return reply.code(200).send(velocity);
    }
  );

  /**
   * GET /analytics/vocabulary/words
   * Get words by state with pagination
   */
  fastify.get<{ Querystring: WordsQuery }>(
    '/vocabulary/words',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: WordsQuerySchema,
        response: {
          200: PaginatedWordsResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { state, language, offset = 0, limit = 50 } = request.query;

      const result = await analyticsService.getWordsByState(userId, state, language, offset, limit);

      return reply.code(200).send({
        words: result.words.map((w) => ({
          ...w,
          lastReviewedAt: w.lastReviewedAt?.toISOString() || null,
          nextReviewAt: w.nextReviewAt?.toISOString() || null,
        })),
        total: result.total,
      });
    }
  );

  /**
   * GET /analytics/vocabulary/word/:meaningId
   * Get detailed word information
   */
  fastify.get<{ Params: WordIdParams }>(
    '/vocabulary/word/:meaningId',
    {
      preHandler: [authMiddleware],
      schema: {
        params: WordIdParamsSchema,
        response: {
          200: WordDetailsSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { meaningId } = request.params;

      const word = await analyticsService.getWordDetails(userId, meaningId);

      if (!word) {
        return reply.code(404).send({
          error: {
            statusCode: 404,
            message: 'Word not found',
            requestId: request.id,
          },
        });
      }

      return reply.code(200).send({
        ...word,
        lastReviewedAt: word.lastReviewedAt?.toISOString() || null,
        nextReviewAt: word.nextReviewAt?.toISOString() || null,
      });
    }
  );
};

export default vocabularyAnalyticsRoutes;
