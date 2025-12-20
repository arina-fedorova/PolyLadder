# E2E Testing with Playwright

## Overview

PolyLadder uses Playwright for end-to-end (E2E) testing of the web application. E2E tests verify complete user flows from the browser perspective, ensuring that the frontend, backend, and database work together correctly.

---

## Core Principles

1. **Mandatory for UI Features**: Every feature that adds or modifies UI must include E2E tests
2. **User-Centric**: Tests should mirror real user behavior and workflows
3. **Reliable**: Tests must be deterministic and not flaky
4. **Maintainable**: Use Page Object Model and reusable helpers
5. **Fast**: Keep tests focused and run in parallel where possible

---

## Setup

### Installation

Playwright is installed in the `@polyladder/web` package:

```bash
cd packages/web
pnpm add -D @playwright/test
pnpm exec playwright install --with-deps
```

### Configuration

Create `packages/web/playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['junit', { outputFile: 'test-results/junit.xml' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Scripts

Add to `packages/web/package.json`:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:debug": "playwright test --debug"
  }
}
```

---

## Test Structure

### Directory Layout

```
packages/web/e2e/
├── auth/
│   ├── login.spec.ts
│   ├── register.spec.ts
│   └── logout.spec.ts
├── learner/
│   ├── dashboard.spec.ts
│   ├── exercises.spec.ts
│   └── review.spec.ts
├── operator/
│   ├── content-review.spec.ts
│   └── pipeline-monitoring.spec.ts
├── fixtures/
│   ├── auth.ts
│   └── test-data.ts
└── helpers/
    ├── page-objects/
    │   ├── LoginPage.ts
    │   ├── DashboardPage.ts
    │   └── ExercisePage.ts
    └── utils.ts
```

---

## Writing Tests

### Basic Test Example

```typescript
import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test('should display login form', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('should login successfully with valid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('learner@test.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByText('Welcome back')).toBeVisible();
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('wrong@test.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText('Invalid email or password')).toBeVisible();
  });
});
```

### Page Object Model

Create reusable page objects:

```typescript
// e2e/helpers/page-objects/LoginPage.ts
import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign In' });
    this.errorMessage = page.getByRole('alert');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectError(message: string) {
    await this.errorMessage.waitFor({ state: 'visible' });
    await this.errorMessage.textContent().then((text) => {
      if (!text?.includes(message)) {
        throw new Error(`Expected error "${message}", got "${text}"`);
      }
    });
  }
}
```

Use in tests:

```typescript
import { test, expect } from '@playwright/test';
import { LoginPage } from '../helpers/page-objects/LoginPage';

test('should login successfully', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.login('learner@test.com', 'password123');

  await expect(page).toHaveURL('/dashboard');
});
```

---

## Authentication Fixtures

Create reusable auth fixtures:

```typescript
// e2e/fixtures/auth.ts
import { test as base } from '@playwright/test';
import { LoginPage } from '../helpers/page-objects/LoginPage';

type AuthFixtures = {
  authenticatedLearner: void;
  authenticatedOperator: void;
};

export const test = base.extend<AuthFixtures>({
  authenticatedLearner: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('learner@test.com', 'password123');
    await page.waitForURL('/dashboard');
    await use();
  },

  authenticatedOperator: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('operator@test.com', 'password123');
    await page.waitForURL('/operator/dashboard');
    await use();
  },
});

export { expect } from '@playwright/test';
```

Use in tests:

```typescript
import { test, expect } from '../fixtures/auth';

test('learner can view exercises', async ({ page, authenticatedLearner }) => {
  await page.goto('/exercises');
  await expect(page.getByRole('heading', { name: 'Exercises' })).toBeVisible();
});
```

---

## Best Practices

### 1. Use Semantic Locators

✅ **Good**:

```typescript
await page.getByRole('button', { name: 'Submit' }).click();
await page.getByLabel('Email').fill('test@test.com');
await page.getByText('Welcome back').waitFor();
```

❌ **Bad**:

```typescript
await page.locator('.btn-submit').click();
await page.locator('#email-input').fill('test@test.com');
await page.locator('div.welcome-message').waitFor();
```

### 2. Avoid Hard-Coded Waits

✅ **Good**:

```typescript
await page.getByText('Loading...').waitFor({ state: 'hidden' });
await page.getByText('Data loaded').waitFor({ state: 'visible' });
```

❌ **Bad**:

```typescript
await page.waitForTimeout(3000);
```

### 3. Test User Flows, Not Implementation

✅ **Good**:

```typescript
test('user can complete an exercise', async ({ page, authenticatedLearner }) => {
  await page.goto('/exercises');
  await page.getByRole('button', { name: 'Start Exercise' }).click();
  await page.getByLabel('Answer').fill('la casa');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Correct!')).toBeVisible();
});
```

❌ **Bad**:

```typescript
test('exercise component state updates', async ({ page }) => {
  // Testing internal component state instead of user-visible behavior
});
```

### 4. Keep Tests Independent

Each test should be able to run in isolation:

```typescript
test.beforeEach(async ({ page }) => {
  // Setup: create necessary test data
  await createTestUser('learner@test.com');
});

test.afterEach(async () => {
  // Teardown: clean up test data
  await cleanupTestData();
});
```

### 5. Use Data Attributes for Stability

Add `data-testid` attributes to critical elements:

```tsx
// Component
<button data-testid="submit-exercise">Submit</button>;

// Test
await page.getByTestId('submit-exercise').click();
```

---

## CI Integration

### GitHub Actions

Add E2E tests to `.github/workflows/ci.yml`:

```yaml
e2e-tests:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:16
      env:
        POSTGRES_USER: postgres
        POSTGRES_PASSWORD: postgres
        POSTGRES_DB: polyladder_test
      ports:
        - 5432:5432
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v2
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: 'pnpm'
    - run: pnpm install
    - run: pnpm --filter @polyladder/db migrate up
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/polyladder_test
    - name: Install Playwright Browsers
      run: pnpm --filter @polyladder/web exec playwright install --with-deps chromium
    - name: Run E2E Tests
      run: pnpm --filter @polyladder/web test:e2e
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/polyladder_test
        JWT_SECRET: test-secret
        VITE_API_URL: http://localhost:3000/api/v1
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: playwright-report
        path: packages/web/playwright-report/
        retention-days: 30
```

---

## Coverage Requirements

For each UI feature, E2E tests must cover:

1. **Happy Path**: Main user flow works as expected
2. **Error Handling**: Invalid inputs show appropriate errors
3. **Authentication**: Protected routes require login
4. **Authorization**: Users can only access allowed content
5. **Loading States**: UI shows loading indicators during async operations
6. **Edge Cases**: Boundary conditions, empty states, max limits

---

## Visual Regression Testing (Optional)

For critical UI components, add visual regression tests:

```typescript
test('landing page matches screenshot', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('landing-page.png');
});
```

---

## Debugging

### UI Mode

```bash
pnpm --filter @polyladder/web test:e2e:ui
```

### Headed Mode

```bash
pnpm --filter @polyladder/web test:e2e:headed
```

### Debug Mode

```bash
pnpm --filter @polyladder/web test:e2e:debug
```

### View Trace

```bash
pnpm --filter @polyladder/web exec playwright show-trace path/to/trace.zip
```

---

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Locators Guide](https://playwright.dev/docs/locators)
- [Page Object Model](https://playwright.dev/docs/pom)

---

End of E2E Testing Guide
