import { FullConfig } from '@playwright/test';
import { exec, ChildProcess } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

declare global {
  var apiProcess: ChildProcess | undefined;
  var dockerStarted: boolean | undefined;
}

async function isServiceRunning(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

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

function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith('packages/web') || cwd.endsWith('packages\\web')) {
    return cwd.replace(/[/\\]packages[/\\]web$/, '');
  }
  return cwd;
}

async function startDockerDatabase(projectRoot: string): Promise<void> {
  console.log('📦 Starting PostgreSQL container...');
  await execAsync('docker compose -f docker/docker-compose.e2e.yml up -d', {
    cwd: projectRoot,
  });
  global.dockerStarted = true;
  console.log('✅ PostgreSQL container started');

  console.log('⏳ Waiting for database...');
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

async function runMigrations(projectRoot: string): Promise<void> {
  const isCI = process.env.CI === 'true';
  console.log(`🔧 Running migrations${isCI ? ' (CI mode)' : ''}...`);

  await execAsync('pnpm --filter @polyladder/db migrate up', {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ||
        'postgres://test_e2e:test_e2e_password@localhost:5433/polyladder_e2e',
    },
  });
  console.log('✅ Migrations completed');
}

function startApiServer(projectRoot: string): ChildProcess {
  console.log('🌐 Starting API server...');

  const apiProcess = exec('pnpm --filter @polyladder/api dev', {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ||
        'postgres://test_e2e:test_e2e_password@localhost:5433/polyladder_e2e',
      JWT_SECRET: process.env.JWT_SECRET || 'test-secret-key-for-e2e-tests-min-32-chars-long',
      PORT: '3001',
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
    },
  });

  apiProcess.on('error', (error) => {
    console.error('API server error:', error);
  });

  return apiProcess;
}

async function globalSetup(_config: FullConfig): Promise<void> {
  const isCI = process.env.CI === 'true';
  const projectRoot = getProjectRoot();
  const apiUrl = 'http://localhost:3001/health';

  console.log('\n🚀 Starting E2E test environment setup...\n');
  console.log(`   Project root: ${projectRoot}`);
  console.log(`   CI mode: ${isCI}\n`);

  if (await isServiceRunning(apiUrl)) {
    console.log('✅ API server is already running, skipping setup');
    global.dockerStarted = false;
    return;
  }

  try {
    if (!isCI) {
      await startDockerDatabase(projectRoot);
    }
    await runMigrations(projectRoot);
  } catch (error) {
    console.error('❌ Setup failed:', error);
    throw error;
  }

  global.apiProcess = startApiServer(projectRoot);

  console.log('⏳ Waiting for API server...');
  const apiReady = await waitForService(apiUrl, 60, 1000);

  if (!apiReady) {
    throw new Error('API server failed to start within 60 seconds');
  }

  console.log('✅ API server is ready');
  console.log('\n✨ E2E test environment ready!\n');
}

export default globalSetup;
