import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema } from '../../schemas/common';
import { CurriculumGraphService } from '../../services/curriculum/graph.service';

const LanguageQuerySchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 2 }),
});

const ConceptIdParamSchema = Type.Object({
  conceptId: Type.String({ minLength: 1 }),
});

const CompleteConceptBodySchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 2 }),
  accuracyPercentage: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
});

const CurriculumNodeSchema = Type.Object({
  conceptId: Type.String(),
  title: Type.String(),
  cefrLevel: Type.String(),
  conceptType: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  estimatedDurationMinutes: Type.Union([Type.Number(), Type.Null()]),
  priorityOrder: Type.Number(),
});

const ConceptWithStatusSchema = Type.Object({
  conceptId: Type.String(),
  title: Type.String(),
  cefrLevel: Type.String(),
  conceptType: Type.String(),
  status: Type.Union([
    Type.Literal('locked'),
    Type.Literal('unlocked'),
    Type.Literal('in_progress'),
    Type.Literal('completed'),
  ]),
});

const GraphEdgeSchema = Type.Object({
  from: Type.String(),
  to: Type.String(),
  type: Type.Union([Type.Literal('and'), Type.Literal('or')]),
});

const CurriculumStatsSchema = Type.Object({
  completedCount: Type.Number(),
  inProgressCount: Type.Number(),
  unlockedCount: Type.Number(),
  lockedCount: Type.Number(),
  totalCount: Type.Number(),
  avgAccuracy: Type.Union([Type.Number(), Type.Null()]),
  completionPercentage: Type.Number(),
});

type LanguageQuery = Static<typeof LanguageQuerySchema>;
type ConceptIdParam = Static<typeof ConceptIdParamSchema>;
type CompleteConceptBody = Static<typeof CompleteConceptBodySchema>;

const curriculumRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const graphService = new CurriculumGraphService(fastify.db);

  fastify.get<{ Querystring: LanguageQuery }>(
    '/curriculum/available',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: LanguageQuerySchema,
        response: {
          200: Type.Object({
            concepts: Type.Array(CurriculumNodeSchema),
          }),
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.query;

      const concepts = await graphService.getAvailableConcepts(userId, language);

      return reply.status(200).send({ concepts });
    }
  );

  fastify.get<{ Querystring: LanguageQuery }>(
    '/curriculum/next',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: LanguageQuerySchema,
        response: {
          200: Type.Object({
            concept: Type.Union([CurriculumNodeSchema, Type.Null()]),
          }),
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.query;

      const concept = await graphService.getNextConcept(userId, language);

      return reply.status(200).send({ concept });
    }
  );

  fastify.get<{ Querystring: LanguageQuery }>(
    '/curriculum/graph',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: LanguageQuerySchema,
        response: {
          200: Type.Object({
            nodes: Type.Array(ConceptWithStatusSchema),
            edges: Type.Array(GraphEdgeSchema),
          }),
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.query;

      const graph = await graphService.getGraphForLanguage(language);

      const statusResult = await fastify.db.query<{ concept_id: string; status: string }>(
        `SELECT concept_id, status FROM user_concept_progress
         WHERE user_id = $1 AND language = $2`,
        [userId, language]
      );

      const statusMap = new Map<string, string>();
      statusResult.rows.forEach((row) => {
        statusMap.set(row.concept_id, row.status);
      });

      const nodes = graph.map((concept) => ({
        conceptId: concept.conceptId,
        title: concept.title,
        cefrLevel: concept.cefrLevel,
        conceptType: concept.conceptType,
        status: (statusMap.get(concept.conceptId) || 'locked') as
          | 'locked'
          | 'unlocked'
          | 'in_progress'
          | 'completed',
      }));

      const edges: Array<{ from: string; to: string; type: 'and' | 'or' }> = [];
      graph.forEach((concept) => {
        concept.prerequisitesAnd.forEach((prereq) => {
          edges.push({ from: prereq, to: concept.conceptId, type: 'and' });
        });
        concept.prerequisitesOr.forEach((prereq) => {
          edges.push({ from: prereq, to: concept.conceptId, type: 'or' });
        });
      });

      return reply.status(200).send({ nodes, edges });
    }
  );

  fastify.post<{ Params: ConceptIdParam; Body: CompleteConceptBody }>(
    '/curriculum/complete/:conceptId',
    {
      preHandler: [authMiddleware],
      schema: {
        params: ConceptIdParamSchema,
        body: CompleteConceptBodySchema,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            unlockedConcepts: Type.Array(Type.String()),
          }),
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { conceptId } = request.params;
      const { language, accuracyPercentage } = request.body;

      await fastify.db.query(
        `UPDATE user_concept_progress
         SET status = 'completed',
             completed_at = NOW(),
             progress_percentage = 100,
             accuracy_percentage = $4
         WHERE user_id = $1 AND concept_id = $2 AND language = $3`,
        [userId, conceptId, language, accuracyPercentage || null]
      );

      const unlockedConcepts = await graphService.unlockAvailableConcepts(userId, language);

      request.log.info(
        { userId, conceptId, language, unlockedCount: unlockedConcepts.length },
        'Concept completed'
      );

      return reply.status(200).send({
        success: true,
        unlockedConcepts,
      });
    }
  );

  fastify.get<{ Querystring: LanguageQuery }>(
    '/curriculum/stats',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: LanguageQuerySchema,
        response: {
          200: CurriculumStatsSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.query;

      const statsResult = await fastify.db.query<{
        completed_count: string;
        in_progress_count: string;
        unlocked_count: string;
        locked_count: string;
        avg_accuracy: string | null;
      }>(
        `SELECT * FROM user_curriculum_stats
         WHERE user_id = $1 AND language = $2`,
        [userId, language]
      );

      const stats = statsResult.rows[0] || {
        completed_count: '0',
        in_progress_count: '0',
        unlocked_count: '0',
        locked_count: '0',
        avg_accuracy: null,
      };

      const completedCount = parseInt(stats.completed_count, 10);
      const inProgressCount = parseInt(stats.in_progress_count, 10);
      const unlockedCount = parseInt(stats.unlocked_count, 10);
      const lockedCount = parseInt(stats.locked_count, 10);

      const totalCount = completedCount + inProgressCount + unlockedCount + lockedCount;
      const completionPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

      return reply.status(200).send({
        completedCount,
        inProgressCount,
        unlockedCount,
        lockedCount,
        totalCount,
        avgAccuracy: stats.avg_accuracy ? parseFloat(stats.avg_accuracy) : null,
        completionPercentage,
      });
    }
  );
};

export default curriculumRoutes;
