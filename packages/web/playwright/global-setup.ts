import { chromium, FullConfig } from '@playwright/test';
import { exec, ChildProcess } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Extend global to store API process
declare global {
  var apiProcess: ChildProcess | undefined;
}

async function globalSetup(_config: FullConfig) {
  // eslint-disable-next-line no-console
  console.log('\n🚀 Starting E2E test environment setup...\n');

  // 1. Start E2E database
  // eslint-disable-next-line no-console
  console.log('📦 Starting PostgreSQL container for E2E tests...');
  try {
    await execAsync('docker compose -f docker/docker-compose.e2e.yml up -d', {
      cwd: process.cwd().replace(/packages[\\/]web$/, ''),
    });
    // eslint-disable-next-line no-console
    console.log('✅ PostgreSQL container started');
  } catch (error) {
    console.error('❌ Failed to start PostgreSQL container:', error);
    throw error;
  }

  // 2. Wait for database to be ready
  // eslint-disable-next-line no-console
  console.log('⏳ Waiting for database to be ready...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // 3. Run migrations
  // eslint-disable-next-line no-console
  console.log('🔧 Running database migrations...');
  try {
    await execAsync('pnpm --filter @polyladder/db migrate up', {
      cwd: process.cwd().replace(/packages[\\/]web$/, ''),
      env: {
        ...process.env,
        DATABASE_URL: 'postgres://test_e2e:test_e2e_password@localhost:5433/polyladder_e2e',
      },
    });
    // eslint-disable-next-line no-console
    console.log('✅ Migrations completed');
  } catch (error) {
    console.error('❌ Failed to run migrations:', error);
    throw error;
  }

  // 4. Start API server in background
  // eslint-disable-next-line no-console
  console.log('🌐 Starting API server...');
  const apiProcess = exec(
    'pnpm --filter @polyladder/api dev',
    {
      cwd: process.cwd().replace(/packages[\\/]web$/, ''),
      env: {
        ...process.env,
        DATABASE_URL: 'postgres://test_e2e:test_e2e_password@localhost:5433/polyladder_e2e',
        JWT_SECRET: 'test-secret-key-for-e2e-tests-min-32-chars-long',
        PORT: '3001',
        NODE_ENV: 'test',
        LOG_LEVEL: 'error',
      },
    },
    (error) => {
      if (error && !error.killed) {
        console.error('API server error:', error);
      }
    }
  );

  // Store process for cleanup
  global.apiProcess = apiProcess;

  // 5. Wait for API to be ready
  // eslint-disable-next-line no-console
  console.log('⏳ Waiting for API server to be ready...');
  const browser = await chromium.launch();
  const page = await browser.newPage();

  let apiReady = false;
  let attempts = 0;
  const maxAttempts = 30;

  while (!apiReady && attempts < maxAttempts) {
    try {
      const response = await page.goto('http://localhost:3001/health', {
        timeout: 2000,
        waitUntil: 'domcontentloaded',
      });
      if (response?.status() === 200) {
        apiReady = true;
        // eslint-disable-next-line no-console
        console.log('✅ API server is ready');
      }
    } catch {
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  await browser.close();

  if (!apiReady) {
    throw new Error('API server failed to start within timeout');
  }

  // eslint-disable-next-line no-console
  console.log('\n✨ E2E test environment ready!\n');
}

export default globalSetup;
