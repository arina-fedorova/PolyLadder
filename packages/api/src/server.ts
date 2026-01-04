import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { getEnv } from './config/env';
import { HealthResponseSchema } from './schemas/common';
import { Pool } from 'pg';

let pool: Pool | null = null;
let poolConnectionString: string | null = null;

function getPool(): Pool {
  const env = getEnv();
  const connectionString = env.DATABASE_URL;

  if (!pool || poolConnectionString !== connectionString) {
    if (pool) {
      void pool.end();
    }
    poolConnectionString = connectionString;
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      process.stderr.write(`Database pool error: ${err.message}\n`);
    });
  }

  return pool;
}

export async function buildServer(): Promise<FastifyInstance> {
  const env = getEnv();

  const server = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV !== 'production'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
    trustProxy: true,
  }).withTypeProvider<TypeBoxTypeProvider>();

  server.decorate('db', getPool());

  await registerPlugins(server);
  registerErrorHandler(server);
  await registerRoutes(server);

  return server;
}

async function registerPlugins(server: FastifyInstance): Promise<void> {
  const env = getEnv();

  if (env.NODE_ENV === 'development') {
    await server.register(fastifyCors, {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
      exposedHeaders: ['X-Request-ID'],
      maxAge: 86400,
    });
  } else {
    await server.register(fastifyCors, {
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
      exposedHeaders: ['X-Request-ID'],
      maxAge: 86400,
    });
  }

  if (env.NODE_ENV !== 'test') {
    await server.register(fastifyRateLimit, {
      max: env.RATE_LIMIT_MAX,
      timeWindow: env.RATE_LIMIT_WINDOW,
      cache: 10000,
      allowList: ['127.0.0.1', '::1'],
      keyGenerator: (request: FastifyRequest) => {
        return request.ip;
      },
      errorResponseBuilder: (request: FastifyRequest, context) => {
        return {
          error: {
            statusCode: 429,
            message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
            requestId: request.id,
            code: 'RATE_LIMIT_EXCEEDED',
          },
        };
      },
    });
  }
}

interface FastifyError extends Error {
  statusCode?: number;
  code?: string;
  validation?: unknown;
}

function registerErrorHandler(server: FastifyInstance): void {
  const env = getEnv();

  server.setErrorHandler((err: FastifyError, request, reply) => {
    const statusCode = err.statusCode ?? 500;
    const isValidationError = err.code === 'FST_ERR_VALIDATION' || statusCode === 400;
    const isClientError = statusCode >= 400 && statusCode < 500;

    if (isValidationError || (isClientError && env.NODE_ENV === 'test')) {
      request.log.debug(
        {
          err,
          requestId: request.id,
          method: request.method,
          url: request.url,
        },
        'Request validation error'
      );
    } else {
      request.log.error(
        {
          err,
          requestId: request.id,
          method: request.method,
          url: request.url,
        },
        'Request error'
      );
    }

    const response: {
      error: {
        statusCode: number;
        message: string;
        requestId: string;
        code?: string;
        details?: Record<string, unknown>;
      };
    } = {
      error: {
        statusCode,
        message:
          env.NODE_ENV === 'production' && statusCode === 500
            ? 'Internal Server Error'
            : err.message,
        requestId: request.id,
      },
    };

    if (err.code) {
      response.error.code = err.code;
    }

    if (err.validation) {
      response.error.code = 'VALIDATION_ERROR';
      response.error.details = { validation: err.validation };
    }

    void reply.status(statusCode).send(response);
  });

  server.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    void reply.status(404).send({
      error: {
        statusCode: 404,
        message: `Route ${request.method} ${request.url} not found`,
        requestId: request.id,
        code: 'NOT_FOUND',
      },
    });
  });
}

async function registerRoutes(server: FastifyInstance): Promise<void> {
  const env = getEnv();
  const dbPool = getPool();

  server.get(
    '/health',
    {
      schema: {
        response: {
          200: HealthResponseSchema,
          503: HealthResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const startTime = Date.now();

      try {
        await dbPool.query('SELECT 1');
        const latencyMs = Date.now() - startTime;

        return reply.status(200).send({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          service: 'polyladder-api',
          version: env.APP_VERSION ?? '0.1.0',
          database: {
            connected: true,
            latencyMs,
          },
        });
      } catch (error) {
        request.log.error({ err: error }, 'Health check failed');

        return reply.status(503).send({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          service: 'polyladder-api',
          version: env.APP_VERSION ?? '0.1.0',
          database: {
            connected: false,
          },
        });
      }
    }
  );

  server.get('/', async (_request, reply) => {
    return reply.status(200).send({
      service: 'PolyLadder API',
      version: env.APP_VERSION ?? '0.1.0',
      endpoints: {
        health: '/health',
        auth: '/api/v1/auth',
        learning: '/api/v1/learning',
        operational: '/api/v1/operational',
        comparative: '/api/v1/comparative',
      },
    });
  });

  await server.register(
    async (apiV1: FastifyInstance) => {
      const authRoutes = (await import('./routes/auth/index')).default;
      await apiV1.register(authRoutes, { prefix: '/auth' });

      const operationalRoutes = (await import('./routes/operational/index')).default;
      await apiV1.register(operationalRoutes, { prefix: '/operational' });

      const learningRoutes = (await import('./routes/learning/index')).default;
      await apiV1.register(learningRoutes, { prefix: '/learning' });

      const comparativeRoutes = (await import('./routes/comparative/index')).default;
      await apiV1.register(comparativeRoutes, { prefix: '/comparative' });
    },
    { prefix: '/api/v1' }
  );
}

export async function startServer(): Promise<FastifyInstance> {
  const env = getEnv();
  const server = await buildServer();

  try {
    await server.listen({ port: env.PORT, host: env.HOST });
    server.log.info(`Server listening on http://${env.HOST}:${String(env.PORT)}`);
    return server;
  } catch (error) {
    server.log.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

export async function closeServer(server: FastifyInstance): Promise<void> {
  await server.close();
  if (pool) {
    await pool.end();
    pool = null;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool;
  }
}
