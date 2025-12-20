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
    await expect(registerPage.baseLanguageSelect).toBeVisible();
    await expect(registerPage.roleSelect).toBeVisible();
    await expect(registerPage.submitButton).toBeVisible();
    await expect(registerPage.signInLink).toBeVisible();
  });

  test('should show validation error for invalid email', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    await registerPage.emailInput.fill('invalid-email');
    await registerPage.emailInput.blur();

    await expect(page.getByText('Invalid email address')).toBeVisible();
  });

  test('should show validation error for weak password', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    await registerPage.emailInput.fill('test@example.com');
    await registerPage.passwordInput.fill('weak');
    await registerPage.confirmPasswordInput.fill('weak');
    await registerPage.submitButton.click();

    await expect(page.getByText('Password must be at least 8 characters')).toBeVisible();
  });

  test('should show validation error when passwords do not match', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    await registerPage.emailInput.fill('test@example.com');
    await registerPage.passwordInput.fill('Password123');
    await registerPage.confirmPasswordInput.fill('DifferentPass123');
    await registerPage.submitButton.click();

    await expect(page.getByText("Passwords don't match")).toBeVisible();
  });

  test('should show error when password lacks uppercase letter', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    await registerPage.emailInput.fill('test@example.com');
    await registerPage.passwordInput.fill('password123');
    await registerPage.confirmPasswordInput.fill('password123');
    await registerPage.submitButton.click();

    await expect(
      page.getByText('Password must contain at least one uppercase letter')
    ).toBeVisible();
  });

  test('should show error when password lacks number', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    await registerPage.emailInput.fill('test@example.com');
    await registerPage.passwordInput.fill('PasswordOnly');
    await registerPage.confirmPasswordInput.fill('PasswordOnly');
    await registerPage.submitButton.click();

    await expect(page.getByText('Password must contain at least one number')).toBeVisible();
  });

  test('should submit button be disabled while submitting', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    // Mock API to add delay for observing loading state
    await page.route('**/api/v1/auth/register', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 400,
        body: JSON.stringify({ error: { message: 'Email already exists' } }),
      });
    });

    await registerPage.emailInput.fill('test@example.com');
    await registerPage.passwordInput.fill('Password123');
    await registerPage.confirmPasswordInput.fill('Password123');

    // Click and immediately check loading state
    const submitPromise = registerPage.submitButton.click();
    await expect(registerPage.submitButton).toHaveText('Creating account...');
    await expect(registerPage.submitButton).toBeDisabled();
    await submitPromise;
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

  test('should show base language explanation', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    await expect(page.getByText('The language used for UI and explanations')).toBeVisible();
  });
});
