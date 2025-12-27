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

  console.log('⏳ Waiting for database to be ready...');
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
      console.log('✅ Database is ready');
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  throw new Error('Database failed to become ready within 30 seconds');
}

async function runMigrations(projectRoot: string): Promise<void> {
  const isCI = process.env.CI === 'true';
  console.log(`🔧 Running migrations${isCI ? ' (CI mode)' : ''}...`);

  const databaseUrl = 'postgresql://test_e2e:test_e2e_password@localhost:5433/polyladder_e2e';

  const env = {
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
  console.log('✅ Migrations completed');
}

function startApiServer(projectRoot: string): ChildProcess {
  console.log('🌐 Starting API server...');

  const databaseUrl = 'postgresql://test_e2e:test_e2e_password@localhost:5433/polyladder_e2e';
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: process.env.JWT_SECRET || 'test-secret-key-for-e2e-tests-min-32-chars-long',
    PORT: '3001',
    NODE_ENV: 'test',
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
    // Show all output in test mode for debugging, especially login-related
    if (
      process.env.NODE_ENV === 'test' ||
      output.includes('Error') ||
      output.includes('error') ||
      output.includes('warn') ||
      output.includes('User not found') ||
      output.includes('E2E LOGIN DEBUG') ||
      output.includes('Attempting login')
    ) {
      console.error('API server output:', output);
    }
  });

  apiProcess.stderr?.on('data', (data: Buffer) => {
    console.error('API server error:', String(data));
  });

  apiProcess.on('error', (error) => {
    console.error('API server process error:', error);
  });

  return apiProcess;
}

async function killProcessOnPort(port: number): Promise<void> {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const command = isWindows ? `netstat -ano | findstr :${port}` : `lsof -ti:${port}`;

    exec(command, (error: Error | null, stdout: string) => {
      if (error || !stdout.trim()) {
        resolve();
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
          exec(`taskkill /F /PID ${pid}`, () => {
            // Ignore errors
          });
        }
      } else {
        exec(`kill -9 ${stdout.trim()}`, () => {
          // Ignore errors
        });
      }
      // Wait a bit for process to die
      setTimeout(resolve, 1000);
    });
  });
}

async function globalSetup(_config: FullConfig): Promise<void> {
  const isCI = process.env.CI === 'true';
  const projectRoot = getProjectRoot();
  const apiUrl = 'http://localhost:3001/health';
  const databaseUrl = 'postgresql://test_e2e:test_e2e_password@localhost:5433/polyladder_e2e';

  process.env.DATABASE_URL = databaseUrl;

  console.log('\n🚀 Starting E2E test environment setup...\n');
  console.log(`   Project root: ${projectRoot}`);
  console.log(`   CI mode: ${isCI}\n`);
  console.log(`   Database URL: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}\n`);

  // Always setup database and API for E2E tests to ensure correct configuration
  // Kill any existing process on port 3001 to ensure clean start
  console.log('🛑 Checking for existing API server on port 3001...');
  await killProcessOnPort(3001);

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
