import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '@polyladder/core';

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    await reply.status(401).send({
      error: {
        statusCode: 401,
        message: 'Authentication required',
        requestId: request.id,
        code: 'UNAUTHORIZED',
      },
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    const payload = verifyToken(token, jwtSecret);

    if (!payload) {
      await reply.status(401).send({
        error: {
          statusCode: 401,
          message: 'Invalid token',
          requestId: request.id,
          code: 'UNAUTHORIZED',
        },
      });
      return;
    }

    request.user = {
      userId: payload.userId,
      role: payload.role as 'learner' | 'operator',
    };
  } catch (error) {
    await reply.status(401).send({
      error: {
        statusCode: 401,
        message: error instanceof Error ? error.message : 'Invalid token',
        requestId: request.id,
        code: 'UNAUTHORIZED',
      },
    });
  }
}

export function optionalAuthMiddleware(request: FastifyRequest): void {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return;
  }

  const token = authHeader.substring(7);

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return;
    }

    const payload = verifyToken(token, jwtSecret);
    if (payload) {
      request.user = {
        userId: payload.userId,
        role: payload.role as 'learner' | 'operator',
      };
    }
  } catch (_error) {
    void _error;
  }
}
