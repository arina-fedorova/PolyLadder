import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { WeaknessIdentificationService } from '../../services/analytics';

// Query schemas
const WeaknessAnalysisQuerySchema = Type.Object({
  language: Type.Optional(Type.String({ minLength: 2, maxLength: 5 })),
  cefrLevel: Type.Optional(
    Type.Union([
      Type.Literal('A0'),
      Type.Literal('A1'),
      Type.Literal('A2'),
      Type.Literal('B1'),
      Type.Literal('B2'),
      Type.Literal('C1'),
      Type.Literal('C2'),
    ])
  ),
});

type WeaknessAnalysisQuery = Static<typeof WeaknessAnalysisQuerySchema>;

const RecommendationsQuerySchema = Type.Object({
  language: Type.Optional(Type.String({ minLength: 2, maxLength: 5 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 10 })),
});

type RecommendationsQuery = Static<typeof RecommendationsQuerySchema>;

const ImprovementsQuerySchema = Type.Object({
  language: Type.Optional(Type.String({ minLength: 2, maxLength: 5 })),
  daysSince: Type.Optional(Type.Number({ minimum: 1, maximum: 90, default: 14 })),
});

type ImprovementsQuery = Static<typeof ImprovementsQuerySchema>;

const HeatmapQuerySchema = Type.Object({
  language: Type.Optional(Type.String({ minLength: 2, maxLength: 5 })),
});

type HeatmapQuery = Static<typeof HeatmapQuerySchema>;

// Response schemas
const WeaknessItemSchema = Type.Object({
  itemId: Type.String(),
  itemType: Type.Union([Type.Literal('vocabulary'), Type.Literal('grammar')]),
  itemText: Type.String(),
  language: Type.String(),
  cefrLevel: Type.String(),
  category: Type.Optional(Type.String()),
  accuracy: Type.Number(),
  totalAttempts: Type.Number(),
  recentAttempts: Type.Number(),
  failureCount: Type.Number(),
  lastAttemptDate: Type.Union([Type.String(), Type.Null()]),
  severityScore: Type.Number(),
  improvementPotential: Type.Number(),
});

const WeaknessAnalysisResponseSchema = Type.Object({
  userId: Type.String(),
  language: Type.Optional(Type.String()),
  totalWeaknesses: Type.Number(),
  weaknessesByType: Type.Object({
    vocabulary: Type.Number(),
    grammar: Type.Number(),
  }),
  weaknessesByCEFR: Type.Record(Type.String(), Type.Number()),
  topWeaknesses: Type.Array(WeaknessItemSchema),
  analyzedAt: Type.String(),
});

const RecommendationSchema = Type.Object({
  itemId: Type.String(),
  itemType: Type.String(),
  itemText: Type.String(),
  reason: Type.String(),
  practiceType: Type.Union([
    Type.Literal('recall'),
    Type.Literal('recognition'),
    Type.Literal('production'),
    Type.Literal('mixed'),
  ]),
  estimatedPracticeTime: Type.Number(),
  priority: Type.Union([
    Type.Literal('critical'),
    Type.Literal('high'),
    Type.Literal('medium'),
    Type.Literal('low'),
  ]),
});

const RecommendationsResponseSchema = Type.Object({
  recommendations: Type.Array(RecommendationSchema),
});

const ImprovementTrackingSchema = Type.Object({
  itemId: Type.String(),
  itemType: Type.String(),
  itemText: Type.String(),
  beforeAccuracy: Type.Number(),
  afterAccuracy: Type.Number(),
  improvementPercentage: Type.Number(),
  practiceSessionsCompleted: Type.Number(),
  status: Type.Union([
    Type.Literal('improving'),
    Type.Literal('stagnant'),
    Type.Literal('regressing'),
  ]),
});

const ImprovementsResponseSchema = Type.Object({
  improvements: Type.Array(ImprovementTrackingSchema),
});

const HeatmapCellSchema = Type.Object({
  cefrLevel: Type.String(),
  category: Type.String(),
  weaknessCount: Type.Number(),
  avgSeverity: Type.Number(),
});

const HeatmapResponseSchema = Type.Object({
  heatmap: Type.Array(HeatmapCellSchema),
});

export const weaknessAnalyticsRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const weaknessService = new WeaknessIdentificationService(fastify.db);

  /**
   * GET /analytics/weakness/analysis
   * Analyze user weaknesses with optional language/level filters
   */
  fastify.get<{ Querystring: WeaknessAnalysisQuery }>(
    '/weakness/analysis',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: WeaknessAnalysisQuerySchema,
        response: {
          200: WeaknessAnalysisResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language, cefrLevel } = request.query;

      const analysis = await weaknessService.analyzeWeaknesses(userId, language, cefrLevel);

      return reply.code(200).send({
        ...analysis,
        topWeaknesses: analysis.topWeaknesses.map((w) => ({
          ...w,
          lastAttemptDate: w.lastAttemptDate?.toISOString() || null,
        })),
        analyzedAt: analysis.analyzedAt.toISOString(),
      });
    }
  );

  /**
   * GET /analytics/weakness/recommendations
   * Get practice recommendations for identified weaknesses
   */
  fastify.get<{ Querystring: RecommendationsQuery }>(
    '/weakness/recommendations',
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
      const { language, limit = 10 } = request.query;

      const recommendations = await weaknessService.getWeaknessRecommendations(
        userId,
        language,
        limit
      );

      return reply.code(200).send({ recommendations });
    }
  );

  /**
   * GET /analytics/weakness/improvements
   * Track improvement for previously identified weaknesses
   */
  fastify.get<{ Querystring: ImprovementsQuery }>(
    '/weakness/improvements',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: ImprovementsQuerySchema,
        response: {
          200: ImprovementsResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language, daysSince = 14 } = request.query;

      const improvements = await weaknessService.trackImprovements(userId, language, daysSince);

      return reply.code(200).send({ improvements });
    }
  );

  /**
   * GET /analytics/weakness/heatmap
   * Get weakness heatmap data (CEFR level x category)
   */
  fastify.get<{ Querystring: HeatmapQuery }>(
    '/weakness/heatmap',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: HeatmapQuerySchema,
        response: {
          200: HeatmapResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.query;

      const heatmap = await weaknessService.getWeaknessHeatmap(userId, language);

      return reply.code(200).send({ heatmap });
    }
  );
};

export default weaknessAnalyticsRoutes;
