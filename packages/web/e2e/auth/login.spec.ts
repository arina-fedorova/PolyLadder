import { test, expect } from '@playwright/test';
import { LoginPage } from '../helpers/page-objects/LoginPage';
import { cleanupTestData, createTestUser } from '../../playwright/db-helpers';

test.describe('Login Page', () => {
  // Clean up database before each test
  test.beforeEach(async () => {
    await cleanupTestData();
  });

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

  test('should successfully login with valid credentials', async ({ page }) => {
    // Create test user in database
    await createTestUser({
      email: 'testuser@example.com',
      password: 'TestPassword123',
      role: 'learner',
    });

    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login('testuser@example.com', 'TestPassword123');

    // Should navigate to dashboard
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 });
  });

  test('should successfully login as operator', async ({ page }) => {
    // Create operator user in database
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login('operator@example.com', 'OperatorPass123');

    // Should navigate to dashboard
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 });
  });
});
