# F004: User Registration & Login

**Feature Code**: F004
**Created**: 2025-12-17
**Phase**: 1 - Authentication & User Management
**Status**: ✅ Completed
**Completed**: 2025-12-19
**PR**: #7

---

## Description

Implement user account creation and authentication system with password hashing, JWT generation, and input validation. This provides the foundation for all user-specific functionality in the system.

## Success Criteria

- [x] User model in database with proper constraints
- [x] Password hashing with bcrypt (salt rounds: 10)
- [x] Registration endpoint validates email uniqueness
- [x] Login endpoint verifies credentials and returns JWT
- [x] JWT includes user_id, role, and expiration (7 days)
- [x] Input validation for email format and password strength
- [x] Proper error handling for auth failures
- [x] All passwords stored as bcrypt hashes, never plaintext

---

## Tasks

### Task 1: Create User Database Schema

**Description**: Define users table with all necessary fields and constraints.

**Implementation Plan**:

1. Create migration `packages/db/migrations/002-create-users-table.sql`:

   ```sql
   -- Create users table
   CREATE TABLE IF NOT EXISTS users (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     email VARCHAR(255) NOT NULL UNIQUE,
     password_hash VARCHAR(255) NOT NULL,
     role VARCHAR(20) NOT NULL DEFAULT 'learner' CHECK (role IN ('learner', 'operator')),
     base_language CHAR(2) NOT NULL,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   );

   -- Create index on email for fast lookups
   CREATE INDEX idx_users_email ON users(email);

   -- Create index on role for role-based queries
   CREATE INDEX idx_users_role ON users(role);

   -- Add updated_at trigger
   CREATE OR REPLACE FUNCTION update_updated_at_column()
   RETURNS TRIGGER AS $$
   BEGIN
     NEW.updated_at = CURRENT_TIMESTAMP;
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;

   CREATE TRIGGER update_users_updated_at
     BEFORE UPDATE ON users
     FOR EACH ROW
     EXECUTE FUNCTION update_updated_at_column();
   ```

2. Add rollback migration `packages/db/migrations/002-create-users-table-down.sql`:
   ```sql
   DROP TRIGGER IF EXISTS update_users_updated_at ON users;
   DROP FUNCTION IF EXISTS update_updated_at_column();
   DROP TABLE IF EXISTS users;
   ```

**Files Created**:

- `packages/db/migrations/002-create-users-table.sql`
- `packages/db/migrations/002-create-users-table-down.sql`

---

### Task 2: Create User Domain Model & Types

**Description**: Define TypeScript types and schemas for User entity.

**Implementation Plan**:

1. Create `packages/core/src/domain/user.ts`:

   ```typescript
   import { z } from 'zod';

   /**
    * User roles in the system
    */
   export const UserRole = {
     LEARNER: 'learner',
     OPERATOR: 'operator',
   } as const;

   export type UserRole = (typeof UserRole)[keyof typeof UserRole];

   /**
    * User entity
    */
   export interface User {
     id: string;
     email: string;
     passwordHash: string;
     role: UserRole;
     baseLanguage: string;
     createdAt: Date;
     updatedAt: Date;
   }

   /**
    * User without sensitive information (for API responses)
    */
   export interface PublicUser {
     id: string;
     email: string;
     role: UserRole;
     baseLanguage: string;
     createdAt: Date;
   }

   /**
    * JWT payload structure
    */
   export interface JWTPayload {
     userId: string;
     role: UserRole;
     iat?: number; // Issued at
     exp?: number; // Expiration
   }

   /**
    * Validation schema for user registration
    */
   export const RegistrationSchema = z.object({
     email: z.string().email('Invalid email format'),
     password: z
       .string()
       .min(8, 'Password must be at least 8 characters')
       .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
       .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
       .regex(/[0-9]/, 'Password must contain at least one number'),
     baseLanguage: z.string().length(2, 'Base language must be 2-letter ISO code'),
   });

   export type RegistrationInput = z.infer<typeof RegistrationSchema>;

   /**
    * Validation schema for user login
    */
   export const LoginSchema = z.object({
     email: z.string().email('Invalid email format'),
     password: z.string().min(1, 'Password is required'),
   });

   export type LoginInput = z.infer<typeof LoginSchema>;

   /**
    * Remove sensitive information from user object
    */
   export function toPublicUser(user: User): PublicUser {
     return {
       id: user.id,
       email: user.email,
       role: user.role,
       baseLanguage: user.baseLanguage,
       createdAt: user.createdAt,
     };
   }
   ```

