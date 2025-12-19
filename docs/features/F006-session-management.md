# F006: Session Management

**Feature Code**: F006
**Created**: 2025-12-17
**Phase**: 1 - Authentication & User Management
**Status**: Not Started

---

## Description

Implement JWT-based session management including token verification, expiration handling, and user information retrieval. This provides stateless authentication across API requests.

## Success Criteria

- [ ] JWT verification middleware for all protected routes
- [ ] Token expiration automatically enforced (7 days)
- [ ] "Get current user" endpoint returns user information
- [ ] Client-side logout (token removal)
- [ ] Invalid/expired tokens return 401 Unauthorized
- [ ] Request context includes authenticated user information
- [ ] No server-side session storage required

---

## Tasks

### Task 1: Create Session Verification Middleware

**Description**: Build middleware that verifies JWT on every protected request.

**Implementation Plan**:

1. The authentication middleware created in F005 already handles JWT verification
2. Create session-specific utilities in `packages/core/src/auth/session.ts`:
   ```typescript
   import { JWTPayload } from '../domain/user';

   /**
    * Session information extracted from JWT
    */
   export interface Session {
     userId: string;
     role: string;
     issuedAt: Date;
     expiresAt: Date;
   }

   /**
    * Convert JWT payload to session information
    */
   export function jwtToSession(payload: JWTPayload): Session {
     return {
       userId: payload.userId,
       role: payload.role,
       issuedAt: payload.iat ? new Date(payload.iat * 1000) : new Date(),
       expiresAt: payload.exp ? new Date(payload.exp * 1000) : new Date(),
     };
   }

   /**
    * Check if session is expired
    */
   export function isSessionExpired(session: Session): boolean {
     return session.expiresAt < new Date();
   }

   /**
    * Get remaining session time in milliseconds
    */
   export function getRemainingSessionTime(session: Session): number {
     const now = Date.now();
     const expires = session.expiresAt.getTime();
     return Math.max(0, expires - now);
   }

   /**
    * Check if session should be refreshed (less than 1 day remaining)
    */
   export function shouldRefreshSession(session: Session): boolean {
     const remaining = getRemainingSessionTime(session);
     const oneDayMs = 24 * 60 * 60 * 1000;
     return remaining < oneDayMs;
   }
   ```

2. Export from `packages/core/src/index.ts`:
   ```typescript
   export * from './auth/session';
   ```

**Files Created**:
- `packages/core/src/auth/session.ts`

---

### Task 2: Implement "Get Current User" Endpoint

**Description**: Create API endpoint that returns authenticated user's information.

**Implementation Plan**:

1. Create `packages/api/src/routes/auth/me.ts`:
   ```typescript
   import { FastifyInstance } from 'fastify';
   import { findUserById } from '@polyladder/db';
   import { toPublicUser } from '@polyladder/core';
   import { protectRoute } from '../../decorators/route-protection';

   /**
    * GET /api/v1/auth/me
    * Returns current authenticated user's information
    */
   export async function meRoutes(fastify: FastifyInstance) {
     fastify.get(
       '/me',
       protectRoute(fastify),
       async (request, reply) => {
         try {
           // User is guaranteed to exist because of protectRoute middleware
           const userId = request.user!.userId;

           // Fetch user from database
           const user = await findUserById(fastify.pg, userId);

           if (!user) {
             return reply.status(404).send({
               error: 'Not Found',
               message: 'User not found',
             });
           }

           // Return public user information (no password hash)
           return {
             user: toPublicUser(user),
           };
         } catch (error) {
           fastify.log.error(error, 'Failed to fetch current user');
           return reply.status(500).send({
             error: 'Internal Server Error',
             message: 'Failed to fetch user information',
           });
         }
       }
     );
   }
   ```

2. Register route in auth routes index `packages/api/src/routes/auth/index.ts`:
   ```typescript
   import { FastifyInstance } from 'fastify';
   import { meRoutes } from './me';
   // Other auth route imports...

   export async function authRoutes(fastify: FastifyInstance) {
     fastify.register(async (instance) => {
       // Register all auth routes under /api/v1/auth
       await instance.register(meRoutes);
       // Other routes...
     }, { prefix: '/auth' });
   }
   ```

**Files Created**:
- `packages/api/src/routes/auth/me.ts`

