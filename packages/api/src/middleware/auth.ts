import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

interface JWTPayload {
  userId: string;
  role: 'learner' | 'operator';
}

function verifyJWT(token: string, secret: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, secret) as JWTPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    throw error;
  }
}

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

    const payload = verifyJWT(token, jwtSecret);

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

    const payload = verifyJWT(token, jwtSecret);
    request.user = {
      userId: payload.userId,
      role: payload.role,
    };
  } catch {
    // Invalid token - ignore
  }
}
