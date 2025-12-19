import { describe, it, expect } from 'vitest';
import { generateToken, verifyToken, decodeToken } from '../../src/auth/jwt';
import { UserRole } from '../../src/domain/enums';

const TEST_SECRET = 'test-secret-key';

describe('JWT Generation and Verification', () => {
  it('should generate a valid JWT', () => {
    const payload = { userId: '123', role: UserRole.LEARNER };
    const token = generateToken(payload, TEST_SECRET);

    expect(token).toBeTruthy();
    expect(token.split('.')).toHaveLength(3);
  });

  it('should verify and decode a valid JWT', () => {
    const payload = { userId: '123', role: UserRole.LEARNER };
    const token = generateToken(payload, TEST_SECRET);

    const decoded = verifyToken(token, TEST_SECRET);
    expect(decoded.userId).toBe('123');
    expect(decoded.role).toBe('learner');
  });

  it('should throw error for invalid JWT', () => {
    expect(() => verifyToken('invalid.token.here', TEST_SECRET)).toThrow('Invalid token');
  });

  it('should throw error for wrong secret', () => {
    const payload = { userId: '123', role: UserRole.LEARNER };
    const token = generateToken(payload, TEST_SECRET);

    expect(() => verifyToken(token, 'wrong-secret')).toThrow('Invalid token');
  });

  it('should decode token without verification', () => {
    const payload = { userId: '123', role: UserRole.LEARNER };
    const token = generateToken(payload, TEST_SECRET);

    const decoded = decodeToken(token);
    expect(decoded).toBeTruthy();
    expect(decoded?.userId).toBe('123');
  });

  it('should return null for invalid token decode', () => {
    const decoded = decodeToken('not-a-jwt');
    expect(decoded).toBeNull();
  });
});
