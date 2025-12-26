import { test, expect } from '@playwright/test';
import { cleanupTestData, createTestUser } from '../../playwright/db-helpers';

test.describe('Curriculum Page', () => {
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

    await expect(page).toHaveURL('/dashboard');

    await page.goto('/operator/curriculum');
    await expect(page.getByText('403')).toBeVisible();
    await expect(page.getByText("You don't have permission to access this page.")).toBeVisible();
  });

  test('should allow operator to access curriculum page', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByPlaceholder('••••••••').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/dashboard');

    await page.goto('/operator/curriculum');
    await expect(page.getByRole('heading', { name: 'Curriculum Structure' })).toBeVisible();
  });

  test('should display language selector with all supported languages', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByPlaceholder('••••••••').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/dashboard');

    await page.goto('/operator/curriculum');
    await expect(page.getByRole('heading', { name: 'Curriculum Structure' })).toBeVisible();

    const languageSelect = page.locator('select').first();
    await expect(languageSelect).toBeVisible();

    await expect(languageSelect.locator('option[value="ES"]')).toHaveText('Spanish');
    await expect(languageSelect.locator('option[value="IT"]')).toHaveText('Italian');
    await expect(languageSelect.locator('option[value="PT"]')).toHaveText('Portuguese');
    await expect(languageSelect.locator('option[value="SL"]')).toHaveText('Slovenian');
  });

  test('should display all CEFR levels', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByPlaceholder('••••••••').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/dashboard');

    await page.goto('/operator/curriculum');
    await expect(page.getByRole('heading', { name: 'Curriculum Structure' })).toBeVisible();

    await expect(page.getByRole('button', { name: /A0.*Beginner/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /A1.*Elementary/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /A2.*Pre-Intermediate/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /B1.*Intermediate/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /B2.*Upper-Intermediate/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /C1.*Advanced/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /C2.*Mastery/ })).toBeVisible();
  });

  test('should expand and collapse level sections', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByPlaceholder('••••••••').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/dashboard');

    await page.goto('/operator/curriculum');
    await expect(page.getByRole('heading', { name: 'Curriculum Structure' })).toBeVisible();

    const levelButton = page.locator('button').filter({ hasText: 'A1' }).first();
    await levelButton.click();

    await expect(page.getByRole('heading', { name: 'Topics' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add Topic/ })).toBeVisible();

    await levelButton.click();

    await expect(page.getByRole('heading', { name: 'Topics' })).not.toBeVisible();
  });

  test('should display topics when level is expanded', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByPlaceholder('••••••••').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/dashboard');

    await page.goto('/operator/curriculum');
    await expect(page.getByRole('heading', { name: 'Curriculum Structure' })).toBeVisible();

    const levelButton = page.locator('button').filter({ hasText: 'A1' }).first();
    await levelButton.click();

    await expect(page.getByRole('heading', { name: 'Topics' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add Topic/ })).toBeVisible();
  });

  test('should add a new topic', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByPlaceholder('••••••••').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/dashboard');

    await page.goto('/operator/curriculum');
    await expect(page.getByRole('heading', { name: 'Curriculum Structure' })).toBeVisible();

    const levelButton = page.locator('button').filter({ hasText: 'A1' }).first();
    await levelButton.click();

    await page.getByRole('button', { name: /Add Topic/ }).click();

    await expect(page.getByText('New Topic')).toBeVisible();
  });

  test('should display curriculum link in header for operator', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByPlaceholder('••••••••').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/dashboard');

    await expect(page.getByRole('link', { name: 'Curriculum' })).toBeVisible();

    await page.getByRole('link', { name: 'Curriculum' }).click();

    await expect(page).toHaveURL('/operator/curriculum');
    await expect(page.getByRole('heading', { name: 'Curriculum Structure' })).toBeVisible();
  });
});
