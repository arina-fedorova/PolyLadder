import { Pool } from 'pg';

let pool: Pool | null = null;

export function getE2EPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: 'postgres://test_e2e:test_e2e_password@localhost:5433/polyladder_e2e',
    });
  }
  return pool;
}

export async function cleanupTestData(): Promise<void> {
  const pool = getE2EPool();

  // Delete in correct order due to foreign key constraints
  await pool.query('DELETE FROM user_exercise_results');
  await pool.query('DELETE FROM user_languages');
  await pool.query('DELETE FROM user_vocabulary');
  await pool.query('DELETE FROM approval_events');
  await pool.query('DELETE FROM review_queue');
  await pool.query('DELETE FROM quality_gate_results');
  await pool.query('DELETE FROM pipeline_failures');
  await pool.query('DELETE FROM refresh_tokens');
  await pool.query('DELETE FROM users');
  await pool.query('DELETE FROM validated');
  await pool.query('DELETE FROM candidates');
  await pool.query('DELETE FROM drafts');
}

export async function createTestUser(data: {
  email: string;
  password: string;
  role?: 'learner' | 'operator';
  baseLanguage?: string;
}): Promise<{ userId: string; email: string; role: string }> {
  const pool = getE2EPool();

  // Use bcrypt to hash password (same as API does)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bcrypt = require('bcrypt') as typeof import('bcrypt');
  const passwordHash = await bcrypt.hash(data.password, 10);

  const result = await pool.query<{ id: string; email: string; role: string }>(
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
