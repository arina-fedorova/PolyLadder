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
  console.warn('📦 Starting PostgreSQL container...');
  await execAsync('docker compose -f docker/docker-compose.e2e.yml up -d', {
    cwd: projectRoot,
  });
  global.dockerStarted = true;
  console.warn('✅ PostgreSQL container started');

  console.warn('⏳ Waiting for database to be ready...');
  const maxAttempts = 30;
  const intervalMs = 1000;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { Pool } = await import('pg');
      const testPool = new Pool({
        connectionString: 'postgresql://test_e2e:test_e2e_password@localhost:5433/polyladder_e2e',
      });
      await testPool.query('SELECT 1');
      await testPool.end();
      console.warn('✅ Database is ready');
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  throw new Error('Database failed to become ready within 30 seconds');
}

async function runMigrations(projectRoot: string): Promise<void> {
  const isCI = process.env.CI === 'true';
  console.warn(`🔧 Running migrations${isCI ? ' (CI mode)' : ''}...`);

  const databaseUrl = 'postgresql://test_e2e:test_e2e_password@localhost:5433/polyladder_e2e';

  const env: Record<string, string | undefined> = {
    ...process.env,
    DATABASE_URL: databaseUrl,
  };

  delete env.PGUSER;
  delete env.PGPASSWORD;
  delete env.PGDATABASE;

  await execAsync('pnpm --filter @polyladder/db migrate:up', {
    cwd: projectRoot,
    env,
  });
  console.warn('✅ Migrations completed');
}

function startApiServer(projectRoot: string): ChildProcess {
  console.warn('🌐 Starting API server...');

  const databaseUrl = 'postgresql://test_e2e:test_e2e_password@localhost:5433/polyladder_e2e';
  const env: Record<string, string | undefined> = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: process.env.JWT_SECRET || 'test-secret-key-for-e2e-tests-min-32-chars-long',
    PORT: '3001',
    NODE_ENV: 'development',
    LOG_LEVEL: 'info',
  };

  delete env.PGUSER;
  delete env.PGPASSWORD;
  delete env.PGDATABASE;

  const apiProcess = exec('pnpm --filter @polyladder/api dev', {
    cwd: projectRoot,
    env,
  });

  apiProcess.stdout?.on('data', (data: Buffer) => {
    const output = String(data);
    // Show all output in test mode for debugging
    console.error('API server stdout:', output);
  });

  apiProcess.stderr?.on('data', (data: Buffer) => {
    const output = String(data);
    // Show all stderr output for debugging
    console.error('API server stderr:', output);
  });

  apiProcess.on('error', (error) => {
    console.error('API server process error:', error);
  });

  return apiProcess;
}

async function killProcessOnPort(port: number): Promise<void> {
  try {
    const isWindows = process.platform === 'win32';
    const findCommand = isWindows ? `netstat -ano | findstr :${port}` : `lsof -ti:${port}`;

    const { stdout } = await execAsync(findCommand).catch(() => ({ stdout: '' }));

    if (!stdout.trim()) {
      return;
    }

    if (isWindows) {
      const lines = stdout.trim().split('\n');
      const pids = new Set<string>();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length > 0) {
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0' && pid !== 'PID') {
            pids.add(pid);
          }
        }
      }
      for (const pid of pids) {
        await execAsync(`taskkill /F /PID ${pid}`).catch(() => {});
      }
    } else {
      await execAsync(`kill -9 ${stdout.trim()}`).catch(() => {});
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch {
    // Ignore errors - port might not be in use
  }
}

async function globalSetup(_config: FullConfig): Promise<void> {
  const isCI = process.env.CI === 'true';
  const projectRoot = getProjectRoot();
  const apiUrl = 'http://localhost:3001/health';
  const databaseUrl = 'postgresql://test_e2e:test_e2e_password@localhost:5433/polyladder_e2e';

  // Set DATABASE_URL for both API and test helpers
  process.env.DATABASE_URL = databaseUrl;
  // Also set NODE_ENV to test so helpers know they're in test mode
  process.env.NODE_ENV = 'test';

  console.warn('\n🚀 Starting E2E test environment setup...\n');
  console.warn(`   Project root: ${projectRoot}`);
  console.warn(`   CI mode: ${isCI}\n`);
  console.warn(`   Database URL: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}\n`);

  // Kill any existing API processes on port 3001 to ensure clean start
  console.warn('🛑 Checking for existing API process on port 3001...');
  await killProcessOnPort(3001);
  console.warn('✅ Port 3001 cleared');

  console.warn('📦 Building @polyladder/core package...');
  await execAsync('pnpm --filter @polyladder/core build', { cwd: projectRoot });
  console.warn('✅ Core package built');

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

  console.warn('⏳ Waiting for API server...');
  const apiReady = await waitForService(apiUrl, 60, 1000);

  if (!apiReady) {
    throw new Error('API server failed to start within 60 seconds');
  }

  console.warn('✅ API server is ready');
  console.warn('\n✨ E2E test environment ready!\n');
}

export default globalSetup;
