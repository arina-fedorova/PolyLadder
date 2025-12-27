import { test, expect } from '@playwright/test';
import { LoginPage } from '../helpers/page-objects/LoginPage';
import { cleanupTestData, createTestUser, getE2EPool } from '../../playwright/db-helpers';

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

    // Fill and submit the form
    await loginPage.emailInput.fill('nonexistent@example.com');
    await loginPage.passwordInput.fill('WrongPassword123');
    await loginPage.submitButton.click();

    // Wait for error message to appear (role="alert" in LoginPage.tsx)
    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert).toBeVisible({ timeout: 15000 });

    // Verify error text contains something
    const errorText = await errorAlert.textContent();
    expect(errorText).toBeTruthy();
    expect(errorText!.length).toBeGreaterThan(0);
  });

  test('should successfully login with valid credentials', async ({ page }) => {
    // Create test user in database
    const user = await createTestUser({
      email: 'testuser@example.com',
      password: 'TestPassword123',
      role: 'learner',
    });

    // Verify user was created
    expect(user.email).toBe('testuser@example.com');
    expect(user.role).toBe('learner');

    // Wait a bit to ensure user is committed and visible to API
    // Increased wait time to ensure database transaction is fully committed
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify user exists in database from API's perspective (using same connection string)
    const pool = getE2EPool();
    const verifyResult = await pool.query<{ id: string; email: string; role: string }>(
      'SELECT id, email, role FROM users WHERE email = $1',
      ['testuser@example.com']
    );
    if (verifyResult.rows.length === 0) {
      throw new Error('User not found in database after creation - this should not happen');
    }

    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Wait for login form to be ready
    await expect(loginPage.emailInput).toBeVisible();

    // Monitor network requests
    const loginResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/auth/login') && response.request().method() === 'POST',
      { timeout: 15000 }
    );

    await loginPage.emailInput.fill('testuser@example.com');
    await loginPage.passwordInput.fill('TestPassword123');
    await loginPage.submitButton.click();

    // Wait for login response
    const response = await loginResponse;
    const responseBody = (await response.json()) as {
      error?: { statusCode: number; message: string; code: string };
    };

    // Check if login was successful
    if (response.status() !== 200) {
      throw new Error(
        `Login failed with status ${response.status()}: ${JSON.stringify(responseBody)}\n` +
          `User created: ${JSON.stringify(user)}`
      );
    }

    // Should navigate to dashboard
    await expect(page).toHaveURL('/dashboard', { timeout: 15000 });
  });

  test('should successfully login as operator', async ({ page }) => {
    // Create operator user in database
    const user = await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    // Verify user was created
    expect(user.email).toBe('operator@example.com');
    expect(user.role).toBe('operator');

    // Wait a bit to ensure user is committed to database and API can see it
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Wait for page to be ready
    await expect(loginPage.emailInput).toBeVisible();

    await loginPage.emailInput.fill('operator@example.com');
    await loginPage.passwordInput.fill('OperatorPass123');
    await loginPage.submitButton.click();

    // Should navigate to operator pipeline
    await expect(page).toHaveURL('/operator/pipeline', { timeout: 15000 });
  });
});
