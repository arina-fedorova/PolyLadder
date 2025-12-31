import { test, expect } from '@playwright/test';
import { cleanupTestData, createTestUser, completeOnboarding } from '../../playwright/db-helpers';

test.describe('Operator Dashboard', () => {
  test.beforeEach(async () => {
    await cleanupTestData();
  });

  test('should deny access to learner', async ({ page }) => {
    const user = await createTestUser({
      email: 'learner@example.com',
      password: 'TestPassword123',
      role: 'learner',
    });

    await completeOnboarding(user.userId);

    await page.goto('/login');
    await page.getByLabel('Email address').fill('learner@example.com');
    await page.getByPlaceholder('••••••••').fill('TestPassword123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/dashboard');

    await page.goto('/operator/pipelines');

    await expect(page.getByText('403')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("You don't have permission to access this page.")).toBeVisible();
  });

  test('should allow operator to access dashboard', async ({ page }) => {
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
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/Document Pipelines/)).toBeVisible({ timeout: 15000 });
  });

  test('should display header navigation for operator', async ({ page }) => {
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
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('link', { name: 'Pipeline' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Corpus' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Curriculum' })).toBeVisible();
    await expect(page.getByText('operator@example.com')).toBeVisible();
  });
});
