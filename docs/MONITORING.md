# Monitoring & Logging Guide

This document describes the monitoring and logging setup for PolyLadder production deployment.

## Table of Contents

- [Structured Logging](#structured-logging)
- [Health Check Endpoint](#health-check-endpoint)
- [Viewing Logs](#viewing-logs)
- [Log Levels](#log-levels)
- [Performance Monitoring](#performance-monitoring)
- [Alerting](#alerting)

---

## Structured Logging

PolyLadder uses [Pino](https://github.com/pinojs/pino) for high-performance structured logging in JSON format.

### Configuration

Log level is controlled via the `LOG_LEVEL` environment variable:

```bash
# Options: debug, info, warn, error, fatal
LOG_LEVEL=info
```

### Log Format

In production, logs are output as JSON for easy parsing:

```json
{
  "level": "info",
  "time": "2026-01-06T00:00:00.000Z",
  "service": "api",
  "method": "GET",
  "url": "/api/v1/learning/progress",
  "statusCode": 200,
  "responseTimeMs": 45,
  "msg": "Request completed in 45ms"
}
```

In development, logs use `pino-pretty` for human-readable output.

### Logger Utilities

The API provides several logging utilities:

```typescript
import { logger, logError, logPerformance, createChildLogger } from '@polyladder/api';

// Standard logging
logger.info({ userId, action }, 'User performed action');

// Error logging with context
logError(error, {
  requestId: 'req-123',
  method: 'POST',
  url: '/api/test',
  userId: 'user-456',
});

// Performance logging
logPerformance({
  operation: 'database.query',
  durationMs: 45,
  success: true,
  metadata: { table: 'users', rows: 100 },
});

// Child logger for component-specific logging
const authLogger = createChildLogger({ component: 'auth' });
authLogger.info('Authentication successful');
```

---

## Health Check Endpoint

The `/health` endpoint provides system status information:

### Request

```bash
GET /health
```

### Response (Healthy)

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

### Response (Unhealthy)

```json
{
  "status": "unhealthy",
  "timestamp": "2026-01-06T00:00:00.000Z",
  "service": "polyladder-api",
  "version": "0.1.0",
  "uptime": 3600,
  "database": {
    "connected": false
  },
  "memory": {
    "heapUsedMB": 45.23,
    "heapTotalMB": 128.0,
    "rssMB": 156.78
  }
}
```

### Health Check Fields

| Field                | Description                              |
| -------------------- | ---------------------------------------- |
| `status`             | Overall health: "healthy" or "unhealthy" |
| `timestamp`          | ISO 8601 timestamp of the check          |
| `service`            | Service name                             |
| `version`            | Application version                      |
| `uptime`             | Server uptime in seconds                 |
| `database.connected` | Database connection status               |
| `database.latencyMs` | Database query latency (when connected)  |
| `memory.heapUsedMB`  | V8 heap memory used                      |
| `memory.heapTotalMB` | V8 heap memory total                     |
| `memory.rssMB`       | Resident Set Size (total memory)         |

---

## Viewing Logs

### Fly.io Logs

View real-time logs from Fly.io:

```bash
# Stream logs in real-time
fly logs --app polyladder

# Follow logs continuously
fly logs --app polyladder -f

# Filter by time
fly logs --app polyladder --since 1h

# Export to file
fly logs --app polyladder > logs.txt
```

### Filtering Logs

Filter logs by level:

```bash
# Errors only
fly logs --app polyladder | grep '"level":"error"'

# Warnings and errors
fly logs --app polyladder | grep -E '"level":"(warn|error)"'

# Specific request ID
fly logs --app polyladder | grep 'req-123'
```

### Log Parsing with jq

Use `jq` for JSON log analysis:

```bash
# Pretty print logs
fly logs --app polyladder | jq .

# Extract specific fields
fly logs --app polyladder | jq '{time, level, msg, responseTimeMs}'

# Filter slow requests (>1000ms)
fly logs --app polyladder | jq 'select(.responseTimeMs > 1000)'

# Count errors
fly logs --app polyladder | jq 'select(.level == "error")' | wc -l
```

---

## Log Levels

| Level   | Usage                                              |
| ------- | -------------------------------------------------- |
| `debug` | Detailed debugging information (not in production) |
| `info`  | Normal operation events (requests, responses)      |
| `warn`  | Warning conditions (slow queries, retries)         |
| `error` | Error conditions (failed requests, exceptions)     |
| `fatal` | Critical errors requiring immediate attention      |

### Setting Log Level

```bash
# Development (verbose)
LOG_LEVEL=debug pnpm dev

# Production (standard)
LOG_LEVEL=info pnpm start

# Production (errors only)
LOG_LEVEL=error pnpm start
```

---

## Performance Monitoring

### Request Timing

Every request logs timing information:

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

### Database Query Monitoring

Database latency is monitored via the health endpoint:

```bash
# Check database latency
curl -s http://localhost:3000/health | jq '.database.latencyMs'
```

### Memory Monitoring

Memory usage is available in the health endpoint:

```bash
# Check memory usage
curl -s http://localhost:3000/health | jq '.memory'
```

---

## Alerting

### GitHub Actions Notifications

Database backup failures automatically create GitHub issues:

- Label: `backup-failure`, `urgent`
- Assigned to: Repository maintainer
- Contains: Link to failed workflow run

### Manual Monitoring

Set up external monitoring for the health endpoint:

1. **Uptime Robot** (free tier):
   - Monitor: `https://polyladder.fly.dev/health`
   - Interval: 5 minutes
   - Alert: Email on failure

2. **BetterStack** (free tier):
   - Monitor: `https://polyladder.fly.dev/health`
   - Incident management
   - Status page

### Health Check Script

```bash
#!/bin/bash
# check-health.sh

RESPONSE=$(curl -s https://polyladder.fly.dev/health)
STATUS=$(echo $RESPONSE | jq -r '.status')

if [ "$STATUS" != "healthy" ]; then
  echo "ALERT: PolyLadder is unhealthy!"
  echo $RESPONSE | jq .
  exit 1
fi

echo "OK: PolyLadder is healthy"
```

---

## Log Retention

| Storage                  | Retention |
| ------------------------ | --------- |
| Fly.io logs              | 7 days    |
| GitHub Actions artifacts | 30 days   |
| Database backups         | 30 days   |

For longer retention, consider:

- **BetterStack** (free: 7 days, paid: longer)
- **Papertrail** (free: 7 days, paid: longer)
- **Logtail** (free tier available)

---

## Troubleshooting

### High Memory Usage

Check memory metrics:

```bash
curl -s https://polyladder.fly.dev/health | jq '.memory'
```

If `heapUsedMB` approaches `heapTotalMB`, consider:

- Increasing Fly.io machine size
- Investigating memory leaks

### Slow Database Queries

Check database latency:

```bash
curl -s https://polyladder.fly.dev/health | jq '.database.latencyMs'
```

Normal: < 50ms
Slow: > 100ms

If consistently slow:

- Check database connections
- Review query indexes
- Consider scaling database

### Request Timeouts

Search for slow requests:

```bash
fly logs --app polyladder | jq 'select(.responseTimeMs > 5000)'
```

Common causes:

- Complex database queries
- External API timeouts
- Resource exhaustion
