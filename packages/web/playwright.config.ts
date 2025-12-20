import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Run tests serially for database consistency
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to avoid database conflicts
  reporter: [['html'], ['junit', { outputFile: 'test-results/junit.xml' }], ['list']],
  globalSetup: resolve(__dirname, './playwright/global-setup.ts'),
  globalTeardown: resolve(__dirname, './playwright/global-teardown.ts'),
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_API_URL: process.env.VITE_API_URL || 'http://localhost:3001/api/v1',
    },
  },
});
