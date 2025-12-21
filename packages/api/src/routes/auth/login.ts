import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
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

        const result = await client.query<{
          id: string;
          email: string;
          password_hash: string;
          role: string;
        }>('SELECT id, email, password_hash, role FROM users WHERE email = $1 FOR UPDATE', [normalizedEmail]);

        if (result.rows.length === 0) {
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

        const user = result.rows[0];

        const isValid = await bcrypt.compare(password, user.password_hash);

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

        const tokenPayload = { userId: user.id, role: user.role };

        const accessToken = jwt.sign(tokenPayload, env.JWT_SECRET, {
          expiresIn: env.JWT_ACCESS_EXPIRY as jwt.SignOptions['expiresIn'],
        });

        const refreshToken = jwt.sign(tokenPayload, env.JWT_SECRET, {
          expiresIn: env.JWT_REFRESH_EXPIRY as jwt.SignOptions['expiresIn'],
        });

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
            role: user.role as 'learner' | 'operator',
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
