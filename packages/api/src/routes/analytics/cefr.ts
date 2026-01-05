import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { CEFRAssessmentService } from '../../services/analytics';

// Query/Params schemas
const LanguageParamsSchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 5 }),
});

type LanguageParams = Static<typeof LanguageParamsSchema>;

const ProgressionQuerySchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 5 }),
  days: Type.Optional(Type.Number({ minimum: 1, maximum: 365, default: 90 })),
});

type ProgressionQuery = Static<typeof ProgressionQuerySchema>;

const RequirementsQuerySchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 5 }),
  targetLevel: Type.Optional(
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

type RequirementsQuery = Static<typeof RequirementsQuerySchema>;

// Response schemas
const CEFRLevelDataSchema = Type.Object({
  level: Type.String(),
  vocabularyTotal: Type.Number(),
  vocabularyMastered: Type.Number(),
  vocabularyPercentage: Type.Number(),
  grammarTotal: Type.Number(),
  grammarCompleted: Type.Number(),
  grammarPercentage: Type.Number(),
  overallPercentage: Type.Number(),
  isCompleted: Type.Boolean(),
});

const CEFRAssessmentResponseSchema = Type.Object({
  userId: Type.String(),
  language: Type.String(),
  currentLevel: Type.String(),
  status: Type.Union([
    Type.Literal('progressing'),
    Type.Literal('ready'),
    Type.Literal('completed'),
  ]),
  levelDetails: Type.Array(CEFRLevelDataSchema),
  nextLevel: Type.Union([Type.String(), Type.Null()]),
  progressToNextLevel: Type.Number(),
  estimatedDaysToNextLevel: Type.Union([Type.Number(), Type.Null()]),
  assessedAt: Type.String(),
});

const LevelProgressionSchema = Type.Object({
  date: Type.String(),
  level: Type.String(),
  vocabularyPercentage: Type.Number(),
  grammarPercentage: Type.Number(),
  overallPercentage: Type.Number(),
});

const ProgressionResponseSchema = Type.Object({
  language: Type.String(),
  days: Type.Number(),
  progression: Type.Array(LevelProgressionSchema),
});

const LevelRequirementsResponseSchema = Type.Union([
  Type.Object({
    level: Type.String(),
    vocabularyNeeded: Type.Number(),
    grammarNeeded: Type.Number(),
    vocabularyGap: Type.Array(Type.String()),
    grammarGap: Type.Array(Type.String()),
    estimatedPracticeHours: Type.Number(),
  }),
  Type.Null(),
]);

const CEFROverviewSchema = Type.Object({
  language: Type.String(),
  currentLevel: Type.String(),
  status: Type.String(),
  progressToNextLevel: Type.Number(),
  lastAssessed: Type.Union([Type.String(), Type.Null()]),
});

const OverviewResponseSchema = Type.Object({
  overview: Type.Array(CEFROverviewSchema),
});

export const cefrAnalyticsRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const cefrService = new CEFRAssessmentService(fastify.db);

  /**
   * GET /analytics/cefr/assessment/:language
   * Get current CEFR level assessment for a language
   */
  fastify.get<{ Params: LanguageParams }>(
    '/cefr/assessment/:language',
    {
      preHandler: [authMiddleware],
      schema: {
        params: LanguageParamsSchema,
        response: {
          200: CEFRAssessmentResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.params;

      const assessment = await cefrService.assessCEFRLevel(userId, language);

      return reply.code(200).send({
        ...assessment,
        assessedAt: assessment.assessedAt.toISOString(),
      });
    }
  );

  /**
   * GET /analytics/cefr/progression
   * Get CEFR level progression history over time
   */
  fastify.get<{ Querystring: ProgressionQuery }>(
    '/cefr/progression',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: ProgressionQuerySchema,
        response: {
          200: ProgressionResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language, days = 90 } = request.query;

      const progression = await cefrService.getLevelProgression(userId, language, days);

      return reply.code(200).send({
        language,
        days,
        progression: progression.map((p) => ({
          ...p,
          date: p.date.toISOString(),
        })),
      });
    }
  );

  /**
   * GET /analytics/cefr/requirements
   * Get requirements for reaching target CEFR level
   */
  fastify.get<{ Querystring: RequirementsQuery }>(
    '/cefr/requirements',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: RequirementsQuerySchema,
        response: {
          200: LevelRequirementsResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language, targetLevel } = request.query;

      const requirements = await cefrService.getLevelRequirements(userId, language, targetLevel);

      return reply.code(200).send(requirements);
    }
  );

  /**
   * GET /analytics/cefr/overview
   * Get CEFR overview for all active languages
   */
  fastify.get(
    '/cefr/overview',
    {
      preHandler: [authMiddleware],
      schema: {
        response: {
          200: OverviewResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;

      const overview = await cefrService.getAllLanguagesOverview(userId);

      return reply.code(200).send({
        overview: overview.map((o) => ({
          ...o,
          lastAssessed: o.lastAssessed?.toISOString() || null,
        })),
      });
    }
  );
};

export default cefrAnalyticsRoutes;
