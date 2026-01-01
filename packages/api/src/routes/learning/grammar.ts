import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { GrammarLessonService } from '../../services/grammar/lesson.service';
import { GrammarComparisonService } from '../../services/grammar/comparison.service';
import { GrammarExerciseService } from '../../services/grammar/exercise.service';
import { GrammarMasteryTrackerService } from '../../services/grammar/mastery-tracker.service';

const LanguageQuerySchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 2 }),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 10 })),
});

type LanguageQuery = Static<typeof LanguageQuerySchema>;

const GrammarLessonResponseSchema = Type.Object({
  lesson: Type.Object({
    rule: Type.Object({
      ruleId: Type.String(),
      category: Type.String(),
      title: Type.String(),
      cefrLevel: Type.Union([
        Type.Literal('A0'),
        Type.Literal('A1'),
        Type.Literal('A2'),
        Type.Literal('B1'),
        Type.Literal('B2'),
        Type.Literal('C1'),
        Type.Literal('C2'),
      ]),
      explanation: Type.String(),
      language: Type.String(),
    }),
    examples: Type.Array(
      Type.Object({
        text: Type.String(),
        translation: Type.Optional(Type.Union([Type.String(), Type.Null()])),
        annotation: Type.Optional(Type.Union([Type.String(), Type.Null()])),
      })
    ),
    relatedRules: Type.Array(
      Type.Object({
        ruleId: Type.String(),
        title: Type.String(),
        relationshipType: Type.Union([Type.Literal('prerequisite'), Type.Literal('related')]),
      })
    ),
    conjugationTable: Type.Null(), // Future enhancement
  }),
});

const GrammarNextLessonsResponseSchema = Type.Object({
  lessons: Type.Array(
    Type.Object({
      ruleId: Type.String(),
      category: Type.String(),
      title: Type.String(),
      cefrLevel: Type.Union([
        Type.Literal('A0'),
        Type.Literal('A1'),
        Type.Literal('A2'),
        Type.Literal('B1'),
        Type.Literal('B2'),
        Type.Literal('C1'),
        Type.Literal('C2'),
      ]),
      explanation: Type.String(),
      language: Type.String(),
    })
  ),
});

const GrammarComparisonResponseSchema = Type.Object({
  comparison: Type.Union([
    Type.Object({
      category: Type.String(),
      languages: Type.Array(
        Type.Object({
          language: Type.String(),
          ruleId: Type.String(),
          title: Type.String(),
          explanation: Type.String(),
          example: Type.Union([Type.String(), Type.Null()]),
        })
      ),
      similarities: Type.Array(Type.String()),
      differences: Type.Array(Type.String()),
    }),
    Type.Null(),
  ]),
});

const CompleteRequestSchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 2 }),
});

type CompleteRequest = Static<typeof CompleteRequestSchema>;

const CompleteResponseSchema = Type.Object({
  success: Type.Boolean(),
});

const ExerciseSchema = Type.Object({
  exerciseId: Type.String(),
  grammarRuleId: Type.String(),
  exerciseType: Type.Union([
    Type.Literal('fill_blank'),
    Type.Literal('transformation'),
    Type.Literal('multiple_choice'),
    Type.Literal('reorder'),
    Type.Literal('error_correction'),
  ]),
  difficulty: Type.Number({ minimum: 1, maximum: 5 }),
  prompt: Type.String(),
  sentenceText: Type.String(),
  correctAnswer: Type.Union([Type.String(), Type.Array(Type.String())]),
  distractors: Type.Optional(Type.Array(Type.String())),
  explanation: Type.String(),
  hint: Type.Union([Type.String(), Type.Null()]),
  audioUrl: Type.Union([Type.String(), Type.Null()]),
});

const ExercisesResponseSchema = Type.Object({
  exercises: Type.Array(ExerciseSchema),
});

const ValidateAnswerRequestSchema = Type.Object({
  answer: Type.Union([Type.String(), Type.Array(Type.String())]),
});

type ValidateAnswerRequest = Static<typeof ValidateAnswerRequestSchema>;

const ValidateAnswerResponseSchema = Type.Object({
  exerciseId: Type.String(),
  userAnswer: Type.Union([Type.String(), Type.Array(Type.String())]),
  isCorrect: Type.Boolean(),
  feedback: Type.String(),
  partialCredit: Type.Number({ minimum: 0, maximum: 1 }),
});

