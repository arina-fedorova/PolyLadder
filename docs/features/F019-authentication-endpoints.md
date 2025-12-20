# F019: Authentication Endpoints

**Feature Code**: F019
**Created**: 2025-12-17
**Phase**: 5 - API Layer
**Status**: ✅ Completed
**Completed**: 2025-12-20
**PR**: #22

---

## Description

Implement REST API endpoints for user registration, login, and current user information retrieval.

## Success Criteria

- [x] POST /auth/register
- [x] POST /auth/login
- [x] GET /auth/me
- [x] POST /auth/refresh
- [x] POST /auth/logout
- [x] TypeBox schema validation for request bodies
- [x] Proper error responses

---

## Tasks

### Task 1: Create Registration Endpoint

**Description**: POST /auth/register endpoint for new user registration with email/password.

**Implementation Plan**:

Create `packages/api/src/routes/auth/register.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcryptjs';
import { SuccessResponseSchema } from '../../schemas/common';

const RegisterRequestSchema = Type.Object({
  email: Type.String({ format: 'email', minLength: 5, maxLength: 255 }),
  password: Type.String({ minLength: 8, maxLength: 100 }),
  role: Type.Optional(
    Type.Union([Type.Literal('learner'), Type.Literal('operator')], { default: 'learner' })
  ),
});

const RegisterResponseSchema = Type.Object({
  userId: Type.String({ format: 'uuid' }),
  email: Type.String({ format: 'email' }),
  role: Type.Union([Type.Literal('learner'), Type.Literal('operator')]),
});

export const registerRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/register',
    {
      schema: {
        body: RegisterRequestSchema,
        response: {
          201: RegisterResponseSchema,
          400: Type.Object({
            error: Type.Object({
              statusCode: Type.Literal(400),
              message: Type.String(),
              requestId: Type.String(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const { email, password, role = 'learner' } = request.body;

      try {
        // Check if user already exists
        const existingUser = await fastify.pg.query('SELECT id FROM users WHERE email = $1', [
          email.toLowerCase(),
        ]);

        if (existingUser.rows.length > 0) {
          return reply.status(400).send({
            error: {
              statusCode: 400,
              message: 'User with this email already exists',
              requestId: request.id,
            },
          });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12); // Cost factor 12

        // Insert user
        const result = await fastify.pg.query(
          `INSERT INTO users (email, password_hash, role, created_at, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id, email, role`,
          [email.toLowerCase(), passwordHash, role]
        );

        const user = result.rows[0];

        request.log.info({ userId: user.id, email: user.email }, 'User registered');

        return reply.status(201).send({
          userId: user.id,
          email: user.email,
          role: user.role,
        });
      } catch (error) {
        request.log.error({ err: error, email }, 'Registration failed');
        throw error;
      }
    }
  );
};
```

**Files Created**: `packages/api/src/routes/auth/register.ts`

---

### Task 2: Create Login Endpoint

**Description**: POST /auth/login endpoint for user authentication with JWT token generation.

**Implementation Plan**:

Create `packages/api/src/routes/auth/login.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

const LoginRequestSchema = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 1 }),
});

const LoginResponseSchema = Type.Object({
  accessToken: Type.String(),
  refreshToken: Type.String(),
  user: Type.Object({
    id: Type.String({ format: 'uuid' }),
    email: Type.String({ format: 'email' }),
    role: Type.Union([Type.Literal('learner'), Type.Literal('operator')]),
  }),
});

export const loginRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/login',
    {
      schema: {
        body: LoginRequestSchema,
        response: {
          200: LoginResponseSchema,
          401: Type.Object({
            error: Type.Object({
              statusCode: Type.Literal(401),
              message: Type.String(),
              requestId: Type.String(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      try {
        // Find user by email
        const result = await fastify.pg.query(
          'SELECT id, email, password_hash, role FROM users WHERE email = $1',
          [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
          return reply.status(401).send({
            error: {
              statusCode: 401,
              message: 'Invalid email or password',
              requestId: request.id,
            },
          });
        }

        const user = result.rows[0];

        // Verify password
        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
          return reply.status(401).send({
            error: {
              statusCode: 401,
              message: 'Invalid email or password',
              requestId: request.id,
            },
          });
        }

        // Generate JWT tokens
        const accessToken = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
          expiresIn: JWT_ACCESS_EXPIRY,
        });

        const refreshToken = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
          expiresIn: JWT_REFRESH_EXPIRY,
        });

        // Store refresh token in database
        await fastify.pg.query(
          `INSERT INTO refresh_tokens (user_id, token, expires_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '${JWT_REFRESH_EXPIRY}')`,
          [user.id, refreshToken]
        );

        request.log.info({ userId: user.id, email: user.email }, 'User logged in');

        return reply.status(200).send({
          accessToken,
          refreshToken,
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
          },
        });
      } catch (error) {
        request.log.error({ err: error, email }, 'Login failed');
        throw error;
      }
    }
  );
};
```

**Files Created**: `packages/api/src/routes/auth/login.ts`

---

### Task 3: Create Current User Endpoint

**Description**: GET /auth/me endpoint to retrieve authenticated user information.

**Implementation Plan**:

Create `packages/api/src/routes/auth/me.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth.middleware';

const UserProfileSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  email: Type.String({ format: 'email' }),
  role: Type.Union([Type.Literal('learner'), Type.Literal('operator')]),
  createdAt: Type.String({ format: 'date-time' }),
});

export const meRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/me',
    {
      preHandler: authMiddleware,
      schema: {
        response: {
          200: UserProfileSchema,
          401: Type.Object({
            error: Type.Object({
              statusCode: Type.Literal(401),
              message: Type.String(),
              requestId: Type.String(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        // User is attached by authMiddleware
        const userId = request.user!.userId;

        // Fetch user from database
        const result = await fastify.pg.query(
          'SELECT id, email, role, created_at FROM users WHERE id = $1',
          [userId]
        );

        if (result.rows.length === 0) {
          return reply.status(401).send({
            error: {
              statusCode: 401,
              message: 'User not found',
              requestId: request.id,
            },
          });
        }

        const user = result.rows[0];

        return reply.status(200).send({
          id: user.id,
          email: user.email,
          role: user.role,
          createdAt: user.created_at.toISOString(),
        });
      } catch (error) {
        request.log.error(
          { err: error, userId: request.user?.userId },
          'Failed to fetch user profile'
        );
        throw error;
      }
    }
  );
};
```

**Files Created**: `packages/api/src/routes/auth/me.ts`

---

### Task 4: Create Refresh Token Endpoint

**Description**: POST /auth/refresh endpoint to obtain new access token using refresh token.

**Implementation Plan**:

Create `packages/api/src/routes/auth/refresh.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';

const RefreshRequestSchema = Type.Object({
  refreshToken: Type.String(),
});

const RefreshResponseSchema = Type.Object({
  accessToken: Type.String(),
});

export const refreshRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/refresh',
    {
      schema: {
        body: RefreshRequestSchema,
        response: {
          200: RefreshResponseSchema,
          401: Type.Object({
            error: Type.Object({
              statusCode: Type.Literal(401),
              message: Type.String(),
              requestId: Type.String(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const { refreshToken } = request.body;

      try {
        // Verify refresh token
        const decoded = jwt.verify(refreshToken, JWT_SECRET) as {
          userId: string;
          role: 'learner' | 'operator';
        };

        // Check if refresh token exists in database
        const tokenResult = await fastify.pg.query(
          'SELECT user_id FROM refresh_tokens WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP',
          [refreshToken]
        );

        if (tokenResult.rows.length === 0) {
          return reply.status(401).send({
            error: {
              statusCode: 401,
              message: 'Invalid or expired refresh token',
              requestId: request.id,
            },
          });
        }

        // Generate new access token
        const accessToken = jwt.sign({ userId: decoded.userId, role: decoded.role }, JWT_SECRET, {
          expiresIn: JWT_ACCESS_EXPIRY,
        });

        request.log.info({ userId: decoded.userId }, 'Access token refreshed');

        return reply.status(200).send({
          accessToken,
        });
      } catch (error) {
        if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
          return reply.status(401).send({
            error: {
              statusCode: 401,
              message: 'Invalid or expired refresh token',
              requestId: request.id,
            },
          });
        }

        request.log.error({ err: error }, 'Token refresh failed');
        throw error;
      }
    }
  );
};
```

**Files Created**: `packages/api/src/routes/auth/refresh.ts`

---

### Task 5: Add Logout Endpoint

**Description**: POST /auth/logout endpoint to invalidate refresh token.

**Implementation Plan**:

Create `packages/api/src/routes/auth/logout.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth.middleware';
import { SuccessResponseSchema } from '../../schemas/common';

const LogoutRequestSchema = Type.Object({
  refreshToken: Type.String(),
});

export const logoutRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/logout',
    {
      preHandler: authMiddleware,
      schema: {
        body: LogoutRequestSchema,
        response: {
          200: SuccessResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { refreshToken } = request.body;
      const userId = request.user!.userId;

      try {
        // Delete refresh token from database
        await fastify.pg.query('DELETE FROM refresh_tokens WHERE token = $1 AND user_id = $2', [
          refreshToken,
          userId,
        ]);

        request.log.info({ userId }, 'User logged out');

        return reply.status(200).send({
          success: true,
          message: 'Logged out successfully',
        });
      } catch (error) {
        request.log.error({ err: error, userId }, 'Logout failed');
        throw error;
      }
    }
  );
};
```

**Files Created**: `packages/api/src/routes/auth/logout.ts`

---

### Task 6: Register All Auth Routes

**Description**: Create auth route index and register all authentication endpoints.

**Implementation Plan**:

Create `packages/api/src/routes/auth/index.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { registerRoute } from './register';
import { loginRoute } from './login';
import { meRoute } from './me';
import { refreshRoute } from './refresh';
import { logoutRoute } from './logout';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register all auth routes
  await fastify.register(registerRoute);
  await fastify.register(loginRoute);
  await fastify.register(meRoute);
  await fastify.register(refreshRoute);
  await fastify.register(logoutRoute);
};
```

Update `packages/api/src/server.ts` to register auth routes:

```typescript
async function registerRoutes(server: FastifyInstance): Promise<void> {
  // Health check endpoint
  server.get('/health', async (request, reply) => {
    // ... existing health check code ...
  });

  // Root endpoint
  server.get('/', async (request, reply) => {
    // ... existing root endpoint code ...
  });

  // Import and register feature routes
  const { authRoutes } = await import('./routes/auth');
  await server.register(authRoutes, { prefix: '/auth' });

  // NOTE: F020-F021 routes to be added here
  // await server.register(operationalRoutes, { prefix: '/operational' });
  // await server.register(learningRoutes, { prefix: '/learning' });
}
```

**Files Created**:

- `packages/api/src/routes/auth/index.ts`
- Update `packages/api/src/server.ts`

---

### Task 7: Add Refresh Tokens Table Migration

**Description**: Database table to store refresh tokens.

**Implementation Plan**:

Create `packages/db/migrations/012-refresh-tokens.sql`:

```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expiry ON refresh_tokens(expires_at);

-- Clean up expired tokens periodically (can be run as cron job)
CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens() RETURNS void AS $$
BEGIN
  DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;
```

**Files Created**: `packages/db/migrations/012-refresh-tokens.sql`

---

## Open Questions

None - authentication flow is standard JWT-based approach.

---

## Dependencies

- **Blocks**: F023
- **Depends on**: F004, F005, F006, F018

---

## Notes

- Registration and login don't require authentication
- `/me` requires valid JWT access token
- Refresh tokens stored in database for revocation capability
- Access token expiry: 15 minutes (short-lived for security)
- Refresh token expiry: 7 days (long-lived for user convenience)
- Password hashing uses bcrypt with cost factor 12
- Email addresses stored as lowercase for case-insensitive lookup
- Logout invalidates refresh token (access tokens expire naturally)
