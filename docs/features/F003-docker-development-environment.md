# F003: Docker Development Environment

**Feature Code**: F003
**Created**: 2025-12-17
**Phase**: 0 - Foundation & Infrastructure
**Status**: Not Started

---

## Description

Set up a complete Docker-based development environment that mirrors production configuration. This includes containerized PostgreSQL, API service, Refinement Service, and hot reload capabilities for efficient development.

## Success Criteria

- [ ] Docker Compose configuration for local development
- [ ] PostgreSQL container with proper health checks
- [ ] API container with hot reload support
- [ ] Refinement Service container configuration
- [ ] Development Dockerfile with multi-stage build
- [ ] Environment variable management for development
- [ ] Volume mounting for source code hot reload
- [ ] Developer can start entire stack with `pnpm dev`

---

## Tasks

### Task 1: Create Development Docker Compose Configuration

**Description**: Set up docker-compose.yml for orchestrating all services in development.

**Implementation Plan**:

1. Create `docker/docker-compose.yml`:
   ```yaml
   version: '3.8'
   services:
     db:
       image: postgres:15-alpine
       container_name: polyladder-db-dev
       environment:
         POSTGRES_DB: polyladder
         POSTGRES_USER: dev
         POSTGRES_PASSWORD: dev
       ports:
         - "5432:5432"
       volumes:
         - postgres_data:/var/lib/postgresql/data
       healthcheck:
         test: ["CMD-SHELL", "pg_isready -U dev"]
         interval: 5s
         timeout: 5s
         retries: 5
       networks:
         - polyladder-network

     api:
       build:
         context: ..
         dockerfile: docker/Dockerfile.dev
         target: development
       container_name: polyladder-api-dev
       volumes:
         # Mount source for hot reload
         - ../packages/api/src:/app/packages/api/src
         - ../packages/core/src:/app/packages/core/src
         - ../packages/db/src:/app/packages/db/src
       environment:
         DATABASE_URL: postgres://dev:dev@db:5432/polyladder
         JWT_SECRET: dev-secret-change-in-production
         NODE_ENV: development
         LOG_LEVEL: debug
       ports:
         - "3000:3000"
         - "9229:9229"  # Node.js debugger
       command: pnpm --filter @polyladder/api dev
       depends_on:
         db:
           condition: service_healthy
       networks:
         - polyladder-network

     refinement:
       build:
         context: ..
         dockerfile: docker/Dockerfile.dev
         target: development
       container_name: polyladder-refinement-dev
       volumes:
         - ../packages/refinement-service/src:/app/packages/refinement-service/src
         - ../packages/core/src:/app/packages/core/src
         - ../packages/db/src:/app/packages/db/src
       environment:
         DATABASE_URL: postgres://dev:dev@db:5432/polyladder
         NODE_ENV: development
         LOG_LEVEL: debug
       command: pnpm --filter @polyladder/refinement-service dev
       depends_on:
         db:
           condition: service_healthy
       networks:
         - polyladder-network

   volumes:
     postgres_data:

   networks:
     polyladder-network:
       driver: bridge
   ```

2. Update root `package.json` with dev script:
   ```json
   {
     "scripts": {
       "dev": "docker-compose -f docker/docker-compose.yml up",
       "dev:build": "docker-compose -f docker/docker-compose.yml up --build",
       "dev:down": "docker-compose -f docker/docker-compose.yml down",
       "dev:clean": "docker-compose -f docker/docker-compose.yml down -v"
     }
   }
   ```

**Files Created**:
- `docker/docker-compose.yml`

---

### Task 2: Create Development Dockerfile

**Description**: Create multi-stage Dockerfile for development with hot reload support.

**Implementation Plan**:

1. Create `docker/Dockerfile.dev`:
   ```dockerfile
   FROM node:20-alpine AS base

   # Install pnpm
   RUN corepack enable pnpm

   WORKDIR /app

   # Copy package files
   COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
   COPY packages/*/package.json ./packages/

   # Development stage
   FROM base AS development

   # Install all dependencies (including dev dependencies)
   RUN pnpm install --frozen-lockfile

   # Copy source code (volumes will override these in docker-compose)
   COPY packages/ ./packages/
   COPY tsconfig.json ./

   # Expose ports
   EXPOSE 3000 9229

   # Default command (overridden in docker-compose)
   CMD ["pnpm", "dev"]
   ```

