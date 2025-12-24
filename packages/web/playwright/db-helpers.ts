import { Pool } from 'pg';
import bcrypt from 'bcrypt';

let pool: Pool | null = null;

export function getE2EPool(): Pool {
  if (!pool) {
    const databaseUrl =
      process.env.DATABASE_URL ||
      'postgresql://test_e2e:test_e2e_password@localhost:5433/polyladder_e2e';
    pool = new Pool({
      connectionString: databaseUrl,
    });
  }
  return pool;
}

export async function cleanupTestData(): Promise<void> {
  const p = getE2EPool();

  // Delete in correct order due to foreign key constraints
  const tables = [
    'retry_queue',
    'item_versions',
    'operator_feedback',
    'feedback_templates',
    'user_exercise_results',
    'user_languages',
    'user_vocabulary',
    'approval_events',
    'review_queue',
    'quality_gate_results',
    'pipeline_failures',
    'refresh_tokens',
    'users',
    'validated',
    'candidates',
    'drafts',
  ];

  for (const table of tables) {
    try {
      await p.query(`DELETE FROM ${table}`);
    } catch {
      // Table might not exist yet, ignore
    }
  }
}

export async function createTestUser(data: {
  email: string;
  password: string;
  role?: 'learner' | 'operator';
  baseLanguage?: string;
}): Promise<{ userId: string; email: string; role: string }> {
  const p = getE2EPool();

  // Hash password (same as API does)
  const passwordHash = await bcrypt.hash(data.password, 10);

  const result = await p.query<{ id: string; email: string; role: string }>(
    `INSERT INTO users (email, password_hash, role, base_language, created_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     RETURNING id, email, role`,
    [data.email, passwordHash, data.role || 'learner', data.baseLanguage || 'EN']
  );

  const row = result.rows[0];
  return {
    userId: row.id,
    email: row.email,
    role: row.role,
  };
}

export async function closeE2EPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
