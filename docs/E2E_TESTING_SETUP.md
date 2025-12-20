# E2E Testing Setup Guide

## Overview

PolyLadder uses Playwright for end-to-end testing with a **real PostgreSQL database**. This ensures tests accurately reflect production behavior.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    E2E Test Suite                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Global Setup (runs once before all tests)       │  │
│  │  1. Start PostgreSQL container (port 5433)       │  │
│  │  2. Run migrations                                │  │
│  │  3. Start API server (port 3001)                 │  │
│  │  4. Start Vite dev server (port 5173)           │  │
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

## Prerequisites

- Docker Desktop running
- Node.js 20+
- pnpm installed

## Running E2E Tests

### Option 1: Automatic (Recommended)

Playwright will automatically setup and teardown the environment:

```bash
# From project root
pnpm --filter @polyladder/web test:e2e
```

### Option 2: Manual Setup

For development or debugging:

```bash
# 1. Setup environment (Windows)
cd packages/web
pwsh scripts/e2e-setup.ps1

# 1. Setup environment (Linux/Mac)
cd packages/web
bash scripts/e2e-setup.sh

# 2. Run tests
pnpm test:e2e

# 3. Cleanup (Windows)
pwsh scripts/e2e-teardown.ps1

# 3. Cleanup (Linux/Mac)
bash scripts/e2e-teardown.sh
```

## Test Database

- **Host**: localhost
- **Port**: 5433 (different from dev database on 5432)
- **Database**: polyladder_e2e
- **User**: test_e2e
- **Password**: test_e2e_password

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
await expect(page).toHaveURL('/dashboard', { timeout: 10000 });
await expect(page.getByRole('heading')).toBeVisible();
```

### 4. Page Objects

Use page objects for reusable interactions:

```typescript
import { LoginPage } from '../helpers/page-objects/LoginPage';

const loginPage = new LoginPage(page);
await loginPage.goto();
await loginPage.login('user@example.com', 'password');
```

## Debugging

### View Test Report

```bash
pnpm --filter @polyladder/web test:e2e:report
```

### Run in UI Mode

```bash
pnpm --filter @polyladder/web test:e2e:ui
```

### Run in Headed Mode

```bash
pnpm --filter @polyladder/web test:e2e:headed
```

### Debug Mode

```bash
pnpm --filter @polyladder/web test:e2e:debug
```

### View Trace

When tests fail, traces are automatically captured:

```bash
pnpm exec playwright show-trace packages/web/test-results/[test-name]/trace.zip
```

## CI Integration

In CI, the E2E tests run automatically:

1. GitHub Actions starts PostgreSQL service
2. Runs migrations
3. Starts API server in background
4. Playwright starts Vite dev server
5. Runs all E2E tests
6. Uploads test reports and screenshots as artifacts

## Troubleshooting

### Port Already in Use

If port 5433 is already in use:

```bash
# Stop existing container
docker compose -f docker/docker-compose.e2e.yml down

# Or find and kill process using port
# Windows
netstat -ano | findstr :5433
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:5433 | xargs kill -9
```

### Database Connection Failed

Check if Docker is running:

```bash
docker ps
```

### API Server Not Starting

Check logs in global setup output. Common issues:

- Port 3001 already in use
- Database migrations failed
- Missing environment variables

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
- **Test Execution**: ~2-5s per test
- **Total Suite**: ~30-60s for full suite

## Future Improvements

- [ ] Parallel test execution with database isolation
- [ ] Test data fixtures for common scenarios
- [ ] Visual regression testing
- [ ] Performance testing with Lighthouse
- [ ] Cross-browser testing (Firefox, Safari)