2. Create `.dockerignore`:
   ```
   node_modules
   dist
   build
   .git
   .github
   .vscode
   .idea
   *.log
   .env
   .env.local
   coverage
   README.md
   docs
   ```

**Files Created**:
- `docker/Dockerfile.dev`
- `.dockerignore`

---

### Task 3: Configure Hot Reload for Backend Services

**Description**: Set up nodemon for automatic restart on code changes.

**Implementation Plan**:

1. Install nodemon in API package:
   ```bash
   pnpm --filter @polyladder/api add -D nodemon ts-node
   ```

2. Create `packages/api/nodemon.json`:
   ```json
   {
     "watch": ["src", "../core/src", "../db/src"],
     "ext": "ts,json",
     "ignore": ["src/**/*.test.ts"],
     "exec": "node --inspect=0.0.0.0:9229 --require ts-node/register src/index.ts",
     "env": {
       "NODE_ENV": "development"
     }
   }
   ```

3. Add dev script to `packages/api/package.json`:
   ```json
   {
     "scripts": {
       "dev": "nodemon",
       "build": "tsc",
       "start": "node dist/index.js"
     }
   }
   ```

4. Install nodemon in Refinement Service:
   ```bash
   pnpm --filter @polyladder/refinement-service add -D nodemon ts-node
   ```

5. Create `packages/refinement-service/nodemon.json`:
   ```json
   {
     "watch": ["src", "../core/src", "../db/src"],
     "ext": "ts,json",
     "ignore": ["src/**/*.test.ts"],
     "exec": "node --require ts-node/register src/main.ts",
     "env": {
       "NODE_ENV": "development"
     }
   }
   ```

6. Add dev script to `packages/refinement-service/package.json`:
   ```json
   {
     "scripts": {
       "dev": "nodemon",
       "build": "tsc",
       "start": "node dist/main.js"
     }
   }
   ```

**Files Created**:
- `packages/api/nodemon.json`
- `packages/refinement-service/nodemon.json`

---

### Task 4: Set Up Environment Variable Management

**Description**: Create environment variable configuration for development and provide templates.

**Implementation Plan**:

1. Create `.env.example` at root:
   ```env
   # Database
   DATABASE_URL=postgres://dev:dev@localhost:5432/polyladder

   # Authentication
   JWT_SECRET=dev-secret-change-in-production

   # Environment
   NODE_ENV=development
   LOG_LEVEL=debug

   # API
   PORT=3000
   API_URL=http://localhost:3000

   # Frontend
   VITE_API_URL=http://localhost:3000/api/v1
   ```

2. Create `docker/.env.development`:
   ```env
   DATABASE_URL=postgres://dev:dev@db:5432/polyladder
   JWT_SECRET=dev-secret-change-in-production
   NODE_ENV=development
   LOG_LEVEL=debug
   PORT=3000
   ```

3. Update `.gitignore` to exclude environment files:
   ```
   .env
   .env.local
   .env.*.local
   ```

4. Document environment variables in root `README.md`:
   ```markdown
   ## Environment Variables

   Copy `.env.example` to `.env` and configure for your environment.

   For Docker development, environment variables are managed in `docker-compose.yml`.
   ```

**Files Created**:
- `.env.example`
- `docker/.env.development`

---

### Task 5: Configure Database Initialization

**Description**: Set up scripts for database initialization and seeding in development.

**Implementation Plan**:

1. Create `packages/db/src/init-dev-db.ts`:
   ```typescript
   import { Client } from 'pg';

   async function initDevDatabase() {
     const client = new Client({
       connectionString: process.env.DATABASE_URL,
     });

     try {
       await client.connect();
       console.log('Connected to database');

       // Database will be initialized by migrations
       console.log('Database ready for migrations');

     } catch (error) {
       console.error('Failed to initialize database:', error);
       process.exit(1);
     } finally {
       await client.end();
     }
   }

   initDevDatabase();
   ```

2. Add database initialization script to `packages/db/package.json`:
   ```json
   {
     "scripts": {
       "init": "ts-node src/init-dev-db.ts",
       "migrate:up": "node-pg-migrate up",
       "migrate:down": "node-pg-migrate down",
       "seed": "ts-node src/seeds/dev-data.ts"
     }
   }
   ```

