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

export const curriculumRoutes: FastifyPluginAsync = async (fastify) => {
  const curriculumService = new CurriculumService(fastify.db);

  await Promise.resolve(); // Explicit async operation for linter

  fastify.get(
    '/operational/curriculum/levels/:language',
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
    '/operational/curriculum/topics/:levelId',
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
    '/operational/curriculum/topics',
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
    '/operational/curriculum/topics/:id',
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
    '/operational/curriculum/topics/:id',
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
    '/operational/curriculum/topics/:levelId/reorder',
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
    '/operational/curriculum/topics/:levelId/import',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { levelId } = request.params as { levelId: string };
      const { topics } = ImportSchema.parse(request.body);
      const topicsWithLevelId = topics.map((t) => ({ ...t, levelId }));
      const imported = await curriculumService.importTopicsFromJSON(levelId, topicsWithLevelId);
      return reply.send({ imported });
    }
  );
};
