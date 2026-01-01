import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { GrammarLessonService } from '../../services/grammar/lesson.service';
import { GrammarComparisonService } from '../../services/grammar/comparison.service';

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

export const grammarRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const lessonService = new GrammarLessonService(fastify.db);
  const comparisonService = new GrammarComparisonService(fastify.db);

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
};

export default grammarRoutes;
