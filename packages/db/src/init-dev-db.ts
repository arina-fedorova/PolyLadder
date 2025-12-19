import { Client, type QueryResult } from 'pg';

interface DatabaseInfo {
  current_database: string;
}

async function initDevDatabase(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.warn('Connected to database');

    const result: QueryResult<DatabaseInfo> = await client.query('SELECT current_database()');
    console.warn(`Database: ${result.rows[0].current_database}`);
    console.warn('Database ready for migrations');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

void initDevDatabase();
