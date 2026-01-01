import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema, SuccessResponseSchema } from '../../schemas/common';
import { OrthographyGateService } from '../../services/orthography-gate.service';

const GateStatusQuerySchema = Type.Object({
  language: Type.String({ minLength: 2, maxLength: 2 }),
});

const BypassGateBodySchema = Type.Object({
  userId: Type.String({ format: 'uuid' }),
  language: Type.String({ minLength: 2, maxLength: 2 }),
});

const GateProgressSchema = Type.Object({
  language: Type.String(),
  status: Type.Union([Type.Literal('locked'), Type.Literal('unlocked'), Type.Literal('completed')]),
  completedAt: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

const AllGatesResponseSchema = Type.Object({
  gates: Type.Array(GateProgressSchema),
});

type GateStatusQuery = Static<typeof GateStatusQuerySchema>;
type BypassGateBody = Static<typeof BypassGateBodySchema>;

const orthographyGateRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const gateService = new OrthographyGateService(fastify.db);

  // GET /learning/orthography-gate/status?language=XX - Get gate status for language
  fastify.get<{ Querystring: GateStatusQuery }>(
    '/orthography-gate/status',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: GateStatusQuerySchema,
        response: {
          200: GateProgressSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.query;

      const progress = await gateService.getGateProgress(userId, language);

      return reply.status(200).send(progress);
    }
  );

  // GET /learning/orthography-gate/all - Get gate status for all user's languages
  fastify.get(
    '/orthography-gate/all',
    {
      preHandler: [authMiddleware],
      schema: {
        response: {
          200: AllGatesResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;

      const gates = await gateService.getAllGatesProgress(userId);

      return reply.status(200).send({
        gates,
      });
    }
  );

  // POST /learning/orthography-gate/bypass - Bypass gate (operators only)
  fastify.post<{ Body: BypassGateBody }>(
    '/orthography-gate/bypass',
    {
      preHandler: [authMiddleware],
      schema: {
        body: BypassGateBodySchema,
        response: {
          200: SuccessResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      // Check if user is operator
      if (request.user!.role !== 'operator') {
        return reply.status(403).send({
          error: {
            statusCode: 403,
            message: 'Only operators can bypass orthography gates',
            requestId: request.id,
            code: 'FORBIDDEN',
          },
        });
      }

      const { userId, language } = request.body;

      await gateService.bypassGate(userId, language);

      request.log.info(
        { userId, language, operatorId: request.user!.userId },
        'Orthography gate bypassed'
      );

      return reply.status(200).send({
        success: true,
        message: `Orthography gate bypassed for user ${userId} in language ${language}`,
      });
    }
  );

  // POST /learning/orthography-gate/unlock - Unlock gate (start learning)
  fastify.post<{ Body: { language: string } }>(
    '/orthography-gate/unlock',
    {
      preHandler: [authMiddleware],
      schema: {
        body: Type.Object({
          language: Type.String({ minLength: 2, maxLength: 2 }),
        }),
        response: {
          200: SuccessResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.body;

      await gateService.unlockGate(userId, language);

      request.log.info({ userId, language }, 'Orthography gate unlocked');

      return reply.status(200).send({
        success: true,
        message: `Orthography gate unlocked for ${language}`,
      });
    }
  );

  // POST /learning/orthography-gate/complete - Mark gate as completed
  fastify.post<{ Body: { language: string } }>(
    '/orthography-gate/complete',
    {
      preHandler: [authMiddleware],
      schema: {
        body: Type.Object({
          language: Type.String({ minLength: 2, maxLength: 2 }),
        }),
        response: {
          200: SuccessResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.body;

      await gateService.markGateCompleted(userId, language);

      request.log.info({ userId, language }, 'Orthography gate completed');

      return reply.status(200).send({
        success: true,
        message: `Orthography gate completed for ${language}`,
      });
    }
  );
};

export default orthographyGateRoutes;
