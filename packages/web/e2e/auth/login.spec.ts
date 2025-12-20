import { test, expect } from '@playwright/test';
import { LoginPage } from '../helpers/page-objects/LoginPage';

test.describe('Login Page', () => {
  test('should display login form', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await expect(page.getByRole('heading', { name: 'PolyLadder' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
    await expect(loginPage.signUpLink).toBeVisible();
  });

  test('should navigate to register page when clicking sign up link', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.signUpLink.click();

    await expect(page).toHaveURL('/register');
  });

  test('should show error for invalid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login('nonexistent@example.com', 'WrongPassword123');

    // Wait for error message to appear
    await expect(loginPage.errorMessage).toBeVisible({ timeout: 10000 });

    // Should show some error message (exact message may vary)
    const errorText = await loginPage.getErrorText();
    expect(errorText).toBeTruthy();
    expect(errorText!.length).toBeGreaterThan(0);
  });

  // Successful login test will be added when we have test database with known users
  test.skip('should successfully login with valid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login('testuser@example.com', 'TestPassword123');

    // Should navigate to dashboard
    await expect(page).toHaveURL('/dashboard');
  });
});
