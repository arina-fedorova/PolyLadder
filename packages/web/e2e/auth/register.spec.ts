import { test, expect } from '@playwright/test';
import { RegisterPage } from '../helpers/page-objects/RegisterPage';
import { cleanupTestData, createTestUser } from '../../playwright/db-helpers';

test.describe('Register Page', () => {
  // Clean up database before each test
  test.beforeEach(async () => {
    await cleanupTestData();
  });

  test('should display registration form', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    await expect(page.getByRole('heading', { name: 'PolyLadder' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await expect(registerPage.emailInput).toBeVisible();
    await expect(registerPage.passwordInput).toBeVisible();
    await expect(registerPage.confirmPasswordInput).toBeVisible();
    await expect(registerPage.roleSelect).toBeVisible();
    await expect(registerPage.submitButton).toBeVisible();
    await expect(registerPage.signInLink).toBeVisible();
  });

  test('should navigate to login page when clicking sign in link', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    await registerPage.signInLink.click();

    await expect(page).toHaveURL('/login');
  });

  test('should show password requirements hint', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    await expect(
      page.getByText('At least 8 characters, with uppercase, lowercase, and number')
    ).toBeVisible();
  });

  test('should successfully register with valid data', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    const uniqueEmail = `test-${Date.now()}@example.com`;

    await registerPage.emailInput.fill(uniqueEmail);
    await registerPage.passwordInput.fill('TestPassword123');
    await registerPage.confirmPasswordInput.fill('TestPassword123');
    await registerPage.submitButton.click();

    // New learners should be redirected to onboarding
    await expect(page).toHaveURL('/onboarding', { timeout: 15000 });

    // Verify user is on onboarding page
    await expect(page.getByRole('heading', { name: 'Welcome to PolyLadder' })).toBeVisible();
  });

  test('should successfully register as operator', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    const uniqueEmail = `operator-${Date.now()}@example.com`;

    await registerPage.emailInput.fill(uniqueEmail);
    await registerPage.passwordInput.fill('OperatorPass123');
    await registerPage.confirmPasswordInput.fill('OperatorPass123');
    await registerPage.roleSelect.selectOption('operator');
    await registerPage.submitButton.click();

    // Should navigate to operator pipeline after auto-login
    await expect(page).toHaveURL('/operator/pipelines', { timeout: 15000 });
  });

  test('should show error when email already exists', async ({ page }) => {
    // Create user in database first
    const existingEmail = 'existing@example.com';
    await createTestUser({
      email: existingEmail,
      password: 'ExistingPassword123',
      role: 'learner',
    });

    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    // Try to register with same email
    await registerPage.emailInput.fill(existingEmail);
    await registerPage.passwordInput.fill('TestPassword123');
    await registerPage.confirmPasswordInput.fill('TestPassword123');
    await registerPage.submitButton.click();

    // Should show error (role="alert")
    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert).toBeVisible({ timeout: 15000 });

    const errorText = await errorAlert.textContent();
    expect(errorText).toBeTruthy();
    expect(errorText!.length).toBeGreaterThan(0);
  });

  test('should register with Spanish base language', async ({ page }) => {
    await cleanupTestData();
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    const uniqueEmail = `test-es-${Date.now()}@example.com`;

    await registerPage.emailInput.fill(uniqueEmail);
    await registerPage.passwordInput.fill('TestPassword123');
    await registerPage.confirmPasswordInput.fill('TestPassword123');
    await registerPage.baseLanguageSelect.selectOption('ES');
    await registerPage.submitButton.click();

    // New learners should be redirected to onboarding
    await expect(page).toHaveURL('/onboarding', { timeout: 15000 });
  });
});
