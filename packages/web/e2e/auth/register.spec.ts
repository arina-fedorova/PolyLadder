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

    await registerPage.register({
      email: uniqueEmail,
      password: 'TestPassword123',
      confirmPassword: 'TestPassword123',
    });

    // Should navigate to dashboard after auto-login
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 });

    // Verify user is logged in by checking for some dashboard element
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
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

    // Should navigate to dashboard after auto-login
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 });
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
    await registerPage.register({
      email: existingEmail,
      password: 'TestPassword123',
      confirmPassword: 'TestPassword123',
    });

    // Should show error (exact message may vary)
    await expect(registerPage.errorMessage).toBeVisible({ timeout: 10000 });
    const errorText = await registerPage.getErrorText();
    expect(errorText).toBeTruthy();
    expect(errorText!.length).toBeGreaterThan(0);
  });

  test('should register with different base languages', async ({ page }) => {
    const registerPage = new RegisterPage(page);

    const languages = ['EN', 'ES', 'PT', 'IT', 'SL'];

    for (const lang of languages) {
      await cleanupTestData(); // Clean between iterations
      await registerPage.goto();

      const uniqueEmail = `test-${lang.toLowerCase()}-${Date.now()}@example.com`;

      await registerPage.emailInput.fill(uniqueEmail);
      await registerPage.passwordInput.fill('TestPassword123');
      await registerPage.confirmPasswordInput.fill('TestPassword123');
      await registerPage.baseLanguageSelect.selectOption(lang);
      await registerPage.submitButton.click();

      // Should navigate to dashboard
      await expect(page).toHaveURL('/dashboard', { timeout: 10000 });
    }
  });
});
