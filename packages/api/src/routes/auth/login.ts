import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import {
  verifyPassword,
  needsRehash,
  hashPassword,
  generateToken,
  UserRole,
} from '@polyladder/core';
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
      onRequest: (_request) => {
        // Log all login requests in E2E tests
        if (process.env.NODE_ENV === 'test') {
          process.stderr.write(`[E2E LOGIN] POST /login request received\n`);
        }
      },
    },
    async (request, reply) => {
      const env = getEnv();
      const { email, password } = request.body;
      const normalizedEmail = email.toLowerCase();

      // Log all login attempts in E2E tests
      if (process.env.NODE_ENV === 'test') {
        process.stderr.write(`[E2E LOGIN] ===== LOGIN REQUEST START =====\n`);
        process.stderr.write(`[E2E LOGIN] Email: ${normalizedEmail}\n`);
        process.stderr.write(`[E2E LOGIN] Password length: ${password.length}\n`);
        process.stderr.write(`[E2E LOGIN] Request ID: ${request.id}\n`);
      }

      // Find user without transaction (read-only operation doesn't need transaction)
      // Log the query for debugging in E2E tests
      if (process.env.NODE_ENV === 'test') {
        process.stderr.write(`[E2E LOGIN] Searching for user: ${normalizedEmail}\n`);
      }

      const userResult = await fastify.db.query<{
        id: string;
        email: string;
        password_hash: string;
        role: 'learner' | 'operator';
        base_language: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT id, email, password_hash, role,
                base_language, created_at, updated_at
         FROM users
         WHERE email = $1`,
        [normalizedEmail]
      );

      const userRow = userResult.rows[0];

      if (!userRow) {
        // Check all users for debugging
        const allUsersResult = await fastify.db.query<{ email: string }>(
          'SELECT email FROM users LIMIT 10'
        );
        const databaseUrl = process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@');
        const logData = {
          email: normalizedEmail,
          searchedEmail: normalizedEmail,
          allUsers: allUsersResult.rows.map((r) => r.email),
          databaseUrl,
          rowCount: userResult.rowCount,
        };
        request.log.warn(logData, 'User not found during login');
        // Also log to stderr for E2E tests
        if (process.env.NODE_ENV === 'test') {
          process.stderr.write(`[E2E LOGIN DEBUG] User not found: ${JSON.stringify(logData)}\n`);
        }
        return reply.status(401).send({
          error: {
            statusCode: 401,
            message: 'Invalid email or password',
            requestId: request.id,
            code: 'INVALID_CREDENTIALS',
          },
        });
      }

      const user = {
        id: userRow.id,
        email: userRow.email,
        passwordHash: userRow.password_hash,
        role: userRow.role,
        baseLanguage: userRow.base_language as 'EN' | 'IT' | 'PT' | 'SL' | 'ES',
        createdAt: userRow.created_at,
        updatedAt: userRow.updated_at,
      };

      // Debug password verification in E2E tests
      if (process.env.NODE_ENV === 'test') {
        process.stderr.write(
          `[E2E LOGIN] Password hash from DB: ${user.passwordHash.substring(0, 20)}... (length: ${user.passwordHash.length})\n`
        );
        process.stderr.write(`[E2E LOGIN] Attempting to verify password...\n`);
      }

      const isValid = await verifyPassword(password, user.passwordHash);

      if (process.env.NODE_ENV === 'test') {
        process.stderr.write(
          `[E2E LOGIN] Password verification result: ${isValid ? 'SUCCESS' : 'FAILED'}\n`
        );
      }

      if (!isValid) {
        request.log.warn(
          { email: normalizedEmail, userId: user.id },
          'Password verification failed during login'
        );
        if (process.env.NODE_ENV === 'test') {
          process.stderr.write(
            `[E2E LOGIN ERROR] Password verification failed for ${normalizedEmail}\n`
          );
        }
        return reply.status(401).send({
          error: {
            statusCode: 401,
            message: 'Invalid email or password',
            requestId: request.id,
            code: 'INVALID_CREDENTIALS',
          },
        });
      }

      // Use transaction only for write operations
      const client = await fastify.db.connect();
      try {
        await client.query('BEGIN');

        // Check if password needs rehashing
        if (needsRehash(user.passwordHash)) {
          const newHash = await hashPassword(password);
          await client.query(
            'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newHash, user.id]
          );
        }

        const tokenPayload = {
          userId: user.id,
          role: user.role === 'learner' ? UserRole.LEARNER : UserRole.OPERATOR,
        };

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
