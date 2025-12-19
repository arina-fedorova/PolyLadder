# F018: API Infrastructure

**Feature Code**: F018
**Created**: 2025-12-17
**Phase**: 5 - API Layer
**Status**: Not Started

---

## Description

Core Fastify server setup with CORS, logging, error handling, rate limiting, and health checks. Foundation for all API endpoints.

## Success Criteria

- [ ] Fastify server configured
- [ ] CORS enabled
- [ ] Request logging (pino)
- [ ] Global error handling
- [ ] Rate limiting plugin
- [ ] Health check endpoint (GET /health)

---

## Tasks

### Task 1: Create Fastify Server Setup

**Description**: Initialize Fastify server with TypeScript, plugins, and configuration.

**Implementation Plan**:

Create `packages/api/src/server.ts`:
```typescript
import Fastify, { FastifyInstance } from 'fastify';
import fastifyPostgres from '@fastify/postgres';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import pino from 'pino';

// Environment variables
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://dev:dev@localhost:5432/polyladder';
const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Logger configuration
const logger = pino({
  level: process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'info' : 'debug'),
  transport: NODE_ENV !== 'production'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
    trustProxy: true, // Trust proxy headers (required for Fly.io, other platforms)
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Register plugins
  await registerPlugins(server);

  // Register error handler
  registerErrorHandler(server);

  // Register routes
  await registerRoutes(server);

  return server;
}

async function registerPlugins(server: FastifyInstance): Promise<void> {
  // PostgreSQL connection pool
  await server.register(fastifyPostgres, {
    connectionString: DATABASE_URL,
  });

  // CORS - allow frontend origin
  await server.register(fastifyCors, {
    origin: FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Rate limiting
  await server.register(fastifyRateLimit, {
    max: 100, // Max requests per window
    timeWindow: '1 minute',
    cache: 10000, // Cache size for tracking IPs
    allowList: ['127.0.0.1'], // Exclude localhost from rate limiting
    redis: undefined, // TODO: Use Redis for distributed rate limiting in production
  });
}

function registerErrorHandler(server: FastifyInstance): void {
  server.setErrorHandler((error, request, reply) => {
    const { statusCode = 500, message } = error;

    // Log error
    request.log.error({
      err: error,
      requestId: request.id,
      method: request.method,
      url: request.url,
    }, 'Request error');

    // Determine response based on environment
    const response = {
      error: {
        statusCode,
        message: NODE_ENV === 'production' && statusCode === 500
          ? 'Internal Server Error'
          : message,
        requestId: request.id,
      },
    };

    // Include stack trace in development
    if (NODE_ENV !== 'production' && error.stack) {
      response.error['stack'] = error.stack;
    }

    reply.status(statusCode).send(response);
  });
}

async function registerRoutes(server: FastifyInstance): Promise<void> {
  // Health check endpoint
  server.get('/health', async (request, reply) => {
    try {
      // Check database connectivity
      await server.pg.query('SELECT 1');

      return reply.status(200).send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'polyladder-api',
        version: process.env.APP_VERSION || '0.1.0',
      });
    } catch (error) {
      request.log.error({ err: error }, 'Health check failed');

      return reply.status(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Database connection failed',
      });
    }
  });

  // Root endpoint
  server.get('/', async (request, reply) => {
    return reply.status(200).send({
      service: 'PolyLadder API',
      version: process.env.APP_VERSION || '0.1.0',
      documentation: '/docs', // TODO: Add OpenAPI/Swagger docs
    });
  });

  // Import and register feature routes
  // NOTE: These will be implemented in F019-F021
  // await server.register(authRoutes, { prefix: '/auth' });
  // await server.register(operationalRoutes, { prefix: '/operational' });
  // await server.register(learningRoutes, { prefix: '/learning' });
}

export async function startServer(): Promise<void> {
  const server = await buildServer();

  try {
    await server.listen({ port: PORT, host: HOST });

    logger.info(`Server listening on http://${HOST}:${PORT}`);
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');

  const server = await buildServer();
  await server.close();

  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');

  const server = await buildServer();
  await server.close();

  process.exit(0);
});
```

Create `packages/api/src/index.ts`:
```typescript
import { startServer } from './server';

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
```

**Files Created**:
- `packages/api/src/server.ts`
- `packages/api/src/index.ts`

---

### Task 2: Add Request Validation & Type Safety

**Description**: Configure TypeBox for runtime validation and TypeScript type safety.

**Implementation Plan**:

Create `packages/api/src/schemas/common.ts`:
```typescript
import { Type, Static } from '@sinclair/typebox';

