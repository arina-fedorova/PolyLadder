import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '@polyladder/core';

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return;
  }

  const token = authHeader.substring(7);

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    const payload = verifyToken(token, jwtSecret);

    request.user = {
      userId: payload.userId,
      role: payload.role,
    };
  } catch (error) {
    await reply.status(401).send({
      error: 'Unauthorized',
      message: error instanceof Error ? error.message : 'Invalid token',
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
    request.user = {
      userId: payload.userId,
      role: payload.role,
    };
  } catch {
    // Invalid token - ignore
  }
}
