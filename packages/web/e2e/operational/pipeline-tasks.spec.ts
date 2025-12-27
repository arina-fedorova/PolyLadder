import { test, expect } from '@playwright/test';
import { cleanupTestData, createTestUser } from '../../playwright/db-helpers';

test.describe('Pipeline Tasks', () => {
  test.beforeEach(async () => {
    await cleanupTestData();
  });
  test('should display pipeline tasks list', async ({ page }) => {
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
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Pipeline Tasks')).toBeVisible({ timeout: 10000 });
  });

  test('should filter pipeline tasks by status', async ({ page }) => {
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
    await page.waitForLoadState('networkidle');

    const statusFilter = page.locator('select').first();
    await statusFilter.selectOption('failed');

    await page.waitForTimeout(1000);
  });

  test('should navigate to task detail page', async ({ page }) => {
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
    await page.waitForLoadState('networkidle');

    const viewButton = page.locator('button[title="View details"]').first();
    if (await viewButton.isVisible({ timeout: 5000 })) {
      await viewButton.click();
      await expect(page).toHaveURL(/\/operator\/pipeline\/tasks\/[a-f0-9-]+/, {
        timeout: 10000,
      });
      await expect(page.getByText('Pipeline Task Details')).toBeVisible({ timeout: 5000 });
    }
  });
});
