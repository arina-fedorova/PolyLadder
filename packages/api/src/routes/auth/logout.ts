import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { SuccessResponseSchema, ErrorResponseSchema } from '../../schemas/common';

const LogoutRequestSchema = Type.Object({
  refreshToken: Type.String(),
});

type LogoutRequest = Static<typeof LogoutRequestSchema>;

const logoutRoute: FastifyPluginAsync = async function (fastify) {
  await Promise.resolve();
  fastify.post<{ Body: LogoutRequest }>(
    '/logout',
    {
      preHandler: [authMiddleware],
      schema: {
        body: LogoutRequestSchema,
        response: {
          200: SuccessResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { refreshToken } = request.body;
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

      await fastify.db.query('DELETE FROM refresh_tokens WHERE token = $1 AND user_id = $2', [
        refreshToken,
        userId,
      ]);

      request.log.info({ userId }, 'User logged out');

      return reply.status(200).send({
        success: true,
        message: 'Logged out successfully',
      });
    }
  );
};

export default logoutRoute;
