# PolyLadder Manual Testing Guide

## Local Environment Setup

### Requirements

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Docker and Docker Compose
- PostgreSQL 15+ (or via Docker)

### Quick Start

#### Option 1: Automated Setup (Recommended)

**Windows (PowerShell):**

```powershell
.\scripts\setup-local-dev.ps1
```

**Linux/macOS:**

```bash
chmod +x scripts/setup-local-dev.sh
./scripts/setup-local-dev.sh
```

This script will:

- Check prerequisites (Node.js, pnpm, Docker)
- Install dependencies
- Create `.env` files with default values
- Start the database
- Run migrations

#### Option 2: Manual Setup

1. **Clone repository and install dependencies:**

```bash
git clone <repo-url>
cd PolyLadder
pnpm install
```

2. **Start database:**

```bash
pnpm dev:build
# or
docker-compose -f docker/docker-compose.yml up -d db
```

3. **Apply migrations:**

```bash
pnpm --filter @polyladder/db migrate:up
```

4. **Start API server:**

```bash
# In a separate terminal
cd packages/api
pnpm dev
```

5. **Start web application:**

```bash
# In a separate terminal
cd packages/web
pnpm dev
```

### Environment Variables

#### API (packages/api)

Create `.env` file in `packages/api/`:

```env
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
DATABASE_URL=postgres://dev:dev@localhost:5432/polyladder
JWT_SECRET=dev-secret-key-must-be-at-least-32-characters-long
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
FRONTEND_URL=http://localhost:5173
LOG_LEVEL=debug
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=1 minute
```

#### Web (packages/web)

Create `.env` file in `packages/web/`:

```env
VITE_API_URL=http://localhost:3000/api/v1
```

## Testing Checklist

### 1. Authentication (F019, F023)

#### Registration

- [ ] Register new user (learner)
- [ ] Register new user (operator)
- [ ] Email format validation
- [ ] Password validation (minimum 8 characters)
- [ ] Error on duplicate email
- [ ] Automatic login after registration

#### Login

- [ ] Successful login with correct credentials
- [ ] Error on incorrect email
- [ ] Error on incorrect password
- [ ] Tokens saved in localStorage
- [ ] Redirect to /dashboard after login

#### Tokens

- [ ] Access token added to Authorization header
- [ ] Automatic refresh when access token expires
- [ ] Redirect to /login when refresh token expires
- [ ] Logout clears tokens

#### Protected Routes

- [ ] Redirect to /login for unauthorized users
- [ ] Access to /dashboard only for authorized users
- [ ] Access to /operator/\* only for operator role
- [ ] 403 error for learner when accessing operator routes

### 2. Operational UI - Dashboard (F025)

#### Pipeline Health

- [ ] Display counters by state (DRAFT, CANDIDATE, VALIDATED, APPROVED)
- [ ] Display metrics by content type
- [ ] Health indicators (healthy/warning/critical)
- [ ] Refinement service status
- [ ] Auto-refresh every 30 seconds

#### Activity Log

- [ ] Display recent actions
- [ ] Filter by action type
- [ ] Pagination

### 3. Operational UI - Review Queue (F026)

#### Queue View

- [ ] Display list of VALIDATED items
- [ ] Filter by content type (vocabulary/grammar/orthography)
- [ ] Pagination works correctly
- [ ] Sort by validation date

#### Detailed View

- [ ] Modal window with full item information
- [ ] Display validation results
- [ ] Display metadata

#### Approval/Rejection

- [ ] Successful item approval
- [ ] Successful rejection with reason
- [ ] Optimistic UI updates
- [ ] Rollback on API error
- [ ] Bulk approve/reject works

#### Feedback Dialog (F017)

- [ ] Dialog opens on reject
- [ ] Select feedback category
- [ ] Enter comment (minimum 10 characters)
- [ ] Enter suggested correction (optional)
- [ ] Use templates
- [ ] Save feedback to database

### 4. Operational UI - Failures (F027)

#### Error List

- [ ] Display validation failures
- [ ] Filter by content type
- [ ] Filter by gate name
- [ ] Filter by time (24h/7d/30d/all)
- [ ] Pagination

#### Error Details

- [ ] Modal window with full information
- [ ] Display error message
- [ ] Display validation context
- [ ] Display stack trace (if available)

#### Retry

- [ ] Retry single failure
- [ ] Bulk retry selected failures
- [ ] Check attempt_number < 3
- [ ] Update status after retry

#### Trends

- [ ] Failure trends chart over time
- [ ] Filter by time range (7d/30d/90d)
- [ ] Display by gate types

### 5. Operational UI - Corpus Explorer (F028)

