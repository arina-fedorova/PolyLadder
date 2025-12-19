import type { Language, UserRole } from '@polyladder/core';
import { query } from '../connection';

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  baseLanguage: Language;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserParams {
  email: string;
  passwordHash: string;
  baseLanguage: Language;
  role?: UserRole;
}

export async function createUser(params: CreateUserParams): Promise<UserRow> {
  const { email, passwordHash, baseLanguage, role = 'learner' } = params;

  const result = await query<UserRow>(
    `INSERT INTO users (email, password_hash, base_language, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, password_hash as "passwordHash", role,
               base_language as "baseLanguage", created_at as "createdAt",
               updated_at as "updatedAt"`,
    [email, passwordHash, baseLanguage, role]
  );

  return result.rows[0];
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const result = await query<UserRow>(
    `SELECT id, email, password_hash as "passwordHash", role,
            base_language as "baseLanguage", created_at as "createdAt",
            updated_at as "updatedAt"
     FROM users
     WHERE email = $1`,
    [email]
  );

  return result.rows[0] || null;
}

export async function findUserById(userId: string): Promise<UserRow | null> {
  const result = await query<UserRow>(
    `SELECT id, email, password_hash as "passwordHash", role,
            base_language as "baseLanguage", created_at as "createdAt",
            updated_at as "updatedAt"
     FROM users
     WHERE id = $1`,
    [userId]
  );

  return result.rows[0] || null;
}

export async function emailExists(email: string): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM users WHERE email = $1) as exists',
    [email]
  );

  return result.rows[0].exists;
}

export async function updatePassword(userId: string, newPasswordHash: string): Promise<void> {
  await query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
    newPasswordHash,
    userId,
  ]);
}
