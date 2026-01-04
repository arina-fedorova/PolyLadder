import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { ProductionService, SelfRating } from '../../services/practice/production.service';

const LanguageQuerySchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 5 }),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 10 })),
});

type LanguageQuery = Static<typeof LanguageQuerySchema>;

const ProductionExerciseSchema = Type.Object({
  exerciseId: Type.String(),
  text: Type.String(),
  audioUrl: Type.String(),
  audioLength: Type.Number(),
  romanization: Type.Union([Type.String(), Type.Null()]),
  translation: Type.Union([Type.String(), Type.Null()]),
  meaningId: Type.String(),
  cefrLevel: Type.String(),
  language: Type.String(),
});

const ExercisesResponseSchema = Type.Object({
  exercises: Type.Array(ProductionExerciseSchema),
  count: Type.Number(),
});

const SelfRatingSchema = Type.Union([
  Type.Literal('again'),
  Type.Literal('hard'),
  Type.Literal('good'),
  Type.Literal('easy'),
]);

const SubmitAssessmentRequestSchema = Type.Object({
  meaningId: Type.String(),
  selfRating: SelfRatingSchema,
  recordingDuration: Type.Number({ minimum: 0, maximum: 120 }),
  attemptNumber: Type.Number({ minimum: 1, maximum: 10 }),
  timeSpentMs: Type.Number({ minimum: 0 }),
});

type SubmitAssessmentRequest = Static<typeof SubmitAssessmentRequestSchema>;

const SubmitAssessmentResponseSchema = Type.Object({
  success: Type.Boolean(),
  qualityRating: Type.Number(),
});

const StatsResponseSchema = Type.Object({
  stats: Type.Object({
    totalExercises: Type.Number(),
    correctCount: Type.Number(),
    accuracy: Type.Number(),
    avgQuality: Type.Union([Type.Number(), Type.Null()]),
  }),
});

export const productionRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const productionService = new ProductionService(fastify.db);

  /**
   * GET /learning/production/exercises
   * Get production exercises with native audio
   */
  fastify.get<{
    Querystring: LanguageQuery;
  }>(
    '/production/exercises',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: LanguageQuerySchema,
        response: {
          200: ExercisesResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language, limit = 10 } = request.query;

      const exercises = await productionService.getProductionExercises(userId, language, limit);

      return reply.code(200).send({
        exercises,
        count: exercises.length,
      });
    }
  );

  /**
   * POST /learning/production/assess
   * Submit self-assessment for production practice
   */
  fastify.post<{
    Body: SubmitAssessmentRequest;
  }>(
    '/production/assess',
    {
      preHandler: [authMiddleware],
      schema: {
        body: SubmitAssessmentRequestSchema,
        response: {
          200: SubmitAssessmentResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { meaningId, selfRating, recordingDuration, attemptNumber, timeSpentMs } = request.body;

      const result = await productionService.submitAssessment(userId, {
        meaningId,
        selfRating: selfRating as SelfRating,
        recordingDuration,
        attemptNumber,
        timeSpentMs,
      });

      return reply.code(200).send(result);
    }
  );

  /**
   * GET /learning/production/stats
   * Get production practice statistics
   */
  fastify.get<{
    Querystring: { language: string };
  }>(
    '/production/stats',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: Type.Object({
          language: Type.String({ minLength: 2, maxLength: 5 }),
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

      const stats = await productionService.getStats(userId, language);

      return reply.code(200).send({ stats });
    }
  );
};

export default productionRoutes;
