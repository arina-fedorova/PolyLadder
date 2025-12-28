import { test, expect } from '@playwright/test';
import { cleanupTestData, createTestUser } from '../../playwright/db-helpers';

test.describe('Corpus Explorer', () => {
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

    await expect(page).toHaveURL('/dashboard', { timeout: 15000 });

    await page.goto('/operator/corpus');
    await expect(page.getByText('403')).toBeVisible();
    await expect(page.getByText("You don't have permission to access this page.")).toBeVisible();
  });

  test('should allow operator to access corpus explorer', async ({ page }) => {
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

    await page.goto('/operator/corpus');
    await expect(page.getByRole('heading', { name: 'Approved Corpus Explorer' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('should display search and filters', async ({ page }) => {
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
    await page.goto('/operator/corpus');

    await expect(page.getByRole('heading', { name: 'Approved Corpus Explorer' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByPlaceholder('Search text, titles, prompts...')).toBeVisible();
    await expect(page.getByText('Content Type')).toBeVisible();
    await expect(page.getByText('CEFR Level')).toBeVisible();
  });

  test('should show empty state when no items', async ({ page }) => {
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
    await page.goto('/operator/corpus');

    await expect(page.getByRole('heading', { name: 'Approved Corpus Explorer' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('No items found')).toBeVisible({ timeout: 10000 });
  });

  test('should display corpus link in header for operator', async ({ page }) => {
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
    await expect(page.getByRole('link', { name: 'Corpus' })).toBeVisible({ timeout: 10000 });
  });

  test('should toggle statistics panel', async ({ page }) => {
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
    await page.goto('/operator/corpus');

    await expect(page.getByRole('heading', { name: 'Approved Corpus Explorer' })).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole('button', { name: 'Show Stats' }).click();
    await expect(page.getByText('Total Items')).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: 'Hide Stats' }).click();
    await expect(page.getByText('Total Items')).not.toBeVisible({ timeout: 5000 });
  });
});
