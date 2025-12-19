import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, needsRehash } from '../../src/auth/password';

describe('Password Hashing', () => {
  it('should hash a password', async () => {
    const password = 'TestPassword123';
    const hash = await hashPassword(password);

    expect(hash).toBeTruthy();
    expect(hash).not.toBe(password);
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it('should verify correct password', async () => {
    const password = 'TestPassword123';
    const hash = await hashPassword(password);

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const password = 'TestPassword123';
    const hash = await hashPassword(password);

    const isValid = await verifyPassword('WrongPassword', hash);
    expect(isValid).toBe(false);
  });

  it('should generate different hashes for same password', async () => {
    const password = 'TestPassword123';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2);
  });

  it('should not need rehash for fresh hash', async () => {
    const hash = await hashPassword('TestPassword123');
    expect(needsRehash(hash)).toBe(false);
  });

  it('should need rehash for invalid hash', () => {
    expect(needsRehash('invalid-hash')).toBe(true);
  });
});