---

### Task 3: Create Session Validation Service

**Description**: Build service for validating and managing session state.

**Implementation Plan**:

1. Create `packages/core/src/services/session-validation.ts`:
   ```typescript
   import { Pool } from 'pg';
   import { JWTPayload, PublicUser, toPublicUser } from '../domain/user';
   import { findUserById } from '@polyladder/db';
   import { jwtToSession, isSessionExpired } from '../auth/session';

   export class SessionValidationError extends Error {
     constructor(message: string) {
       super(message);
       this.name = 'SessionValidationError';
     }
   }

   /**
    * Validate JWT payload and return user information
    * @param pool Database connection pool
    * @param payload JWT payload from verified token
    * @returns User information
    * @throws SessionValidationError if session is invalid
    */
   export async function validateSession(
     pool: Pool,
     payload: JWTPayload
   ): Promise<PublicUser> {
     // Check if session is expired
     const session = jwtToSession(payload);
     if (isSessionExpired(session)) {
       throw new SessionValidationError('Session has expired');
     }

     // Verify user still exists in database
     const user = await findUserById(pool, payload.userId);
     if (!user) {
       throw new SessionValidationError('User not found');
     }

     // Verify role hasn't changed (shouldn't happen, but safety check)
     if (user.role !== payload.role) {
       throw new SessionValidationError('User role has changed, please re-authenticate');
     }

     return toPublicUser(user);
   }

   /**
    * Check if session needs refresh
    * @param payload JWT payload
    * @returns True if session should be refreshed
    */
   export function needsSessionRefresh(payload: JWTPayload): boolean {
     const session = jwtToSession(payload);
     return shouldRefreshSession(session);
   }
   ```

2. Export from `packages/core/src/index.ts`:
   ```typescript
   export * from './services/session-validation';
   ```

**Files Created**:
- `packages/core/src/services/session-validation.ts`

---

### Task 4: Implement Logout (Client-Side)

**Description**: Document logout pattern since JWT is stateless.

**Implementation Plan**:

1. Create documentation in `docs/AUTH_PATTERNS.md` (append to existing file):
   ```markdown
   ## Logout Pattern

   ### Client-Side Logout

   Since JWT is stateless, logout is handled client-side by removing the token:

   \`\`\`typescript
   // Frontend logout
   export function logout() {
     // Remove token from localStorage
     localStorage.removeItem('authToken');

     // Redirect to login page
     window.location.href = '/login';
   }
   \`\`\`

   ### Server-Side Token Invalidation (Future)

   For immediate token invalidation, consider implementing:
   - Token blacklist in Redis
   - Token revocation endpoint
   - Shorter token expiration with refresh tokens

   Current system: Tokens remain valid until expiration (7 days).
   ```

2. No server-side endpoint needed for basic logout

**Files Created**:
- (Documentation update only)

---

### Task 5: Add Session Information to Logs

**Description**: Enhance logging to include user context from session.

**Implementation Plan**:

1. Create logging middleware `packages/api/src/middleware/request-logger.ts`:
   ```typescript
   import { FastifyRequest, FastifyReply } from 'fastify';

   /**
    * Enhanced request logging with session context
    */
   export async function requestLoggerMiddleware(
     request: FastifyRequest,
     reply: FastifyReply
   ): Promise<void> {
     // Add user context to log if available
     if (request.user) {
       request.log = request.log.child({
         userId: request.user.userId,
         userRole: request.user.role,
       });
     }

     // Log request start
     request.log.info({
       method: request.method,
       url: request.url,
       ip: request.ip,
     }, 'Incoming request');

     // Track response time
     const startTime = Date.now();

     reply.addHook('onResponse', () => {
       const duration = Date.now() - startTime;
       request.log.info({
         method: request.method,
         url: request.url,
         statusCode: reply.statusCode,
         duration,
       }, 'Request completed');
     });
   }
   ```

2. Register in Fastify server setup:
   ```typescript
   // In packages/api/src/server.ts
   import { requestLoggerMiddleware } from './middleware/request-logger';

   // Register for all routes
   fastify.addHook('onRequest', requestLoggerMiddleware);
   ```

**Files Created**:
- `packages/api/src/middleware/request-logger.ts`

---

