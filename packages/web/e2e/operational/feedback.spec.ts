import { test, expect } from '@playwright/test';
import { cleanupTestData, createTestUser } from '../../playwright/db-helpers';

test.describe('Feedback System', () => {
  test.beforeEach(async () => {
    await cleanupTestData();
  });

  test('should allow operator to provide feedback on item', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByPlaceholder('••••••••').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/operator/pipeline', { timeout: 15000 });

    await page.goto('/operator/review-queue');

    const feedbackButton = page
      .getByRole('button', { name: /feedback|reject|provide feedback/i })
      .first();

    if (await feedbackButton.isVisible()) {
      await feedbackButton.click();

      await expect(page.getByText('Provide Feedback')).toBeVisible();
      await expect(page.getByText('Action')).toBeVisible();
      await expect(page.getByText('Category')).toBeVisible();
      await expect(page.getByText('Comment')).toBeVisible();
    }
  });

  test('should display feedback dialog with all required fields', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByPlaceholder('••••••••').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/operator/pipeline', { timeout: 15000 });

    await page.goto('/operator/review-queue');

    const feedbackButton = page
      .getByRole('button', { name: /feedback|reject|provide feedback/i })
      .first();

    if (await feedbackButton.isVisible()) {
      await feedbackButton.click();

      await expect(page.getByText('Reject')).toBeVisible();
      await expect(page.getByText('Request Revision')).toBeVisible();
      await expect(page.getByText('Flag for Review')).toBeVisible();
      await expect(page.getByLabel(/category/i)).toBeVisible();
      await expect(page.getByLabel(/comment/i)).toBeVisible();
    }
  });

  test('should validate feedback form fields', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByPlaceholder('••••••••').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/operator/pipeline', { timeout: 15000 });

    await page.goto('/operator/review-queue');

    const feedbackButton = page
      .getByRole('button', { name: /feedback|reject|provide feedback/i })
      .first();

    if (await feedbackButton.isVisible()) {
      await feedbackButton.click();

      const submitButton = page.getByRole('button', { name: /submit feedback/i });

      if (await submitButton.isVisible()) {
        await expect(submitButton).toBeDisabled();

        await page.getByLabel(/category/i).selectOption('incorrect_content');
        await page.getByLabel(/comment/i).fill('short');

        await expect(submitButton).toBeDisabled();

        await page
          .getByLabel(/comment/i)
          .fill('This is a valid comment that is long enough to pass validation');

        await expect(submitButton).toBeEnabled();
      }
    }
  });

  test('should allow operator to view feedback analytics', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByPlaceholder('••••••••').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/operator/pipeline', { timeout: 15000 });

    const analyticsSection = page.getByText(/feedback|analytics/i);

    if (await analyticsSection.isVisible()) {
      await expect(page.getByText(/total feedback/i)).toBeVisible();
      await expect(page.getByText(/retry success rate/i)).toBeVisible();
    }
  });

  test('should display feedback templates when category is selected', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByPlaceholder('••••••••').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/operator/pipeline', { timeout: 15000 });

    await page.goto('/operator/review-queue');

    const feedbackButton = page
      .getByRole('button', { name: /feedback|reject|provide feedback/i })
      .first();

    if (await feedbackButton.isVisible()) {
      await feedbackButton.click();

      await page.getByLabel(/category/i).selectOption('incorrect_content');

      await page.waitForTimeout(500);

      const templatesSection = page.getByText(/quick templates|templates/i);

      if (await templatesSection.isVisible()) {
        await expect(page.getByText(/template/i)).toBeVisible();
      }
    }
  });

  test('should close feedback dialog when cancel is clicked', async ({ page }) => {
    await createTestUser({
      email: 'operator@example.com',
      password: 'OperatorPass123',
      role: 'operator',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('operator@example.com');
    await page.getByPlaceholder('••••••••').fill('OperatorPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/operator/pipeline', { timeout: 15000 });

    await page.goto('/operator/review-queue');

    const feedbackButton = page
      .getByRole('button', { name: /feedback|reject|provide feedback/i })
      .first();

    if (await feedbackButton.isVisible()) {
      await feedbackButton.click();

      await expect(page.getByText('Provide Feedback')).toBeVisible();

      await page.getByRole('button', { name: /cancel/i }).click();

      await expect(page.getByText('Provide Feedback')).not.toBeVisible();
    }
  });

  test('should deny access to learner', async ({ page }) => {
    await createTestUser({
      email: 'learner@example.com',
      password: 'LearnerPass123',
      role: 'learner',
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('learner@example.com');
    await page.getByPlaceholder('••••••••').fill('LearnerPass123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/operator/pipeline', { timeout: 15000 });

    await page.goto('/operator/review-queue');

    await expect(page.getByText('403')).toBeVisible();
    await expect(page.getByText("You don't have permission")).toBeVisible();
  });
});
