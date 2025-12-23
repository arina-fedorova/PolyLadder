import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { verifyPassword, needsRehash, hashPassword, generateToken } from '@polyladder/core';
import { findUserByEmail, updatePassword } from '@polyladder/db';
import { getEnv } from '../../config/env';
import { ErrorResponseSchema } from '../../schemas/common';

const LoginRequestSchema = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 1 }),
});

type LoginRequest = Static<typeof LoginRequestSchema>;

const LoginResponseSchema = Type.Object({
  accessToken: Type.String(),
  refreshToken: Type.String(),
  expiresIn: Type.Number(),
  user: Type.Object({
    id: Type.String(),
    email: Type.String({ format: 'email' }),
    role: Type.Union([Type.Literal('learner'), Type.Literal('operator')]),
  }),
});

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

const loginRoute: FastifyPluginAsync = async function (fastify) {
  await Promise.resolve();
  fastify.post<{ Body: LoginRequest }>(
    '/login',
    {
      schema: {
        body: LoginRequestSchema,
        response: {
          200: LoginResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const env = getEnv();
      const { email, password } = request.body;
      const normalizedEmail = email.toLowerCase();

      const client = await fastify.db.connect();
      try {
        await client.query('BEGIN');

        const user = await findUserByEmail(normalizedEmail);

        if (!user) {
          await client.query('ROLLBACK');
          return reply.status(401).send({
            error: {
              statusCode: 401,
              message: 'Invalid email or password',
              requestId: request.id,
              code: 'INVALID_CREDENTIALS',
            },
          });
        }

        const isValid = await verifyPassword(password, user.passwordHash);

        if (!isValid) {
          await client.query('ROLLBACK');
          return reply.status(401).send({
            error: {
              statusCode: 401,
              message: 'Invalid email or password',
              requestId: request.id,
              code: 'INVALID_CREDENTIALS',
            },
          });
        }

        // Check if password needs rehashing
        if (needsRehash(user.passwordHash)) {
          const newHash = await hashPassword(password);
          await updatePassword(user.id, newHash);
        }

        const tokenPayload = { userId: user.id, role: user.role };

        const accessToken = generateToken(tokenPayload, env.JWT_SECRET, env.JWT_ACCESS_EXPIRY);

        const refreshToken = generateToken(tokenPayload, env.JWT_SECRET, env.JWT_REFRESH_EXPIRY);

        const refreshExpirySeconds = parseExpiry(env.JWT_REFRESH_EXPIRY);
        const refreshExpiresAt = new Date(Date.now() + refreshExpirySeconds * 1000);

        await client.query(
          `INSERT INTO refresh_tokens (user_id, token, expires_at)
           VALUES ($1, $2, $3)`,
          [user.id, refreshToken, refreshExpiresAt]
        );

        await client.query('COMMIT');

        request.log.info({ userId: user.id, email: user.email }, 'User logged in');

        const accessExpirySeconds = parseExpiry(env.JWT_ACCESS_EXPIRY);

        return reply.status(200).send({
          accessToken,
          refreshToken,
          expiresIn: accessExpirySeconds,
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
          },
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  );
};

export default loginRoute;
