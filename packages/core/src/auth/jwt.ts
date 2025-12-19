import jwt from 'jsonwebtoken';
import type { JWTPayload } from './types';

const JWT_EXPIRATION = '7d';

export function generateToken(payload: JWTPayload, secret: string): string {
  return jwt.sign(payload, secret, { expiresIn: JWT_EXPIRATION });
}

export function verifyToken(token: string, secret: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, secret) as JWTPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    throw error;
  }
}

export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch {
    return null;
  }
}
