import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { hashPassword } from '@polyladder/auth';
import { emailExists, createUser } from '@polyladder/db';
import { Language, UserRole } from '@polyladder/types';
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

      const exists = await emailExists(normalizedEmail);

      if (exists) {
        return reply.status(409).send({
          error: {
            statusCode: 409,
            message: 'User with this email already exists',
            requestId: request.id,
            code: 'EMAIL_EXISTS',
          },
        });
      }

      const passwordHash = await hashPassword(password);

      const user = await createUser({
        email: normalizedEmail,
        passwordHash,
        role: role as UserRole,
        baseLanguage: baseLanguage as Language,
      });

      request.log.info({ userId: user.id, email: user.email }, 'User registered');

      return reply.status(201).send({
        userId: user.id,
        email: user.email,
        role: user.role,
      });
    }
  );
};

export default registerRoute;
