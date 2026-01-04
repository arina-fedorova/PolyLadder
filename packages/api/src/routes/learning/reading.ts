import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { ReadingComprehensionService } from '../../services/practice/reading.service';

const LanguageQuerySchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 5 }),
  cefrLevel: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 20, default: 5 })),
});

type LanguageQuery = Static<typeof LanguageQuerySchema>;

const VocabularyHintSchema = Type.Object({
  word: Type.String(),
  definition: Type.String(),
  position: Type.Number(),
});

const ComprehensionQuestionSchema = Type.Object({
  id: Type.String(),
  questionText: Type.String(),
  questionType: Type.String(),
  options: Type.Array(Type.String()),
});

const ReadingPassageSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  text: Type.String(),
  language: Type.String(),
  cefrLevel: Type.String(),
  wordCount: Type.Number(),
  audioUrl: Type.Union([Type.String(), Type.Null()]),
  source: Type.Union([Type.String(), Type.Null()]),
  vocabularyHints: Type.Array(VocabularyHintSchema),
  questions: Type.Array(ComprehensionQuestionSchema),
  srsItemId: Type.Union([Type.String(), Type.Null()]),
});

const PassagesResponseSchema = Type.Object({
  passages: Type.Array(ReadingPassageSchema),
  count: Type.Number(),
});

const UserAnswerSchema = Type.Object({
  questionId: Type.String(),
  answerIndex: Type.Number({ minimum: 0 }),
});

const SubmitAnswersRequestSchema = Type.Object({
  passageId: Type.String(),
  answers: Type.Array(UserAnswerSchema),
  timeSpentMs: Type.Number({ minimum: 0 }),
});

type SubmitAnswersRequest = Static<typeof SubmitAnswersRequestSchema>;

const AnswerResultSchema = Type.Object({
  questionId: Type.String(),
  userAnswerIndex: Type.Number(),
  correctAnswerIndex: Type.Number(),
  isCorrect: Type.Boolean(),
  explanation: Type.Union([Type.String(), Type.Null()]),
});

const SubmitAnswersResponseSchema = Type.Object({
  passageId: Type.String(),
  score: Type.Number(),
  totalQuestions: Type.Number(),
  correctAnswers: Type.Number(),
  qualityRating: Type.Number(),
  answers: Type.Array(AnswerResultSchema),
});

const StatsResponseSchema = Type.Object({
  stats: Type.Object({
    totalPassagesRead: Type.Number(),
    passagesWithGoodScore: Type.Number(),
    averageScore: Type.Union([Type.Number(), Type.Null()]),
  }),
});

export const readingRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const readingService = new ReadingComprehensionService(fastify.db);

  /**
   * GET /learning/reading/passages
   * Get reading passages with comprehension questions
   */
  fastify.get<{
    Querystring: LanguageQuery;
  }>(
    '/reading/passages',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: LanguageQuerySchema,
        response: {
          200: PassagesResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language, cefrLevel, limit = 5 } = request.query;

      const passages = await readingService.getReadingPassages(userId, language, cefrLevel, limit);

      // Sanitize passages to remove correct answers before sending to client
      const sanitizedPassages = readingService.sanitizePassagesForClient(passages);

      return reply.code(200).send({
        passages: sanitizedPassages,
        count: sanitizedPassages.length,
      });
    }
  );

  /**
   * POST /learning/reading/submit
   * Submit answers for reading comprehension
   */
  fastify.post<{
    Body: SubmitAnswersRequest;
  }>(
    '/reading/submit',
    {
      preHandler: [authMiddleware],
      schema: {
        body: SubmitAnswersRequestSchema,
        response: {
          200: SubmitAnswersResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { passageId, answers, timeSpentMs } = request.body;

      const result = await readingService.submitAnswers(userId, passageId, answers, timeSpentMs);

      return reply.code(200).send(result);
    }
  );

  /**
   * GET /learning/reading/stats
   * Get reading practice statistics
   */
  fastify.get<{
    Querystring: { language: string };
  }>(
    '/reading/stats',
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

      const stats = await readingService.getStats(userId, language);

      return reply.code(200).send({ stats });
    }
  );
};

export default readingRoutes;
