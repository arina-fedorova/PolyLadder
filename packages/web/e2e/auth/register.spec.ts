import { test, expect } from '@playwright/test';
import { RegisterPage } from '../helpers/page-objects/RegisterPage';

test.describe('Register Page', () => {
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

  // Successful registration test will be added when we have test database setup
  test.skip('should successfully register with valid data', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    await registerPage.register({
      email: `test-${Date.now()}@example.com`,
      password: 'TestPassword123',
      confirmPassword: 'TestPassword123',
    });

    // Should navigate to dashboard after auto-login
    await expect(page).toHaveURL('/dashboard');
  });

  // Skip this test for now - requires database cleanup between runs
  test.skip('should show error when email already exists', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    // First registration
    const testEmail = `duplicate-${Date.now()}@example.com`;
    await registerPage.register({
      email: testEmail,
      password: 'TestPassword123',
      confirmPassword: 'TestPassword123',
    });

    // Wait for first registration to complete (should redirect to dashboard)
    await page.waitForURL('/dashboard', { timeout: 10000 });

    // Navigate back to register page
    await registerPage.goto();

    // Try to register again with same email
    await registerPage.register({
      email: testEmail,
      password: 'TestPassword123',
      confirmPassword: 'TestPassword123',
    });

    // Should show error (exact message may vary)
    await expect(registerPage.errorMessage).toBeVisible({ timeout: 10000 });
    const errorText = await registerPage.getErrorText();
    expect(errorText).toBeTruthy();
    expect(errorText!.length).toBeGreaterThan(0);
  });
});