2. Export from `packages/core/src/index.ts`:
   ```typescript
   export * from './domain/user';
   ```

**Files Created**:

- `packages/core/src/domain/user.ts`

---

### Task 3: Implement Password Hashing Service

**Description**: Create utility functions for password hashing and verification using bcrypt.

**Implementation Plan**:

1. Install bcrypt:

   ```bash
   pnpm --filter @polyladder/core add bcrypt
   pnpm --filter @polyladder/core add -D @types/bcrypt
   ```

2. Create `packages/core/src/auth/password.ts`:

   ```typescript
   import bcrypt from 'bcrypt';

   const SALT_ROUNDS = 10;

   /**
    * Hash a password using bcrypt
    * @param password Plain text password
    * @returns Hashed password
    */
   export async function hashPassword(password: string): Promise<string> {
     return bcrypt.hash(password, SALT_ROUNDS);
   }

   /**
    * Verify a password against a hash
    * @param password Plain text password
    * @param hash Stored password hash
    * @returns True if password matches hash
    */
   export async function verifyPassword(password: string, hash: string): Promise<boolean> {
     return bcrypt.compare(password, hash);
   }

   /**
    * Check if a hash needs to be regenerated (bcrypt version or salt rounds changed)
    * @param hash Stored password hash
    * @returns True if rehashing is recommended
    */
   export function needsRehash(hash: string): boolean {
     try {
       const rounds = bcrypt.getRounds(hash);
       return rounds < SALT_ROUNDS;
     } catch {
       return true; // Invalid hash format
     }
   }
   ```

3. Export from `packages/core/src/index.ts`:
   ```typescript
   export * from './auth/password';
   ```

**Files Created**:

- `packages/core/src/auth/password.ts`

---

### Task 4: Implement JWT Service

**Description**: Create utilities for JWT generation and verification.

**Implementation Plan**:

1. Install jsonwebtoken:

   ```bash
   pnpm --filter @polyladder/core add jsonwebtoken
   pnpm --filter @polyladder/core add -D @types/jsonwebtoken
   ```

2. Create `packages/core/src/auth/jwt.ts`:

   ```typescript
   import jwt from 'jsonwebtoken';
   import { JWTPayload } from '../domain/user';

   const JWT_EXPIRATION = '7d'; // 7 days

   /**
    * Generate a JWT token for a user
    * @param payload JWT payload containing userId and role
    * @param secret JWT signing secret
    * @returns Signed JWT token
    */
   export function generateToken(payload: JWTPayload, secret: string): string {
     return jwt.sign(payload, secret, {
       expiresIn: JWT_EXPIRATION,
     });
   }

   /**
    * Verify and decode a JWT token
    * @param token JWT token string
    * @param secret JWT signing secret
    * @returns Decoded payload if valid
    * @throws Error if token is invalid or expired
    */
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

   /**
    * Decode token without verification (for debugging)
    * @param token JWT token string
    * @returns Decoded payload (unverified)
    */
   export function decodeToken(token: string): JWTPayload | null {
     try {
       return jwt.decode(token) as JWTPayload;
     } catch {
       return null;
     }
   }
   ```

3. Export from `packages/core/src/index.ts`:
   ```typescript
   export * from './auth/jwt';
   ```

**Files Created**:

- `packages/core/src/auth/jwt.ts`

---

### Task 5: Implement User Repository (Database Layer)

**Description**: Create database access functions for user CRUD operations.

**Implementation Plan**:

