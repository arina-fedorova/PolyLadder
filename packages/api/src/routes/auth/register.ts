import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import bcrypt from 'bcrypt';
import { ErrorResponseSchema } from '../../schemas/common';

const RegisterRequestSchema = Type.Object({
  email: Type.String({ format: 'email', minLength: 5, maxLength: 255 }),
  password: Type.String({ minLength: 8, maxLength: 100 }),
  role: Type.Optional(
    Type.Union([Type.Literal('learner'), Type.Literal('operator')], { default: 'learner' })
  ),
  baseLanguage: Type.Optional(
    Type.Union(
      [
        Type.Literal('EN'),
        Type.Literal('IT'),
        Type.Literal('PT'),
        Type.Literal('SL'),
        Type.Literal('ES'),
      ],
      { default: 'EN' }
    )
  ),
});

type RegisterRequest = Static<typeof RegisterRequestSchema>;

const RegisterResponseSchema = Type.Object({
  userId: Type.String(),
  email: Type.String({ format: 'email' }),
  role: Type.Union([Type.Literal('learner'), Type.Literal('operator')]),
});

const SALT_ROUNDS = 12;

const registerRoute: FastifyPluginAsync = async function (fastify) {
  await Promise.resolve();
  fastify.post<{ Body: RegisterRequest }>(
    '/register',
    {
      schema: {
        body: RegisterRequestSchema,
        response: {
          201: RegisterResponseSchema,
          400: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { email, password, role = 'learner', baseLanguage = 'EN' } = request.body;
      const normalizedEmail = email.toLowerCase();

      const existingUser = await fastify.db.query('SELECT id FROM users WHERE email = $1', [
        normalizedEmail,
      ]);

      if (existingUser.rows.length > 0) {
        return reply.status(409).send({
          error: {
            statusCode: 409,
            message: 'User with this email already exists',
            requestId: request.id,
            code: 'EMAIL_EXISTS',
          },
        });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      const result = await fastify.db.query<{ id: string; email: string; role: string }>(
        `INSERT INTO users (email, password_hash, role, base_language, created_at, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id, email, role`,
        [normalizedEmail, passwordHash, role, baseLanguage]
      );

      const user = result.rows[0];

      request.log.info({ userId: user.id, email: user.email }, 'User registered');

      return reply.status(201).send({
        userId: user.id,
        email: user.email,
        role: user.role as 'learner' | 'operator',
      });
    }
  );
};

export default registerRoute;
