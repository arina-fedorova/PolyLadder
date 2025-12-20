import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import jwt from 'jsonwebtoken';
import { getEnv } from '../../config/env';
import { ErrorResponseSchema } from '../../schemas/common';

const RefreshRequestSchema = Type.Object({
  refreshToken: Type.String(),
});

type RefreshRequest = Static<typeof RefreshRequestSchema>;

const RefreshResponseSchema = Type.Object({
  accessToken: Type.String(),
  expiresIn: Type.Number(),
});

interface TokenPayload {
  userId: string;
  role: string;
}

function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([mhd])$/);
  if (!match) return 900;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'm':
      return value * 60;
    case 'h':
      return value * 60 * 60;
    case 'd':
      return value * 60 * 60 * 24;
    default:
      return 900;
  }
}

const refreshRoute: FastifyPluginAsync = async function (fastify) {
  await Promise.resolve();
  fastify.post<{ Body: RefreshRequest }>(
    '/refresh',
    {
      schema: {
        body: RefreshRequestSchema,
        response: {
          200: RefreshResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const env = getEnv();
      const { refreshToken } = request.body;

      let decoded: TokenPayload;
      try {
        decoded = jwt.verify(refreshToken, env.JWT_SECRET) as TokenPayload;
      } catch {
        return reply.status(401).send({
          error: {
            statusCode: 401,
            message: 'Invalid or expired refresh token',
            requestId: request.id,
            code: 'INVALID_TOKEN',
          },
        });
      }

      const tokenResult = await fastify.db.query<{ user_id: string }>(
        'SELECT user_id FROM refresh_tokens WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP',
        [refreshToken]
      );

      if (tokenResult.rows.length === 0) {
        return reply.status(401).send({
          error: {
            statusCode: 401,
            message: 'Invalid or expired refresh token',
            requestId: request.id,
            code: 'TOKEN_REVOKED',
          },
        });
      }

      const accessToken = jwt.sign({ userId: decoded.userId, role: decoded.role }, env.JWT_SECRET, {
        expiresIn: env.JWT_ACCESS_EXPIRY as jwt.SignOptions['expiresIn'],
      });

      request.log.info({ userId: decoded.userId }, 'Access token refreshed');

      const accessExpirySeconds = parseExpiry(env.JWT_ACCESS_EXPIRY);

      return reply.status(200).send({
        accessToken,
        expiresIn: accessExpirySeconds,
      });
    }
  );
};

export default refreshRoute;
