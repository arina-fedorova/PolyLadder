# PolyLadder System Architecture

Document type: System Architecture Specification
Status: Authoritative
Date: 2025-12-17
Language: English

================================================================

## 1. Architecture Overview

PolyLadder is a cloud-hosted web application with clean separation of concerns. The system runs on a server, and users access it through web browsers. The architecture is designed to be **portable** - it can be easily migrated from one hosting provider to another without fundamental changes.

### 1.1 Core Principles

**Cloud-First**: The application runs on a server. All data and computation happen centrally. Users access via web browsers.

**Portable by Design**: Use standard technologies and avoid vendor lock-in. The application runs in Docker containers and can be deployed anywhere that supports containers and PostgreSQL.

**Clean Architecture**: Each component has a single responsibility. Dependencies point inward toward the domain core. External concerns (UI, database, authentication) are isolated.

**API-First**: Frontend and backend communicate through explicit REST APIs. Clear contracts between layers.

**Shared Knowledge, Private Progress**: The linguistic knowledge base is shared among all users. User progress and learning state are private and isolated per account.

**Immutability at Core**: Approved data is write-once. The system architecture enforces this at multiple levels.

================================================================

## 2. Technology Stack

### 2.1 Core Technologies

**TypeScript 5.x** - Primary language for all components. Type safety, excellent IDE support, AI-friendly.

**Node.js 20.x LTS** - Runtime for backend services. Modern features, long-term support.

**PostgreSQL 15.x** - Relational database. ACID transactions, multi-user support, standard SQL, portable across all cloud providers.

**Docker** - Containerization. Ensures consistent deployment across environments. Critical for portability.

**pnpm** - Package manager. Fast, disk-efficient, strict dependency resolution.

### 2.2 API Layer

**Fastify 4.x** - Web framework for REST APIs. Fast, excellent TypeScript support, schema-based validation.

**Zod** - Runtime schema validation. Type-safe, composable, integrates with TypeScript.

**JWT** - JSON Web Tokens for stateless authentication. Standard, portable, no server-side session storage needed.

### 2.3 UI Layer

**React 18.x** - UI framework. AI-friendly, massive ecosystem, excellent for SPAs.

**Vite** - Build tool. Fast dev server, optimized production builds.

**TanStack Query (React Query)** - Data fetching and caching. Eliminates boilerplate, handles loading/error states.

**Tailwind CSS** - Utility-first CSS. Fast to write, easy for AI to generate, consistent design.

**React Router** - Client-side routing.

### 2.4 Authentication & Sessions

**Passport.js** - Authentication middleware. Supports multiple strategies, well-tested.

**bcrypt** - Password hashing. Industry standard, secure.

**jsonwebtoken** - JWT creation and verification.

### 2.5 Testing

**Vitest** - Unit and integration tests. Fast, Vite-native, Jest-compatible API.

**Playwright** - End-to-end tests for UI flows.

### 2.6 Deployment

**Fly.io** - Initial hosting platform. Chosen for cost-effectiveness and simplicity.

**Docker Compose** - Local development environment that mirrors production.

**nginx** - Reverse proxy and static file serving (in production).

### 2.7 Deferred Decisions

**Audio library** - Not selected yet. Decision deferred until audio features are implemented.

**Audio storage** - Fly Volumes vs S3-compatible storage. Decided when audio features are implemented.

================================================================

## 3. System Components

The system consists of five components running in the cloud.

### 3.1 Component Map

```
┌─────────────────────────────────────────────────────────────┐
│                       Fly.io (Cloud)                         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   Nginx (Reverse Proxy)              │  │
│  │  - Static files (React SPA)                          │  │
│  │  - Reverse proxy to API                              │  │
│  └─────────┬────────────────────────────────────────────┘  │
│            │                                                 │
│            ▼                                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            API Service (Fastify)                     │  │
│  │  - REST endpoints                                    │  │
│  │  - Authentication                                    │  │
│  │  - Business logic                                    │  │
│  └─────────┬────────────────────────────────────────────┘  │
│            │                                                 │
│            │ Uses                                            │
│            ▼                                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            Core Library                              │  │
│  │  - Domain Model                                      │  │
│  │  - Lifecycle Engine                                  │  │
│  │  - Validation Logic                                  │  │
│  └─────────┬────────────────────────────────────────────┘  │
│            │                                                 │
│            │ Queries                                         │
│            ▼                                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            Database Layer                            │  │
│  │  - Schema                                            │  │
│  │  - Migrations                                        │  │
│  │  - Query Builders                                    │  │
│  └─────────┬────────────────────────────────────────────┘  │
│            │                                                 │
│            ▼                                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         PostgreSQL Database                          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Refinement Service                           │  │
│  │  (Separate Process)                                  │  │
│  │  - Work Planner                                      │  │
│  │  - Data Generators                                   │  │
│  │  - Promotion Pipeline                                │  │
│  └─────────┬────────────────────────────────────────────┘  │
│            │                                                 │
│            │ Direct DB Access                                │
│            ▼                                                 │
│       PostgreSQL                                             │
└─────────────────────────────────────────────────────────────┘

       Users access via browsers (HTTPS)
                    ▼
              Nginx (port 443)
```

### 3.2 Component Descriptions

#### 3.2.1 Core Library (`@polyladder/core`)

**Purpose**: Contains all domain logic and business rules. Framework-agnostic.

**Responsibilities**:

- Domain model definitions (User, Meaning, Utterance, Exercise, etc.)
- Lifecycle state machine (DRAFT→CANDIDATE→VALIDATED→APPROVED)
- Immutability enforcement logic
- Quality gates implementation
- Validation rules
- Curriculum graph algorithms

**Technology**: Pure TypeScript. No framework dependencies. Fully testable in isolation.

**API**: Exported functions and classes. No HTTP. Used by other packages as library.

#### 3.2.2 Database Layer (`@polyladder/db`)

**Purpose**: Abstracts all database access. Provides type-safe query builders and migrations.

**Responsibilities**:

- PostgreSQL schema definition
- Migration scripts (using node-pg-migrate)
- Query builders for all tables
- Transaction management
- Connection pooling

**Technology**: TypeScript + pg (node-postgres driver).

**API**: Exported functions for CRUD operations. No business logic here.

**Schema categories**:

- **User tables**: `users`, `sessions`
- **Approved knowledge base** (shared): `approved_meanings`, `approved_utterances`, `approved_rules`, `approved_exercises`, `curriculum_graph`
- **Pipeline tables**: `drafts`, `candidates`, `validated`, `validation_failures`, `approval_events`, `service_state`
- **User progress** (private): `user_progress`, `user_vocabulary`, `user_srs_schedule`, `user_preferences`, `user_statistics`

All user-specific tables include `user_id` foreign key referencing `users.id`.

#### 3.2.3 API Service (`@polyladder/api`)

**Purpose**: REST API for authentication, data access, and learning functionality.

**Responsibilities**:

- User registration and authentication
- Session management (JWT)
- Expose data health metrics
- CRUD operations for candidates/validated items
- Approval/rejection operations
- Query approved corpus
- Serve learning content (vocabulary, grammar, exercises)
- Track learner progress (per user)
- Schedule SRS reviews

**Technology**: Fastify + Zod + Passport.js. Uses `@polyladder/core` for logic, `@polyladder/db` for data access.

**API Design**:

- RESTful endpoints
- JSON request/response
- Versioned (`/api/v1/...`)
- Clear separation: `/api/v1/auth/...`, `/api/v1/operational/...`, `/api/v1/learning/...`
- JWT authentication required for all endpoints except `/auth/register` and `/auth/login`

**Key endpoints**:

- `POST /api/v1/auth/register` - Create user account
- `POST /api/v1/auth/login` - Login, returns JWT
- `GET /api/v1/auth/me` - Get current user info
- `GET /api/v1/operational/health` - Pipeline health (operator only)
- `GET /api/v1/operational/candidates` - Browse candidates (operator only)
- `POST /api/v1/operational/approve/:id` - Approve item (operator only)
- `GET /api/v1/learning/curriculum` - Get curriculum for user
- `POST /api/v1/learning/progress` - Record progress
- `GET /api/v1/learning/vocabulary` - Get user vocabulary state

