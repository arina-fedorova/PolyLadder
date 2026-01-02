import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { WordStateService } from '../../services/vocabulary/word-state.service';

const WordStateSchema = Type.Object({
  meaningId: Type.String(),
  userId: Type.String(),
  state: Type.Union([Type.Literal('unknown'), Type.Literal('learning'), Type.Literal('known')]),
  successfulReviews: Type.Number(),
  totalReviews: Type.Number(),
  firstSeenAt: Type.Union([Type.String(), Type.Null()]),
  markedLearningAt: Type.Union([Type.String(), Type.Null()]),
  markedKnownAt: Type.Union([Type.String(), Type.Null()]),
  lastReviewedAt: Type.Union([Type.String(), Type.Null()]),
});

const RecordReviewRequestSchema = Type.Object({
  meaningId: Type.String(),
  wasSuccessful: Type.Boolean(),
});

type RecordReviewRequest = Static<typeof RecordReviewRequestSchema>;

const RecordReviewResponseSchema = Type.Object({
  meaningId: Type.String(),
  state: Type.Union([Type.Literal('unknown'), Type.Literal('learning'), Type.Literal('known')]),
  successfulReviews: Type.Number(),
  totalReviews: Type.Number(),
  stateChanged: Type.Boolean(),
});

const ResetWordRequestSchema = Type.Object({
  meaningId: Type.String(),
});

type ResetWordRequest = Static<typeof ResetWordRequestSchema>;

const ResetWordResponseSchema = Type.Object({
  success: Type.Boolean(),
  message: Type.String(),
});

const MarkKnownRequestSchema = Type.Object({
  meaningId: Type.String(),
});

type MarkKnownRequest = Static<typeof MarkKnownRequestSchema>;

const MarkKnownResponseSchema = Type.Object({
  success: Type.Boolean(),
  message: Type.String(),
});

const StateStatsResponseSchema = Type.Object({
  unknownCount: Type.Number(),
  learningCount: Type.Number(),
  knownCount: Type.Number(),
  totalWords: Type.Number(),
});

const WordsByStateQuerySchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 2 }),
  state: Type.Union([Type.Literal('unknown'), Type.Literal('learning'), Type.Literal('known')]),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 50 })),
  offset: Type.Optional(Type.Number({ minimum: 0, default: 0 })),
});

type WordsByStateQuery = Static<typeof WordsByStateQuerySchema>;

const WordsByStateResponseSchema = Type.Object({
  words: Type.Array(
    Type.Object({
      meaning_id: Type.String(),
      state: Type.String(),
      successful_reviews: Type.Number(),
      total_reviews: Type.Number(),
      last_reviewed_at: Type.Union([Type.String(), Type.Null()]),
      cefr_level: Type.String(),
    })
  ),
  total: Type.Number(),
  limit: Type.Number(),
  offset: Type.Number(),
});

export const wordStateRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const wordStateService = new WordStateService(fastify.db);

  // GET /learning/word-state/:meaningId - Get word state
  fastify.get<{
    Params: { meaningId: string };
  }>(
    '/word-state/:meaningId',
    {
      preHandler: [authMiddleware],
      schema: {
        params: Type.Object({
          meaningId: Type.String(),
        }),
        response: {
          200: WordStateSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { meaningId } = request.params;

      const state = await wordStateService.getWordState(userId, meaningId);
      return reply.code(200).send(state);
    }
  );

  // POST /learning/word-state/record-review - Record a review
  fastify.post<{
    Body: RecordReviewRequest;
  }>(
    '/word-state/record-review',
    {
      preHandler: [authMiddleware],
      schema: {
        body: RecordReviewRequestSchema,
        response: {
          200: RecordReviewResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { meaningId, wasSuccessful } = request.body;

      const previousState = await wordStateService.getWordState(userId, meaningId);
      const newState = await wordStateService.recordReview(userId, meaningId, wasSuccessful);

      return reply.code(200).send({
        meaningId: newState.meaningId,
        state: newState.state,
        successfulReviews: newState.successfulReviews,
        totalReviews: newState.totalReviews,
        stateChanged: previousState.state !== newState.state,
      });
    }
  );

  // POST /learning/word-state/reset - Reset word to learning
  fastify.post<{
    Body: ResetWordRequest;
  }>(
    '/word-state/reset',
    {
      preHandler: [authMiddleware],
      schema: {
        body: ResetWordRequestSchema,
        response: {
          200: ResetWordResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { meaningId } = request.body;

      await wordStateService.resetToLearning(userId, meaningId);

      return reply.code(200).send({
        success: true,
        message: 'Word reset to learning state',
      });
    }
  );

  // POST /learning/word-state/mark-known - Mark word as known
  fastify.post<{
    Body: MarkKnownRequest;
  }>(
    '/word-state/mark-known',
    {
      preHandler: [authMiddleware],
      schema: {
        body: MarkKnownRequestSchema,
        response: {
          200: MarkKnownResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { meaningId } = request.body;

      await wordStateService.markAsKnown(userId, meaningId);

      return reply.code(200).send({
        success: true,
        message: 'Word marked as known',
      });
    }
  );

  // GET /learning/word-state/stats - Get state statistics
  fastify.get<{
    Querystring: { language: string };
  }>(
    '/word-state/stats',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: Type.Object({
          language: Type.String({ minLength: 2, maxLength: 2 }),
        }),
        response: {
          200: StateStatsResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.query;

      const stats = await wordStateService.getStateStats(userId, language.toUpperCase());

      return reply.code(200).send(stats);
    }
  );

  // GET /learning/word-state/by-state - Get words by state
  fastify.get<{
    Querystring: WordsByStateQuery;
  }>(
    '/word-state/by-state',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: WordsByStateQuerySchema,
        response: {
          200: WordsByStateResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language, state, limit = 50, offset = 0 } = request.query;

      const words = await wordStateService.getWordsByState(
        userId,
        language.toUpperCase(),
        state,
        limit,
        offset
      );

      return reply.code(200).send({
        words,
        total: words.length,
        limit,
        offset,
      });
    }
  );
};

export default wordStateRoutes;
