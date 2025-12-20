import { FullConfig } from '@playwright/test';
import { exec } from 'child_process';
import { promisify } from 'util';
import { closeE2EPool } from './db-helpers';

const execAsync = promisify(exec);

// Get the project root directory
function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith('packages/web') || cwd.endsWith('packages\\web')) {
    return cwd.replace(/[/\\]packages[/\\]web$/, '');
  }
  return cwd;
}

async function globalTeardown(_config: FullConfig): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('\n🧹 Cleaning up E2E test environment...\n');

  // Close database pool first
  try {
    await closeE2EPool();
    // eslint-disable-next-line no-console
    console.log('✅ Database pool closed');
  } catch {
    // Pool might not have been initialized
  }

  // 1. Stop API server
  const apiProcess = global.apiProcess;
  if (apiProcess) {
    // eslint-disable-next-line no-console
    console.log('🛑 Stopping API server...');
    try {
      apiProcess.kill('SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // eslint-disable-next-line no-console
      console.log('✅ API server stopped');
    } catch (error) {
      console.error('⚠️ Could not stop API server gracefully:', error);
    }
  }

  // 2. Stop and remove database container (only if we started it)
  if (global.dockerStarted) {
    // eslint-disable-next-line no-console
    console.log('🗑️  Stopping PostgreSQL container...');
    try {
      await execAsync('docker compose -f docker/docker-compose.e2e.yml down -v', {
        cwd: getProjectRoot(),
      });
      // eslint-disable-next-line no-console
      console.log('✅ PostgreSQL container stopped and removed');
    } catch (error) {
      console.error('❌ Failed to stop PostgreSQL container:', error);
    }
  }

  // eslint-disable-next-line no-console
  console.log('\n✨ E2E test environment cleaned up!\n');
}

export default globalTeardown;
