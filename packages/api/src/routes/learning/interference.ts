import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { InterferenceDetectionService } from '../../services/interference';

const InterferenceTypeSchema = Type.Union([
  Type.Literal('vocabulary'),
  Type.Literal('grammar'),
  Type.Literal('syntax'),
]);

const InterferenceTrendSchema = Type.Union([
  Type.Literal('improving'),
  Type.Literal('stable'),
  Type.Literal('worsening'),
]);

const InterferencePatternSchema = Type.Object({
  id: Type.String(),
  userId: Type.String(),
  targetLanguage: Type.String(),
  sourceLanguage: Type.String(),
  targetItemId: Type.String(),
  targetText: Type.String(),
  interferingItemId: Type.String(),
  interferingText: Type.String(),
  interferenceType: InterferenceTypeSchema,
  confidenceScore: Type.Number(),
  occurrenceCount: Type.Number(),
  lastOccurrence: Type.String(),
  remediationCompleted: Type.Boolean(),
  createdAt: Type.String(),
});

const AnalyzeRequestSchema = Type.Object({
  targetLanguage: Type.String({ minLength: 2, maxLength: 5 }),
  correctText: Type.String({ minLength: 1, maxLength: 500 }),
  userAnswer: Type.String({ minLength: 1, maxLength: 500 }),
  itemId: Type.String(),
  itemType: InterferenceTypeSchema,
});

type AnalyzeRequest = Static<typeof AnalyzeRequestSchema>;

const AnalyzeResponseSchema = Type.Object({
  isInterference: Type.Boolean(),
  confidenceScore: Type.Number(),
  pattern: Type.Union([InterferencePatternSchema, Type.Null()]),
  explanation: Type.String(),
});

const GetPatternsResponseSchema = Type.Object({
  patterns: Type.Array(InterferencePatternSchema),
});

const ItemDataSchema = Type.Object({
  language: Type.String(),
  text: Type.String(),
  translation: Type.String(),
});

const RemediationExerciseSchema = Type.Object({
  id: Type.String(),
  patternId: Type.String(),
  exerciseType: Type.Union([
    Type.Literal('contrast'),
    Type.Literal('fill_blank'),
    Type.Literal('multiple_choice'),
  ]),
  targetItem: ItemDataSchema,
  interferingItem: ItemDataSchema,
  prompt: Type.String(),
  correctAnswer: Type.String(),
  distractors: Type.Array(Type.String()),
});

const GetRemediationExercisesResponseSchema = Type.Object({
  exercises: Type.Array(RemediationExerciseSchema),
});

const SubmitRemediationAttemptRequestSchema = Type.Object({
  exerciseId: Type.String(),
  userAnswer: Type.String({ minLength: 1, maxLength: 500 }),
  isCorrect: Type.Boolean(),
  timeSpent: Type.Number({ minimum: 0, maximum: 600000 }),
});

type SubmitRemediationAttemptRequest = Static<typeof SubmitRemediationAttemptRequestSchema>;

const SubmitRemediationAttemptResponseSchema = Type.Object({
  success: Type.Boolean(),
  shouldMarkRemediated: Type.Boolean(),
});

const LanguagePairSchema = Type.Object({
  targetLanguage: Type.String(),
  sourceLanguage: Type.String(),
  count: Type.Number(),
});

const InterferenceSummarySchema = Type.Object({
  totalPatterns: Type.Number(),
  activePatterns: Type.Number(),
  remediatedPatterns: Type.Number(),
  topInterferenceLanguagePairs: Type.Array(LanguagePairSchema),
  recentPatterns: Type.Array(InterferencePatternSchema),
});

const GetSummaryResponseSchema = Type.Object({
  summary: InterferenceSummarySchema,
});

const InterferenceReductionSchema = Type.Object({
  rate: Type.Number(),
  trend: InterferenceTrendSchema,
});

const GetReductionResponseSchema = Type.Object({
  reduction: InterferenceReductionSchema,
});

