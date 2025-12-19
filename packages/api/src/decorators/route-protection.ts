import { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';

export function protectRoute(fastify: FastifyInstance): {
  preHandler: preHandlerHookHandler[];
} {
  return {
    preHandler: [authMiddleware, fastify.requireAuth()],
  };
}

export function protectOperatorRoute(fastify: FastifyInstance): {
  preHandler: preHandlerHookHandler[];
} {
  return {
    preHandler: [authMiddleware, fastify.requireOperator()],
  };
}

export function protectLearnerRoute(fastify: FastifyInstance): {
  preHandler: preHandlerHookHandler[];
} {
  return {
    preHandler: [authMiddleware, fastify.requireLearner()],
  };
}

export function optionalAuth(): { preHandler: preHandlerHookHandler[] } {
  return {
    preHandler: [optionalAuthMiddleware],
  };
}
