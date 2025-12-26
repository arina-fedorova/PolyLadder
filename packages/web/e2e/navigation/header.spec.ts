import { test, expect } from '@playwright/test';
import { cleanupTestData, createTestUser } from '../../playwright/db-helpers';

test.describe('Header Navigation', () => {
  test.beforeEach(async () => {
    await cleanupTestData();
  });

  test('should display user email in header after login', async ({ page }) => {
    await createTestUser({
      email: 'user@example.com',
      password: 'TestPassword123',
      role: 'learner',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('user@example.com');
    await page.getByPlaceholder('••••••••').fill('TestPassword123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/dashboard', { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Learner Dashboard' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('user@example.com')).toBeVisible({ timeout: 5000 });
  });

  test('should show learner navigation links for learner', async ({ page }) => {
    await createTestUser({
      email: 'learner@example.com',
      password: 'TestPassword123',
      role: 'learner',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('learner@example.com');
    await page.getByPlaceholder('••••••••').fill('TestPassword123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/dashboard', { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Learner Dashboard' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('link', { name: 'Learn' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Review' })).toBeVisible();
  });

  test('should show operator navigation links for operator', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByPlaceholder('••••••••').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/operator/dashboard', { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Pipeline Dashboard' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('link', { name: 'Pipeline' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('link', { name: 'Review Queue' })).toBeVisible();
  });

  test('should logout and redirect to login page', async ({ page }) => {
    await createTestUser({
      email: 'user@example.com',
      password: 'TestPassword123',
      role: 'learner',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('user@example.com');
    await page.getByPlaceholder('••••••••').fill('TestPassword123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/dashboard', { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Learner Dashboard' })).toBeVisible({
      timeout: 10000,
    });
    await page.getByText('user@example.com').click();
    await page.getByText('Logout').click();

    await expect(page).toHaveURL('/login', { timeout: 10000 });
  });

  test('should show user role in dropdown menu', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByPlaceholder('••••••••').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/operator/dashboard', { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Pipeline Dashboard' })).toBeVisible({
      timeout: 10000,
    });
    await page.getByText('operator@example.com').click();
    await expect(page.locator('.capitalize').filter({ hasText: 'operator' })).toBeVisible();
  });
});
