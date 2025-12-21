import { test, expect } from '@playwright/test';
import { cleanupTestData, createTestUser } from '../../playwright/db-helpers';

test.describe('Mapping Review Page', () => {
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
    await page.getByLabel('Password').fill('TestPassword123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/dashboard');

    await page.goto('/operator/mappings');
    await expect(page.getByText('403')).toBeVisible();
    await expect(page.getByText("You don't have permission to access this page.")).toBeVisible();
  });

  test('should allow operator to access mapping review page', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByLabel('Password').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/dashboard');

    await page.goto('/operator/mappings');
    await expect(page.getByRole('heading', { name: 'Review Content Mappings' })).toBeVisible();
  });

  test('should display empty state when no mappings', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByLabel('Password').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/dashboard');

    await page.goto('/operator/mappings');
    await expect(page.getByRole('heading', { name: 'Review Content Mappings' })).toBeVisible();
    await expect(page.getByText('All mappings reviewed!')).toBeVisible();
    await expect(page.getByText('No pending mappings to review.')).toBeVisible();
  });

  test('should display pending review count', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByLabel('Password').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/dashboard');

    await page.goto('/operator/mappings');
    await expect(page.getByText(/\d+ pending review/)).toBeVisible();
  });

  test('should display mappings link in header for operator', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByLabel('Password').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/dashboard');

    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: 'Mappings' })).toBeVisible();

    await page.getByRole('link', { name: 'Mappings' }).click();
    await expect(page).toHaveURL('/operator/mappings');
    await expect(page.getByRole('heading', { name: 'Review Content Mappings' })).toBeVisible();
  });

  test('should not display bulk confirm button when no high confidence mappings', async ({
    page,
  }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByLabel('Password').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/dashboard');

    await page.goto('/operator/mappings');
    await expect(page.getByRole('heading', { name: 'Review Content Mappings' })).toBeVisible();

    const bulkConfirmButton = page.getByRole('button', {
      name: /Confirm All High Confidence/,
    });
    await expect(bulkConfirmButton).not.toBeVisible();
  });
});
