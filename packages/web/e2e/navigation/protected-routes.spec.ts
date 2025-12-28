import { test, expect } from '@playwright/test';
import { cleanupTestData, createTestUser } from '../../playwright/db-helpers';

test.describe('Protected Routes', () => {
  test.beforeEach(async () => {
    await cleanupTestData();
  });

  test('should redirect to login when accessing protected route without auth', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL('/login');
  });

  test('should access dashboard after login', async ({ page }) => {
    await createTestUser({
      email: 'learner@example.com',
      password: 'TestPassword123',
      role: 'learner',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('learner@example.com');
    await page.getByPlaceholder('••••••••').fill('TestPassword123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'Learner Dashboard' })).toBeVisible();
  });

  test('should show 403 when learner tries to access operator route', async ({ page }) => {
    await createTestUser({
      email: 'learner@example.com',
      password: 'TestPassword123',
      role: 'learner',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('learner@example.com');
    await page.getByPlaceholder('••••••••').fill('TestPassword123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/dashboard');

    await page.goto('/operator/pipelines');

    await expect(page.getByText('403')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("You don't have permission to access this page.")).toBeVisible();
  });

  test('should allow operator to access operator routes', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByPlaceholder('••••••••').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/operator/pipelines', { timeout: 15000 });

    await page.goto('/operator/pipelines');

    await expect(page.getByText(/Document Pipelines/)).toBeVisible({ timeout: 10000 });
  });
});
