import { z } from 'zod';
import { Language, UserRole } from '../domain/enums';

export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  baseLanguage: Language;
  createdAt: Date;
}

export interface JWTPayload {
  userId: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export const RegistrationSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  baseLanguage: z.nativeEnum(Language),
});

export type RegistrationInput = z.infer<typeof RegistrationSchema>;

export const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export interface AuthResult {
  user: PublicUser;
  token: string;
}
