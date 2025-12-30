import { test, expect } from '@playwright/test';
import { cleanupTestData, createTestUser, completeOnboarding } from '../../playwright/db-helpers';

test.describe('Document Library Page', () => {
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

    await expect(page).toHaveURL('/dashboard', { timeout: 15000 });

    await page.goto('/operator/documents');
    await expect(page.getByText('403')).toBeVisible();
    await expect(page.getByText("You don't have permission to access this page.")).toBeVisible();
  });

  test('should allow operator to access document library', async ({ page }) => {
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

    await page.goto('/operator/documents');
    await expect(page.getByRole('heading', { name: 'Document Library' })).toBeVisible();
  });

  test('should display empty state when no documents', async ({ page }) => {
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

    await page.goto('/operator/documents');
    await expect(page.getByRole('heading', { name: 'Document Library' })).toBeVisible();

    await expect(page.getByText('No documents yet')).toBeVisible();
    await expect(page.getByText('Upload a PDF textbook to get started')).toBeVisible();
  });

  test('should display upload button', async ({ page }) => {
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

    await page.goto('/operator/documents');
    await expect(page.getByRole('heading', { name: 'Document Library' })).toBeVisible();

    await expect(page.getByRole('button', { name: /Upload Document/ })).toBeVisible();
  });

  test('should open upload modal when clicking upload button', async ({ page }) => {
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

    await page.goto('/operator/documents');
    await expect(page.getByRole('heading', { name: 'Document Library' })).toBeVisible();

    await page.getByRole('button', { name: /Upload Document/ }).click();

    await expect(page.getByRole('heading', { name: 'Upload Document' })).toBeVisible();
    await expect(page.getByText('File (PDF or DOCX)')).toBeVisible();
    await expect(page.getByText('Language')).toBeVisible();
    await expect(page.getByText('Document Type')).toBeVisible();
  });

  test('should display documents link in header for operator', async ({ page }) => {
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

    await expect(page.getByRole('link', { name: 'Documents' })).toBeVisible();

    await page.getByRole('link', { name: 'Documents' }).click();

    await expect(page).toHaveURL('/operator/documents');
    await expect(page.getByRole('heading', { name: 'Document Library' })).toBeVisible();
  });

  test('should close upload modal when clicking cancel', async ({ page }) => {
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

    await page.goto('/operator/documents');
    await expect(page.getByRole('heading', { name: 'Document Library' })).toBeVisible();

    await page.getByRole('button', { name: /Upload Document/ }).click();
    await expect(page.getByRole('heading', { name: 'Upload Document' })).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('heading', { name: 'Upload Document' })).not.toBeVisible();
  });
});