1. Create `packages/db/src/repositories/users.ts`:

   ```typescript
   import { Pool } from 'pg';
   import { User, UserRole } from '@polyladder/core';

   export interface CreateUserParams {
     email: string;
     passwordHash: string;
     baseLanguage: string;
     role?: UserRole;
   }

   /**
    * Create a new user
    */
   export async function createUser(pool: Pool, params: CreateUserParams): Promise<User> {
     const { email, passwordHash, baseLanguage, role = 'learner' } = params;

     const result = await pool.query<User>(
       `INSERT INTO users (email, password_hash, base_language, role)
        VALUES ($1, $2, $3, $4)
        RETURNING id, email, password_hash as "passwordHash", role,
                  base_language as "baseLanguage", created_at as "createdAt",
                  updated_at as "updatedAt"`,
       [email, passwordHash, baseLanguage, role]
     );

     return result.rows[0];
   }

   /**
    * Find user by email
    */
   export async function findUserByEmail(pool: Pool, email: string): Promise<User | null> {
     const result = await pool.query<User>(
       `SELECT id, email, password_hash as "passwordHash", role,
               base_language as "baseLanguage", created_at as "createdAt",
               updated_at as "updatedAt"
        FROM users
        WHERE email = $1`,
       [email]
     );

     return result.rows[0] || null;
   }

   /**
    * Find user by ID
    */
   export async function findUserById(pool: Pool, userId: string): Promise<User | null> {
     const result = await pool.query<User>(
       `SELECT id, email, password_hash as "passwordHash", role,
               base_language as "baseLanguage", created_at as "createdAt",
               updated_at as "updatedAt"
        FROM users
        WHERE id = $1`,
       [userId]
     );

     return result.rows[0] || null;
   }

   /**
    * Check if email already exists
    */
   export async function emailExists(pool: Pool, email: string): Promise<boolean> {
     const result = await pool.query<{ exists: boolean }>(
       'SELECT EXISTS(SELECT 1 FROM users WHERE email = $1) as exists',
       [email]
     );

     return result.rows[0].exists;
   }

   /**
    * Update user password hash
    */
   export async function updatePassword(
     pool: Pool,
     userId: string,
     newPasswordHash: string
   ): Promise<void> {
     await pool.query(
       'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
       [newPasswordHash, userId]
     );
   }
   ```

2. Export from `packages/db/src/index.ts`:
   ```typescript
   export * from './repositories/users';
   ```

**Files Created**:

- `packages/db/src/repositories/users.ts`

---

### Task 6: Implement Registration Service

**Description**: Create business logic for user registration.

**Implementation Plan**:

1. Create `packages/core/src/services/registration.ts`:

   ```typescript
   import { Pool } from 'pg';
   import { RegistrationInput, RegistrationSchema, PublicUser, toPublicUser } from '../domain/user';
   import { hashPassword } from '../auth/password';
   import { generateToken } from '../auth/jwt';
   import { createUser, emailExists } from '@polyladder/db';

   export interface RegistrationResult {
     user: PublicUser;
     token: string;
   }

   /**
    * Register a new user
    * @param pool Database connection pool
    * @param input Registration input (email, password, baseLanguage)
    * @param jwtSecret Secret for JWT signing
    * @returns User and JWT token
    * @throws Error if validation fails or email already exists
    */
   export async function registerUser(
     pool: Pool,
     input: RegistrationInput,
     jwtSecret: string
   ): Promise<RegistrationResult> {
     // Validate input
     const validatedInput = RegistrationSchema.parse(input);

     // Check if email already exists
     const exists = await emailExists(pool, validatedInput.email);
     if (exists) {
       throw new Error('Email already registered');
     }

     // Hash password
     const passwordHash = await hashPassword(validatedInput.password);

     // Create user
     const user = await createUser(pool, {
       email: validatedInput.email,
       passwordHash,
       baseLanguage: validatedInput.baseLanguage,
       role: 'learner', // New users are learners by default
     });

     // Generate JWT
     const token = generateToken(
       {
         userId: user.id,
         role: user.role,
       },
       jwtSecret
     );

     return {
       user: toPublicUser(user),
       token,
     };
   }
   ```

2. Export from `packages/core/src/index.ts`:
   ```typescript
   export * from './services/registration';
   ```

**Files Created**:

- `packages/core/src/services/registration.ts`

---

### Task 7: Implement Login Service

**Description**: Create business logic for user authentication.

**Implementation Plan**:

