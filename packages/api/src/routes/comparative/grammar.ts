import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { ComparativeGrammarService } from '../../services/comparative/comparative-grammar.service';

// Query schemas
const GetConceptsQuerySchema = Type.Object({
  languages: Type.String({
    minLength: 5, // At least "EN,RU"
    description: 'Comma-separated language codes (e.g., "EN,RU,DE")',
  }),
});

type GetConceptsQuery = Static<typeof GetConceptsQuerySchema>;

const GetComparisonQuerySchema = Type.Object({
  conceptKey: Type.String({ minLength: 1 }),
  languages: Type.String({ minLength: 5 }),
});

type GetComparisonQuery = Static<typeof GetComparisonQuerySchema>;

const GetHistoryQuerySchema = Type.Object({
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 10 })),
});

type GetHistoryQuery = Static<typeof GetHistoryQuerySchema>;

// Response schemas
const AvailableConceptSchema = Type.Object({
  conceptKey: Type.String(),
  conceptName: Type.String(),
  languageCount: Type.Number(),
});

const ConceptsResponseSchema = Type.Object({
  concepts: Type.Array(AvailableConceptSchema),
});

const GrammarExampleSchema = Type.Object({
  sentence: Type.String(),
  translation: Type.String(),
  highlighted: Type.Optional(Type.String()),
});

const LanguageGrammarDataSchema = Type.Object({
  language: Type.String(),
  ruleId: Type.String(),
  ruleName: Type.String(),
  explanation: Type.String(),
  examples: Type.Array(GrammarExampleSchema),
  conjugationTable: Type.Optional(
    Type.Object({
      tableType: Type.String(),
      headers: Type.Array(Type.String()),
      rows: Type.Array(
        Type.Object({
          label: Type.String(),
          cells: Type.Array(Type.String()),
        })
      ),
    })
  ),
  level: Type.String(),
  category: Type.String(),
});

const ComparisonDifferenceSchema = Type.Object({
  aspect: Type.String(),
  descriptions: Type.Array(
    Type.Object({
      language: Type.String(),
      description: Type.String(),
    })
  ),
});

const GrammarComparisonSchema = Type.Object({
  conceptKey: Type.String(),
  conceptName: Type.String(),
  languages: Type.Array(LanguageGrammarDataSchema),
  similarities: Type.Array(Type.String()),
  differences: Type.Array(ComparisonDifferenceSchema),
  crossLinguisticInsights: Type.Array(Type.String()),
});

const ComparisonResponseSchema = Type.Object({
  comparison: GrammarComparisonSchema,
});

const HistoryItemSchema = Type.Object({
  conceptKey: Type.String(),
  conceptName: Type.String(),
  languages: Type.Array(Type.String()),
  viewedAt: Type.String(),
});

const HistoryResponseSchema = Type.Object({
  history: Type.Array(HistoryItemSchema),
});

const comparativeGrammarRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const service = new ComparativeGrammarService(fastify.db);

  /**
   * GET /comparative/grammar/concepts
   * Get available grammar concepts for comparison across languages
   */
  fastify.get<{ Querystring: GetConceptsQuery }>(
    '/grammar/concepts',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: GetConceptsQuerySchema,
        response: {
          200: ConceptsResponseSchema,
          400: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const languages = request.query.languages.split(',').map((l) => l.trim().toUpperCase());

      if (languages.length < 2) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'At least 2 languages required for comparison',
        });
      }

      if (languages.length > 3) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Maximum 3 languages allowed for comparison',
        });
      }

      const concepts = await service.getAvailableConcepts(userId, languages);

      return reply.status(200).send({ concepts });
    }
  );

  /**
   * GET /comparative/grammar/compare
   * Get detailed grammar comparison for a concept across languages
   */
  fastify.get<{ Querystring: GetComparisonQuery }>(
    '/grammar/compare',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: GetComparisonQuerySchema,
        response: {
          200: ComparisonResponseSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { conceptKey } = request.query;
      const languages = request.query.languages.split(',').map((l) => l.trim().toUpperCase());

      if (languages.length < 2) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'At least 2 languages required for comparison',
        });
      }

      if (languages.length > 3) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Maximum 3 languages allowed for comparison',
        });
      }

      try {
        const comparison = await service.getGrammarComparison(userId, conceptKey, languages);

        request.log.info(
          { userId, conceptKey, languages, languageCount: comparison.languages.length },
          'Grammar comparison retrieved'
        );

        return reply.status(200).send({ comparison });
      } catch (error) {
        if ((error as Error).message?.includes('No grammar rules found')) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: `No grammar rules found for concept: ${conceptKey}`,
          });
        }
        throw error;
      }
    }
  );

  /**
   * GET /comparative/grammar/history
   * Get user's grammar comparison viewing history
   */
  fastify.get<{ Querystring: GetHistoryQuery }>(
    '/grammar/history',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: GetHistoryQuerySchema,
        response: {
          200: HistoryResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { limit = 10 } = request.query;

      const history = await service.getUserComparisonHistory(userId, limit);

      return reply.status(200).send({
        history: history.map((item) => ({
          ...item,
          viewedAt: item.viewedAt.toISOString(),
        })),
      });
    }
  );
};

export default comparativeGrammarRoutes;
