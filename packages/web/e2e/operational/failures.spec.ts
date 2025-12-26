import { test, expect } from '@playwright/test';
import { cleanupTestData, createTestUser } from '../../playwright/db-helpers';

test.describe('Failures Page', () => {
  test.beforeEach(async () => {
    await cleanupTestData();
  });

  test('should deny access to learner', async ({ page }) => {
    await createTestUser({
      email: 'learner@example.com',
      password: 'TestPassword123',
      role: 'learner',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('learner@example.com');
    await page.getByPlaceholder('••••••••').fill('TestPassword123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/operator/pipeline', { timeout: 15000 });

    await page.goto('/operator/failures');
    await expect(page.getByText('403')).toBeVisible();
    await expect(page.getByText("You don't have permission to access this page.")).toBeVisible();
  });

  test('should allow operator to access failures page', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByPlaceholder('••••••••').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/operator/pipeline', { timeout: 15000 });

    await page.goto('/operator/failures');
    await expect(page.getByRole('heading', { name: 'Validation Failures' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('should display filters', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByPlaceholder('••••••••').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/operator/pipeline', { timeout: 15000 });
    await page.goto('/operator/failures');

    await expect(page.getByRole('heading', { name: 'Validation Failures' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('Content Type')).toBeVisible();
    await expect(page.getByText('Time Range')).toBeVisible();
    await expect(page.getByRole('combobox').first()).toBeVisible();
  });

  test('should show empty state when no failures', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByPlaceholder('••••••••').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/operator/pipeline', { timeout: 15000 });
    await page.goto('/operator/failures');

    await expect(page.getByRole('heading', { name: 'Validation Failures' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('No validation failures found')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('All content is passing validation')).toBeVisible();
  });

  test('should display failures link in header for operator', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByPlaceholder('••••••••').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/operator/pipeline', { timeout: 15000 });
    await expect(page.getByRole('link', { name: 'Failures' })).toBeVisible({ timeout: 10000 });
  });
});
