# F060: Monitoring & Logging

**Feature Code**: F060
**Created**: 2025-12-17
**Completed**: 2026-01-06
**Phase**: 16 - Production Deployment
**Status**: Completed

---

## Description

Implement comprehensive monitoring and logging for production environment with error tracking, performance metrics, and alerting.

## Success Criteria

- [x] Structured logging (JSON format)
- [x] Log levels (debug, info, warn, error)
- [x] Error tracking with stack traces
- [x] Performance monitoring (request duration, database queries)
- [x] Health endpoint returns system status
- [x] Log aggregation (Fly.io logs or external service)
- [x] Alerting for critical errors (GitHub Actions backup failure alerts)

---

## Implementation Summary

### Files Modified/Created

| File                                            | Description                                 |
| ----------------------------------------------- | ------------------------------------------- |
| `packages/api/src/utils/logger.ts`              | Enhanced structured logging with utilities  |
| `packages/api/src/middleware/request-logger.ts` | Added response time tracking                |
| `packages/api/src/schemas/common.ts`            | Added uptime/memory to HealthResponseSchema |
| `packages/api/src/server.ts`                    | Enhanced health endpoint with metrics       |
| `packages/api/src/index.ts`                     | Export logger utilities                     |
| `packages/api/tests/unit/utils/logger.test.ts`  | Logger unit tests                           |
| `packages/api/tests/integration/health.test.ts` | Health endpoint tests                       |
| `docs/MONITORING.md`                            | Comprehensive monitoring guide              |

---

### Task 1: Structured Logging Utilities

**Files**: `packages/api/src/utils/logger.ts`

Enhanced the existing pino logger with:

- `logError(error, context)` - Structured error logging with stack traces
- `logPerformance(metrics)` - Performance metrics logging
- `createChildLogger(bindings)` - Scoped logger creation
- ISO timestamp formatting
- Level label formatting

**Usage**:

```typescript
import { logger, logError, logPerformance, createChildLogger } from '@polyladder/api';

// Error logging
logError(error, { requestId: 'req-123', method: 'POST' });

// Performance logging
logPerformance({ operation: 'db.query', durationMs: 45, success: true });

// Child logger
const authLogger = createChildLogger({ component: 'auth' });
```

---

### Task 2: Request Logging with Response Time

**Files**: `packages/api/src/middleware/request-logger.ts`

Enhanced request logging middleware with:

- Request start time tracking
- Response time calculation in milliseconds
- User-Agent header logging
- Content-Length in response logs

**Log output**:

```json
{
  "level": "info",
  "method": "GET",
  "url": "/api/v1/users/profile",
  "statusCode": 200,
  "responseTimeMs": 45,
  "contentLength": 256,
  "msg": "Request completed in 45ms"
}
```

---

### Task 3: Enhanced Health Endpoint

**Files**: `packages/api/src/server.ts`, `packages/api/src/schemas/common.ts`

Added new metrics to the `/health` endpoint:

- Server uptime in seconds
- Memory usage (heap used/total, RSS)

**Response**:

```json
{
  "status": "healthy",
  "timestamp": "2026-01-06T00:00:00.000Z",
  "service": "polyladder-api",
  "version": "0.1.0",
  "uptime": 3600,
  "database": {
    "connected": true,
    "latencyMs": 5
  },
  "memory": {
    "heapUsedMB": 45.23,
    "heapTotalMB": 128.0,
    "rssMB": 156.78
  }
}
```

---

### Task 4: Monitoring Documentation

**Files**: `docs/MONITORING.md`

Created comprehensive documentation covering:

- Structured logging configuration
- Health endpoint usage
- Viewing Fly.io logs
- Log levels and configuration
- Performance monitoring
- Alerting setup
- Troubleshooting guide

---

## Testing

### Unit Tests (10 tests)

- Logger instance validation
- logError function with context
- logPerformance with success/failure
- createChildLogger bindings

### Integration Tests (5 tests)

- Health endpoint healthy status
- Health endpoint uptime metric
- Health endpoint memory metrics
- API info endpoint
- 404 handling

---

## Dependencies

- **Blocks**: None (final feature in phase)
- **Depends on**: F000-F059

---

## Notes

- Pino logger provides high-performance JSON logging
- Development mode uses pino-pretty for readable output
- Health endpoint is used by Fly.io for automatic health checks
- Memory metrics help detect memory leaks
- Log aggregation via Fly.io logs with 7-day retention
- Optional external services (BetterStack, Papertrail) for longer retention
- Sentry integration ready but not implemented (adds cost)
