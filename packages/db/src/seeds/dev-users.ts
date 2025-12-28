import { Pool } from 'pg';
import bcrypt from 'bcrypt';

export async function seedDevUsers(pool: Pool): Promise<void> {
  const isDevelopment = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

  if (!isDevelopment) {
    return;
  }

  const operatorPasswordHash = bcrypt.hashSync('password123', 10);
  const learnerPasswordHash = bcrypt.hashSync('password123', 10);

  await pool.query(
    `INSERT INTO users (email, password_hash, role, base_language, created_at, updated_at)
     VALUES
       ('operator@test.com', $1, 'operator', 'EN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ('learner@test.com', $2, 'learner', 'EN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (email) DO NOTHING`,
    [operatorPasswordHash, learnerPasswordHash]
  );
}