export const interferenceRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const interferenceService = new InterferenceDetectionService(fastify.db);

  /**
   * POST /learning/interference/analyze
   * Analyze an incorrect answer for potential language interference
   */
  fastify.post<{
    Body: AnalyzeRequest;
  }>(
    '/interference/analyze',
    {
      preHandler: [authMiddleware],
      schema: {
        body: AnalyzeRequestSchema,
        response: {
          200: AnalyzeResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { targetLanguage, correctText, userAnswer, itemId, itemType } = request.body;

      const result = await interferenceService.analyzeForInterference(
        userId,
        targetLanguage,
        correctText,
        userAnswer,
        itemId,
        itemType
      );

      return reply.code(200).send({
        ...result,
        pattern: result.pattern
          ? {
              ...result.pattern,
              lastOccurrence: result.pattern.lastOccurrence.toISOString(),
              createdAt: result.pattern.createdAt.toISOString(),
            }
          : null,
      });
    }
  );

  /**
   * GET /learning/interference/patterns
   * Get user's interference patterns
   */
  fastify.get<{
    Querystring: { includeRemediated?: boolean };
  }>(
    '/interference/patterns',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: Type.Object({
          includeRemediated: Type.Optional(Type.Boolean({ default: false })),
        }),
        response: {
          200: GetPatternsResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { includeRemediated = false } = request.query;

      const patterns = await interferenceService.getUserInterferencePatterns(
        userId,
        includeRemediated
      );

      return reply.code(200).send({
        patterns: patterns.map((p) => ({
          ...p,
          lastOccurrence: p.lastOccurrence.toISOString(),
          createdAt: p.createdAt.toISOString(),
        })),
      });
    }
  );

  /**
   * GET /learning/interference/remediation/:patternId
   * Generate remediation exercises for an interference pattern
   */
  fastify.get<{
    Params: { patternId: string };
  }>(
    '/interference/remediation/:patternId',
    {
      preHandler: [authMiddleware],
      schema: {
        params: Type.Object({
          patternId: Type.String({ format: 'uuid' }),
        }),
        response: {
          200: GetRemediationExercisesResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { patternId } = request.params;

      try {
        const exercises = await interferenceService.generateRemediationExercises(patternId);

        return reply.code(200).send({ exercises });
      } catch (error) {
        if (error instanceof Error && error.message === 'Pattern not found') {
          return reply.code(404).send({ error: 'Pattern not found' });
        }
        throw error;
      }
    }
  );

  /**
   * POST /learning/interference/remediation/submit
   * Submit a remediation exercise attempt
   */
  fastify.post<{
    Body: SubmitRemediationAttemptRequest;
  }>(
    '/interference/remediation/submit',
    {
      preHandler: [authMiddleware],
      schema: {
        body: SubmitRemediationAttemptRequestSchema,
        response: {
          200: SubmitRemediationAttemptResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { exerciseId, userAnswer, isCorrect, timeSpent } = request.body;

      const result = await interferenceService.recordRemediationAttempt(
        exerciseId,
        userId,
        userAnswer,
        isCorrect,
        timeSpent
      );

      return reply.code(200).send(result);
    }
  );

  /**
   * GET /learning/interference/summary
   * Get interference summary statistics
   */
  fastify.get(
    '/interference/summary',
    {
      preHandler: [authMiddleware],
      schema: {
        response: {
          200: GetSummaryResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;

      const summary = await interferenceService.getInterferenceSummary(userId);

      return reply.code(200).send({
        summary: {
          ...summary,
          recentPatterns: summary.recentPatterns.map((p) => ({
            ...p,
            lastOccurrence: p.lastOccurrence.toISOString(),
            createdAt: p.createdAt.toISOString(),
          })),
        },
      });
    }
  );

  /**
   * GET /learning/interference/reduction/:patternId
   * Calculate interference reduction rate for a pattern
   */
  fastify.get<{
    Params: { patternId: string };
    Querystring: { periodDays?: number };
  }>(
    '/interference/reduction/:patternId',
    {
      preHandler: [authMiddleware],
      schema: {
        params: Type.Object({
          patternId: Type.String({ format: 'uuid' }),
        }),
        querystring: Type.Object({
          periodDays: Type.Optional(Type.Number({ minimum: 1, maximum: 365, default: 30 })),
        }),
        response: {
          200: GetReductionResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { patternId } = request.params;
      const { periodDays = 30 } = request.query;

      const reduction = await interferenceService.calculateInterferenceReduction(
        userId,
        patternId,
        periodDays
      );

      return reply.code(200).send({ reduction });
    }
  );

  /**
   * POST /learning/interference/patterns/:patternId/complete
   * Mark a pattern as remediation completed
   */
  fastify.post<{
    Params: { patternId: string };
  }>(
    '/interference/patterns/:patternId/complete',
    {
      preHandler: [authMiddleware],
      schema: {
        params: Type.Object({
          patternId: Type.String({ format: 'uuid' }),
        }),
        response: {
          200: Type.Object({ success: Type.Boolean() }),
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { patternId } = request.params;

      await interferenceService.markRemediationCompleted(patternId);

      return reply.code(200).send({ success: true });
    }
  );
};

export default interferenceRoutes;
