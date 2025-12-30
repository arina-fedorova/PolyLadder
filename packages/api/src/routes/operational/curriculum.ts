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

      const topicIds = topics.map((t) => t.id);
      if (topicIds.length === 0) {
        return reply.send({
          topics: topics.map((t) => ({ ...t, actualItems: 0 })),
        });
      }

      const countsResult = await fastify.db.query<{ topic_id: string; count: string }>(
        `SELECT d.topic_id, COUNT(DISTINCT v.id) as count
         FROM validated v
         JOIN approval_events ae ON ae.item_id = v.id::varchar
         JOIN candidates c ON v.candidate_id = c.id
         JOIN drafts d ON c.draft_id = d.id
         WHERE d.topic_id = ANY($1::uuid[])
         GROUP BY d.topic_id`,
        [topicIds]
      );

      const countsMap = new Map<string, number>();
      for (const row of countsResult.rows) {
        countsMap.set(row.topic_id, parseInt(row.count, 10));
      }

      const topicsWithActual = topics.map((t) => ({
        ...t,
        actualItems: countsMap.get(t.id) || 0,
      }));

      return reply.send({ topics: topicsWithActual });
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

      const approvedItemsResult = await fastify.db.query<{
        id: string;
        data_type: string;
        validated_data: Record<string, unknown>;
        created_at: Date;
      }>(
        `SELECT v.id, v.data_type, v.validated_data, ae.created_at
         FROM validated v
         JOIN approval_events ae ON ae.item_id = v.id::varchar
         JOIN candidates c ON v.candidate_id = c.id
         JOIN drafts d ON c.draft_id = d.id
         WHERE d.topic_id = $1
         ORDER BY ae.created_at DESC`,
        [topicId]
      );

      const meanings: Array<{
        id: string;
        type: 'meaning';
        content: Record<string, unknown>;
        createdAt: string;
      }> = [];
      const rules: Array<{
        id: string;
        type: 'rule';
        content: Record<string, unknown>;
        createdAt: string;
      }> = [];
      const utterances: Array<{
        id: string;
        type: 'utterance';
        content: Record<string, unknown>;
        createdAt: string;
      }> = [];
      const exercises: Array<{
        id: string;
        type: 'exercise';
        content: Record<string, unknown>;
        createdAt: string;
      }> = [];

      for (const row of approvedItemsResult.rows) {
        const item = {
          id: row.id,
          content: row.validated_data,
          createdAt: row.created_at.toISOString(),
        };

        if (row.data_type === 'meaning') {
          meanings.push({ ...item, type: 'meaning' as const });
        } else if (row.data_type === 'rule') {
          rules.push({ ...item, type: 'rule' as const });
        } else if (row.data_type === 'utterance') {
          utterances.push({ ...item, type: 'utterance' as const });
        } else if (row.data_type === 'exercise') {
          exercises.push({ ...item, type: 'exercise' as const });
        }
      }

      return reply.send({ meanings, rules, utterances, exercises });
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

      const checkResult = await fastify.db.query<{ id: string }>(
        `SELECT v.id FROM validated v
         JOIN approval_events ae ON ae.item_id = v.id::varchar
         WHERE v.id = $1`,
        [id]
      );

      if (checkResult.rows.length === 0) {
        return reply.status(404).send({
          error: {
            statusCode: 404,
            message: 'Approved item not found',
            requestId: request.id,
            code: 'NOT_FOUND',
          },
        });
      }

      await fastify.db.query('DELETE FROM approval_events WHERE item_id = $1', [id]);
      await fastify.db.query('DELETE FROM review_queue WHERE item_id = $1', [id]);
      await fastify.db.query('DELETE FROM validated WHERE id = $1', [id]);

      return reply.status(204).send();
    }
  );
};
