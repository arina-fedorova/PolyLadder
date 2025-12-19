import jwt from 'jsonwebtoken';

type UserRole = 'learner' | 'operator';

const TEST_JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

export function createTestToken(userId: string, role: UserRole = 'learner'): string {
  return jwt.sign({ userId, role }, TEST_JWT_SECRET, { expiresIn: '7d' });
}

export function createAuthHeader(userId: string, role: UserRole = 'learner'): string {
  const token = createTestToken(userId, role);
  return `Bearer ${token}`;
}

export const TEST_USERS = {
  LEARNER: 'test-learner-123',
  OPERATOR: 'test-operator-456',
} as const;

export function learnerToken(): string {
  return createTestToken(TEST_USERS.LEARNER, 'learner');
}

export function operatorToken(): string {
  return createTestToken(TEST_USERS.OPERATOR, 'operator');
}
