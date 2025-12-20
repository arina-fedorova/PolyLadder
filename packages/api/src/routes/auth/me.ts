import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema } from '../../schemas/common';

const UserProfileSchema = Type.Object({
  id: Type.String(),
  email: Type.String({ format: 'email' }),
  role: Type.Union([Type.Literal('learner'), Type.Literal('operator')]),
  createdAt: Type.String(),
  baseLanguage: Type.Union([Type.String(), Type.Null()]),
});

const meRoute: FastifyPluginAsync = async function (fastify) {
  await Promise.resolve();
  fastify.get(
    '/me',
    {
      preHandler: [authMiddleware],
      schema: {
        response: {
          200: UserProfileSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user?.userId;

      if (!userId) {
        return reply.status(401).send({
          error: {
            statusCode: 401,
            message: 'Authentication required',
            requestId: request.id,
            code: 'UNAUTHORIZED',
          },
        });
      }

      const result = await fastify.db.query<{
        id: string;
        email: string;
        role: string;
        created_at: Date;
        base_language: string | null;
      }>('SELECT id, email, role, created_at, base_language FROM users WHERE id = $1', [userId]);

      if (result.rows.length === 0) {
        return reply.status(401).send({
          error: {
            statusCode: 401,
            message: 'User not found',
            requestId: request.id,
            code: 'USER_NOT_FOUND',
          },
        });
      }

      const user = result.rows[0];

      return reply.status(200).send({
        id: user.id,
        email: user.email,
        role: user.role as 'learner' | 'operator',
        createdAt: user.created_at.toISOString(),
        baseLanguage: user.base_language,
      });
    }
  );
};

export default meRoute;
