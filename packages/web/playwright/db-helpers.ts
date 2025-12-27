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

  // Normalize email (same as API does)
  const normalizedEmail = data.email.toLowerCase();

  // Hash password (same as API does - use SALT_ROUNDS = 12)
  const passwordHash = await bcrypt.hash(data.password, 12);

  // Use a transaction to ensure atomicity
  const client = await p.connect();
  try {
    await client.query('BEGIN');

    // Delete existing user if any (idempotency)
    await client.query('DELETE FROM users WHERE email = $1', [normalizedEmail]);

    const result = await client.query<{ id: string; email: string; role: string }>(
      `INSERT INTO users (email, password_hash, role, base_language, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       RETURNING id, email, role`,
      [normalizedEmail, passwordHash, data.role || 'learner', data.baseLanguage || 'EN']
    );

    await client.query('COMMIT');
    const row = result.rows[0];
    client.release();

    // Wait a bit and verify user exists from a fresh connection (simulating API behavior)
    await new Promise((resolve) => setTimeout(resolve, 500));

    const verifyClient = await p.connect();
    try {
      const verifyResult = await verifyClient.query<{
        id: string;
        email: string;
        role: string;
        password_hash: string;
      }>('SELECT id, email, role, password_hash FROM users WHERE email = $1', [normalizedEmail]);
      if (verifyResult.rows.length === 0) {
        throw new Error(`Failed to create user ${normalizedEmail} - user not found after insert`);
      }

      const userRow = verifyResult.rows[0];

      // Verify password hash was set
      if (!userRow.password_hash) {
        throw new Error(`Failed to create user ${normalizedEmail} - password_hash is null`);
      }

      // Verify password can be verified
      const storedHash = userRow.password_hash;
      const bcrypt = await import('bcrypt');
      const passwordMatches = await bcrypt.compare(data.password, storedHash);
      if (!passwordMatches) {
        throw new Error(`Failed to create user ${normalizedEmail} - password verification failed`);
      }
    } finally {
      verifyClient.release();
    }

    return {
      userId: row.id,
      email: row.email,
      role: row.role,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    throw error;
  }
}

export async function closeE2EPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
