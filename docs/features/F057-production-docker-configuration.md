# F057: Production Docker Configuration

**Feature Code**: F057
**Created**: 2025-12-17
**Completed**: 2026-01-05
**Phase**: 16 - Production Deployment
**Status**: Completed

---

## Description

Create production-optimized Docker configuration with multi-stage builds, security hardening, and minimal image size.

## Success Criteria

- [x] Multi-stage Dockerfile for production
- [x] Minimal image size (<200MB) - Alpine base with 3-stage build
- [x] Non-root user in container (nodejs:1001)
- [x] Health checks configured
- [x] Environment variable validation
- [x] Production docker-compose.yml

---

## Implementation Summary

### Files Created

| File                             | Description                             |
| -------------------------------- | --------------------------------------- |
| `docker/Dockerfile.prod`         | Multi-stage production Dockerfile       |
| `docker/docker-compose.prod.yml` | Production Docker Compose configuration |
| `docker/.env.prod.example`       | Environment variables template          |
| `docker/validate-env.sh`         | Environment validation script           |

---

### Task 1: Create Production Dockerfile

**File**: `docker/Dockerfile.prod`

Three-stage build for minimal production image:

1. **Builder Stage**: Installs all dependencies and builds TypeScript
2. **Deps Stage**: Installs production dependencies only
3. **Production Stage**: Minimal runtime with security hardening

Key features:

- Node.js 20 Alpine base for minimal size
- `dumb-init` for proper signal handling (PID 1)
- Non-root user `nodejs:1001`
- Health check on `/health` endpoint
- Resource-optimized layer caching

```dockerfile
# Stage 1: Builder
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm
# ... build packages

# Stage 2: Production deps only
FROM node:20-alpine AS deps
# ... install --prod

# Stage 3: Production runtime
FROM node:20-alpine AS production
RUN apk add --no-cache dumb-init
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs
USER nodejs
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "packages/api/dist/main.js"]
```

---

### Task 2: Create Production Docker Compose

**File**: `docker/docker-compose.prod.yml`

Production-ready orchestration with:

- PostgreSQL 15 Alpine with health checks
- API service with resource limits
- Database migrations as separate profile
- Environment variable validation (required vars with `:?` syntax)
- Network isolation

**Usage**:

```bash
# Validate environment variables first
./docker/validate-env.sh .env.prod

# Run migrations (one-time)
docker compose -f docker/docker-compose.prod.yml --profile migrate up migrate

# Start services
docker compose -f docker/docker-compose.prod.yml up -d
```

**Resource Limits**:

```yaml
deploy:
  resources:
    limits:
      cpus: '1'
      memory: 512M
    reservations:
      cpus: '0.25'
      memory: 128M
```

---

### Task 3: Environment Variable Validation

**File**: `docker/validate-env.sh`

Shell script for pre-flight validation:

- Checks required variables: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `JWT_SECRET`
- Validates `JWT_SECRET` minimum length (32 chars)
- Warns about placeholder values (`CHANGE_ME`, etc.)
- Shows optional variables with defaults

**Usage**:

```bash
./docker/validate-env.sh .env.prod
```

---

## Required Environment Variables

| Variable             | Required | Description                                   |
| -------------------- | -------- | --------------------------------------------- |
| `POSTGRES_DB`        | Yes      | Database name                                 |
| `POSTGRES_USER`      | Yes      | Database user                                 |
| `POSTGRES_PASSWORD`  | Yes      | Database password                             |
| `JWT_SECRET`         | Yes      | JWT signing secret (min 32 chars)             |
| `JWT_REFRESH_SECRET` | No       | Refresh token secret (defaults to JWT_SECRET) |
| `API_PORT`           | No       | API port (default: 3000)                      |
| `LOG_LEVEL`          | No       | Logging level (default: info)                 |
| `TAG`                | No       | Docker image tag (default: latest)            |

---

## Dependencies

- **Blocks**: F058
- **Depends on**: F000-F003

---

## Notes

- Image size optimized with Alpine base and multi-stage build
- Security: non-root user, dumb-init for signal handling, minimal attack surface
- Health checks enable orchestration (Kubernetes, Docker Swarm, Fly.io)
- Database port not exposed in production (use reverse proxy or SSH tunnel for external access)
- API already has built-in environment validation via Zod (`packages/api/src/config/env.ts`)