export const grammarRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const lessonService = new GrammarLessonService(fastify.db);
  const comparisonService = new GrammarComparisonService(fastify.db);
  const exerciseService = new GrammarExerciseService(fastify.db);
  const masteryTrackerService = new GrammarMasteryTrackerService(fastify.db);

  /**
   * GET /learning/grammar/next
   * Get next grammar lessons for user
   */
  fastify.get<{
    Querystring: LanguageQuery;
  }>(
    '/grammar/next',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: LanguageQuerySchema,
        response: {
          200: GrammarNextLessonsResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language, limit = 10 } = request.query;

      const lessons = await lessonService.getNextGrammarLessons(userId, language, limit);

      return reply.code(200).send({ lessons });
    }
  );

  /**
   * GET /learning/grammar/:ruleId/lesson
   * Get full grammar lesson data
   */
  fastify.get<{
    Params: { ruleId: string };
  }>(
    '/grammar/:ruleId/lesson',
    {
      preHandler: [authMiddleware],
      schema: {
        params: Type.Object({
          ruleId: Type.String(),
        }),
        response: {
          200: GrammarLessonResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { ruleId } = request.params;

      const lesson = await lessonService.getGrammarLesson(ruleId);

      if (!lesson) {
        const error = new Error('Grammar rule not found') as Error & { statusCode?: number };
        error.statusCode = 404;
        throw error;
      }

      return reply.code(200).send({ lesson });
    }
  );

  /**
   * GET /learning/grammar/:ruleId/comparison
   * Get cross-linguistic comparison for grammar rule
   */
  fastify.get<{
    Params: { ruleId: string };
  }>(
    '/grammar/:ruleId/comparison',
    {
      preHandler: [authMiddleware],
      schema: {
        params: Type.Object({
          ruleId: Type.String(),
        }),
        response: {
          200: GrammarComparisonResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { ruleId } = request.params;
      const userId = request.user!.userId;

      interface CategoryRow {
        category: string;
      }
      // Get grammar category from rule
      const ruleResult = await fastify.db.query<CategoryRow>(
        `SELECT category FROM approved_rules WHERE id = $1`,
        [ruleId]
      );

      if (ruleResult.rows.length === 0) {
        const error = new Error('Grammar rule not found') as Error & { statusCode?: number };
        error.statusCode = 404;
        throw error;
      }

      const category = ruleResult.rows[0].category;

      const comparison = await comparisonService.getComparison(userId, category);

      return reply.code(200).send({ comparison });
    }
  );

  /**
   * POST /learning/grammar/:ruleId/complete
   * Mark grammar lesson as completed
   */
  fastify.post<{
    Params: { ruleId: string };
    Body: CompleteRequest;
  }>(
    '/grammar/:ruleId/complete',
    {
      preHandler: [authMiddleware],
      schema: {
        params: Type.Object({
          ruleId: Type.String(),
        }),
        body: CompleteRequestSchema,
        response: {
          200: CompleteResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { ruleId } = request.params;
      const { language } = request.body;
      const userId = request.user!.userId;

      await lessonService.markLessonComplete(userId, ruleId, language);

      return reply.code(200).send({ success: true });
    }
  );

  /**
   * GET /learning/grammar/:ruleId/exercises
   * Get exercises for a specific grammar rule
   */
  fastify.get<{
    Params: { ruleId: string };
    Querystring: { limit?: number };
  }>(
    '/grammar/:ruleId/exercises',
    {
      preHandler: [authMiddleware],
      schema: {
        params: Type.Object({
          ruleId: Type.String(),
        }),
        querystring: Type.Object({
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 10 })),
        }),
        response: {
          200: ExercisesResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { ruleId } = request.params;
      const userId = request.user!.userId;
      const { limit = 10 } = request.query;

      const exercises = await exerciseService.getExercisesForRule(ruleId, userId, limit);

      return reply.code(200).send({ exercises });
    }
  );

  /**
   * GET /learning/grammar/exercises/mixed
   * Get mixed exercises across all unlocked grammar rules
   */
  fastify.get<{
    Querystring: LanguageQuery;
  }>(
    '/grammar/exercises/mixed',
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
      const { language, limit = 20 } = request.query;

      const exercises = await exerciseService.getMixedExercises(userId, language, limit);

      return reply.code(200).send({ exercises });
    }
  );

  /**
   * POST /learning/grammar/exercises/:exerciseId/validate
   * Validate user's answer for an exercise
   */
  fastify.post<{
    Params: { exerciseId: string };
    Body: ValidateAnswerRequest;
  }>(
    '/grammar/exercises/:exerciseId/validate',
    {
      preHandler: [authMiddleware],
      schema: {
        params: Type.Object({
          exerciseId: Type.String(),
        }),
        body: ValidateAnswerRequestSchema,
        response: {
          200: ValidateAnswerResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { exerciseId } = request.params;
      const { answer } = request.body;
      const userId = request.user!.userId;

      // Get exercise metadata for mastery tracking
      interface ExerciseMetadata {
        grammar_rule_id: string;
        language: string;
      }
      const exerciseMetadata = await fastify.db.query<ExerciseMetadata>(
        `SELECT ge.grammar_rule_id, ar.language
         FROM grammar_exercises ge
         JOIN approved_rules ar ON ge.grammar_rule_id = ar.id
         WHERE ge.id = $1`,
        [exerciseId]
      );

      const result = await exerciseService.validateAnswer(exerciseId, answer, userId);

      // Update curriculum progress if user has mastered the rule
      if (exerciseMetadata.rows.length > 0) {
        const { grammar_rule_id, language } = exerciseMetadata.rows[0];
        await masteryTrackerService.updateCurriculumProgress(userId, grammar_rule_id, language);
      }

      return reply.code(200).send(result);
    }
  );
};

export default grammarRoutes;
