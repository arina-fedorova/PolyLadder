import { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    startTime?: number;
  }
}

export function requestLoggerMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
  done: () => void
): void {
  request.startTime = Date.now();

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
      userAgent: request.headers['user-agent'],
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
  const responseTimeMs = request.startTime ? Date.now() - request.startTime : 0;

  request.log.info(
    {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTimeMs,
      contentLength: reply.getHeader('content-length'),
    },
    `Request completed in ${responseTimeMs}ms`
  );
  done();
}
