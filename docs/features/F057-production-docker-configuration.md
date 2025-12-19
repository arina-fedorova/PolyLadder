# F057: Production Docker Configuration

**Feature Code**: F057
**Created**: 2025-12-17
**Phase**: 16 - Production Deployment
**Status**: Not Started

---

## Description

Create production-optimized Docker configuration with multi-stage builds, security hardening, and minimal image size.

## Success Criteria

- [ ] Multi-stage Dockerfile for production
- [ ] Minimal image size (<200MB)
- [ ] Non-root user in container
- [ ] Health checks configured
- [ ] Environment variable validation
- [ ] Production docker-compose.yml

---

## Tasks

### Task 1: Create Production Dockerfile

**Implementation Plan**:

Create `docker/Dockerfile.prod`:
```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable pnpm

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/*/package.json ./packages/

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# Copy source
COPY packages/ ./packages/
COPY tsconfig.json ./

# Build all packages
RUN pnpm -r build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install pnpm
RUN corepack enable pnpm

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/*/package.json ./packages/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder
COPY --from=builder /app/packages/*/dist ./packages/

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "packages/api/dist/index.js"]
```

**Files Created**: `docker/Dockerfile.prod`

---

### Task 2: Create Production Docker Compose

**Implementation Plan**:

Create `docker-compose.prod.yml`:
```yaml
version: '3.8'

services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  api:
    build:
      context: .
      dockerfile: docker/Dockerfile.prod
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      JWT_SECRET: ${JWT_SECRET}
      NODE_ENV: production
      LOG_LEVEL: info
    ports:
      - "3000:3000"
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  postgres_data:
```

**Files Created**: `docker-compose.prod.yml`

---

## Dependencies

- **Blocks**: F058
- **Depends on**: F000-F003

---

## Notes

- Image size optimized with alpine and multi-stage build
- Security: non-root user, minimal attack surface
- Health checks enable orchestration (Kubernetes, Docker Swarm, Fly.io)