// UUID schema
export const UuidSchema = Type.String({
  format: 'uuid',
  description: 'UUID identifier',
});

// Error response schema
export const ErrorResponseSchema = Type.Object({
  error: Type.Object({
    statusCode: Type.Number(),
    message: Type.String(),
    requestId: Type.String(),
    stack: Type.Optional(Type.String()),
  }),
});

export type ErrorResponse = Static<typeof ErrorResponseSchema>;

// Pagination query params
export const PaginationQuerySchema = Type.Object({
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Number({ minimum: 0, default: 0 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// Paginated response wrapper
export function PaginatedResponseSchema<T>(itemSchema: T) {
  return Type.Object({
    items: Type.Array(itemSchema),
    total: Type.Number(),
    limit: Type.Number(),
    offset: Type.Number(),
  });
}

// Success response wrapper
export const SuccessResponseSchema = Type.Object({
  success: Type.Boolean(),
  message: Type.Optional(Type.String()),
});

export type SuccessResponse = Static<typeof SuccessResponseSchema>;
```

**Files Created**: `packages/api/src/schemas/common.ts`

---

### Task 3: Add Authentication Middleware

**Description**: JWT token verification middleware for protected routes.

**Implementation Plan**:

Create `packages/api/src/middleware/auth.middleware.ts`:
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export interface JWTPayload {
  userId: string;
  role: 'learner' | 'operator';
  iat: number;
  exp: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: {
          statusCode: 401,
          message: 'Missing or invalid Authorization header',
          requestId: request.id,
        },
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

    // Attach user to request
    request.user = decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return reply.status(401).send({
        error: {
          statusCode: 401,
          message: 'Token expired',
          requestId: request.id,
        },
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return reply.status(401).send({
        error: {
          statusCode: 401,
          message: 'Invalid token',
          requestId: request.id,
        },
      });
    }

    throw error;
  }
}

export function requireOperator() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({
        error: {
          statusCode: 401,
          message: 'Authentication required',
          requestId: request.id,
        },
      });
    }

    if (request.user.role !== 'operator') {
      return reply.status(403).send({
        error: {
          statusCode: 403,
          message: 'Operator role required',
          requestId: request.id,
        },
      });
    }
  };
}

export function requireLearner() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({
        error: {
          statusCode: 401,
          message: 'Authentication required',
          requestId: request.id,
        },
      });
    }

    if (request.user.role !== 'learner') {
      return reply.status(403).send({
        error: {
          statusCode: 403,
          message: 'Learner role required',
          requestId: request.id,
        },
      });
    }
  };
}
```

**Files Created**: `packages/api/src/middleware/auth.middleware.ts`

---

### Task 4: Add Database Helper Utilities

**Description**: Helper functions for common database operations.

**Implementation Plan**:

Create `packages/api/src/utils/db.utils.ts`:
```typescript
import { PoolClient } from 'pg';

/**
 * Execute query in a transaction
 */
export async function withTransaction<T>(
  client: PoolClient,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/**
 * Build WHERE clause from filters
 */
export function buildWhereClause(
  filters: Record<string, unknown>,
  startIndex: number = 1
): { clause: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = startIndex;

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) {
      conditions.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
}

/**
 * Build pagination clause
 */
export function buildPaginationClause(
  limit: number = 20,
  offset: number = 0
): string {
  return `LIMIT ${limit} OFFSET ${offset}`;
}
```

**Files Created**: `packages/api/src/utils/db.utils.ts`

---

### Task 5: Add Package Configuration

**Description**: Update package.json with dependencies and scripts.

**Implementation Plan**:

Update `packages/api/package.json`:
```json
{
  "name": "@polyladder/api",
  "version": "0.1.0",
  "scripts": {
    "dev": "nodemon",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest",
    "lint": "eslint src --ext .ts"
  },
  "dependencies": {
    "@polyladder/core": "workspace:*",
    "@polyladder/db": "workspace:*",
    "@fastify/cors": "^8.5.0",
    "@fastify/postgres": "^5.2.2",
    "@fastify/rate-limit": "^9.1.0",
    "@fastify/type-provider-typebox": "^4.0.0",
    "@sinclair/typebox": "^0.32.5",
    "fastify": "^4.25.2",
    "jsonwebtoken": "^9.0.2",
    "pg": "^8.11.0",
    "pino": "^8.16.0",
    "pino-pretty": "^10.2.3"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.5",
    "@types/node": "^20.10.0",
    "@types/pg": "^8.10.0",
    "nodemon": "^3.0.2",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3",
    "vitest": "^1.0.4"
  }
}
```

Create `packages/api/nodemon.json`:
```json
{
  "watch": ["src"],
  "ext": "ts",
  "exec": "ts-node src/index.ts",
  "env": {
    "NODE_ENV": "development"
  }
}
```

Create `packages/api/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "CommonJS",
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Files Created**:
- Update `packages/api/package.json`
- `packages/api/nodemon.json`
- `packages/api/tsconfig.json`

---

### Task 6: Add Environment Variable Validation

**Description**: Validate required environment variables on startup.

**Implementation Plan**:

Create `packages/api/src/config/env.ts`:
```typescript
import { z } from 'zod';

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().url(),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // Frontend
  FRONTEND_URL: z.string().url(),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Optional
  APP_VERSION: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

export function validateEnv(): Env {
  try {
    env = envSchema.parse(process.env);
    return env;
  } catch (error) {
    console.error('❌ Environment validation failed:');
    console.error(error.errors);
    process.exit(1);
  }
}

export function getEnv(): Env {
  if (!env) {
    throw new Error('Environment not validated. Call validateEnv() first.');
  }
  return env;
}
```

Update `packages/api/src/index.ts`:
```typescript
import { validateEnv } from './config/env';
import { startServer } from './server';

// Validate environment variables before starting
validateEnv();

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
```

**Files Created**:
- `packages/api/src/config/env.ts`
- Update `packages/api/src/index.ts`

---

## Open Questions

### Question 1: API Versioning Strategy
**Context**: How to handle API versioning for future changes.

**Options**:
1. **URL Versioning** (`/v1/users`, `/v2/users`)
   - Pros: Clear, easy to understand
   - Cons: Routes duplication, multiple versions to maintain

2. **Header Versioning** (`Accept: application/vnd.polyladder.v1+json`)
   - Pros: Clean URLs, version in metadata
   - Cons: Less discoverable, harder to test

3. **No Versioning** (breaking changes in new major releases)
   - Pros: Simplest, no overhead
   - Cons: Risky for public APIs, difficult migrations

**Questions**:
1. Is this API public or internal only?
2. How often do we expect breaking changes?

**Decision Needed**: Can be deferred to post-MVP.

**Temporary Plan**: No versioning for MVP. All routes at root level. Add versioning if needed later.

---

### Question 2: Rate Limiting Strategy
**Context**: Current implementation uses in-memory rate limiting (max 100 req/min per IP).

**Current Limitation**: In-memory rate limiting doesn't work across multiple API instances.

**Options for Production**:
1. **Redis-based rate limiting**
   - Pros: Works across instances, accurate, persistent
   - Cons: Requires Redis infrastructure
   - Cost: ~$5-15/month for Redis (Upstash, Redis Cloud)

2. **Per-instance rate limiting**
   - Pros: No external dependencies
   - Cons: Limit is per instance (3 instances = 3x requests)
   - Acceptable if limits are conservative

3. **No rate limiting**
   - Pros: Simplest, no overhead
   - Cons: Vulnerable to abuse

**Questions**:
1. How many API instances will run in production?
2. Budget for Redis?
3. What's acceptable abuse risk for MVP?

**Decision Needed**: Before production deployment.

**Temporary Plan**: Use in-memory rate limiting for MVP (single instance). Add Redis-based rate limiting if deploying multiple instances.

---

### Question 3: Request/Response Logging
**Context**: How much request/response data to log?

**Current State**: Logs request method, URL, errors. No request/response body logging.

**Options**:
1. **Minimal logging** (current)
   - Log: Method, URL, status, duration, errors
   - Pros: Low overhead, GDPR-safe
   - Cons: Hard to debug issues

2. **Full logging** (development only)
   - Log: Method, URL, headers, body, response, errors
   - Pros: Easy debugging
   - Cons: Privacy concerns, large log volume

3. **Selective logging** (errors + sampled requests)
   - Log errors fully, sample 1% of successful requests
   - Pros: Balance debugging and privacy
   - Cons: More complex configuration

**Questions**:
1. What's the privacy policy for user data?
2. Is logging request bodies acceptable?

**Decision Needed**: Before MVP launch.

**Temporary Plan**: Minimal logging (option 1) for MVP. Only log errors with request context. No request/response body logging for privacy.

---

## Dependencies

- **Blocks**: F019, F020, F021
- **Depends on**: F003

---

## Notes

- Health check endpoint (`GET /health`) used by Fly.io and other deployment platforms
- Rate limiting: 100 requests/minute per IP (configurable via env var)
- JWT secret must be at least 32 characters in production
- CORS allows only frontend origin (configured via FRONTEND_URL env var)
- All errors return consistent format with request ID for tracing
