import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';
import bcrypt from 'bcrypt';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  const isDevelopment = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

  if (!isDevelopment) {
    pgm.sql(`-- Skipping dev users seed: NODE_ENV is ${process.env.NODE_ENV || 'not set'}`);
    return;
  }

  const operatorPasswordHash = bcrypt.hashSync('password123', 10);
  const learnerPasswordHash = bcrypt.hashSync('password123', 10);

  const escapedOperatorHash = operatorPasswordHash.replace(/'/g, "''");
  const escapedLearnerHash = learnerPasswordHash.replace(/'/g, "''");

  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'operator@test.com') THEN
        INSERT INTO users (email, password_hash, role, base_language, created_at, updated_at)
        VALUES ('operator@test.com', '${escapedOperatorHash}', 'operator', 'EN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      END IF;
      
      IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'learner@test.com') THEN
        INSERT INTO users (email, password_hash, role, base_language, created_at, updated_at)
        VALUES ('learner@test.com', '${escapedLearnerHash}', 'learner', 'EN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      END IF;
    END $$;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DELETE FROM users 
    WHERE email IN ('operator@test.com', 'learner@test.com');
  `);
}
