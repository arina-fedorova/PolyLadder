import jwt from 'jsonwebtoken';
import type { JWTPayload } from './types';

const DEFAULT_EXPIRATION = '7d';

export function generateToken(
  payload: JWTPayload,
  secret: string,
  expiresIn: string = DEFAULT_EXPIRATION
): string {
  return jwt.sign(payload as object, secret, {
    expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string, secret: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, secret) as JWTPayload;
    return decoded;
  } catch {
    return null;
  }
}

export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch {
    return null;
  }
}
