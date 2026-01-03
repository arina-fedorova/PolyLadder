import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { ClozeExerciseService } from '../../services/practice/cloze.service';

const LanguageQuerySchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 2 }),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 10 })),
});

type LanguageQuery = Static<typeof LanguageQuerySchema>;

const HintSchema = Type.Object({
  firstLetter: Type.String(),
  wordLength: Type.Number(),
  partOfSpeech: Type.Union([Type.String(), Type.Null()]),
});

const ClozeExerciseSchema = Type.Object({
  exerciseId: Type.String(),
  sentenceWithBlank: Type.String(),
  correctAnswer: Type.String(),
  alternativeAnswers: Type.Array(Type.String()),
  hint: HintSchema,
  context: Type.Union([Type.String(), Type.Null()]),
  audioUrl: Type.Union([Type.String(), Type.Null()]),
  explanation: Type.String(),
  cefrLevel: Type.Union([
    Type.Literal('A0'),
    Type.Literal('A1'),
    Type.Literal('A2'),
    Type.Literal('B1'),
    Type.Literal('B2'),
    Type.Literal('C1'),
    Type.Literal('C2'),
  ]),
  meaningId: Type.Union([Type.String(), Type.Null()]),
});

const ExercisesResponseSchema = Type.Object({
  exercises: Type.Array(ClozeExerciseSchema),
  count: Type.Number(),
});

const SubmitAnswerRequestSchema = Type.Object({
  exerciseId: Type.String(),
  userAnswer: Type.String({ minLength: 1, maxLength: 100 }),
  correctAnswer: Type.String(),
  alternativeAnswers: Type.Array(Type.String()),
  meaningId: Type.Union([Type.String(), Type.Null()]),
  timeSpentMs: Type.Number({ minimum: 0 }),
});

type SubmitAnswerRequest = Static<typeof SubmitAnswerRequestSchema>;

const SubmitAnswerResponseSchema = Type.Object({
  isCorrect: Type.Boolean(),
  similarity: Type.Number(),
  feedback: Type.String(),
  correctAnswer: Type.String(),
  partialCredit: Type.Number(),
});

const StatsResponseSchema = Type.Object({
  stats: Type.Object({
    totalExercises: Type.Number(),
    correctCount: Type.Number(),
    accuracy: Type.Number(),
    avgTimeMs: Type.Union([Type.Number(), Type.Null()]),
  }),
});

export const clozeRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const clozeService = new ClozeExerciseService(fastify.db);

  /**
   * GET /learning/cloze/exercises
   * Get cloze (fill-in-the-blank) exercises
   */
  fastify.get<{
    Querystring: LanguageQuery;
  }>(
    '/cloze/exercises',
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

      const exercises = await clozeService.getClozeExercises(userId, language, limit);

      return reply.code(200).send({
        exercises,
        count: exercises.length,
      });
    }
  );

  /**
   * POST /learning/cloze/submit
   * Submit an answer for a cloze exercise
   */
  fastify.post<{
    Body: SubmitAnswerRequest;
  }>(
    '/cloze/submit',
    {
      preHandler: [authMiddleware],
      schema: {
        body: SubmitAnswerRequestSchema,
        response: {
          200: SubmitAnswerResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { exerciseId, userAnswer, correctAnswer, alternativeAnswers, meaningId, timeSpentMs } =
        request.body;

      const result = await clozeService.validateClozeAnswer(
        userId,
        exerciseId,
        userAnswer,
        correctAnswer,
        alternativeAnswers,
        meaningId,
        timeSpentMs
      );

      return reply.code(200).send(result);
    }
  );

  /**
   * GET /learning/cloze/stats
   * Get cloze practice statistics
   */
  fastify.get<{
    Querystring: { language: string };
  }>(
    '/cloze/stats',
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

      const stats = await clozeService.getStats(userId, language);

      return reply.code(200).send({ stats });
    }
  );
};

export default clozeRoutes;
