import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { VocabularySequencingService } from '../../services/vocabulary/sequencing.service';
import { UtteranceService } from '../../services/vocabulary/utterance.service';
import { WordStateService } from '../../services/vocabulary/word-state.service';

const VocabularyBatchQuerySchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 2 }),
  maxLevel: Type.Optional(
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
  batchSize: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 10 })),
});

type VocabularyBatchQuery = Static<typeof VocabularyBatchQuerySchema>;

const VocabularyBatchResponseSchema = Type.Object({
  vocabulary: Type.Array(
    Type.Object({
      meaningId: Type.String(),
      level: Type.String(),
      tags: Type.Array(Type.String()),
      utteranceCount: Type.Number(),
    })
  ),
});

const MeaningLessonQuerySchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 2 }),
  utteranceLimit: Type.Optional(Type.Number({ minimum: 1, maximum: 20, default: 5 })),
});

type MeaningLessonQuery = Static<typeof MeaningLessonQuerySchema>;

const MeaningLessonResponseSchema = Type.Object({
  meaning: Type.Object({
    meaningId: Type.String(),
    level: Type.String(),
    tags: Type.Array(Type.String()),
  }),
  utterances: Type.Array(
    Type.Object({
      utteranceId: Type.String(),
      meaningId: Type.String(),
      text: Type.String(),
      language: Type.String(),
      register: Type.Union([Type.String(), Type.Null()]),
      usageNotes: Type.Union([Type.String(), Type.Null()]),
      audioUrl: Type.Union([Type.String(), Type.Null()]),
    })
  ),
  wordState: Type.Object({
    state: Type.Union([Type.Literal('unknown'), Type.Literal('learning'), Type.Literal('known')]),
    successfulReviews: Type.Number(),
    totalReviews: Type.Number(),
  }),
});

const IntroductionStatsQuerySchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 2 }),
});

type IntroductionStatsQuery = Static<typeof IntroductionStatsQuerySchema>;

const IntroductionStatsResponseSchema = Type.Object({
  totalAvailable: Type.Number(),
  byLevel: Type.Record(Type.String(), Type.Number()),
});

const MarkIntroducedRequestSchema = Type.Object({
  meaningIds: Type.Array(Type.String({ minLength: 1 })),
});

type MarkIntroducedRequest = Static<typeof MarkIntroducedRequestSchema>;

const MarkIntroducedResponseSchema = Type.Object({
  success: Type.Boolean(),
  markedCount: Type.Number(),
  message: Type.String(),
});

export const vocabularyIntroductionRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const sequencingService = new VocabularySequencingService(fastify.db);
  const utteranceService = new UtteranceService(fastify.db);
  const wordStateService = new WordStateService(fastify.db);

  /**
   * GET /learning/vocabulary-introduction/next
   * Get next batch of vocabulary to introduce to user
   */
  fastify.get<{
    Querystring: VocabularyBatchQuery;
  }>(
    '/vocabulary-introduction/next',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: VocabularyBatchQuerySchema,
        response: {
          200: VocabularyBatchResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language, maxLevel = 'C2', batchSize = 10 } = request.query;

      const vocabulary = await sequencingService.getNextVocabularyBatch(
        userId,
        language,
        maxLevel,
        batchSize
      );

      return reply.code(200).send({ vocabulary });
    }
  );

  /**
   * GET /learning/vocabulary-introduction/:meaningId/lesson
   * Get full lesson data for a specific meaning
   */
  fastify.get<{
    Params: { meaningId: string };
    Querystring: MeaningLessonQuery;
  }>(
    '/vocabulary-introduction/:meaningId/lesson',
    {
      preHandler: [authMiddleware],
      schema: {
        params: Type.Object({
          meaningId: Type.String(),
        }),
        querystring: MeaningLessonQuerySchema,
        response: {
          200: MeaningLessonResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { meaningId } = request.params;
      const { utteranceLimit = 5 } = request.query;

      // Get meaning with utterances
      const meaningWithUtterances = await utteranceService.getMeaningWithUtterances(
        meaningId,
        utteranceLimit
      );

      if (!meaningWithUtterances) {
        const error = new Error('Meaning not found') as Error & { statusCode?: number };
        error.statusCode = 404;
        throw error;
      }

      // Get or create word state (marks as encountered if first time)
      const wordState = await wordStateService.getWordState(userId, meaningId);

      return reply.code(200).send({
        meaning: {
          meaningId: meaningWithUtterances.meaningId,
          level: meaningWithUtterances.level,
          tags: meaningWithUtterances.tags,
        },
        utterances: meaningWithUtterances.utterances,
        wordState: {
          state: wordState.state,
          successfulReviews: wordState.successfulReviews,
          totalReviews: wordState.totalReviews,
        },
      });
    }
  );

  /**
   * GET /learning/vocabulary-introduction/stats
   * Get statistics on available vocabulary for introduction
   */
  fastify.get<{
    Querystring: IntroductionStatsQuery;
  }>(
    '/vocabulary-introduction/stats',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: IntroductionStatsQuerySchema,
        response: {
          200: IntroductionStatsResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.query;

      const stats = await sequencingService.getIntroductionStats(userId, language);

      return reply.code(200).send(stats);
    }
  );

  /**
   * POST /learning/vocabulary-introduction/mark-introduced
   * Mark vocabulary as introduced (sets first_seen_at)
   */
  fastify.post<{
    Body: MarkIntroducedRequest;
  }>(
    '/vocabulary-introduction/mark-introduced',
    {
      preHandler: [authMiddleware],
      schema: {
        body: MarkIntroducedRequestSchema,
        response: {
          200: MarkIntroducedResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { meaningIds } = request.body;

      const result = await sequencingService.markVocabularyIntroduced(userId, meaningIds);

      return reply.code(200).send({
        success: true,
        markedCount: result.markedCount,
        message: `Marked ${result.markedCount} words as introduced`,
      });
    }
  );
};

export default vocabularyIntroductionRoutes;