### Task 6: Create Session Testing Utilities

**Description**: Build test helpers for simulating authenticated requests.

**Implementation Plan**:

1. Create `packages/api/tests/helpers/auth.ts`:
   ```typescript
   import { generateToken, UserRole } from '@polyladder/core';

   const TEST_JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

   /**
    * Generate test JWT token
    */
   export function createTestToken(userId: string, role: UserRole = 'learner'): string {
     return generateToken({ userId, role }, TEST_JWT_SECRET);
   }

   /**
    * Create authorization header for testing
    */
   export function createAuthHeader(userId: string, role: UserRole = 'learner'): string {
     const token = createTestToken(userId, role);
     return `Bearer ${token}`;
   }

   /**
    * Test user IDs
    */
   export const TEST_USERS = {
     LEARNER: 'test-learner-123',
     OPERATOR: 'test-operator-456',
   };

   /**
    * Create test learner token
    */
   export function learnerToken(): string {
     return createTestToken(TEST_USERS.LEARNER, 'learner');
   }

   /**
    * Create test operator token
    */
   export function operatorToken(): string {
     return createTestToken(TEST_USERS.OPERATOR, 'operator');
   }
   ```

2. Create integration test example `packages/api/tests/routes/auth/me.test.ts`:
   ```typescript
   import { describe, it, expect, beforeAll, afterAll } from 'vitest';
   import { build } from '../../helpers/server';
   import { createAuthHeader, TEST_USERS } from '../../helpers/auth';

   describe('GET /api/v1/auth/me', () => {
     let app: any;

     beforeAll(async () => {
       app = await build();
     });

     afterAll(async () => {
       await app.close();
     });

     it('should return current user information', async () => {
       const response = await app.inject({
         method: 'GET',
         url: '/api/v1/auth/me',
         headers: {
           authorization: createAuthHeader(TEST_USERS.LEARNER),
         },
       });

       expect(response.statusCode).toBe(200);
       const body = JSON.parse(response.body);
       expect(body.user).toBeDefined();
       expect(body.user.id).toBe(TEST_USERS.LEARNER);
     });

     it('should return 401 without authentication', async () => {
       const response = await app.inject({
         method: 'GET',
         url: '/api/v1/auth/me',
       });

       expect(response.statusCode).toBe(401);
     });

     it('should return 401 with invalid token', async () => {
       const response = await app.inject({
         method: 'GET',
         url: '/api/v1/auth/me',
         headers: {
           authorization: 'Bearer invalid-token',
         },
       });

       expect(response.statusCode).toBe(401);
     });
   });
   ```

**Files Created**:
- `packages/api/tests/helpers/auth.ts`
- `packages/api/tests/routes/auth/me.test.ts`

---

### Task 7: Document Session Lifecycle

**Description**: Create comprehensive documentation for session management.

**Implementation Plan**:

1. Create `docs/SESSION_MANAGEMENT.md`:
   ```markdown
   # Session Management

   ## Overview

   PolyLadder uses stateless JWT-based authentication. No server-side session storage is required.

   ## Session Lifecycle

   ### 1. Registration/Login

   \`\`\`
   Client → POST /api/v1/auth/register or /login
   Server → Generate JWT (expires in 7 days)
   Server → Return JWT to client
   Client → Store JWT in localStorage
   \`\`\`

   ### 2. Authenticated Requests

   \`\`\`
   Client → Send request with Authorization: Bearer <token>
   Server → Verify JWT signature
   Server → Check expiration
   Server → Extract userId and role
   Server → Process request
   \`\`\`

   ### 3. Logout

   \`\`\`
   Client → Remove JWT from localStorage
   Client → Redirect to login page
   \`\`\`

   ## Token Structure

   JWT payload contains:
   - `userId`: User's UUID
   - `role`: 'learner' or 'operator'
   - `iat`: Issued at (Unix timestamp)
   - `exp`: Expires at (Unix timestamp)

   Example decoded JWT:
   \`\`\`json
   {
     "userId": "123e4567-e89b-12d3-a456-426614174000",
     "role": "learner",
     "iat": 1705320000,
     "exp": 1705924800
   }
   \`\`\`

   ## Expiration Handling

   ### Client-Side
   - Check token expiration before making requests
   - Redirect to login if expired
   - Show "session expired" message

   ### Server-Side
   - JWT library automatically validates expiration
   - Returns 401 if token is expired
   - Client must re-authenticate

   ## Security Considerations

   ### Token Storage
   - Store in localStorage (acceptable for this use case)
   - Alternative: HttpOnly cookies (more secure but complicates deployment)

   ### Token Lifetime
   - 7 days expiration balances security and UX
   - Users must re-login weekly

   ### Token Refresh (Future Enhancement)
   - Implement refresh tokens for better UX
   - Short-lived access tokens (15 min)
   - Long-lived refresh tokens (30 days)

   ## Error Codes

   - **401 Unauthorized**: No token, invalid token, or expired token
   - **403 Forbidden**: Valid token but insufficient role

   ## Testing Sessions

   \`\`\`typescript
   import { createTestToken } from './tests/helpers/auth';

   const token = createTestToken('user-id', 'learner');
   const response = await request.get('/api/v1/protected')
     .set('Authorization', \`Bearer \${token}\`);
   \`\`\`
   ```

