import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { GrammarAnalyticsService } from '../../services/analytics';

// Query schemas
const LanguageQuerySchema = Type.Object({
  language: Type.Optional(Type.String({ minLength: 2, maxLength: 5 })),
});

type LanguageQuery = Static<typeof LanguageQuerySchema>;

const RecommendationsQuerySchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 5 }),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 20, default: 5 })),
});

type RecommendationsQuery = Static<typeof RecommendationsQuerySchema>;

const TrendsQuerySchema = Type.Object({
  language: Type.Optional(Type.String({ minLength: 2, maxLength: 5 })),
  days: Type.Optional(Type.Number({ minimum: 1, maximum: 365, default: 30 })),
});

type TrendsQuery = Static<typeof TrendsQuerySchema>;

const ConceptIdParamsSchema = Type.Object({
  conceptId: Type.String(),
});

type ConceptIdParams = Static<typeof ConceptIdParamsSchema>;

// Response schemas
const CEFRCoverageSchema = Type.Object({
  level: Type.String(),
  total: Type.Number(),
  completed: Type.Number(),
  percentage: Type.Number(),
});

const CategoryCoverageSchema = Type.Object({
  category: Type.String(),
  total: Type.Number(),
  completed: Type.Number(),
  percentage: Type.Number(),
});

const LanguageCoverageSchema = Type.Object({
  language: Type.String(),
  totalConcepts: Type.Number(),
  completedConcepts: Type.Number(),
  percentage: Type.Number(),
});

const GrammarConceptSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  description: Type.String(),
  cefrLevel: Type.String(),
  language: Type.String(),
  category: Type.String(),
  completed: Type.Boolean(),
  masteryLevel: Type.Number(),
  lastPracticed: Type.Union([Type.String(), Type.Null()]),
  practiceCount: Type.Number(),
});

const GrammarCoverageResponseSchema = Type.Object({
  totalConcepts: Type.Number(),
  completedConcepts: Type.Number(),
  coveragePercentage: Type.Number(),
  byCEFR: Type.Array(CEFRCoverageSchema),
  byCategory: Type.Array(CategoryCoverageSchema),
  byLanguage: Type.Array(LanguageCoverageSchema),
  gaps: Type.Array(
    Type.Object({
      id: Type.String(),
      title: Type.String(),
      cefrLevel: Type.String(),
      category: Type.String(),
    })
  ),
  recentlyCompleted: Type.Array(
    Type.Object({
      id: Type.String(),
      title: Type.String(),
      cefrLevel: Type.String(),
      lastPracticed: Type.String(),
    })
  ),
});

const GrammarRecommendationSchema = Type.Object({
  conceptId: Type.String(),
  title: Type.String(),
  cefrLevel: Type.String(),
  reason: Type.String(),
  priority: Type.Union([Type.Literal('high'), Type.Literal('medium'), Type.Literal('low')]),
});

const RecommendationsResponseSchema = Type.Object({
  recommendations: Type.Array(GrammarRecommendationSchema),
});

const GrammarMasteryTrendSchema = Type.Object({
  date: Type.String(),
  conceptsCompleted: Type.Number(),
  averageMastery: Type.Number(),
});

const TrendsResponseSchema = Type.Object({
  trends: Type.Array(GrammarMasteryTrendSchema),
});

export const grammarAnalyticsRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const analyticsService = new GrammarAnalyticsService(fastify.db);

  /**
   * GET /analytics/grammar/coverage
   * Get grammar coverage statistics
   */
  fastify.get<{ Querystring: LanguageQuery }>(
    '/grammar/coverage',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: LanguageQuerySchema,
        response: {
          200: GrammarCoverageResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.query;

      const coverage = await analyticsService.getGrammarCoverage(userId, language);

      return reply.code(200).send({
        totalConcepts: coverage.totalConcepts,
        completedConcepts: coverage.completedConcepts,
        coveragePercentage: coverage.coveragePercentage,
        byCEFR: coverage.byCEFR,
        byCategory: coverage.byCategory,
        byLanguage: coverage.byLanguage,
        gaps: coverage.gaps.map((g) => ({
          id: g.id,
          title: g.title,
          cefrLevel: g.cefrLevel,
          category: g.category,
        })),
        recentlyCompleted: coverage.recentlyCompleted.map((c) => ({
          id: c.id,
          title: c.title,
          cefrLevel: c.cefrLevel,
          lastPracticed: c.lastPracticed!.toISOString(),
        })),
      });
    }
  );

  /**
   * GET /analytics/grammar/recommendations
   * Get personalized grammar recommendations
   */
  fastify.get<{ Querystring: RecommendationsQuery }>(
    '/grammar/recommendations',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: RecommendationsQuerySchema,
        response: {
          200: RecommendationsResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language, limit = 5 } = request.query;

      const recommendations = await analyticsService.getGrammarRecommendations(
        userId,
        language,
        limit
      );

      return reply.code(200).send({ recommendations });
    }
  );

  /**
   * GET /analytics/grammar/trends
   * Get grammar mastery trends over time
   */
  fastify.get<{ Querystring: TrendsQuery }>(
    '/grammar/trends',
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

      const trends = await analyticsService.getGrammarMasteryTrends(userId, language, days);

      return reply.code(200).send({ trends });
    }
  );

  /**
   * GET /analytics/grammar/concept/:conceptId
   * Get detailed information about a specific concept
   */
  fastify.get<{ Params: ConceptIdParams }>(
    '/grammar/concept/:conceptId',
    {
      preHandler: [authMiddleware],
      schema: {
        params: ConceptIdParamsSchema,
        response: {
          200: GrammarConceptSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { conceptId } = request.params;

      const concept = await analyticsService.getConceptDetails(userId, conceptId);

      if (!concept) {
        return reply.code(404).send({
          error: {
            statusCode: 404,
            message: 'Concept not found',
            requestId: request.id,
          },
        });
      }

      return reply.code(200).send({
        ...concept,
        lastPracticed: concept.lastPracticed?.toISOString() || null,
      });
    }
  );
};

export default grammarAnalyticsRoutes;
