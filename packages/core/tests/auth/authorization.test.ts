import { describe, it, expect } from 'vitest';
import {
  hasRole,
  isOperator,
  isLearner,
  assertRole,
  assertOperator,
  AuthorizationError,
} from '../../src/auth/authorization';
import { UserRole } from '../../src/domain/enums';

describe('Authorization', () => {
  describe('hasRole', () => {
    it('should allow operator to access learner routes', () => {
      expect(hasRole(UserRole.OPERATOR, UserRole.LEARNER)).toBe(true);
    });

    it('should allow learner to access learner routes', () => {
      expect(hasRole(UserRole.LEARNER, UserRole.LEARNER)).toBe(true);
    });

    it('should deny learner access to operator routes', () => {
      expect(hasRole(UserRole.LEARNER, UserRole.OPERATOR)).toBe(false);
    });

    it('should allow operator to access operator routes', () => {
      expect(hasRole(UserRole.OPERATOR, UserRole.OPERATOR)).toBe(true);
    });
  });

  describe('isOperator', () => {
    it('should return true for operator role', () => {
      expect(isOperator(UserRole.OPERATOR)).toBe(true);
    });

    it('should return false for learner role', () => {
      expect(isOperator(UserRole.LEARNER)).toBe(false);
    });
  });

  describe('isLearner', () => {
    it('should return true for learner role', () => {
      expect(isLearner(UserRole.LEARNER)).toBe(true);
    });

    it('should return false for operator role', () => {
      expect(isLearner(UserRole.OPERATOR)).toBe(false);
    });
  });

  describe('assertRole', () => {
    it('should not throw for valid role', () => {
      expect(() => assertRole(UserRole.OPERATOR, UserRole.OPERATOR)).not.toThrow();
    });

    it('should throw AuthorizationError for invalid role', () => {
      expect(() => assertRole(UserRole.LEARNER, UserRole.OPERATOR)).toThrow(AuthorizationError);
    });
  });

  describe('assertOperator', () => {
    it('should not throw for operator', () => {
      expect(() => assertOperator(UserRole.OPERATOR)).not.toThrow();
    });

    it('should throw AuthorizationError for non-operator', () => {
      expect(() => assertOperator(UserRole.LEARNER)).toThrow(AuthorizationError);
    });
  });
});
