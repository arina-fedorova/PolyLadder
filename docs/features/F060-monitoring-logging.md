# F060: Monitoring & Logging

**Feature Code**: F060
**Created**: 2025-12-17
**Phase**: 16 - Production Deployment
**Status**: Not Started

---

## Description

Implement comprehensive monitoring and logging for production environment with error tracking, performance metrics, and alerting.

## Success Criteria

- [ ] Structured logging (JSON format)
- [ ] Log levels (debug, info, warn, error)
- [ ] Error tracking with stack traces
- [ ] Performance monitoring (request duration, database queries)
- [ ] Health endpoint returns system status
- [ ] Log aggregation (Fly.io logs or external service)
- [ ] Alerting for critical errors

---

## Tasks

### Task 1: Implement Structured Logging

**Implementation Plan**:

Create `packages/api/src/utils/logger.ts`:
```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty' }
      : undefined,
});

export function logRequest(req: FastifyRequest) {
  logger.info({
    method: req.method,
    url: req.url,
    ip: req.ip,
    userId: req.user?.userId,
  }, 'Incoming request');
}

export function logError(error: Error, context?: Record<string, unknown>) {
  logger.error({
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
    ...context,
  }, 'Error occurred');
}
```

Install dependencies:
```bash
pnpm add pino pino-pretty
```

**Files Created**: `packages/api/src/utils/logger.ts`

---

### Task 2: Create Health Check Endpoint

**Implementation Plan**:

Create `packages/api/src/routes/health.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';

export const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (request, reply) => {
    // Check database connection
    try {
      await fastify.pg.query('SELECT 1');
    } catch (error) {
      logger.error('Database health check failed', { error });
      return reply.status(503).send({
        status: 'unhealthy',
        database: 'down',
      });
    }

    return reply.status(200).send({
      status: 'healthy',
      database: 'up',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });
};
```

**Files Created**: `packages/api/src/routes/health.ts`

---

### Task 3: Add Request Logging Middleware

**Implementation Plan**:

Update `packages/api/src/index.ts`:
```typescript
import { logger, logRequest } from './utils/logger';

fastify.addHook('onRequest', async (request, reply) => {
  logRequest(request);
});

fastify.addHook('onResponse', async (request, reply) => {
  logger.info({
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode,
    responseTime: reply.getResponseTime(),
  }, 'Request completed');
});

fastify.setErrorHandler((error, request, reply) => {
  logError(error, {
    method: request.method,
    url: request.url,
    userId: request.user?.userId,
  });

  reply.status(500).send({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
});
```

**Files Created**: None (update existing)

---

### Task 4: Configure Error Tracking (Optional)

**Implementation Plan**:

For Sentry integration (optional):
```typescript
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });

  fastify.setErrorHandler((error, request, reply) => {
    Sentry.captureException(error);
    logError(error, { method: request.method, url: request.url });
    reply.status(500).send({ error: 'Internal Server Error' });
  });
}
```

**Files Created**: None (optional Sentry integration)

---

### Task 5: Set Up Log Viewing

**Implementation Plan**:

For Fly.io logs:
```bash
# View realtime logs
fly logs --app polyladder

# Filter errors only
fly logs --app polyladder | grep ERROR

# Export logs to file
fly logs --app polyladder > logs.txt
```

For external log aggregation (optional):
- BetterStack (free tier)
- Papertrail
- Logtail

**Files Created**: `docs/MONITORING.md` (documentation)

---

## Dependencies

- **Blocks**: None (final feature)
- **Depends on**: F000-F058

---

## Notes

- Structured logging (JSON) enables better log parsing
- Pino is high-performance logger for Node.js
- Health endpoint used by Fly.io for health checks
- Error tracking with Sentry is optional (adds cost)
- Logs retention: Fly.io keeps 7 days by default
- Consider external log aggregation for longer retention
