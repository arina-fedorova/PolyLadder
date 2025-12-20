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
    await page.getByLabel('Password').fill('TestPassword123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('user@example.com')).toBeVisible();
  });

  test('should show learner navigation links for learner', async ({ page }) => {
    await createTestUser({
      email: 'learner@example.com',
      password: 'TestPassword123',
      role: 'learner',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('learner@example.com');
    await page.getByLabel('Password').fill('TestPassword123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
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
    await page.getByLabel('Password').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('link', { name: 'Pipeline' })).toBeVisible();
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
    await page.getByLabel('Password').fill('TestPassword123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.getByText('user@example.com').click();

    await page.getByRole('button', { name: 'Logout' }).click();

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
    await page.getByLabel('Password').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.getByText('operator@example.com').click();

    await expect(page.getByText('operator', { exact: true })).toBeVisible();
  });
});
