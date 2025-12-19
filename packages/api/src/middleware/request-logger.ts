import { FastifyRequest, FastifyReply } from 'fastify';

export function requestLoggerMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
  done: () => void
): void {
  if (request.user) {
    request.log = request.log.child({
      userId: request.user.userId,
      userRole: request.user.role,
    });
  }

  request.log.info(
    {
      method: request.method,
      url: request.url,
      ip: request.ip,
    },
    'Incoming request'
  );

  done();
}

export function responseLoggerHook(
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void
): void {
  request.log.info(
    {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
    },
    'Request completed'
  );
  done();
}
