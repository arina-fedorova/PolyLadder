import { FullConfig } from '@playwright/test';
import { exec } from 'child_process';
import { promisify } from 'util';
import { closeE2EPool } from './db-helpers';

const execAsync = promisify(exec);

function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith('packages/web') || cwd.endsWith('packages\\web')) {
    return cwd.replace(/[/\\]packages[/\\]web$/, '');
  }
  return cwd;
}

async function stopApiServer(): Promise<void> {
  const apiProcess = global.apiProcess;
  if (!apiProcess) return;

  console.log('🛑 Stopping API server...');
  try {
    apiProcess.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log('✅ API server stopped');
  } catch (error) {
    console.error('⚠️ Could not stop API server:', error);
  }
}

async function stopDockerDatabase(): Promise<void> {
  if (!global.dockerStarted) return;

  console.log('🗑️  Stopping PostgreSQL container...');
  try {
    await execAsync('docker compose -f docker/docker-compose.e2e.yml down -v', {
      cwd: getProjectRoot(),
    });
    console.log('✅ PostgreSQL container stopped');
  } catch (error) {
    console.error('❌ Failed to stop PostgreSQL:', error);
  }
}

async function globalTeardown(_config: FullConfig): Promise<void> {
  console.log('\n🧹 Cleaning up E2E test environment...\n');

  try {
    await closeE2EPool();
    console.log('✅ Database pool closed');
  } catch {
    // Pool might not have been initialized
  }

  await stopApiServer();
  await stopDockerDatabase();

  console.log('\n✨ E2E test environment cleaned up!\n');
}

export default globalTeardown;
