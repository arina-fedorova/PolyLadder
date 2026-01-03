import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { RecognitionPracticeService } from '../../services/practice/recognition.service';

const LanguageQuerySchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 2 }),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 10 })),
});

type LanguageQuery = Static<typeof LanguageQuerySchema>;

const RecognitionQuestionSchema = Type.Object({
  questionId: Type.String(),
  questionType: Type.Union([
    Type.Literal('word_to_definition'),
    Type.Literal('definition_to_word'),
  ]),
  meaningId: Type.String(),
  prompt: Type.String(),
  correctAnswer: Type.String(),
  options: Type.Array(Type.String()),
  correctIndex: Type.Number({ minimum: 0, maximum: 3 }),
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
});

const QuestionsResponseSchema = Type.Object({
  questions: Type.Array(RecognitionQuestionSchema),
  count: Type.Number(),
});

const SubmitAnswerRequestSchema = Type.Object({
  meaningId: Type.String(),
  selectedIndex: Type.Number({ minimum: 0, maximum: 3 }),
  correctIndex: Type.Number({ minimum: 0, maximum: 3 }),
  timeToAnswerMs: Type.Number({ minimum: 0 }),
});

type SubmitAnswerRequest = Static<typeof SubmitAnswerRequestSchema>;

const SubmitAnswerResponseSchema = Type.Object({
  isCorrect: Type.Boolean(),
  correctAnswer: Type.String(),
  explanation: Type.String(),
  nextReviewAt: Type.String(),
  interval: Type.Number(),
});

const StatsResponseSchema = Type.Object({
  stats: Type.Object({
    totalItems: Type.Number(),
    dueNow: Type.Number(),
    mastered: Type.Number(),
  }),
});

export const recognitionRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const recognitionService = new RecognitionPracticeService(fastify.db);

  /**
   * GET /learning/recognition/questions
   * Get recognition practice questions (multiple choice)
   */
  fastify.get<{
    Querystring: LanguageQuery;
  }>(
    '/recognition/questions',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: LanguageQuerySchema,
        response: {
          200: QuestionsResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language, limit = 10 } = request.query;

      const questions = await recognitionService.getRecognitionQuestions(userId, language, limit);

      return reply.code(200).send({
        questions,
        count: questions.length,
      });
    }
  );

  /**
   * POST /learning/recognition/submit
   * Submit an answer for a recognition question
   */
  fastify.post<{
    Body: SubmitAnswerRequest;
  }>(
    '/recognition/submit',
    {
      preHandler: [authMiddleware],
      schema: {
        body: SubmitAnswerRequestSchema,
        response: {
          200: SubmitAnswerResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { meaningId, selectedIndex, correctIndex, timeToAnswerMs } = request.body;

      const result = await recognitionService.submitAnswer(
        userId,
        meaningId,
        selectedIndex,
        correctIndex,
        timeToAnswerMs
      );

      return reply.code(200).send(result);
    }
  );

  /**
   * GET /learning/recognition/stats
   * Get recognition practice statistics
   */
  fastify.get<{
    Querystring: { language: string };
  }>(
    '/recognition/stats',
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

      const stats = await recognitionService.getStats(userId, language);

      return reply.code(200).send({ stats });
    }
  );
};

export default recognitionRoutes;
