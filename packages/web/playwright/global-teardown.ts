import { FullConfig } from '@playwright/test';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function globalTeardown(_config: FullConfig) {
  // eslint-disable-next-line no-console
  console.log('\n🧹 Cleaning up E2E test environment...\n');

  // 1. Stop API server
  const apiProcess = global.apiProcess;
  if (apiProcess) {
    // eslint-disable-next-line no-console
    console.log('🛑 Stopping API server...');
    apiProcess.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    // eslint-disable-next-line no-console
    console.log('✅ API server stopped');
  }

  // 2. Stop and remove database container
  // eslint-disable-next-line no-console
  console.log('🗑️  Stopping PostgreSQL container...');
  try {
    await execAsync('docker compose -f docker/docker-compose.e2e.yml down -v', {
      cwd: process.cwd().replace(/packages[\\/]web$/, ''),
    });
    // eslint-disable-next-line no-console
    console.log('✅ PostgreSQL container stopped and removed');
  } catch (error) {
    console.error('❌ Failed to stop PostgreSQL container:', error);
  }

  // eslint-disable-next-line no-console
  console.log('\n✨ E2E test environment cleaned up!\n');
}

export default globalTeardown;
