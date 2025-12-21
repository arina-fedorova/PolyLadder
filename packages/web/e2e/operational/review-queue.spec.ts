import { test, expect } from '@playwright/test';
import { cleanupTestData, createTestUser } from '../../playwright/db-helpers';

test.describe('Review Queue', () => {
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

    await page.goto('/operator/review-queue');
    await expect(page.getByText('403')).toBeVisible();
    await expect(page.getByText("You don't have permission to access this page.")).toBeVisible();
  });

  test('should allow operator to access review queue', async ({ page }) => {
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

    await page.goto('/operator/review-queue');
    await expect(page.getByRole('heading', { name: 'Review Queue' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/items awaiting review/)).toBeVisible();
  });

  test('should display content type filter', async ({ page }) => {
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

    await page.goto('/operator/review-queue');
    await expect(page.getByRole('heading', { name: 'Review Queue' })).toBeVisible({
      timeout: 10000,
    });

    const filterSelect = page.locator('select').first();
    await expect(filterSelect).toBeVisible();

    await expect(filterSelect.locator('option[value="all"]')).toHaveText('All Types');
    await expect(filterSelect.locator('option[value="vocabulary"]')).toHaveText('Vocabulary');
    await expect(filterSelect.locator('option[value="grammar"]')).toHaveText('Grammar');
    await expect(filterSelect.locator('option[value="orthography"]')).toHaveText('Orthography');
  });

  test('should display table headers', async ({ page }) => {
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

    await page.goto('/operator/review-queue');
    await expect(page.getByRole('heading', { name: 'Review Queue' })).toBeVisible({
      timeout: 10000,
    });

    await expect(page.getByRole('columnheader', { name: 'Type' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Content' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Language' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Level' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Validated' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Actions' })).toBeVisible();
  });
});