#### Search

- [ ] Text search in approved corpus
- [ ] Filter by content type
- [ ] Filter by language
- [ ] Filter by CEFR level
- [ ] Combined filters

#### View

- [ ] Display search results
- [ ] Pagination (20/50/100/200 items per page)
- [ ] Detailed item view
- [ ] Display metadata

#### Export

- [ ] Export to JSON
- [ ] Export to CSV
- [ ] Bulk selection works
- [ ] Limit 1000 items for export

#### Statistics

- [ ] Display total items
- [ ] Statistics by content type
- [ ] Statistics by language
- [ ] Statistics by CEFR level
- [ ] Coverage chart by language and level

### 6. API Endpoints

#### Health Check

```bash
curl http://localhost:3000/health
```

#### Auth Endpoints

```bash
# Register
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234","role":"learner"}'

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234"}'

# Me (requires token)
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

#### Operational Endpoints

```bash
# Pipeline Health
curl http://localhost:3000/api/v1/operational/health \
  -H "Authorization: Bearer <operatorToken>"

# Review Queue
curl "http://localhost:3000/api/v1/operational/review-queue?page=1&pageSize=20" \
  -H "Authorization: Bearer <operatorToken>"

# Approve
curl -X POST http://localhost:3000/api/v1/operational/approve/<itemId> \
  -H "Authorization: Bearer <operatorToken>" \
  -H "Content-Type: application/json" \
  -d '{"tableName":"meanings","notes":"Looks good"}'

# Reject
curl -X POST http://localhost:3000/api/v1/operational/reject/<itemId> \
  -H "Authorization: Bearer <operatorToken>" \
  -H "Content-Type: application/json" \
  -d '{"tableName":"meanings","reason":"Incorrect translation"}'
```

## Known Issues and Bugs

### Critical

1. **SQL Injection in review-queue.ts (line 113)**
   - Issue: Using string interpolation for dataTypes
   - Risk: Low (data from internal logic), but better to use parameterized queries
   - Status: Requires fix

2. **Missing await in learning routes (packages/api/src/routes/learning/index.ts:11-15)**
   - Issue: Using `void` instead of `await` for route registration
   - Risk: Medium - routes may not register correctly
   - Status: Requires fix

### Medium

3. **Missing tableName validation in approve/reject endpoints**
   - Issue: Can pass arbitrary table name
   - Risk: Medium - may lead to errors or SQL injection
   - Status: Requires fix

4. **No race condition handling in bulk operations**
   - Issue: Parallel bulk approve/reject may conflict
   - Risk: Medium - may lead to duplicate operations
   - Status: Requires improvement

5. **Missing rate limiting on sensitive endpoints**
   - Issue: No additional rate limiting on approve/reject
   - Risk: Low - general rate limit exists, but can be improved
   - Status: Optional improvement

### Low

6. **No handling for large exports (corpus)**
   - Issue: Export >1000 items may be slow
   - Risk: Low - limit exists, but UX may be poor
   - Status: Optional improvement

7. **Missing caching for statistics**
   - Issue: Statistics recalculated on every request
   - Risk: Low - acceptable for MVP
   - Status: Optional improvement

## Testing Recommendations

### Priority 1 (Critical)

1. Test all auth endpoints
2. Test approve/reject workflow
3. Test feedback system (F017)
4. Check SQL injection vulnerabilities

### Priority 2 (Important)

1. Test bulk operations
2. Test filtering and search
3. Test export
4. Check performance on large datasets

### Priority 3 (Desirable)

1. Test edge cases
2. Test error handling
3. Test UI responsiveness
4. Check accessibility

## Quick Testing Scripts

### Create Test Data

```bash
# Run script to create test data
pnpm --filter @polyladder/db seed:dev
```

### Clean Data

```bash
# Clear all test data
pnpm --filter @polyladder/db reset:dev
```

### Check Migrations

```bash
# Check migration status
pnpm --filter @polyladder/db migrate:status
```

## Testing Report

Fill out the report after testing:

### General Information

- Testing Date: ****\_\_\_****
- Version: ****\_\_\_****
- Tester: ****\_\_\_****

### Results

- Total Tests: ****\_\_\_****
- Passed: ****\_\_\_****
- Failed: ****\_\_\_****
- Skipped: ****\_\_\_****

### Found Bugs

1. [Bug description]
   - Priority: [Critical/High/Medium/Low]
   - Reproduction steps: ...
   - Expected behavior: ...
   - Actual behavior: ...

### Recommendations

- [ ] Ready for production
- [ ] Requires fixes before release
- [ ] Requires additional testing