1. Create `packages/core/src/services/login.ts`:

   ```typescript
   import { Pool } from 'pg';
   import { LoginInput, LoginSchema, PublicUser, toPublicUser } from '../domain/user';
   import { verifyPassword, needsRehash, hashPassword } from '../auth/password';
   import { generateToken } from '../auth/jwt';
   import { findUserByEmail, updatePassword } from '@polyladder/db';

   export interface LoginResult {
     user: PublicUser;
     token: string;
   }

   /**
    * Authenticate a user and return JWT
    * @param pool Database connection pool
    * @param input Login credentials (email, password)
    * @param jwtSecret Secret for JWT signing
    * @returns User and JWT token
    * @throws Error if credentials are invalid
    */
   export async function loginUser(
     pool: Pool,
     input: LoginInput,
     jwtSecret: string
   ): Promise<LoginResult> {
     // Validate input
     const validatedInput = LoginSchema.parse(input);

     // Find user by email
     const user = await findUserByEmail(pool, validatedInput.email);
     if (!user) {
       throw new Error('Invalid email or password');
     }

     // Verify password
     const isValid = await verifyPassword(validatedInput.password, user.passwordHash);
     if (!isValid) {
       throw new Error('Invalid email or password');
     }

     // Check if password hash needs updating (bcrypt version changed)
     if (needsRehash(user.passwordHash)) {
       const newHash = await hashPassword(validatedInput.password);
       await updatePassword(pool, user.id, newHash);
     }

     // Generate JWT
     const token = generateToken(
       {
         userId: user.id,
         role: user.role,
       },
       jwtSecret
     );

     return {
       user: toPublicUser(user),
       token,
     };
   }
   ```

2. Export from `packages/core/src/index.ts`:
   ```typescript
   export * from './services/login';
   ```

**Files Created**:

- `packages/core/src/services/login.ts`

---

### Task 8: Create Unit Tests

**Description**: Test password hashing, JWT generation, and authentication services.

**Implementation Plan**:

1. Create `packages/core/tests/auth/password.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { hashPassword, verifyPassword, needsRehash } from '../../src/auth/password';

   describe('Password Hashing', () => {
     it('should hash a password', async () => {
       const password = 'TestPassword123';
       const hash = await hashPassword(password);

       expect(hash).toBeTruthy();
       expect(hash).not.toBe(password);
       expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt format
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
   });
   ```

2. Create `packages/core/tests/auth/jwt.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { generateToken, verifyToken, decodeToken } from '../../src/auth/jwt';

   const TEST_SECRET = 'test-secret-key';

   describe('JWT Generation and Verification', () => {
     it('should generate a valid JWT', () => {
       const payload = { userId: '123', role: 'learner' as const };
       const token = generateToken(payload, TEST_SECRET);

       expect(token).toBeTruthy();
       expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
     });

     it('should verify and decode a valid JWT', () => {
       const payload = { userId: '123', role: 'learner' as const };
       const token = generateToken(payload, TEST_SECRET);

       const decoded = verifyToken(token, TEST_SECRET);
       expect(decoded.userId).toBe('123');
       expect(decoded.role).toBe('learner');
     });

     it('should throw error for invalid JWT', () => {
       expect(() => verifyToken('invalid.token.here', TEST_SECRET)).toThrow('Invalid token');
     });

     it('should throw error for wrong secret', () => {
       const payload = { userId: '123', role: 'learner' as const };
       const token = generateToken(payload, TEST_SECRET);

       expect(() => verifyToken(token, 'wrong-secret')).toThrow('Invalid token');
     });

     it('should decode token without verification', () => {
       const payload = { userId: '123', role: 'learner' as const };
       const token = generateToken(payload, TEST_SECRET);

       const decoded = decodeToken(token);
       expect(decoded).toBeTruthy();
       expect(decoded?.userId).toBe('123');
     });
   });
   ```

3. Install vitest if not already:

   ```bash
   pnpm --filter @polyladder/core add -D vitest
   ```

4. Add test script to `packages/core/package.json`:
   ```json
   {
     "scripts": {
       "test": "vitest run",
       "test:watch": "vitest"
     }
   }
   ```

**Files Created**:

- `packages/core/tests/auth/password.test.ts`
- `packages/core/tests/auth/jwt.test.ts`

---

## Dependencies

- **Blocks**: F005 (role-based authorization), F006 (session management), F019 (authentication endpoints)
- **Depends on**: F001 (database schema), F002 (core domain model)

---

## Notes

- Password strength validation enforces: min 8 chars, uppercase, lowercase, number
- JWT expires after 7 days; frontend must handle re-authentication
- bcrypt salt rounds set to 10 (industry standard balance between security and performance)
- Passwords never logged or returned in API responses
- Email is case-sensitive; consider normalizing to lowercase in future
- Registration automatically assigns 'learner' role; operators created manually
- JWT secret MUST be different in production (stored as environment variable)
- Consider adding rate limiting to prevent brute force attacks (future enhancement)

---

## Open Questions

### 1. Password Hashing Algorithm: bcrypt vs Argon2