**Files Created**:
- `docs/SESSION_MANAGEMENT.md`

---

### Task 8: Create Unit Tests

**Description**: Test session validation and management logic.

**Implementation Plan**:

1. Create `packages/core/tests/auth/session.test.ts`:
   ```typescript
   import { describe, it, expect } from 'vitest';
   import { jwtToSession, isSessionExpired, getRemainingSessionTime, shouldRefreshSession } from '../../src/auth/session';

   describe('Session Management', () => {
     describe('jwtToSession', () => {
       it('should convert JWT payload to session', () => {
         const now = Math.floor(Date.now() / 1000);
         const payload = {
           userId: '123',
           role: 'learner' as const,
           iat: now,
           exp: now + 7 * 24 * 60 * 60, // 7 days
         };

         const session = jwtToSession(payload);
         expect(session.userId).toBe('123');
         expect(session.role).toBe('learner');
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

     describe('shouldRefreshSession', () => {
       it('should return true if less than 1 day remaining', () => {
         const session = {
           userId: '123',
           role: 'learner',
           issuedAt: new Date(),
           expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours
         };

         expect(shouldRefreshSession(session)).toBe(true);
       });

       it('should return false if more than 1 day remaining', () => {
         const session = {
           userId: '123',
           role: 'learner',
           issuedAt: new Date(),
           expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
         };

         expect(shouldRefreshSession(session)).toBe(false);
       });
     });
   });
   ```

**Files Created**:
- `packages/core/tests/auth/session.test.ts`

---

## Dependencies

- **Blocks**: F019 (authentication endpoints), F023 (authentication UI)
- **Depends on**: F004 (user registration & login), F005 (role-based authorization)

---

## Notes

- JWT is stateless; no server-side session storage required
- Tokens cannot be invalidated before expiration (by design)
- For immediate revocation, implement token blacklist (future enhancement)
- 7-day expiration balances security and user convenience
- Consider implementing refresh tokens for better UX in future
- HttpOnly cookies more secure than localStorage but complicate CORS
- Current approach acceptable for MVP
- Monitor token size; don't add too much data to payload

---

## Open Questions

### 1. Token Storage: HttpOnly Cookies vs localStorage

**Question**: Should JWTs be stored in HttpOnly cookies (server-side set) or localStorage (client-side managed)?

**Current Approach**: Not explicitly defined. Notes mention "HttpOnly cookies more secure than localStorage but complicate CORS" suggesting localStorage might be current choice for simplicity.

**Alternatives**:
1. **localStorage**: Client stores token, includes in `Authorization: Bearer` header. Simple, works with CORS, but vulnerable to XSS attacks (malicious scripts can steal token).
2. **HttpOnly cookies**: Server sets cookie with `HttpOnly; Secure; SameSite=Strict` flags. Immune to XSS but vulnerable to CSRF, requires CSRF tokens, complicates CORS with credentials.
3. **Hybrid**: Refresh token in HttpOnly cookie, short-lived access token in memory (React state). Best security but most complex.
4. **SessionStorage**: Like localStorage but cleared on tab close. Slightly better security but poor UX (logout on tab close).

