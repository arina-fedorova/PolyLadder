import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

const authorizationPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('requireAuth', function (): (
    request: FastifyRequest,
    reply: FastifyReply
  ) => Promise<void> {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      if (!request.user) {
        await reply.status(401).send({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }
    };
  });

  fastify.decorate('requireOperator', function (): (
    request: FastifyRequest,
    reply: FastifyReply
  ) => Promise<void> {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      if (!request.user) {
        await reply.status(401).send({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      if (request.user.role !== 'operator') {
        await reply.status(403).send({
          error: 'Forbidden',
          message: 'Operator role required',
        });
      }
    };
  });

  fastify.decorate('requireLearner', function (): (
    request: FastifyRequest,
    reply: FastifyReply
  ) => Promise<void> {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      if (!request.user) {
        await reply.status(401).send({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }
    };
  });

  await Promise.resolve();
};

export default fp(authorizationPlugin, { name: 'authorization' });
