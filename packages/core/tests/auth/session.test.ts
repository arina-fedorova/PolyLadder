import { describe, it, expect } from 'vitest';
import {
  jwtToSession,
  isSessionExpired,
  getRemainingSessionTime,
  shouldRefreshSession,
} from '../../src/auth/session';
import { UserRole } from '../../src/domain/enums';

describe('Session Management', () => {
  describe('jwtToSession', () => {
    it('should convert JWT payload to session', () => {
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        userId: '123',
        role: UserRole.LEARNER,
        iat: now,
        exp: now + 7 * 24 * 60 * 60,
      };

      const session = jwtToSession(payload);
      expect(session.userId).toBe('123');
      expect(session.role).toBe('learner');
    });

    it('should use current date if iat/exp missing', () => {
      const payload = {
        userId: '123',
        role: UserRole.LEARNER,
      };

      const session = jwtToSession(payload);
      expect(session.userId).toBe('123');
      expect(session.issuedAt).toBeInstanceOf(Date);
      expect(session.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('isSessionExpired', () => {
    it('should return false for valid session', () => {
      const session = {
        userId: '123',
        role: 'learner',
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      expect(isSessionExpired(session)).toBe(false);
    });

    it('should return true for expired session', () => {
      const session = {
        userId: '123',
        role: 'learner',
        issuedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      };

      expect(isSessionExpired(session)).toBe(true);
    });
  });

  describe('getRemainingSessionTime', () => {
    it('should return positive time for valid session', () => {
      const session = {
        userId: '123',
        role: 'learner',
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      };

      const remaining = getRemainingSessionTime(session);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(60 * 60 * 1000);
    });

    it('should return 0 for expired session', () => {
      const session = {
        userId: '123',
        role: 'learner',
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() - 1000),
      };

      expect(getRemainingSessionTime(session)).toBe(0);
    });
  });

  describe('shouldRefreshSession', () => {
    it('should return true if less than 1 day remaining', () => {
      const session = {
        userId: '123',
        role: 'learner',
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      };

      expect(shouldRefreshSession(session)).toBe(true);
    });

    it('should return false if more than 1 day remaining', () => {
      const session = {
        userId: '123',
        role: 'learner',
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      };

      expect(shouldRefreshSession(session)).toBe(false);
    });
  });
});