**Authorization**:

- Regular users can only access `/auth` and `/learning` endpoints
- Operator role required for `/operational` endpoints
- Role stored in `users.role` field (enum: 'learner', 'operator')

#### 3.2.4 Refinement Service (`@polyladder/refinement-service`)

**Purpose**: Background process that processes documents into structured learning content.

**Responsibilities**:

- Document processing (PDF extraction, chunking)
- Semantic Split (LLM #1): categorize chunks into drafts
- Content Transformation (LLM #2): convert approved candidates into lessons
- Pipeline orchestration and state tracking
- Error handling and retry logic

**Technology**: TypeScript/Node.js standalone process. No HTTP server. Direct database access.

**Pipeline Flow**:

```
PDF → Chunk → Semantic Split (LLM#1) → DRAFTS
                                         ↓
                              [Operator Review via UI]
                                         ↓
DRAFTS (approved) → CANDIDATES → Transform (LLM#2) → VALIDATED
                                                        ↓
                                           [Operator Review via UI]
                                                        ↓
                                              APPROVED (immutable)
```

**Lifecycle**:

1. Start → Load state from database
2. Loop:
   - Find pending documents → process (extract, chunk)
   - Find ready chunks → semantic split (LLM #1)
   - Find approved candidates → transform (LLM #2)
   - Save checkpoint
   - Sleep or yield
3. On shutdown → Save state, graceful exit

**Interaction with other components**: None directly. Writes to database. API and Operational UI observe results and manage approvals.

#### 3.2.5 Frontend Application (`@polyladder/web`)

**Purpose**: Single-page application for both learners and operators.

**Responsibilities**:

- User registration and login
- Learning interface (curriculum, exercises, progress)
- Operational dashboard (data health, approval workflow)
- Account settings

**Technology**: React + Vite + TanStack Query + Tailwind CSS + React Router.

**Routes**:

- `/` - Landing page
- `/register` - User registration
- `/login` - Login
- `/home` - Dashboard (learner or operator, role-based)
- `/setup` - Initial language selection (first-time users)
- `/orthography/:lang` - Orthography learning
- `/vocabulary` - Vocabulary practice
- `/grammar` - Grammar lessons
- `/practice` - Mixed practice modes
- `/progress` - Statistics and tracking
- `/operator/dashboard` - Operator dashboard (role-restricted)
- `/operator/documents` - Document library (role-restricted)
- `/operator/pipelines` - Pipeline management (role-restricted)
- `/operator/drafts` - Draft review queue (role-restricted)
- `/operator/review-queue` - Validated items review (role-restricted)
- `/operator/curriculum` - Curriculum management (role-restricted)

**Authentication flow**:

1. User submits login form
2. Frontend calls `POST /api/v1/auth/login`
3. Backend returns JWT
4. Frontend stores JWT in localStorage
5. All subsequent API calls include JWT in `Authorization: Bearer <token>` header
6. Frontend checks JWT expiration, redirects to login if expired

**Communication**: HTTP calls to API Service. No direct database access.

#### 3.2.6 Nginx (Reverse Proxy)

**Purpose**: Entry point for all HTTP traffic. Serves static files and proxies API requests.

**Configuration**:

```nginx
server {
  listen 443 ssl;

  # Serve static files (React SPA)
  location / {
    root /app/web/dist;
    try_files $uri /index.html;
  }

  # Proxy API requests
  location /api/ {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```

**Why nginx?**

- Efficient static file serving
- SSL termination
- Compression
- Security headers
- Standard tool, works everywhere

================================================================

## 4. User Account System

### 4.1 User Model

**User** contains:

- `id` (UUID, primary key)
- `email` (unique, required)
- `password_hash` (bcrypt, required)
- `role` (enum: 'learner', 'operator')
- `base_language` (chosen during registration)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### 4.2 Registration Flow

1. User fills registration form (email, password, base language)
2. Frontend calls `POST /api/v1/auth/register`
3. Backend validates input (email unique, password strong enough)
4. Backend hashes password with bcrypt
5. Backend creates user record
6. Backend returns JWT
7. Frontend stores JWT, redirects to `/setup` (language selection)

### 4.3 Login Flow

1. User fills login form (email, password)
2. Frontend calls `POST /api/v1/auth/login`
3. Backend finds user by email
4. Backend verifies password with bcrypt
5. Backend generates JWT (includes `user_id`, `role`, expires in 7 days)
6. Backend returns JWT
7. Frontend stores JWT, redirects to `/home`

### 4.4 Authentication Middleware

All API endpoints except `/auth/register` and `/auth/login` require valid JWT.

```typescript
// Fastify hook
fastify.addHook('onRequest', async (request, reply) => {
  if (request.url.startsWith('/api/v1/auth/')) {
    return; // Skip auth for auth endpoints
  }

  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    request.user = decoded; // Attach user to request
  } catch (err) {
    return reply.status(401).send({ error: 'Invalid token' });
  }
});
```

### 4.5 Authorization (Role-Based)

Operator endpoints (`/api/v1/operational/*`) check `request.user.role === 'operator'`.

```typescript
// Fastify hook for operator routes
fastify.addHook('onRequest', async (request, reply) => {
  if (request.user.role !== 'operator') {
    return reply.status(403).send({ error: 'Forbidden' });
  }
});
```

================================================================

## 5. Data Ownership Model

### 5.1 Shared Knowledge Base

The linguistic knowledge base is **shared among all users**. This includes:

- Approved meanings
- Approved utterances
- Approved grammar rules
- Approved exercises
- Curriculum graph
- Orthography and phonetics data

**Why shared?**

- No reason to duplicate the same data per user
- Content Refinement Service grows the base for everyone
- Reduces database size
- Ensures consistency (all users learn from the same high-quality data)

**Access**: Read-only for learners. Writable only by Refinement Service and operators (via approval workflow).

### 5.2 User-Specific Data

Each user has **private data** tied to their account:

- Learning progress (which units completed, current position)
- Vocabulary state (Unknown/Learning/Known per word per language)
- SRS schedules (when each item is due for review)
- Exercise history (attempts, scores)
- Preferences (studied languages, focus mode settings)
- Statistics (time spent, exercises completed, streaks)

**Isolation**: Each user sees only their own data. Queries filter by `user_id`.

**Example**:

```sql
-- Shared data (no user_id)
SELECT * FROM approved_meanings WHERE level = 'A1';

-- User data (filtered by user_id)
SELECT * FROM user_vocabulary WHERE user_id = $1 AND language = 'IT';
```

================================================================

## 6. Data Flow & Interactions

### 6.1 Data Creation Flow (Refinement Service → Database)

```
1. Refinement Service determines work needed
2. Generates DRAFT data (via LLM, parser, rules)
3. Writes DRAFT to database
4. Normalizes DRAFT → CANDIDATE
5. Runs quality gates on CANDIDATE
6. If all gates pass → VALIDATED
7. If auto-approval enabled → APPROVED
8. Records all state changes, failures
```

### 6.2 Data Approval Flow (Operator → Database)

```
1. Operator opens Operational UI in browser
2. UI fetches VALIDATED items via API (JWT in header)
3. Operator reviews item
4. Operator clicks "Approve"
5. Frontend calls POST /api/v1/operational/approve/:id
6. API validates JWT, checks role === 'operator'
7. API calls core.approveItem()
8. Core validates immutability rules
9. Database inserts into approved_* tables
10. Approval event recorded
11. API returns success
12. UI updates, item removed from validation queue
```

### 6.3 Learning Flow (Learner → Database)

```
1. Learner opens browser, logs in
2. Frontend receives JWT, stores it
3. User navigates to /home
4. Frontend calls GET /api/v1/learning/curriculum (JWT in header)
5. API validates JWT, extracts user_id
6. API queries approved_* tables (shared data)
7. API queries user_progress (filtered by user_id)
8. API returns personalized curriculum
9. Learner interacts, submits answers
10. Frontend calls POST /api/v1/learning/progress (JWT + data)
11. API records user state (vocabulary status, SRS schedule)
12. Next session reflects updated state
```

### 6.4 Communication Protocols

**Frontend ↔ API**

- Protocol: HTTP REST
- Format: JSON
- Authentication: JWT in `Authorization: Bearer <token>` header
- CORS: Enabled (API and frontend on same domain in production)

**Refinement Service ↔ Database**

- Protocol: Direct PostgreSQL connection
- No API layer (service is trusted, has full database access)

**Core Library ↔ Database Layer**

- Protocol: Function calls (in-process)
- Transactions managed by database layer

### 6.5 Error Handling Strategy

**At API Level**:

- All errors return structured JSON: `{ error: string, code: string, details?: any }`
- HTTP status codes match error type (400 client, 401 unauthorized, 403 forbidden, 500 server)
- Validation errors include field-level details

**At Service Level**:

- Service logs all errors
- Non-fatal errors recorded but don't stop service
- Fatal errors saved to database, service exits gracefully
- Restart resumes from last checkpoint

**At UI Level**:

- TanStack Query handles network errors automatically
- User-friendly error messages
- Retry mechanisms for transient failures
- Redirect to /login on 401 errors

================================================================

## 7. Project Structure

### 7.1 Monorepo Layout

```
polyladder/
├── packages/
│   ├── core/                    # @polyladder/core
│   │   ├── src/
│   │   │   ├── domain/          # Domain entities
│   │   │   ├── lifecycle/       # State machine
│   │   │   ├── validation/      # Quality gates
│   │   │   ├── curriculum/      # Graph algorithms
│   │   │   └── index.ts
│   │   ├── tests/
│   │   └── package.json
│   │
│   ├── db/                      # @polyladder/db
│   │   ├── src/
│   │   │   ├── schema/          # Table definitions
│   │   │   ├── migrations/      # Migration scripts
│   │   │   ├── queries/         # Query builders
│   │   │   └── index.ts
│   │   ├── tests/
│   │   └── package.json
│   │
│   ├── refinement-service/      # @polyladder/refinement-service
│   │   ├── src/
│   │   │   ├── planner/         # Work planning
│   │   │   ├── generators/      # Data generation
│   │   │   ├── pipeline/        # Lifecycle pipeline
│   │   │   ├── main.ts          # Entry point
│   │   │   └── index.ts
│   │   ├── tests/
│   │   └── package.json
│   │
│   ├── api/                     # @polyladder/api
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts      # Authentication
│   │   │   │   ├── operational/ # Operator endpoints
│   │   │   │   └── learning/    # Learner endpoints
│   │   │   ├── middleware/      # Auth, CORS, etc.
│   │   │   ├── schemas/         # Zod schemas
│   │   │   ├── server.ts        # Fastify setup
│   │   │   └── index.ts
│   │   ├── tests/
│   │   └── package.json
│   │
│   └── web/                     # @polyladder/web
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── hooks/
│       │   ├── api/             # API client
│       │   ├── auth/            # Auth context & hooks
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── public/
│       ├── index.html
│       └── package.json
│
├── docker/                      # Docker configs
│   ├── Dockerfile.api           # API + Refinement Service
│   ├── Dockerfile.web           # Nginx + static files
│   └── docker-compose.yml       # Local development
│
├── docs/                        # Documentation
│   ├── TECHNICAL_SPECIFICATION.md
│   ├── ARCHITECTURE.md
│   └── features/                # Feature specifications
│
├── .cursorrules                 # Cursor AI rules
├── fly.toml                     # Fly.io config
├── pnpm-workspace.yaml          # Monorepo config
├── package.json                 # Root package
├── tsconfig.json                # Base TypeScript config
└── README.md
```

### 7.2 Shared Configuration

**TypeScript**: Base `tsconfig.json` at root, extended by each package.

**ESLint/Prettier**: Shared config at root, applied to all packages.

**Testing**: Vitest config at root, overridable per package.

**Build**: Each package has its own build script.

================================================================

## 8. Deployment Model

### 8.1 Development Mode

**Local environment using Docker Compose**:

```bash
pnpm dev
```

This starts:

- PostgreSQL (port 5432)
- API server (port 3000)
- Refinement service (background)
- Web dev server (port 5173)

Developer opens `localhost:5173` in browser.

**docker-compose.yml**:

```yaml
version: '3.8'
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: polyladder
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    ports:
      - '5432:5432'

  api:
    build:
      context: .
      dockerfile: docker/Dockerfile.api
    environment:
      DATABASE_URL: postgres://dev:dev@db:5432/polyladder
      JWT_SECRET: dev-secret
    ports:
      - '3000:3000'
    depends_on:
      - db

  refinement:
    build:
      context: .
      dockerfile: docker/Dockerfile.api
    command: node packages/refinement-service/dist/main.js
    environment:
      DATABASE_URL: postgres://dev:dev@db:5432/polyladder
    depends_on:
      - db
```

### 8.2 Production Deployment (Fly.io)

**Build**:

```bash
pnpm build
```

This:

1. Compiles all TypeScript to JavaScript
2. Bundles React app (Vite)
3. Creates Docker images

**Deploy to Fly.io**:

```bash
fly deploy
```

**Fly.io configuration** (`fly.toml`):

```toml
app = "polyladder"
primary_region = "ams"  # Amsterdam (cheap, EU)

[build]
  dockerfile = "docker/Dockerfile.prod"

[env]
  PORT = "8080"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0  # Scale to zero when idle

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256

[[services]]
  processes = ["app"]
  protocol = "tcp"
  internal_port = 8080

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
```

**PostgreSQL on Fly.io**:

```bash
fly postgres create --name polyladder-db --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 1
fly postgres attach polyladder-db
```

**Processes**:

- API service (main process)
- Refinement service (background process via supervisor)
- Nginx (static files + reverse proxy)

**Dockerfile.prod**:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN corepack enable pnpm
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM nginx:alpine AS runtime
# Copy nginx config
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Copy frontend build
COPY --from=builder /app/packages/web/dist /app/web/dist

# Copy backend
COPY --from=builder /app/packages/api/dist /app/api/dist
COPY --from=builder /app/packages/refinement-service/dist /app/refinement-service/dist
COPY --from=builder /app/node_modules /app/node_modules

# Install supervisor to run multiple processes
RUN apk add --no-cache supervisor nodejs

# Supervisor config
COPY docker/supervisord.conf /etc/supervisord.conf

EXPOSE 8080
CMD ["supervisord", "-c", "/etc/supervisord.conf"]
```

**supervisord.conf**:

```ini
[supervisord]
nodaemon=true

[program:nginx]
command=nginx -g 'daemon off;'
autostart=true
autorestart=true

[program:api]
command=node /app/api/dist/index.js
autostart=true
autorestart=true
environment=PORT=3000

[program:refinement]
command=node /app/refinement-service/dist/main.js
autostart=true
autorestart=true
```

**Environment variables** (set via Fly.io secrets):

```bash
fly secrets set DATABASE_URL=<postgres-connection-string>
fly secrets set JWT_SECRET=<random-secret>
```

### 8.3 Data Storage

**Database**: Fly Postgres (managed)

- Automatic backups
- Connection string injected as `DATABASE_URL`

**Audio files** (future): Fly Volumes

- Persistent storage attached to VM
- Mounted at `/data/audio`

### 8.4 Scaling

**Initial (MVP)**:

- 1 VM (shared-cpu-1x, 256MB)
- Scale to zero when idle (save costs)

**Growth**:

- Increase VM size (more RAM/CPU)
- Add more regions (closer to users)
- Separate Refinement Service to dedicated VM

**Database**:

- Start with shared-cpu-1x (256MB RAM, 1GB storage)
- Scale vertically as data grows

================================================================

## 9. Portability & Migration Strategy

### 9.1 Design for Portability

The architecture is **deliberately portable**. Migration to another provider requires minimal changes.

**Standard technologies used**:

- PostgreSQL (supported everywhere)
- Docker containers (run anywhere)
- Standard HTTP/HTTPS
- No Fly.io-specific features in application code

**What's configurable via environment variables**:

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT signing
- `PORT` - HTTP port
- `NODE_ENV` - production/development

**No vendor lock-in**:

- No Fly.io SDK usage in code
- No proprietary APIs
- Database is standard PostgreSQL (dump/restore works)

### 9.2 Migration to Another Provider

**To migrate from Fly.io to DigitalOcean/Hetzner/Railway/etc:**

1. **Export database**:

   ```bash
   pg_dump $DATABASE_URL > backup.sql
   ```

2. **Create new PostgreSQL instance** on target provider

3. **Import database**:

   ```bash
   psql $NEW_DATABASE_URL < backup.sql
   ```

4. **Build Docker image**:

   ```bash
   docker build -f docker/Dockerfile.prod -t polyladder:latest .
   ```

5. **Push to target provider's registry** (or use Docker Hub)

6. **Deploy** using target provider's CLI/UI

7. **Set environment variables** on new provider

8. **Update DNS** to point to new deployment

**Estimated migration time**: 1-2 hours for simple move.

### 9.3 Multi-Cloud Strategy (Future)

If needed, the app can run on multiple providers simultaneously:

- Load balancer in front
- Shared PostgreSQL (or read replicas)
- Docker images deployed to multiple regions

================================================================

## 10. Open Questions

### 10.1 Audio Library Selection

**Context**: The system requires audio playback for pronunciation examples and recording for dictation/pronunciation practice.

**Requirements**:

- Play audio files (MP3, OGG, or WAV)
- Record from microphone
- Basic waveform visualization (optional, nice to have)
- Works in web browsers

**Candidates** (to be evaluated later):

- Web Audio API (native browser, no library needed)
- Howler.js (playback only, mature)
- RecordRTC (recording, works with Web Audio API)
- Tone.js (advanced, might be overkill)

**Decision deferred until**: F021 (Orthography Learning Module) implementation.

### 10.2 Audio Storage Strategy

**Context**: Audio files for pronunciation need to be stored and served.

**Options**:

1. **Fly Volumes** - persistent storage on Fly.io (~$0.15/GB/month)
2. **S3-compatible storage** - Backblaze B2 ($0.005/GB/month), AWS S3 ($0.023/GB/month)
3. **Supabase Storage** - 1GB free, then $0.021/GB/month

**Decision deferred until**: Audio features are implemented.

**Factors to consider**:

- Cost (S3-compatible likely cheaper at scale)
- Portability (S3 API is standard, works everywhere)
- CDN (faster delivery to users)

### 10.3 LLM Integration Strategy

**Context**: Refinement Service generates content using LLMs.

**Options**:

1. Direct API calls (OpenAI, Anthropic, etc.) - requires API keys, recurring cost
2. Local models (Ollama, llama.cpp) - no API costs, but need GPU/more RAM
3. Hybrid: local for drafts, cloud for refinement

**Decision deferred until**: F012 (Data Source Integration Framework) implementation.

================================================================

## 11. Design Decisions & Rationale

### 11.1 Why Cloud-Hosted Instead of Desktop?

**Decision**: Cloud-hosted web application, not desktop Electron app.

**Rationale**:

- **Shared knowledge base**: No reason to duplicate the same linguistic data on every device. One central database serves all users.
- **Content Refinement Service**: Runs continuously on server, grows knowledge base for everyone. Can't do this reliably on user devices.
- **Easier updates**: Deploy once, all users get updates immediately. No "please update your app" friction.
- **Cross-device access**: Users can learn on desktop, mobile, tablet without syncing.
- **Lower barrier to entry**: No installation required. Just open browser.

**Trade-offs accepted**:

- Requires internet connection (acceptable for language learning)
- Hosting costs (mitigated by cost-effective Fly.io)

### 11.2 Why PostgreSQL Instead of SQLite?

**Decision**: Use PostgreSQL for multi-user cloud deployment.

**Rationale**:

- **Multi-user support**: SQLite is designed for single-user scenarios. PostgreSQL handles concurrent users natively.
- **ACID guarantees**: Robust transactions even under concurrent load.
- **Standard and portable**: Supported by every cloud provider.
- **Scalability**: Can handle growth without fundamental changes.
- **Managed services**: Fly Postgres, DigitalOcean, Supabase all offer managed PostgreSQL with backups.

**Alternative considered**: SQLite (rejected for cloud deployment, but would work for desktop app).

### 11.3 Why Monorepo?

**Decision**: Use pnpm workspaces for monorepo.

**Rationale**:

- Shared TypeScript types across packages
- Atomic commits across related changes
- Simplified dependency management
- Easier refactoring

**Alternative considered**: Multi-repo (rejected due to complexity of coordinating changes).

### 11.4 Why Fastify over Express?

**Decision**: Use Fastify for API.

**Rationale**:

- Better TypeScript support out of the box
- Schema-based validation (aligns with Zod)
- Faster performance
- Modern, actively maintained

**Alternative considered**: Express (rejected due to weaker TypeScript integration).

### 11.5 Why JWT Instead of Sessions?

**Decision**: Use JWT for authentication.

**Rationale**:

- **Stateless**: No server-side session storage needed. Simplifies scaling.
- **Portable**: Token is self-contained. Works with load balancers, multiple servers.
- **Standard**: Industry-standard approach for SPAs.

**Alternative considered**: Server-side sessions with Redis (rejected as over-engineering for MVP).

### 11.6 Why Fly.io for Initial Deployment?

**Decision**: Start with Fly.io.

**Rationale**:

- **Cost-effective**: ~$2-5/month for MVP (scale to zero when idle)
- **Simple deployment**: `fly deploy` and done
- **Good enough**: PostgreSQL, Docker, all basics covered
- **Portable**: Easy to migrate away (Docker + PostgreSQL are standard)

**Alternative considered**: DigitalOcean, Railway, Hetzner (all viable, Fly.io chosen for cost/simplicity balance).

### 11.7 Why Shared Knowledge Base?

**Decision**: Linguistic knowledge base is shared among all users, not duplicated per user.

**Rationale**:

- **Efficiency**: No reason to store "Hello = Ciao = Olá" separately for each user.
- **Consistency**: All users learn from the same high-quality approved data.
- **Lower storage costs**: One copy vs thousands.
- **Easier content updates**: Refinement Service improves knowledge base for everyone.

**User data is still private**: Progress, vocabulary state, SRS schedules are per-user.

### 11.8 Why Docker?

**Decision**: Use Docker for deployment.

**Rationale**:

- **Portability**: Same container runs on Fly.io, DigitalOcean, Hetzner, anywhere.
- **Consistency**: Development environment matches production.
- **Standard**: Industry-standard containerization.

**Alternative considered**: No containers (rejected due to portability concerns).

================================================================

## 12. Security Considerations

### 12.1 Data Privacy

**Threat**: User learning data is personal and sensitive.

**Mitigation**:

- User data is private, isolated by `user_id`.
- HTTPS enforced (SSL termination at nginx/Fly.io edge).
- Passwords hashed with bcrypt (never stored in plaintext).
- JWT secrets stored as environment variables (not in code).

### 12.2 Authentication

**Threat**: Unauthorized access to user accounts.

**Mitigation**:

- Password strength validation (minimum 8 chars, complexity rules).
- JWT expires after 7 days (user must re-login).
- JWT signed with secret (can't be forged).
- All endpoints except `/auth` require valid JWT.

### 12.3 Authorization

**Threat**: Regular users accessing operator endpoints.

**Mitigation**:

- Role-based access control (`users.role` field).
- Middleware checks `role === 'operator'` for `/operational/*` endpoints.
- Unauthorized access returns 403 Forbidden.

### 12.4 Code Injection

**Threat**: LLM-generated content could include malicious code.

**Mitigation**:

- All generated content is treated as data, never executed.
- Content stored as strings in database.
- UI renders as text or sanitized HTML (React escapes by default).

### 12.5 SQL Injection

**Threat**: User input or generated content could manipulate SQL queries.

**Mitigation**:

- Use parameterized queries exclusively.
- Never concatenate strings into SQL.
- pg library supports prepared statements.

### 12.6 Cross-Site Scripting (XSS)

**Threat**: Malicious scripts injected into UI.

**Mitigation**:

- React escapes all dynamic content by default.
- Use `dangerouslySetInnerHTML` only when absolutely necessary (and sanitize input).
- Content Security Policy headers in nginx.

### 12.7 Cross-Site Request Forgery (CSRF)

**Threat**: Attacker tricks user into making unwanted requests.

**Mitigation**:

- JWT in `Authorization` header (not cookies, so CSRF doesn't apply).
- SameSite cookie policy if cookies are used in future.

### 12.8 Denial of Service

**Threat**: Refinement Service or API could consume excessive resources.

**Mitigation**:

- Refinement Service includes rate limiting, backoff, max iteration limits.
- API has request rate limiting (Fastify plugin).
- Fly.io auto-scaling handles traffic spikes.

### 12.9 Database Backups

**Threat**: Data loss from server failure or human error.

**Mitigation**:

- Fly Postgres automatic daily backups (retained for 7 days).
- Manual backup script: `pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql`
- Store backups off-server (S3, Backblaze B2).

================================================================

## 13. Performance Considerations

### 13.1 Database Indexing

**Critical indexes**:

- `users.email` (unique index for login)
- `approved_meanings.id` (primary key)
- `approved_utterances.meaning_id` (foreign key)
- `approved_exercises.type, level` (filtering)
- `user_vocabulary.user_id, word, language, state` (progress queries)
- `user_srs_schedule.user_id, due_date` (review queue)

**Strategy**: Add indexes as needed based on query patterns. Profile slow queries during development.

### 13.2 API Response Caching

**Not needed initially**: Fast PostgreSQL queries, small user base.

**Future consideration**: If response times exceed 100ms, add caching layer (Redis or in-memory).

### 13.3 Frontend Performance

**Strategy**:

- Code splitting (React.lazy for routes)
- Lazy load components
- Optimize images (WebP format)
- Bundle size monitoring
- TanStack Query caching (reduces API calls)

### 13.4 Database Connection Pooling

**Strategy**:

- Use pg connection pool (max 10 connections initially)
- Adjust pool size based on load
- Monitor connection usage

### 13.5 Refinement Service Throughput

**Target**: Process at least 100 items per minute.

**Strategy**:

- Batch database writes (insert multiple rows at once)
- Parallel LLM calls where possible (rate limit aware)
- Efficient validation (fail fast on first gate failure)

### 13.6 CDN for Static Assets

**Current**: Nginx serves static files from same server.

**Future optimization**: Use Cloudflare (free tier) or Fly.io CDN for global distribution.

================================================================

## 14. Local Development & Debugging

### 14.1 Quick Start

**Prerequisites**:

- Docker & Docker Compose installed
- Node.js 20.x LTS installed
- pnpm installed (`corepack enable pnpm`)

**Start development environment**:

```bash
# Clone repository
git clone <repo-url>
cd polyladder

# Install dependencies
pnpm install

# Start all services (PostgreSQL + API + Refinement + Web)
pnpm dev
```

**Access**:

- Frontend: http://localhost:5173
- API: http://localhost:3000
- PostgreSQL: localhost:5432 (user: dev, password: dev, database: polyladder)

### 14.2 Docker Compose Configuration

**docker-compose.yml** (development):

```yaml
version: '3.8'
services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: polyladder
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U dev']
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build:
      context: .
      dockerfile: docker/Dockerfile.dev
      target: development
    volumes:
      # Mount source for hot reload
      - ./packages/api/src:/app/packages/api/src
      - ./packages/core/src:/app/packages/core/src
      - ./packages/db/src:/app/packages/db/src
    environment:
      DATABASE_URL: postgres://dev:dev@db:5432/polyladder
      JWT_SECRET: dev-secret-change-in-production
      NODE_ENV: development
      LOG_LEVEL: debug
    ports:
      - '3000:3000'
      - '9229:9229' # Node.js debugger
    command: pnpm --filter @polyladder/api dev
    depends_on:
      db:
        condition: service_healthy

  refinement:
    build:
      context: .
      dockerfile: docker/Dockerfile.dev
      target: development
    volumes:
      - ./packages/refinement-service/src:/app/packages/refinement-service/src
      - ./packages/core/src:/app/packages/core/src
      - ./packages/db/src:/app/packages/db/src
    environment:
      DATABASE_URL: postgres://dev:dev@db:5432/polyladder
      NODE_ENV: development
      LOG_LEVEL: debug
    command: pnpm --filter @polyladder/refinement-service dev
    depends_on:
      db:
        condition: service_healthy

volumes:
  postgres_data:
```

**Dockerfile.dev**:

```dockerfile
FROM node:20-alpine AS development

WORKDIR /app

# Install pnpm
RUN corepack enable pnpm

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/*/package.json ./packages/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source (volumes will override in docker-compose)
COPY . .

# Expose ports
EXPOSE 3000 9229

# Default command (overridden in docker-compose)
CMD ["pnpm", "dev"]
```

### 14.3 Hot Reload Setup

#### 14.3.1 Frontend Hot Reload (Vite)

Vite hot reload works out of the box. No additional configuration needed.

**Run frontend standalone** (without Docker):

```bash
pnpm --filter @polyladder/web dev
```

Frontend will auto-reload on file changes in `packages/web/src/`.

#### 14.3.2 Backend Hot Reload (nodemon)

**packages/api/package.json**:

```json
{
  "scripts": {
    "dev": "nodemon --watch src --exec ts-node src/index.ts",
    "build": "tsc"
  },
  "devDependencies": {
    "nodemon": "^3.0.0",
    "ts-node": "^10.9.0"
  }
}
```

**nodemon.json** (in packages/api/):

```json
{
  "watch": ["src", "../core/src", "../db/src"],
  "ext": "ts,json",
  "ignore": ["src/**/*.test.ts"],
  "exec": "node --inspect=0.0.0.0:9229 --require ts-node/register src/index.ts"
}
```

Changes to TypeScript files in `api/`, `core/`, or `db/` will trigger API restart.

### 14.4 Debugging

#### 14.4.1 VSCode/Cursor Debugger Setup

**.vscode/launch.json**:

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
      "skipFiles": ["<node_internals>/**"]
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

**Usage**:

1. Start services: `pnpm dev`
2. Set breakpoints in VSCode
3. Run debugger: F5 or "Attach to API (Docker)"
4. Debugger pauses at breakpoints

#### 14.4.2 Chrome DevTools for Node.js

Alternative to VSCode debugger:

1. Start API with inspector: `pnpm dev` (inspector enabled by default on port 9229)
2. Open Chrome: `chrome://inspect`
3. Click "Open dedicated DevTools for Node"
4. Sources tab → set breakpoints

### 14.5 Database Access

#### 14.5.1 Direct PostgreSQL Connection

**Using psql**:

```bash
# Connect from host
psql postgres://dev:dev@localhost:5432/polyladder

# Or via Docker
docker-compose exec db psql -U dev polyladder
```

**Common queries**:

```sql
-- List all tables
\dt

-- See approved meanings
SELECT * FROM approved_meanings LIMIT 10;

-- See user accounts
SELECT id, email, role, created_at FROM users;

-- Check pipeline status
SELECT
  (SELECT COUNT(*) FROM drafts) as drafts,
  (SELECT COUNT(*) FROM candidates) as candidates,
  (SELECT COUNT(*) FROM validated) as validated,
  (SELECT COUNT(*) FROM approved_meanings) as approved;
```

#### 14.5.2 GUI Tools

**Recommended tools**:

- **pgAdmin**: http://localhost:5432 (separate install)
- **DBeaver**: Universal database tool
- **TablePlus**: macOS/Windows GUI
- **Postico**: macOS only

**Connection details**:

- Host: localhost
- Port: 5432
- Database: polyladder
- Username: dev
- Password: dev

#### 14.5.3 Run Migrations

```bash
# Run migrations (creates/updates tables)
pnpm --filter @polyladder/db migrate up

# Rollback last migration
pnpm --filter @polyladder/db migrate down

# Create new migration
pnpm --filter @polyladder/db migrate create add-user-preferences-table
```

### 14.6 Viewing Logs

#### 14.6.1 Docker Compose Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f refinement
docker-compose logs -f db

# Last 100 lines
docker-compose logs --tail=100 api

# Since specific time
docker-compose logs --since 2023-01-01T00:00:00 api
```

#### 14.6.2 Structured Logging (pino)

API logs are structured JSON (via pino). Use `pino-pretty` for human-readable output.

**Install pino-pretty**:

```bash
pnpm add -D pino-pretty
```

**View pretty logs**:

```bash
docker-compose logs -f api | pnpm exec pino-pretty
```

**Example log output**:

```
[2025-01-15 10:30:45.123] INFO (api/1): Server listening on port 3000
[2025-01-15 10:30:50.456] INFO (api/1): POST /api/v1/auth/login
  req: {
    "id": "req-123",
    "method": "POST",
    "url": "/api/v1/auth/login"
  }
  res: {
    "statusCode": 200
  }
  responseTime: 45
```

### 14.7 Testing Locally

#### 14.7.1 Unit Tests

```bash
# Run all tests
pnpm test

# Run tests in specific package
pnpm --filter @polyladder/core test

# Watch mode
pnpm --filter @polyladder/api test --watch

# Coverage
pnpm test --coverage
```

#### 14.7.2 Integration Tests

Integration tests use Docker Compose to spin up real PostgreSQL.

**Run integration tests**:

```bash
# Start test database
docker-compose -f docker-compose.test.yml up -d

# Run tests
pnpm test:integration

# Cleanup
docker-compose -f docker-compose.test.yml down -v
```

#### 14.7.3 E2E Tests (Playwright)

```bash
# Install Playwright browsers (first time only)
pnpm exec playwright install

# Start dev environment
pnpm dev

# Run E2E tests (in another terminal)
pnpm test:e2e

# Run with UI
pnpm exec playwright test --ui

# Debug specific test
pnpm exec playwright test --debug tests/auth.spec.ts
```

### 14.8 Testing Production Build Locally

**Build production Docker image**:

```bash
docker build -f docker/Dockerfile.prod -t polyladder:local .
```

**Run production image locally**:

```bash
# Start PostgreSQL first
docker-compose up -d db

# Run production container
docker run -p 8080:8080 \
  -e DATABASE_URL=postgres://dev:dev@host.docker.internal:5432/polyladder \
  -e JWT_SECRET=local-test-secret \
  -e NODE_ENV=production \
  polyladder:local
```

**Access**:

- Application: http://localhost:8080

This is **identical** to what runs on Fly.io, but running locally for testing.

### 14.9 Resetting Development Environment

**Clear all data and restart**:

```bash
# Stop all services
docker-compose down

# Remove volumes (deletes database!)
docker-compose down -v

# Start fresh
pnpm dev
```

**Reset only database**:

```bash
# Connect to DB
docker-compose exec db psql -U dev polyladder

# Drop and recreate
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
\q

# Run migrations
pnpm --filter @polyladder/db migrate up
```

### 14.10 Common Development Tasks

#### 14.10.1 Add New API Endpoint

1. Define route in `packages/api/src/routes/learning/newEndpoint.ts`
2. Define Zod schema in `packages/api/src/schemas/`
3. Implement business logic in `packages/core/src/`
4. Add database query in `packages/db/src/queries/`
5. Test with curl or Postman:
   ```bash
   curl -X GET http://localhost:3000/api/v1/learning/new-endpoint \
     -H "Authorization: Bearer <jwt-token>"
   ```

#### 14.10.2 Seed Development Data

**packages/db/src/seeds/dev-data.ts**:

```typescript
export async function seedDevData(db: Database) {
  // Create test user
  await db.query(`
    INSERT INTO users (email, password_hash, role, base_language)
    VALUES ('test@example.com', '<bcrypt-hash>', 'learner', 'EN')
    ON CONFLICT (email) DO NOTHING
  `);

  // Create test approved meanings
  await db.query(`
    INSERT INTO approved_meanings (id, level, tags)
    VALUES ('greeting-hello', 'A0', '["greetings"]')
    ON CONFLICT (id) DO NOTHING
  `);
}
```

**Run seed**:

```bash
pnpm --filter @polyladder/db seed
```

#### 14.10.3 Inspect JWT Tokens

**Decode JWT** (without verification):

```bash
# Install jwt-cli
npm install -g jwt-cli

# Decode token
jwt decode <your-jwt-token>
```

**Example output**:

```json
{
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "role": "learner",
  "iat": 1705320000,
  "exp": 1705924800
}
```

#### 14.10.4 Monitor Performance

**API Response Times**:
Pino logs include `responseTime` field. Filter slow requests:

```bash
docker-compose logs api | grep '"responseTime":[0-9]\{3,\}'
```

**Database Query Performance**:

```sql
-- Enable query timing in PostgreSQL
\timing

-- Explain query plan
EXPLAIN ANALYZE SELECT * FROM approved_meanings WHERE level = 'A1';
```

### 14.11 Troubleshooting

#### 14.11.1 Port Already in Use

**Error**: `Error starting userland proxy: listen tcp 0.0.0.0:5432: bind: address already in use`

**Solution**:

```bash
# Find process using port
lsof -i :5432  # macOS/Linux
netstat -ano | findstr :5432  # Windows

# Kill process or change port in docker-compose.yml
ports:
  - "5433:5432"  # Use different host port
```

#### 14.11.2 Database Connection Refused

**Error**: `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Solution**:

```bash
# Check if PostgreSQL is running
docker-compose ps

# Check logs
docker-compose logs db

# Restart database
docker-compose restart db

# Wait for health check
docker-compose up -d db && docker-compose logs -f db
```

#### 14.11.3 Hot Reload Not Working

**Frontend**: Clear Vite cache

```bash
rm -rf packages/web/node_modules/.vite
pnpm --filter @polyladder/web dev
```

**Backend**: Check nodemon is watching correct files

```bash
# Add verbose logging
nodemon --watch src --verbose --exec ts-node src/index.ts
```

#### 14.11.4 Debugger Won't Attach

**Check inspector is running**:

```bash
# Should see "Debugger listening on ws://..."
docker-compose logs api | grep Debugger
```

**Ensure port is exposed**:

```yaml
# docker-compose.yml
api:
  ports:
    - '9229:9229' # Must be present
```

**Firewall blocking connection**: Allow port 9229 in firewall settings.

### 14.12 Development Workflow Best Practices

1. **Always run tests before committing**:

   ```bash
   pnpm test && pnpm lint
   ```

2. **Use conventional commits**:

   ```bash
   git commit -m "feat(api): add user vocabulary endpoint"
   git commit -m "fix(core): correct lifecycle state transition"
   ```

3. **Keep Docker images updated**:

   ```bash
   docker-compose pull
   docker-compose build --no-cache
   ```

4. **Monitor logs during development**:

   ```bash
   # In separate terminal
   docker-compose logs -f api refinement
   ```

5. **Use TypeScript strict mode**: Catch errors early at compile time.

6. **Profile slow code paths**: Use Node.js profiler if API is slow:
   ```bash
   node --inspect --prof src/index.ts
   ```

================================================================

## 15. Feature Breakdown

This section defines the complete feature roadmap. Each feature is a discrete increment that can be implemented, tested, and deployed independently.

### 15.1 Feature Organization

Features are organized into phases. Each phase groups related features that build toward a common subsystem or capability. Features within a phase must be implemented sequentially. Phases themselves may overlap when working on different subsystems.

### 15.2 Phase 0: Foundation & Infrastructure

**F000: Project Setup & Development Environment**

- Initialize monorepo with pnpm workspaces
- TypeScript configuration (base + per-package)
- ESLint, Prettier, Git hooks
- CI/CD pipeline basics (GitHub Actions)
- Package structure (`core`, `db`, `api`, `refinement-service`, `web`)

**F001: Database Schema & Migrations**

- PostgreSQL schema design
- Migration framework setup (node-pg-migrate)
- Initial tables: users, approved*\*, pipeline*\_, user\_\_
- Database seeding for development
- Connection pooling configuration

**F002: Core Domain Model & Types**

- TypeScript types for all domain entities
- User, Meaning, Utterance, Exercise, Grammar Rule
- Lifecycle state enums (DRAFT, CANDIDATE, VALIDATED, APPROVED)
- CEFR levels, Language codes
- Validation schemas (Zod)

**F003: Docker Development Environment**

- Dockerfile for API + Refinement Service
- docker-compose.yml for local development
- PostgreSQL container configuration
- Hot reload setup for development
- Environment variable management

---

### 15.3 Phase 1: Authentication & User Management

**F004: User Registration & Login**

- User model in database
- Password hashing (bcrypt)
- Registration endpoint (POST /api/v1/auth/register)
- Login endpoint (POST /api/v1/auth/login)
- JWT generation and signing
- Input validation (email format, password strength)

**F005: Role-Based Authorization**

- Role field in users table (learner/operator)
- Authorization middleware for Fastify
- Operator-only route protection
- JWT payload includes user_id and role
- Authorization error handling (403 Forbidden)

**F006: Session Management**

- JWT verification middleware
- Token expiration handling (7 days)
- Get current user endpoint (GET /api/v1/auth/me)
- Logout (client-side token removal)
- Token refresh strategy (future consideration)

---

### 15.4 Phase 2: Data Governance Core

**F007: Lifecycle State Machine Implementation**

- State transition logic (DRAFT→CANDIDATE→VALIDATED→APPROVED)
- Promotion rules and constraints
- State validation (no backward transitions)
- State change event recording
- Atomic state transitions (database transactions)

**F008: Immutability Engine**

- Write-once logic for approved\_\* tables
- Deprecation mechanism (not deletion)
- Audit log for approved data
- Immutability constraint enforcement
- Violation detection and prevention

**F009: Approval Event System**

- Approval event recording (who, when, what)
- Traceability: every approved item → approval event
- Automatic vs manual approval modes
- Approval history queries
- Event metadata (operator ID, timestamp, notes)

---

### 15.5 Phase 3: Quality Assurance System

**F010: Schema Validation Engine**

- JSON schema validation for all data types
- Required fields enforcement
- Type checking (string, number, enum)
- Format validation (URLs, language codes)
- Validation error messages

**F011: Quality Gates Implementation (Part 1)** ⏸️ DEFERRED

> **Note**: Quality Gates are deferred. Manual operator review at Draft and Validated stages provides quality control. Gates can be reintroduced when needed.

- ~~Duplication detection gate~~
- ~~Language standard enforcement gate~~
- ~~Orthography consistency gate~~
- ~~Gate execution framework~~
- ~~Gate failure recording~~

**F012: Quality Gates Implementation (Part 2)** ⏸️ DEFERRED

> **Note**: See F011. Quality control is currently handled via operator review.

- ~~CEFR level consistency checker~~
- ~~Prerequisite consistency validation~~
- ~~Content safety filtering~~
- ~~Gate orchestration~~
- ~~Pass/fail determination~~

**F013: Validation Failure Recording & Reporting** ⏸️ DEFERRED

> **Note**: With gates deferred, this is also deferred. Rejection tracking exists in `operator_feedback` and `rejected_items` tables.

- ~~Detailed failure logs~~
- ~~Failure storage~~
- ~~Retry mechanism~~
- ~~Failure trends analysis~~
- ~~Operator visibility in UI~~

---

### 15.6 Phase 4: Content Refinement Service (REVISED)

**⚠️ ARCHITECTURAL CHANGE**: Content is not generated by LLM from scratch. Instead, content comes from real teaching materials (PDF textbooks) and LLM transforms raw extracted text into structured format. See `docs/REVISED_CONTENT_PIPELINE.md` for full details.

**F014: Curriculum Structure Management**

- Pre-created CEFR levels (A0-C2) database seeding
- Operator UI: define topics per level (name, description, order, prerequisites)
- Topic management: add, edit, reorder topics
- Prerequisites configuration (topic X requires topic Y)
- Database schema: `curriculum_levels`, `curriculum_topics` tables
- Topic validation (no circular dependencies)
- Bulk import topics from template (JSON/CSV)
- Per-language topic library (Spanish, Italian, Portuguese, Slovenian)

**F015: Document Processing Pipeline**

- Document upload UI (PDF textbooks, grammar guides, corpus documents)
- File storage integration (Fly Volumes or S3-compatible)
- Document metadata management (language, level, source type, description)
- PDF text extraction engine (pdf-parse, pdfjs-dist)
- Structure detection: identify chapters, vocabulary, grammar, dialogues, exercises
- Content chunking: split by semantic boundaries (paragraphs, sections)
- Database schema: `document_sources`, `raw_content_chunks` tables
- Processing status tracking (pending → extracting → chunked → ready)
- Document library UI (browse, reprocess, delete documents)
- OCR support for scanned PDFs (tesseract.js)

**F016: Content Transformation Engine** (REVISED v2.0)

Two-stage LLM pipeline with operator review:

**Stage 1: Semantic Split (LLM #1)**

- LLM analyzes chunk + full curriculum schema
- Creates DRAFTS with: original_content, topic_id, level, content_type
- LLM does NOT modify content, only categorizes
- If no topic match → item not created

**Stage 2: Draft Review (Operator UI)**

- Approve → Draft moves to Candidate
- Reject → Draft deleted permanently
- Re-run → Re-process chunk with operator comment
- Bulk approve/reject supported
- Override topic/level before approving

**Stage 3: Transform (LLM #2)**

- Approved Candidates → LLM creates structured lesson
- explanation, notes, commonMistakes → Base language (English)
- examples, words → Target language
- Output: VALIDATED items

**Database schema additions**:

- `drafts.approval_status`, `drafts.suggested_topic_id`, `drafts.original_content`
- `draft_review_queue` table

**Benefits**:

- ~50-70% fewer LLM#2 calls (only approved drafts transformed)
- Clear audit trail: chunk → draft → candidate → validated → approved
- Operator catches mapping errors BEFORE expensive transformation

**F017: Operator Feedback & Iteration System**

- Rejection with detailed comments (operator explains corrections needed)
- Database schema: `operator_feedback`, `rejected_items` tables
- Feedback UI: rejection dialog with text input
- Re-run mechanism for drafts: reprocess with operator comment
- Feedback templates for common issues
- Version history tracking per item
- Feedback analytics: common rejection patterns
- Bulk operations (approve/reject multiple items)
- Quality improvement metrics (approval rate over time)

---

### 15.7 Phase 5: API Layer

**F018: API Infrastructure**

- Fastify server setup
- CORS configuration
- Request logging (pino)
- Error handling middleware
- Rate limiting (Fastify plugin)
- Health check endpoint (GET /health)

**F019: Authentication Endpoints**

- POST /api/v1/auth/register implementation
- POST /api/v1/auth/login implementation
- GET /api/v1/auth/me implementation
- JWT middleware integration
- Auth error responses

**F020: Operational Endpoints**

- GET /api/v1/operational/health - Pipeline metrics
- GET /api/v1/operational/candidates - Browse candidates
- GET /api/v1/operational/validated - Browse validated items
- POST /api/v1/operational/approve/:id - Approve item
- POST /api/v1/operational/reject/:id - Reject item
- GET /api/v1/operational/failures - Validation failures

**F021: Learning Endpoints**

- GET /api/v1/learning/curriculum - User curriculum
- GET /api/v1/learning/vocabulary - User vocabulary state
- POST /api/v1/learning/progress - Record progress
- GET /api/v1/learning/exercises - Fetch exercises
- POST /api/v1/learning/exercise-result - Submit exercise result
- GET /api/v1/learning/srs-due - Get SRS review queue

---

### 15.8 Phase 6: Frontend Foundation

**F022: React Application Setup**

- Vite + React project initialization
- React Router setup
- TanStack Query configuration
- Tailwind CSS setup
- Folder structure (components, pages, hooks, api)

**F023: Authentication UI**

- Registration page (/register)
- Login page (/login)
- Auth context (React Context for user state)
- JWT storage (localStorage)
- API client with JWT injection
- Auth error handling (401 → redirect to login)

**F024: Protected Routes & Navigation**

- Protected route wrapper (requires authentication)
- Role-based route protection (operator routes)
- Main navigation (header, sidebar)
- User menu (profile, logout)
- Landing page (/)

---

### 15.9 Phase 7: Operational UI

**F025: Data Health Dashboard**

- Counts by lifecycle state (DRAFT, CANDIDATE, VALIDATED, APPROVED)
- Pipeline flow visualization
- Health indicators (green/yellow/red)
- Recent activity log
- Refinement service status

**F026: Candidate Inspection & Approval Interface**

- Browse validated items (paginated table)
- Item detail view (content, metadata, validation results)
- Approve button (calls API)
- Reject button with reason input
- Bulk operations (approve/reject multiple)

**F027: Failure Investigation Tools**

- View failed validations (paginated list)
- Failure details (which gate, error message)
- Retry button
- Fix and resubmit option
- Failure trends chart

**F028: Approved Corpus Explorer**

- Search approved data (by language, level, type)
- Browse approved meanings, utterances, exercises
- Export capabilities (JSON, CSV)
- Statistics (counts by language, level)

---

### 15.10 Phase 8: Learning Application - Foundation

**F029: User Onboarding Flow**

- Welcome screen (first-time users)
- Base language selection
- Explanation of parallel learning
- Onboarding completion flag in user record

**F030: Language Selection & Management**

- Select languages to learn (multi-select)
- Save in user_preferences table
- Language selection screen (/setup)
- Change languages later (settings)

**F031: Orthography Gate System**

- Mandatory prerequisite enforcement
- Per-language orthography completion tracking
- Block access to vocabulary/grammar until orthography done
- Orthography gate UI indicator

**F032: Curriculum Graph Engine**

- DAG representation of concepts
- Prerequisite resolution
- "What can I learn next" logic
- Curriculum traversal algorithms
- Progress tracking through curriculum

---

### 15.11 Phase 9: Learning Application - Orthography & Phonetics

**F033: Orthography Learning Module**

- Graphemes & phonemes presentation
- Reading drills (minimum 30 per language)
- Audio playback for phonetics
- Drill progression (ordered by difficulty)
- Completion tracking

**F034: Orthography Practice Exercises**

- Recognition drills (match grapheme to phoneme)
- Reading aloud with recording
- Dictation (audio → text input)
- Progress tracking to completion gate
- Mastery criteria (X drills passed)

---

### 15.12 Phase 10: Learning Application - Vocabulary System

**F035: Word State Tracking (Unknown → Learning → Known)**

- Per-word, per-language state in user_vocabulary table
- State transitions based on performance
- Vocabulary size metrics (count by state)
- Word introduction logic

**F036: Contextual Vocabulary Introduction**

- Words introduced through example sentences
- Context tracking (which words appear where)
- Varied exposure enforcement
- Vocabulary in use (not isolated flashcards)

---

### 15.13 Phase 11: Learning Application - Grammar Lessons

**F037: Grammar Lesson Structure**

- Theory presentation (in base language)
- Examples across studied languages
- Comparative presentation (similarities/differences)
- Grammar concept as prerequisite for exercises

**F038: Grammar Practice Exercises**

- Rule application exercises
- Grammar-focused cloze
- Transformation drills
- Prerequisite enforcement (can't pass without grammar)

---

### 15.14 Phase 12: Learning Application - Practice Modes

**F039: Recall Practice Mode**

- Prompt in one language → answer in another
- Random source/target language rotation
- Word/phrase/sentence levels
- Immediate feedback

**F040: Recognition Practice Mode (Multiple Choice)**

- Present options, identify correct one
- Passive knowledge testing
- Distractor generation (incorrect options)
- Performance tracking

**F041: Cloze Exercises**

- Sentence with missing element
- Context-based gap filling
- Grammar & vocabulary variants
- Hint system (optional)

**F042: Dictation Practice**

- Audio playback
- Transcription input
- Automatic correction (fuzzy match)
- Orthography & listening combo

**F043: Translation Practice (Between Studied Languages)**

- NO base language intermediary
- Direct associations (IT→PT, ES→IT, etc.)
- Random language pair rotation
- Gradual difficulty increase

**F044: Production Practice (Audio Recording)**

- Learner speaks & records
- Compare to reference pronunciation
- Playback comparison
- Pronunciation feedback (future: speech recognition)

**F045: Reading Comprehension**

- Level-appropriate texts
- Content questions
- Vocabulary in context
- Comprehension scoring

---

### 15.15 Phase 13: Learning Application - Spaced Repetition System

**F046: SRS Algorithm Implementation**

- Scheduling based on difficulty, time, performance
- SM-2 or similar algorithm
- Due date calculation
- Difficulty adjustment based on results
- Applies to vocabulary, grammar, sentences

**F047: Review Session Management**

- Daily review queue (items due today)
- Due items presentation
- Performance tracking for rescheduling
- Review statistics (items reviewed, accuracy)

---

### 15.16 Phase 14: Learning Application - Parallel Learning Features

**F048: Comparative Grammar Presentation**

- Side-by-side rule comparison (ES/IT/PT past tense, etc.)
- Explicit similarity/difference highlighting
- Tabular comparison views
- Cross-language grammar insights

**F049: Language Mixing in Practice Sessions**

- Deliberate randomization across languages
- Prevent fixed pathways through base language
- Random language pair selection
- Mixed exercise sessions

**F050: Interference Detection & Remediation**

- Detect confusion patterns (similar words/structures)
- Track errors by language pair
- Generate targeted exercises for specific confusions
- Interference heatmap visualization

**F051: Focus Mode**

- Optional single-language practice
- For exam prep or high-confusion periods
- Toggle between parallel & focus mode
- Preference storage per user

---

### 15.17 Phase 15: Learning Application - Progress Tracking

**F052: Vocabulary Progress Dashboard**

- Per-language word counts (Unknown/Learning/Known)
- Breakdown by domain & frequency band
- Visualization (charts, graphs)
- Historical trends

**F053: Grammar Coverage Tracking**

- Completed vs remaining topics
- Per-language grammar progress
- Coverage percentage
- Next recommended grammar topic

**F054: CEFR Level Assessment**

- Automatic level mapping (vocab + grammar + performance)
- Per-language level indicators
- Level-up notifications
- Estimated time to next level

**F055: Weakness Identification System**

- Highlight struggle areas (grammar, domain, language pair)
- Actionable recommendations
- Weakness trends over time
- Targeted practice suggestions

**F056: Study Statistics & Trends**

- Time spent (daily, weekly, total)
- Exercises completed
- Accuracy trends
- Streaks, achievements
- Learning pattern analysis

---

### 15.18 Phase 16: Deployment & Production Readiness

**F057: Production Docker Configuration**

- Multi-stage Dockerfile (builder + runtime)
- Nginx configuration
- Supervisord setup (nginx + API + refinement)
- Production environment variables
- Health checks

**F058: Fly.io Deployment Setup**

- fly.toml configuration
- Fly Postgres setup
- Secrets management (DATABASE_URL, JWT_SECRET)
- Deploy script
- Domain configuration (custom domain)

**F059: Database Backup & Restore**

- Automated daily backups (Fly Postgres)
- Manual backup script (pg_dump)
- Off-site backup storage (S3/B2)
- Restore procedure documentation
- Backup testing

**F060: Monitoring & Logging**

- Structured logging (pino)
- Error tracking (Sentry or similar)
- Performance monitoring (response times)
- Database query monitoring
- Alerting setup (email/Slack)

---

### 15.19 Feature Implementation Notes

**Completion Criteria**: Each feature is considered complete when:

- Implementation is done and tested (unit + integration tests)
- Documentation is updated (if needed)
- Code is reviewed and merged to main
- Feature is deployed to staging and verified

**Feature Dependencies**: Features within a phase are sequential. Cross-phase dependencies are noted in individual feature specifications.

**Feature Estimation**: No time estimates are provided. Features are scoped to be implementable in reasonable increments (days, not weeks).

**Feature Flexibility**: Feature definitions are authoritative but implementation details may evolve. The "what" is fixed, the "how" can adapt.

================================================================

END OF ARCHITECTURE DOCUMENT
