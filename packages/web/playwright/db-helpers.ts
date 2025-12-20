import { Pool } from 'pg';
import bcrypt from 'bcrypt';

let pool: Pool | null = null;

export function getE2EPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ||
        'postgres://test_e2e:test_e2e_password@localhost:5433/polyladder_e2e',
    });
  }
  return pool;
}

export async function cleanupTestData(): Promise<void> {
  const p = getE2EPool();

  // Delete in correct order due to foreign key constraints
  await p.query('DELETE FROM user_exercise_results');
  await p.query('DELETE FROM user_languages');
  await p.query('DELETE FROM user_vocabulary');
  await p.query('DELETE FROM approval_events');
  await p.query('DELETE FROM review_queue');
  await p.query('DELETE FROM quality_gate_results');
  await p.query('DELETE FROM pipeline_failures');
  await p.query('DELETE FROM refresh_tokens');
  await p.query('DELETE FROM users');
  await p.query('DELETE FROM validated');
  await p.query('DELETE FROM candidates');
  await p.query('DELETE FROM drafts');
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
