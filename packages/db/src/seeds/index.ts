import { seedDevelopmentData } from './dev-seed';
import { close } from '../connection';

async function main(): Promise<void> {
  try {
    await seedDevelopmentData();
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  } finally {
    await close();
  }
}

void main();
