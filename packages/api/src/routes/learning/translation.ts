import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { TranslationService } from '../../services/practice/translation.service';

const LanguagePairQuerySchema = Type.Object({
  sourceLanguage: Type.String({ minLength: 2, maxLength: 5 }),
  targetLanguage: Type.String({ minLength: 2, maxLength: 5 }),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 10 })),
});

type LanguagePairQuery = Static<typeof LanguagePairQuerySchema>;

const HintSchema = Type.Object({
  firstWord: Type.String(),
  wordCount: Type.Number(),
});

const TranslationExerciseSchema = Type.Object({
  exerciseId: Type.String(),
  sourceText: Type.String(),
  sourceLanguage: Type.String(),
  targetLanguage: Type.String(),
  acceptableTranslations: Type.Array(Type.String()),
  hint: HintSchema,
  cefrLevel: Type.String(),
  meaningId: Type.String(),
});

const ExercisesResponseSchema = Type.Object({
  exercises: Type.Array(TranslationExerciseSchema),
  count: Type.Number(),
});

const SubmitTranslationRequestSchema = Type.Object({
  exerciseId: Type.String(),
  userTranslation: Type.String({ minLength: 1, maxLength: 1000 }),
  acceptableTranslations: Type.Array(Type.String()),
  meaningId: Type.String(),
  timeSpentMs: Type.Number({ minimum: 0 }),
});

type SubmitTranslationRequest = Static<typeof SubmitTranslationRequestSchema>;

const SubmitTranslationResponseSchema = Type.Object({
  isCorrect: Type.Boolean(),
  similarity: Type.Number(),
  matchedTranslation: Type.Union([Type.String(), Type.Null()]),
  alternativeTranslations: Type.Array(Type.String()),
  feedback: Type.String(),
  qualityRating: Type.Number(),
});

const StatsQuerySchema = Type.Object({
  sourceLanguage: Type.String({ minLength: 2, maxLength: 5 }),
  targetLanguage: Type.String({ minLength: 2, maxLength: 5 }),
});

const StatsResponseSchema = Type.Object({
  stats: Type.Object({
    totalExercises: Type.Number(),
    correctCount: Type.Number(),
    accuracy: Type.Number(),
    avgSimilarity: Type.Union([Type.Number(), Type.Null()]),
  }),
});

const HintRequestSchema = Type.Object({
  acceptableTranslations: Type.Array(Type.String()),
  hintLevel: Type.Number({ minimum: 1, maximum: 3 }),
});

type HintRequest = Static<typeof HintRequestSchema>;

const HintResponseSchema = Type.Object({
  hint: Type.String(),
});

export const translationRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const translationService = new TranslationService(fastify.db);

  /**
   * GET /learning/translation/exercises
   * Get translation exercises for specified language pair
   */
  fastify.get<{
    Querystring: LanguagePairQuery;
  }>(
    '/translation/exercises',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: LanguagePairQuerySchema,
        response: {
          200: ExercisesResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { sourceLanguage, targetLanguage, limit = 10 } = request.query;

      if (sourceLanguage === targetLanguage) {
        return reply.code(400).send({
          error: 'Source and target languages must be different',
        });
      }

      const exercises = await translationService.getTranslationExercises(
        userId,
        sourceLanguage,
        targetLanguage,
        limit
      );

      return reply.code(200).send({
        exercises,
        count: exercises.length,
      });
    }
  );

  /**
   * POST /learning/translation/submit
   * Submit a translation for validation
   */
  fastify.post<{
    Body: SubmitTranslationRequest;
  }>(
    '/translation/submit',
    {
      preHandler: [authMiddleware],
      schema: {
        body: SubmitTranslationRequestSchema,
        response: {
          200: SubmitTranslationResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { meaningId, userTranslation, acceptableTranslations, timeSpentMs } = request.body;

      const result = await translationService.validateTranslation(
        userId,
        meaningId,
        userTranslation,
        acceptableTranslations,
        timeSpentMs
      );

      return reply.code(200).send(result);
    }
  );

  /**
   * GET /learning/translation/stats
   * Get translation practice statistics for language pair
   */
  fastify.get<{
    Querystring: Static<typeof StatsQuerySchema>;
  }>(
    '/translation/stats',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: StatsQuerySchema,
        response: {
          200: StatsResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { sourceLanguage, targetLanguage } = request.query;

      const stats = await translationService.getStats(userId, sourceLanguage, targetLanguage);

      return reply.code(200).send({ stats });
    }
  );

  /**
   * POST /learning/translation/hint
   * Get a hint for translation exercise
   */
  fastify.post<{
    Body: HintRequest;
  }>(
    '/translation/hint',
    {
      preHandler: [authMiddleware],
      schema: {
        body: HintRequestSchema,
        response: {
          200: HintResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { acceptableTranslations, hintLevel } = request.body;

      const hint = translationService.generateHint(acceptableTranslations, hintLevel);

      return reply.code(200).send({ hint });
    }
  );
};

export default translationRoutes;