**Question**: Should we use bcrypt (current) or upgrade to Argon2id for password hashing?

**Current Approach**: bcrypt with 10 salt rounds (~100ms per hash). Industry standard, widely deployed, but designed in 1999 and increasingly vulnerable to specialized hardware (ASICs).

**Alternatives**:

1. **bcrypt (current)**: Proven track record, widely supported libraries, but vulnerable to GPU/ASIC attacks. 10 rounds = ~100ms on modern CPU.
2. **Argon2id**: Winner of Password Hashing Competition (2015), resistant to GPU/ASIC/side-channel attacks. Configurable memory hardness. Slower to crack but requires more tuning.
3. **scrypt**: Memory-hard like Argon2 but older (2009). Good but Argon2 considered superior.
4. **PBKDF2**: Standard but weakest against GPU attacks. Only use if compatibility required.

**Recommendation**: **Migrate to Argon2id** (Option 2) for new accounts, maintain bcrypt compatibility for existing users. Use `@node-rs/argon2` (Rust bindings, fastest):

```typescript
import { hash, verify } from '@node-rs/argon2';

// Argon2id with recommended params (OWASP 2023)
const argon2Hash = await hash(password, {
  memoryCost: 19456, // 19 MB
  timeCost: 2, // iterations
  parallelism: 1, // threads
  algorithm: Algorithm.Argon2id,
});
```

Migration strategy:

- New registrations use Argon2id
- Add `users.password_algorithm` enum column ('bcrypt' | 'argon2id')
- On login, if user has bcrypt hash, verify, then rehash with Argon2id and update
- Complete migration in ~6 months as users log in naturally

---

### 2. Email Verification Requirement

**Question**: Should email verification be required before users can access the application, or optional?

**Current Approach**: No email verification mentioned. Users can register and immediately start using the app. Email might not even be real.

**Alternatives**:

1. **No verification** (current): Instant access, smooth UX, but allows fake emails, spam accounts, can't do password reset via email.
2. **Required before access**: Send verification email, block app usage until clicked. Highest security but friction in onboarding - users may abandon if email delayed.
3. **Required before certain features**: Allow basic learning immediately, require verification for social features, data export, or after 7 days trial period.
4. **Optional with incentives**: Email verification unlocks badge/reward. Gamified nudge without blocking access.

**Recommendation**: **Required before certain features** (Option 3) with grace period. Flow:

- Registration → immediate access to learning features (practice, SRS, progress tracking)
- After 3 days OR when trying to export data/contact support, show: "Please verify email to continue"
- Resend verification email with exponential cooldown (1min, 5min, 15min) to prevent spam
- Mark unverified accounts for deletion after 30 days of inactivity

This balances onboarding friction (users can try app immediately) with security (verified email needed for account recovery, data export). Add `users.email_verified_at` timestamp column.

---

### 3. Account Lockout Policy for Failed Login Attempts

**Question**: After how many failed login attempts should we lock an account, and for how long?

**Current Approach**: No account lockout mentioned. Unlimited login attempts possible. Vulnerable to brute force attacks even with rate limiting.

**Alternatives**:

1. **No lockout** (current): Rely only on rate limiting (F006). Simple but allows persistent attacks across IP addresses/sessions.
2. **Hard lockout**: Lock account after N failures (5-10) until admin manually unlocks. Most secure but terrible UX - user locked out by attacker.
3. **Time-based lockout**: Lock for T minutes (15-60) after N failures (5-10), then auto-unlock. Balances security and UX.
4. **Progressive delay**: 1st failure = no delay, 2nd = 5s, 3rd = 15s, 4th = 60s, 5th = 300s. Exponential backoff makes brute force impractical.
5. **CAPTCHA after failures**: Require CAPTCHA after 3 failures instead of locking. Stops bots while allowing humans.

**Recommendation**: **Time-based lockout + CAPTCHA** (Option 3 + 5 hybrid). Implementation:

- Track failed attempts in `failed_login_attempts` table per email
- After 5 failed attempts within 15 minutes → lock account for 15 minutes
- After 3 failed attempts → require CAPTCHA (hCaptcha/Cloudflare Turnstile) for next login
- Successful login resets failure counter
- Store `users.locked_until` timestamp

Add CAPTCHA only for accounts with failed attempts to minimize friction for legitimate users. This stops automated attacks while allowing real users who forgot password to try a few times before being locked out. Include "Forgot password?" link that bypasses lockout.
