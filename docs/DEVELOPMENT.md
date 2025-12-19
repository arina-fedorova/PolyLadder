# Development Guide

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker and Docker Compose

### Start Development Environment

```bash
# Start all services (PostgreSQL, API, Refinement Service)
pnpm dev

# In another terminal, start frontend
pnpm --filter @polyladder/web dev
```

Access:

- Frontend: http://localhost:5173
- API: http://localhost:3000
- PostgreSQL: localhost:5432 (user: dev, password: dev)

### Hot Reload

Backend services automatically reload on code changes in:

- `packages/api/src/`
- `packages/refinement-service/src/`
- `packages/core/src/`
- `packages/db/src/`

Frontend (Vite) has instant HMR.

## Common Tasks

### View Logs

```bash
# All services
pnpm dev:logs

# Specific service
pnpm dev:logs api
pnpm dev:logs refinement
pnpm dev:logs db
```

### Access Database

```bash
# PostgreSQL shell
pnpm dev:db

# Or use GUI tools (TablePlus, DBeaver, etc.)
# Connection: localhost:5432, user: dev, password: dev, database: polyladder
```

### Run Migrations

```bash
# Start database only
pnpm db:up

# Run migrations
pnpm --filter @polyladder/db migrate:up

# Seed development data
pnpm --filter @polyladder/db seed
```

### Reset Environment

```bash
# Stop containers and remove all data
pnpm dev:reset
```

## Debugging

### Backend (API)

1. Start development environment: `pnpm dev`
2. In VSCode/Cursor: F5 or Run > "Attach to API (Docker)"
3. Set breakpoints in TypeScript files
4. Make API request to trigger breakpoint

### Frontend

1. Start frontend: `pnpm --filter @polyladder/web dev`
2. In VSCode/Cursor: Run > "Debug Frontend (Chrome)"
3. Or use Chrome DevTools (F12)

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 5432
lsof -i :5432  # macOS/Linux
netstat -ano | findstr :5432  # Windows

# Or change port in docker-compose.yml
```

### Database Connection Failed

```bash
# Check database is running
docker ps | grep polyladder-db-dev

# Check logs
pnpm dev:logs db

# Restart database
docker-compose -f docker/docker-compose.yml restart db
```

### Hot Reload Not Working

```bash
# Rebuild containers
pnpm dev:build

# Or restart specific service
docker-compose -f docker/docker-compose.yml restart api
```

### Docker Build Failed

```bash
# Clean up and rebuild
pnpm dev:clean
pnpm dev:build
```

## Environment Variables

Copy `.env.example` to `.env` for local development without Docker.

For Docker development, environment variables are managed in `docker/docker-compose.yml`.

| Variable     | Description           | Default (Dev)                                |
| ------------ | --------------------- | -------------------------------------------- |
| DATABASE_URL | PostgreSQL connection | postgres://dev:dev@localhost:5432/polyladder |
| JWT_SECRET   | JWT signing secret    | dev-secret-change-in-production              |
| NODE_ENV     | Environment           | development                                  |
| LOG_LEVEL    | Logging verbosity     | debug                                        |
| PORT         | API server port       | 3000                                         |
| VITE_API_URL | Frontend API URL      | http://localhost:3000/api/v1                 |

## Project Structure

```
packages/
├── core/          # Shared types and utilities
├── db/            # Database connection and migrations
├── api/           # REST API (Fastify)
├── refinement-service/  # Content Refinement Service
└── web/           # Frontend (React + Vite)

docker/
├── docker-compose.yml   # Development orchestration
├── Dockerfile.dev       # Development image
└── .env.development     # Docker environment vars

scripts/
├── dev-reset.sh    # Reset development environment
├── dev-logs.sh     # View service logs
├── dev-shell.sh    # Access container shell
└── dev-db-shell.sh # Access PostgreSQL
```
