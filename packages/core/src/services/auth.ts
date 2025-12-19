import { hashPassword, verifyPassword, needsRehash } from '../auth/password';
import { generateToken } from '../auth/jwt';
import {
  RegistrationSchema,
  LoginSchema,
  type RegistrationInput,
  type LoginInput,
  type AuthResult,
  type PublicUser,
} from '../auth/types';
import type { Language, UserRole } from '../domain/enums';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  baseLanguage: Language;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRepository {
  createUser(params: {
    email: string;
    passwordHash: string;
    baseLanguage: Language;
    role: UserRole;
  }): Promise<UserRecord>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  emailExists(email: string): Promise<boolean>;
  updatePassword(userId: string, newPasswordHash: string): Promise<void>;
}

function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    baseLanguage: user.baseLanguage,
    createdAt: user.createdAt,
  };
}

export async function registerUser(
  input: RegistrationInput,
  jwtSecret: string,
  repo: UserRepository
): Promise<AuthResult> {
  const validatedInput = RegistrationSchema.parse(input);

  const exists = await repo.emailExists(validatedInput.email);
  if (exists) {
    throw new Error('Email already registered');
  }

  const passwordHash = await hashPassword(validatedInput.password);

  const user = await repo.createUser({
    email: validatedInput.email,
    passwordHash,
    baseLanguage: validatedInput.baseLanguage,
    role: 'learner',
  });

  const token = generateToken({ userId: user.id, role: user.role }, jwtSecret);

  return { user: toPublicUser(user), token };
}

export async function loginUser(
  input: LoginInput,
  jwtSecret: string,
  repo: UserRepository
): Promise<AuthResult> {
  const validatedInput = LoginSchema.parse(input);

  const user = await repo.findUserByEmail(validatedInput.email);
  if (!user) {
    throw new Error('Invalid email or password');
  }

  const isValid = await verifyPassword(validatedInput.password, user.passwordHash);
  if (!isValid) {
    throw new Error('Invalid email or password');
  }

  if (needsRehash(user.passwordHash)) {
    const newHash = await hashPassword(validatedInput.password);
    await repo.updatePassword(user.id, newHash);
  }

  const token = generateToken({ userId: user.id, role: user.role }, jwtSecret);

  return { user: toPublicUser(user), token };
}
