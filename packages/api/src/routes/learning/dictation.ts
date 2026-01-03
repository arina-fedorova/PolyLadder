import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { DictationService } from '../../services/practice/dictation.service';

const LanguageQuerySchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 2 }),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 10 })),
});

type LanguageQuery = Static<typeof LanguageQuerySchema>;

const DictationExerciseSchema = Type.Object({
  exerciseId: Type.String(),
  audioUrl: Type.String(),
  correctTranscript: Type.String(),
  meaningId: Type.String(),
  cefrLevel: Type.String(),
  wordCount: Type.Number(),
});

const ExercisesResponseSchema = Type.Object({
  exercises: Type.Array(DictationExerciseSchema),
  count: Type.Number(),
});

const WordDiffSchema = Type.Object({
  type: Type.Union([
    Type.Literal('correct'),
    Type.Literal('substitution'),
    Type.Literal('insertion'),
    Type.Literal('deletion'),
  ]),
  expected: Type.Optional(Type.String()),
  actual: Type.Optional(Type.String()),
  position: Type.Number(),
});

const SubmitDictationRequestSchema = Type.Object({
  exerciseId: Type.String(),
  userTranscript: Type.String({ minLength: 0, maxLength: 1000 }),
  correctTranscript: Type.String(),
  meaningId: Type.String(),
  timeSpentMs: Type.Number({ minimum: 0 }),
});

type SubmitDictationRequest = Static<typeof SubmitDictationRequestSchema>;

const SubmitDictationResponseSchema = Type.Object({
  isCorrect: Type.Boolean(),
  characterAccuracy: Type.Number(),
  wordAccuracy: Type.Number(),
  diff: Type.Array(WordDiffSchema),
  correctTranscript: Type.String(),
  qualityRating: Type.Number(),
});

const StatsResponseSchema = Type.Object({
  stats: Type.Object({
    totalExercises: Type.Number(),
    correctCount: Type.Number(),
    accuracy: Type.Number(),
    avgCharacterAccuracy: Type.Union([Type.Number(), Type.Null()]),
  }),
});

export const dictationRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const dictationService = new DictationService(fastify.db);

  /**
   * GET /learning/dictation/exercises
   * Get dictation exercises with audio
   */
  fastify.get<{
    Querystring: LanguageQuery;
  }>(
    '/dictation/exercises',
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

      const exercises = await dictationService.getDictationExercises(userId, language, limit);

      return reply.code(200).send({
        exercises,
        count: exercises.length,
      });
    }
  );

  /**
   * POST /learning/dictation/submit
   * Submit a transcription for validation
   */
  fastify.post<{
    Body: SubmitDictationRequest;
  }>(
    '/dictation/submit',
    {
      preHandler: [authMiddleware],
      schema: {
        body: SubmitDictationRequestSchema,
        response: {
          200: SubmitDictationResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { meaningId, userTranscript, correctTranscript, timeSpentMs } = request.body;

      const result = await dictationService.validateDictation(
        userId,
        meaningId,
        userTranscript,
        correctTranscript,
        timeSpentMs
      );

      return reply.code(200).send(result);
    }
  );

  /**
   * GET /learning/dictation/stats
   * Get dictation practice statistics
   */
  fastify.get<{
    Querystring: { language: string };
  }>(
    '/dictation/stats',
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

      const stats = await dictationService.getStats(userId, language);

      return reply.code(200).send({ stats });
    }
  );
};

export default dictationRoutes;
