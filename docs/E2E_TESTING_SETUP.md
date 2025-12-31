# E2E Testing Setup Guide

## Overview

PolyLadder uses Playwright for end-to-end testing with a **real PostgreSQL database**. Tests are fully automated - Playwright handles all setup and teardown automatically.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    E2E Test Suite                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Global Setup (runs once before all tests)       │  │
│  │  1. Build @polyladder/core package                │  │
│  │  2. Start PostgreSQL container (port 5433)       │  │
│  │  3. Run migrations                                │  │
│  │  4. Start API server (port 3001)                 │  │
│  │  5. Start Vite dev server (port 5174)           │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Test Execution (runs for each test)             │  │
│  │  1. beforeEach: Clean database                   │  │
│  │  2. Run test with real HTTP requests             │  │
│  │  3. Verify UI and database state                 │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Global Teardown (runs once after all tests)     │  │
│  │  1. Stop API server                               │  │
│  │  2. Stop and remove PostgreSQL container         │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## ⚠️ CRITICAL: Environment Isolation

**E2E and Development environments MUST be completely isolated and NEVER share ports:**

| Service         | Development Port | E2E Port | Notes                         |
| --------------- | ---------------- | -------- | ----------------------------- |
| Frontend (Vite) | **5173**         | **5174** | NEVER change E2E port to 5173 |
| API Server      | 3000             | **3001** | E2E uses different port       |
| PostgreSQL      | 5432             | **5433** | E2E uses separate container   |

**DO NOT**:

- ❌ Run dev server on port 5174
- ❌ Change E2E Vite port in `playwright.config.ts`
- ❌ Run E2E tests while dev server is running on 5173
- ❌ Manually edit port constants in E2E config files

**Configuration Location**:

- `packages/web/playwright.config.ts` - defines `E2E_PORT = 5174` and configures webServer to start Vite
- `packages/web/playwright/global-setup.ts` - kills processes on port 3001 before setup (port 5174 is managed by Playwright's webServer)

**If you get "port already in use" error**:

```bash
# Kill processes on E2E ports (Windows):
netstat -ano | findstr :5174
netstat -ano | findstr :3001
# Then kill the PIDs manually

# Or restart Docker:
docker compose -f docker/docker-compose.e2e.yml down -v
```

## Prerequisites

- Docker Desktop running
- Node.js 20+
- pnpm installed

## Running E2E Tests

### From Project Root

```bash
pnpm --filter @polyladder/web test:e2e
```

### With UI (Visual Debugging)

```bash
pnpm --filter @polyladder/web test:e2e:ui
```

### Headed Mode (Watch Browser)

```bash
pnpm --filter @polyladder/web test:e2e:headed
```

### Debug Mode (Step Through)

```bash
pnpm --filter @polyladder/web test:e2e:debug
```

## E2E Environment Configuration

### Frontend (Vite)

- **Port**: 5174 (isolated from dev port 5173)
- **URL**: http://localhost:5174
- **Command**: `pnpm vite --port 5174`

### API Server

- **Port**: 3001 (isolated from dev port 3000)
- **URL**: http://localhost:3001
- **Database**: Uses E2E database on port 5433

### PostgreSQL Database

- **Host**: localhost
- **Port**: 5433 (isolated from dev port 5432)
- **Database**: polyladder_e2e
- **User**: test_e2e
- **Password**: test_e2e_password
- **Container**: Started via `docker/docker-compose.e2e.yml`

## Writing E2E Tests

### Basic Structure

```typescript
import { test, expect } from '@playwright/test';
import { cleanupTestData, createTestUser } from '../../playwright/db-helpers';

test.describe('Feature Name', () => {
  // Clean database before each test
  test.beforeEach(async () => {
    await cleanupTestData();
  });

  test('should do something', async ({ page }) => {
    // Arrange: Setup test data
    await createTestUser({
      email: 'test@example.com',
      password: 'TestPassword123',
      role: 'learner',
    });

    // Act: Perform user actions
    await page.goto('/login');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('TestPassword123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Assert: Verify results
    await expect(page).toHaveURL('/dashboard');
  });
});
```

### Database Helpers

```typescript
import { cleanupTestData, createTestUser } from '../../playwright/db-helpers';

// Clean all test data
await cleanupTestData();

// Create test user
const user = await createTestUser({
  email: 'user@example.com',
  password: 'Password123',
  role: 'learner', // or 'operator'
  baseLanguage: 'EN', // optional, defaults to 'EN'
});
```

### Page Objects

Use page objects for reusable interactions:

```typescript
import { LoginPage } from '../helpers/page-objects/LoginPage';

const loginPage = new LoginPage(page);
await loginPage.goto();
await loginPage.login('user@example.com', 'password');
```

## Best Practices

### 1. Database Isolation

Always clean database before each test:

```typescript
test.beforeEach(async () => {
  await cleanupTestData();
});
```

### 2. Unique Emails

For registration tests, use unique emails:

```typescript
const uniqueEmail = `test-${Date.now()}@example.com`;
```

### 3. Explicit Waits

Wait for navigation or elements:

```typescript
await expect(page).toHaveURL('/dashboard', { timeout: 15000 });
await expect(page.getByRole('heading')).toBeVisible();
```

## Debugging

### View Test Report

```bash
pnpm --filter @polyladder/web test:e2e:report
```

### View Trace

When tests fail, traces are automatically captured:

```bash
pnpm --filter @polyladder/web test:e2e:trace test-results/[test-name]/trace.zip
```

## CI Integration

In GitHub Actions CI:

1. PostgreSQL E2E service starts on port 5433
2. Migrations run automatically
3. API server starts via global-setup
4. Playwright runs all E2E tests
5. Reports uploaded as artifacts

## Troubleshooting

### Port Already in Use

```bash
# Stop existing container
docker compose -f docker/docker-compose.e2e.yml down -v
```

### API Already Running

If the API is already running on port 3001, global-setup will detect it and skip setup. This is useful for development:

```bash
# Start API manually for faster iteration
pnpm --filter @polyladder/api dev

# Run tests (will use existing API)
pnpm --filter @polyladder/web test:e2e
```

### Tests Timing Out

Increase timeout in test:

```typescript
test('slow test', async ({ page }) => {
  test.setTimeout(60000); // 60 seconds
  // ... test code
});
```

## Performance

- **Single Worker**: Tests run serially to avoid database conflicts
- **Database Cleanup**: ~100ms per test
- **Test Execution**: ~1-2s per test
- **Total Suite**: ~15-30s for full suite