3. Create wait-for-db script `docker/wait-for-db.sh`:
   ```bash
   #!/bin/sh
   # wait-for-db.sh - Wait for PostgreSQL to be ready

   set -e

   host="$1"
   shift

   until PGPASSWORD=$POSTGRES_PASSWORD psql -h "$host" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\q'; do
     >&2 echo "Postgres is unavailable - sleeping"
     sleep 1
   done

   >&2 echo "Postgres is up - executing command"
   exec "$@"
   ```

4. Make script executable:
   ```bash
   chmod +x docker/wait-for-db.sh
   ```

**Files Created**:
- `packages/db/src/init-dev-db.ts`
- `docker/wait-for-db.sh`

---

### Task 6: Create Helper Scripts for Development

**Description**: Create convenient scripts for common development tasks.

**Implementation Plan**:

1. Create `scripts/dev-reset.sh` (reset development environment):
   ```bash
   #!/bin/bash
   # Reset development environment

   echo "Stopping containers..."
   pnpm dev:down

   echo "Removing volumes..."
   docker volume rm polyladder_postgres_data 2>/dev/null || true

   echo "Rebuilding containers..."
   pnpm dev:build

   echo "Development environment reset complete!"
   ```

2. Create `scripts/dev-logs.sh` (view logs):
   ```bash
   #!/bin/bash
   # View development logs

   SERVICE=${1:-""}

   if [ -z "$SERVICE" ]; then
     docker-compose -f docker/docker-compose.yml logs -f
   else
     docker-compose -f docker/docker-compose.yml logs -f "$SERVICE"
   fi
   ```

3. Create `scripts/dev-shell.sh` (access container shell):
   ```bash
   #!/bin/bash
   # Access container shell

   SERVICE=${1:-"api"}

   docker-compose -f docker/docker-compose.yml exec "$SERVICE" sh
   ```

4. Create `scripts/dev-db-shell.sh` (access PostgreSQL):
   ```bash
   #!/bin/bash
   # Access PostgreSQL shell

   docker-compose -f docker/docker-compose.yml exec db psql -U dev polyladder
   ```

5. Make all scripts executable:
   ```bash
   chmod +x scripts/*.sh
   ```

6. Add convenience scripts to root `package.json`:
   ```json
   {
     "scripts": {
       "dev:reset": "bash scripts/dev-reset.sh",
       "dev:logs": "bash scripts/dev-logs.sh",
       "dev:shell": "bash scripts/dev-shell.sh",
       "dev:db": "bash scripts/dev-db-shell.sh"
     }
   }
   ```

**Files Created**:
- `scripts/dev-reset.sh`
- `scripts/dev-logs.sh`
- `scripts/dev-shell.sh`
- `scripts/dev-db-shell.sh`

---

### Task 7: Configure VSCode/Cursor Debugger Integration

**Description**: Set up debugger configuration for attaching to Dockerized Node.js processes.

**Implementation Plan**:

1. Create `.vscode/launch.json`:
   ```json
   {
     "version": "0.2.0",
     "configurations": [
       {
         "name": "Attach to API (Docker)",
         "type": "node",
         "request": "attach",
         "port": 9229,
         "address": "localhost",
         "localRoot": "${workspaceFolder}/packages/api",
         "remoteRoot": "/app/packages/api",
         "restart": true,
         "sourceMaps": true,
         "skipFiles": ["<node_internals>/**"],
         "outFiles": ["${workspaceFolder}/packages/api/src/**/*.ts"]
       },
       {
         "name": "Debug Frontend (Chrome)",
         "type": "chrome",
         "request": "launch",
         "url": "http://localhost:5173",
         "webRoot": "${workspaceFolder}/packages/web/src",
         "sourceMapPathOverrides": {
           "webpack:///./src/*": "${webRoot}/*"
         }
       }
     ]
   }
   ```

2. Create `.vscode/settings.json`:
   ```json
   {
     "typescript.tsdk": "node_modules/typescript/lib",
     "typescript.enablePromptUseWorkspaceTsdk": true,
     "editor.formatOnSave": true,
     "editor.defaultFormatter": "esbenp.prettier-vscode",
     "editor.codeActionsOnSave": {
       "source.fixAll.eslint": true
     }
   }
   ```

