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

  test('should show validation error for invalid email', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.emailInput.fill('invalid-email');
    await loginPage.emailInput.blur();
    await expect(page.getByText('Invalid email address')).toBeVisible();
  });

  test('should show validation error for empty password', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.emailInput.fill('test@example.com');
    await loginPage.passwordInput.focus();
    await loginPage.passwordInput.blur();

    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login('wrong@example.com', 'wrongpassword');

    // Wait for error message to appear
    await expect(loginPage.errorMessage).toBeVisible({ timeout: 10000 });

    const errorText = await loginPage.getErrorText();
    expect(errorText).toContain('Invalid email or password');
  });

  test('should submit button be disabled while submitting', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Mock API to add delay for observing loading state
    await page.route('**/api/v1/auth/login', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 401,
        body: JSON.stringify({ error: { message: 'Invalid credentials' } }),
      });
    });

    await loginPage.emailInput.fill('test@example.com');
    await loginPage.passwordInput.fill('password123');

    // Click and immediately check loading state
    const submitPromise = loginPage.submitButton.click();
    await expect(loginPage.submitButton).toHaveText('Signing in...');
    await expect(loginPage.submitButton).toBeDisabled();
    await submitPromise;
  });

  test('should navigate to register page when clicking sign up link', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.signUpLink.click();

    await expect(page).toHaveURL('/register');
  });
});
