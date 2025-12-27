import { seedDevUsers } from './dev-users';
import { pool } from '../connection';
import { close } from '../connection';

async function main(): Promise<void> {
  try {
    await seedDevUsers(pool);
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  } finally {
    await close();
  }
}

void main();