3. Add `.vscode/` to `.gitignore` but create `.vscode.example/` with templates:
   ```bash
   mkdir -p .vscode.example
   cp .vscode/launch.json .vscode.example/
   cp .vscode/settings.json .vscode.example/
   ```

**Files Created**:
- `.vscode/launch.json`
- `.vscode/settings.json`
- `.vscode.example/` (templates)

---

### Task 8: Document Development Workflow

**Description**: Create comprehensive documentation for local development.

**Implementation Plan**:

1. Create `docs/DEVELOPMENT.md`:
   ```markdown
   # Development Guide

   ## Quick Start

   ### Start Development Environment

   \`\`\`bash
   # Start all services (PostgreSQL, API, Refinement Service)
   pnpm dev

   # In another terminal, start frontend
   pnpm --filter @polyladder/web dev
   \`\`\`

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

   \`\`\`bash
   # All services
   pnpm dev:logs

   # Specific service
   pnpm dev:logs api
   pnpm dev:logs refinement
   pnpm dev:logs db
   \`\`\`

   ### Access Database

   \`\`\`bash
   # PostgreSQL shell
   pnpm dev:db

   # Or use GUI tools (TablePlus, DBeaver, etc.)
   # Connection: localhost:5432, user: dev, password: dev, database: polyladder
   \`\`\`

   ### Reset Environment

   \`\`\`bash
   # Stop containers and remove all data
   pnpm dev:reset
   \`\`\`

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

   \`\`\`bash
   # Find process using port 5432
   lsof -i :5432  # macOS/Linux
   netstat -ano | findstr :5432  # Windows

   # Or change port in docker-compose.yml
   \`\`\`

   ### Database Connection Failed

   \`\`\`bash
   # Check database is running
   docker ps | grep polyladder-db-dev

   # Check logs
   pnpm dev:logs db

   # Restart database
   docker-compose -f docker/docker-compose.yml restart db
   \`\`\`

   ### Hot Reload Not Working

   \`\`\`bash
   # Rebuild containers
   pnpm dev:build

   # Or restart specific service
   docker-compose -f docker/docker-compose.yml restart api
   \`\`\`
   ```

2. Update root `README.md` to reference development guide:
   ```markdown
   ## Development

   See [DEVELOPMENT.md](./docs/DEVELOPMENT.md) for detailed development workflow.
   ```

**Files Created**:
- `docs/DEVELOPMENT.md`

---

### Task 9: Verify Docker Environment

**Description**: Test that the complete Docker development environment works correctly.

**Implementation Plan**:

1. Build containers:
   ```bash
   pnpm dev:build
   ```
   Expected: All containers build without errors

2. Start services:
   ```bash
   pnpm dev
   ```
   Expected: PostgreSQL, API, Refinement Service all start

3. Check health:
   ```bash
   # PostgreSQL health
   docker-compose -f docker/docker-compose.yml exec db pg_isready -U dev

   # API health (once F018 API Infrastructure is implemented)
   curl http://localhost:3000/health
   ```

4. Test hot reload:
   ```bash
   # Edit a file in packages/api/src/
   # Watch logs for automatic restart
   pnpm dev:logs api
   ```

5. Test debugger attachment:
   - Set breakpoint in `packages/api/src/index.ts`
   - Press F5 in VSCode
   - Verify debugger attaches and pauses at breakpoint

6. Clean up:
   ```bash
   pnpm dev:down
   ```

**Validation**:
- ✅ Containers build successfully
- ✅ All services start and remain healthy
- ✅ Hot reload works for backend services
- ✅ Debugger can attach to API service
- ✅ PostgreSQL accessible from host
- ✅ Services can communicate with each other

---

## Dependencies

- **Blocks**: F004, F014, F018 (authentication, refinement service, API infrastructure)
- **Depends on**: F000 (project setup), F001 (database schema - for migrations)

---

## Notes

- Docker Compose is for development only; production uses different configuration (see F057)
- Volume mounting enables hot reload but requires source files on host
- PostgreSQL data persists in named volume even when containers stop
- Inspector port 9229 must be exposed for debugging
- Frontend runs on host (not in Docker) for better Vite HMR performance
- Consider Docker Desktop alternatives (Podman, Rancher Desktop) if licensing is a concern
