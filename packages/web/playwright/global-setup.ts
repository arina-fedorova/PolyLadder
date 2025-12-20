import { FullConfig } from '@playwright/test';
import { exec, ChildProcess } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Extend global to store API process
declare global {
  var apiProcess: ChildProcess | undefined;

  var dockerStarted: boolean | undefined;
}

// Helper to check if a service is running
async function isServiceRunning(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

// Helper to wait for service to be ready
async function waitForService(
  url: string,
  maxAttempts: number,
  intervalMs: number
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (await isServiceRunning(url)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

// Get the project root directory
function getProjectRoot(): string {
  const cwd = process.cwd();
  // Handle both running from packages/web and from project root
  if (cwd.endsWith('packages/web') || cwd.endsWith('packages\\web')) {
    return cwd.replace(/[/\\]packages[/\\]web$/, '');
  }
  return cwd;
}

async function globalSetup(_config: FullConfig): Promise<void> {
  const isCI = process.env.CI === 'true';
  const projectRoot = getProjectRoot();
  const apiUrl = 'http://localhost:3001/health';

  // eslint-disable-next-line no-console
  console.log('\n🚀 Starting E2E test environment setup...\n');
  // eslint-disable-next-line no-console
  console.log(`   Project root: ${projectRoot}`);
  // eslint-disable-next-line no-console
  console.log(`   CI mode: ${isCI}\n`);

  // Check if API is already running (e.g., started manually for debugging)
  if (await isServiceRunning(apiUrl)) {
    // eslint-disable-next-line no-console
    console.log('✅ API server is already running, skipping setup');
    global.dockerStarted = false;
    return;
  }

  // In CI, we rely on the service containers defined in the workflow
  // Locally, we start Docker ourselves
  if (!isCI) {
    // 1. Start E2E database
    // eslint-disable-next-line no-console
    console.log('📦 Starting PostgreSQL container for E2E tests...');
    try {
      await execAsync('docker compose -f docker/docker-compose.e2e.yml up -d', {
        cwd: projectRoot,
      });
      global.dockerStarted = true;
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
        cwd: projectRoot,
        env: {
          ...process.env,
          DATABASE_URL:
            process.env.DATABASE_URL ||
            'postgres://test_e2e:test_e2e_password@localhost:5433/polyladder_e2e',
        },
      });
      // eslint-disable-next-line no-console
      console.log('✅ Migrations completed');
    } catch (error) {
      console.error('❌ Failed to run migrations:', error);
      throw error;
    }
  } else {
    // In CI, run migrations against the CI database
    // eslint-disable-next-line no-console
    console.log('🔧 Running database migrations (CI mode)...');
    try {
      await execAsync('pnpm --filter @polyladder/db migrate up', {
        cwd: projectRoot,
        env: {
          ...process.env,
        },
      });
      // eslint-disable-next-line no-console
      console.log('✅ Migrations completed');
    } catch (error) {
      console.error('❌ Failed to run migrations:', error);
      throw error;
    }
  }

  // 4. Start API server in background
  // eslint-disable-next-line no-console
  console.log('🌐 Starting API server...');

  const apiEnv = {
    ...process.env,
    DATABASE_URL:
      process.env.DATABASE_URL ||
      'postgres://test_e2e:test_e2e_password@localhost:5433/polyladder_e2e',
    JWT_SECRET: process.env.JWT_SECRET || 'test-secret-key-for-e2e-tests-min-32-chars-long',
    PORT: '3001',
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
  };

  const apiProcess = exec('pnpm --filter @polyladder/api dev', {
    cwd: projectRoot,
    env: apiEnv,
  });

  apiProcess.on('error', (error) => {
    console.error('API server error:', error);
  });

  // Store process for cleanup
  global.apiProcess = apiProcess;

  // 5. Wait for API to be ready
  // eslint-disable-next-line no-console
  console.log('⏳ Waiting for API server to be ready...');

  const apiReady = await waitForService(apiUrl, 60, 1000);

  if (!apiReady) {
    throw new Error('API server failed to start within timeout (60 seconds)');
  }

  // eslint-disable-next-line no-console
  console.log('✅ API server is ready');
  // eslint-disable-next-line no-console
  console.log('\n✨ E2E test environment ready!\n');
}

export default globalSetup;
