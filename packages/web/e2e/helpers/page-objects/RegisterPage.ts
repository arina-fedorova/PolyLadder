import { Page, Locator } from '@playwright/test';

export class RegisterPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly baseLanguageSelect: Locator;
  readonly roleSelect: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly signInLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email address');
    this.passwordInput = page.getByLabel(/^Password$/);
    this.confirmPasswordInput = page.getByLabel('Confirm Password');
    this.baseLanguageSelect = page.getByLabel('Base Language (for instructions)');
    this.roleSelect = page.getByLabel('Account Type');
    this.submitButton = page.getByRole('button', { name: 'Create account' });
    this.errorMessage = page.getByRole('alert');
    this.signInLink = page.getByRole('link', { name: 'Sign in' });
  }

  async goto() {
    await this.page.goto('/register');
  }

  async register(data: {
    email: string;
    password: string;
    confirmPassword: string;
    baseLanguage?: string;
    role?: string;
  }) {
    await this.emailInput.fill(data.email);
    await this.passwordInput.fill(data.password);
    await this.confirmPasswordInput.fill(data.confirmPassword);

    if (data.baseLanguage) {
      await this.baseLanguageSelect.selectOption(data.baseLanguage);
    }

    if (data.role) {
      await this.roleSelect.selectOption(data.role);
    }

    await this.submitButton.click();
  }

  async isErrorVisible() {
    return this.errorMessage.isVisible();
  }

  async getErrorText() {
    return this.errorMessage.textContent();
  }
}