**Recommendation**: Use **HttpOnly cookies** (Option 2) for production security. Implementation:
```typescript
// Server sets cookie after login
reply.setCookie('auth_token', jwt, {
  httpOnly: true,        // No JavaScript access
  secure: true,          // HTTPS only
  sameSite: 'strict',    // CSRF protection
  maxAge: 7 * 24 * 60 * 60 // 7 days
});
```

Frontend configuration:
- API requests use `credentials: 'include'` to send cookies
- CORS must allow credentials: `Access-Control-Allow-Credentials: true`
- Add CSRF protection: Double-submit cookie pattern or synchronizer tokens

For development (localhost), use `sameSite: 'lax'` and `secure: false`. The XSS protection from HttpOnly is worth the CORS complexity for a production app handling user data.

---

### 2. Token Revocation Strategy for Logout and Ban

**Question**: How should we handle immediate token invalidation (logout, account ban, password change) when JWTs are stateless?

**Current Approach**: Stateless JWT with no server-side storage. Tokens valid until expiration (7 days). Notes mention "cannot be invalidated before expiration" and token blacklist as "future enhancement".

**Alternatives**:
1. **No revocation** (current): Wait for token to expire naturally. Simple but terrible for security - banned user can use app for up to 7 days after ban.
2. **Token blacklist in database**: Store revoked token JTIs in `revoked_tokens` table. Check on every request. Adds database query overhead but enables instant revocation.
3. **Token blacklist in Redis**: Store revoked JTIs in Redis with TTL matching token expiration. Faster than database but adds infrastructure dependency.
4. **Short-lived tokens + refresh tokens**: 15-minute access tokens, long-lived refresh tokens. Revoke refresh token in database. Limits exposure but requires refresh token flow.
5. **Server-side sessions**: Abandon JWT, use session IDs stored in Redis/database. Full control over revocation but loses stateless benefits.

**Recommendation**: Implement **short-lived tokens + refresh tokens** (Option 4). Architecture:
- **Access token**: JWT, 15-minute expiration, stored in memory (React state), used for API requests
- **Refresh token**: Secure random string, 30-day expiration, stored in HttpOnly cookie, tracked in database

Flow:
```typescript
// Database table
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL, -- SHA256 of token
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP, -- NULL = active
  created_at TIMESTAMP DEFAULT NOW()
);

// On logout/ban
UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1;
```

This enables instant revocation (revoke refresh token) while keeping access tokens stateless. 15-minute window limits damage if access token stolen. Add automatic refresh: frontend checks token expiration, calls `/auth/refresh` endpoint before expiry.

---

### 3. Session Activity Tracking and Concurrent Login Limits

**Question**: Should we track active sessions per user and limit concurrent logins (e.g., max 3 devices)?

**Current Approach**: Stateless JWT with no session tracking. User can log in from unlimited devices simultaneously. No visibility into where user is logged in.

**Alternatives**:
1. **No tracking** (current): Unlimited concurrent sessions. Simple but no audit trail, can't answer "where am I logged in?", can't revoke specific device.
2. **Track all sessions in database**: Store session metadata (device, IP, login time) for each active refresh token. User can view and revoke sessions. Full visibility but database overhead.
3. **Limit concurrent sessions**: Allow max N devices (3-5). New login revokes oldest session. Prevents account sharing but may frustrate legitimate users with many devices.
4. **Track + optional limit**: Store sessions, let user configure limit (1-10 devices) in settings. Flexibility but more complex.

**Recommendation**: **Track all sessions without hard limits** (Option 2). Extend `refresh_tokens` table:
```sql
ALTER TABLE refresh_tokens ADD COLUMN device_info JSONB;

-- Store on login
{
  "user_agent": "Mozilla/5.0...",
  "device_type": "desktop", // mobile/tablet/desktop
  "device_name": "Chrome on Windows",
  "ip_address": "192.168.1.1",
  "country": "US"
}
```

Build "Active Sessions" page in UI (F023):
- Show all active devices with last activity time
- "Sign out" button per session (revoke that refresh token)
- "Sign out all other devices" button (revoke all except current)

No hard limit initially (don't block legitimate multi-device users) but monitor abuse. Add soft limit later if needed (email alert if >10 concurrent sessions = potential account compromise). Store last activity: `UPDATE refresh_tokens SET last_used_at = NOW()` on each token refresh.
