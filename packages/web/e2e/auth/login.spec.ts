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
    await createTestUser({
      email: 'testuser@example.com',
      password: 'TestPassword123',
      role: 'learner',
    });

    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.emailInput.fill('testuser@example.com');
    await loginPage.passwordInput.fill('TestPassword123');
    await loginPage.submitButton.click();

    // Should navigate to dashboard
    await expect(page).toHaveURL('/dashboard', { timeout: 15000 });
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

    await loginPage.emailInput.fill('operator@example.com');
    await loginPage.passwordInput.fill('OperatorPass123');
    await loginPage.submitButton.click();

    // Should navigate to dashboard
    await expect(page).toHaveURL('/dashboard', { timeout: 15000 });
  });
});
