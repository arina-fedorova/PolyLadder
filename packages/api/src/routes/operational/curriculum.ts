import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { CurriculumService } from '../../services/curriculum.service';
import { authMiddleware } from '../../middleware/auth';

const CreateTopicSchema = z.object({
  levelId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  contentType: z.enum(['vocabulary', 'grammar', 'orthography', 'mixed']),
  sortOrder: z.number().int().min(0).optional(),
  estimatedItems: z.number().int().min(0).optional(),
  prerequisites: z.array(z.string().uuid()).optional(),
});

const UpdateTopicSchema = CreateTopicSchema.partial().omit({ levelId: true });

const ReorderSchema = z.object({
  topicIds: z.array(z.string().uuid()),
});

const ImportSchema = z.object({
  topics: z.array(CreateTopicSchema.omit({ levelId: true })),
});

const BulkCreateSchema = z.object({
  topics: z.array(CreateTopicSchema).min(1).max(1000),
});

export const curriculumRoutes: FastifyPluginAsync = async (fastify) => {
  const curriculumService = new CurriculumService(fastify.db);

  await Promise.resolve(); // Explicit async operation for linter

  fastify.get(
    '/curriculum/levels/:language',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { language } = request.params as { language: string };
      const levels = await curriculumService.getLevelsByLanguage(language);
      return reply.send({ levels });
    }
  );

  fastify.get(
    '/curriculum/topics/:levelId',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { levelId } = request.params as { levelId: string };
      const topics = await curriculumService.getTopicsByLevel(levelId);
      return reply.send({ topics });
    }
  );

  fastify.post(
    '/curriculum/topics',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const input = CreateTopicSchema.parse(request.body);
      const topic = await curriculumService.createTopic(input);
      return reply.status(201).send({ topic });
    }
  );

  fastify.put(
    '/curriculum/topics/:id',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const updates = UpdateTopicSchema.parse(request.body);
      const topic = await curriculumService.updateTopic(id, updates);
      return reply.send({ topic });
    }
  );

  fastify.delete(
    '/curriculum/topics/:id',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await curriculumService.deleteTopic(id);
      return reply.status(204).send();
    }
  );

  fastify.post(
    '/curriculum/topics/:levelId/reorder',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { levelId } = request.params as { levelId: string };
      const { topicIds } = ReorderSchema.parse(request.body);
      await curriculumService.reorderTopics(levelId, topicIds);
      return reply.send({ success: true });
    }
  );

  fastify.post(
    '/curriculum/topics/:levelId/import',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { levelId } = request.params as { levelId: string };
      const { topics } = ImportSchema.parse(request.body);
      const topicsWithLevelId = topics.map((t) => ({ ...t, levelId }));
      const imported = await curriculumService.importTopicsFromJSON(levelId, topicsWithLevelId);
      return reply.send({ imported, total: topics.length });
    }
  );

  fastify.post(
    '/curriculum/topics/bulk',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const { topics } = BulkCreateSchema.parse(request.body);
        const result = await curriculumService.bulkCreateTopics(topics);
        return reply.status(201).send({
          created: result.created.length,
          failed: result.errors.length,
          topics: result.created,
          errors: result.errors,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: 'Validation failed',
            details: error.errors,
          });
        }
        throw error;
      }
    }
  );

  fastify.get(
    '/curriculum/topics/:topicId/approved-items',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      if (request.user?.role !== 'operator') {
        return reply.status(403).send({
          error: {
            statusCode: 403,
            message: 'Operator role required',
            requestId: request.id,
            code: 'FORBIDDEN',
          },
        });
      }

      const { topicId } = request.params as { topicId: string };

      const meaningsResult = await fastify.db.query<{
        id: string;
        text: string;
        level: string;
        tags: unknown;
        created_at: Date;
      }>(
        `SELECT am.id, am.text, am.level, am.tags, am.created_at
         FROM approved_meanings am
         JOIN validated v ON v.id = am.id::uuid
         JOIN candidates c ON v.candidate_id = c.id
         JOIN drafts d ON c.draft_id = d.id
         WHERE d.topic_id = $1
         ORDER BY am.created_at DESC`,
        [topicId]
      );

      const rulesResult = await fastify.db.query<{
        id: string;
        title: string;
        language: string;
        level: string;
        explanation: string;
        examples: unknown;
        created_at: Date;
      }>(
        `SELECT ar.id, ar.title, ar.language, ar.level, ar.explanation, ar.examples, ar.created_at
         FROM approved_rules ar
         JOIN validated v ON v.id = ar.id::uuid
         JOIN candidates c ON v.candidate_id = c.id
         JOIN drafts d ON c.draft_id = d.id
         WHERE d.topic_id = $1
         ORDER BY ar.created_at DESC`,
        [topicId]
      );

      const utterancesResult = await fastify.db.query<{
        id: string;
        text: string;
        language: string;
        meaning_id: string;
        created_at: Date;
      }>(
        `SELECT au.id, au.text, au.language, au.meaning_id, au.created_at
         FROM approved_utterances au
         JOIN approved_meanings am ON au.meaning_id = am.id
         JOIN validated v ON v.id = am.id::uuid
         JOIN candidates c ON v.candidate_id = c.id
         JOIN drafts d ON c.draft_id = d.id
         WHERE d.topic_id = $1
         ORDER BY au.created_at DESC`,
        [topicId]
      );

      const exercisesResult = await fastify.db.query<{
        id: string;
        prompt: string;
        language: string;
        level: string;
        created_at: Date;
      }>(
        `SELECT ae.id, ae.prompt, ae.language, ae.level, ae.created_at
         FROM approved_exercises ae
         JOIN validated v ON v.id = ae.id::uuid
         JOIN candidates c ON v.candidate_id = c.id
         JOIN drafts d ON c.draft_id = d.id
         WHERE d.topic_id = $1
         ORDER BY ae.created_at DESC`,
        [topicId]
      );

      return reply.send({
        meanings: meaningsResult.rows.map((row) => ({
          id: row.id,
          type: 'meaning' as const,
          content: {
            text: row.text,
            level: row.level,
            tags: row.tags,
          },
          createdAt: row.created_at.toISOString(),
        })),
        rules: rulesResult.rows.map((row) => ({
          id: row.id,
          type: 'rule' as const,
          content: {
            title: row.title,
            language: row.language,
            level: row.level,
            explanation: row.explanation,
            examples: row.examples,
          },
          createdAt: row.created_at.toISOString(),
        })),
        utterances: utterancesResult.rows.map((row) => ({
          id: row.id,
          type: 'utterance' as const,
          content: {
            text: row.text,
            language: row.language,
            meaningId: row.meaning_id,
          },
          createdAt: row.created_at.toISOString(),
        })),
        exercises: exercisesResult.rows.map((row) => ({
          id: row.id,
          type: 'exercise' as const,
          content: {
            prompt: row.prompt,
            language: row.language,
            level: row.level,
          },
          createdAt: row.created_at.toISOString(),
        })),
      });
    }
  );

  fastify.delete(
    '/curriculum/approved-items/:id',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      if (request.user?.role !== 'operator') {
        return reply.status(403).send({
          error: {
            statusCode: 403,
            message: 'Operator role required',
            requestId: request.id,
            code: 'FORBIDDEN',
          },
        });
      }

      const { id } = request.params as { id: string };
      const { dataType } = request.query as { dataType: string };

      if (!['meaning', 'utterance', 'rule', 'exercise'].includes(dataType)) {
        return reply.status(400).send({
          error: {
            statusCode: 400,
            message: 'Invalid dataType. Must be one of: meaning, utterance, rule, exercise',
            requestId: request.id,
            code: 'INVALID_DATA_TYPE',
          },
        });
      }

      const tableMap: Record<string, string> = {
        meaning: 'approved_meanings',
        utterance: 'approved_utterances',
        rule: 'approved_rules',
        exercise: 'approved_exercises',
      };

      const table = tableMap[dataType];
      const result = await fastify.db.query(`DELETE FROM ${table} WHERE id = $1`, [id]);

      if (result.rowCount === 0) {
        return reply.status(404).send({
          error: {
            statusCode: 404,
            message: `Approved ${dataType} not found`,
            requestId: request.id,
            code: 'NOT_FOUND',
          },
        });
      }

      return reply.status(204).send();
    }
  );
};
