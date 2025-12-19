import type { JWTPayload } from './types';

export interface Session {
  userId: string;
  role: string;
  issuedAt: Date;
  expiresAt: Date;
}

export function jwtToSession(payload: JWTPayload): Session {
  return {
    userId: payload.userId,
    role: payload.role,
    issuedAt: payload.iat ? new Date(payload.iat * 1000) : new Date(),
    expiresAt: payload.exp ? new Date(payload.exp * 1000) : new Date(),
  };
}

export function isSessionExpired(session: Session): boolean {
  return session.expiresAt < new Date();
}

export function getRemainingSessionTime(session: Session): number {
  const now = Date.now();
  const expires = session.expiresAt.getTime();
  return Math.max(0, expires - now);
}

export function shouldRefreshSession(session: Session): boolean {
  const remaining = getRemainingSessionTime(session);
  const oneDayMs = 24 * 60 * 60 * 1000;
  return remaining < oneDayMs;
}
