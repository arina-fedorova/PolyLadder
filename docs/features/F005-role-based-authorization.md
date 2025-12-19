# F005: Role-Based Authorization

**Feature Code**: F005
**Created**: 2025-12-17
**Phase**: 1 - Authentication & User Management
**Status**: ✅ Completed
**Completed**: 2025-12-19
**PR**: #8

---

## Description

Implement role-based access control (RBAC) to restrict operator-only functionality. This ensures that operational endpoints (data approval, pipeline management) are only accessible to users with the operator role.

## Success Criteria

- [x] Role field in JWT payload
- [x] Authorization middleware checks user role
- [x] Operator-only routes return 403 Forbidden for non-operators
- [x] Clear separation between learner and operator endpoints
- [x] Role validation integrated with Fastify route protection
- [x] Authorization errors include descriptive messages

---

## Tasks

### Task 1: Create Authorization Utilities

**Description**: Build core authorization logic for role checking.

**Implementation Plan**:

1. Create `packages/core/src/auth/authorization.ts`:

   ```typescript
   import { UserRole } from '../domain/user';

   /**
    * Check if user has required role
    * @param userRole Current user's role
    * @param requiredRole Required role for access
    * @returns True if user has sufficient permissions
    */
   export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
     // Operators can access learner routes, but not vice versa
     if (requiredRole === 'learner') {
       return true; // All roles can access learner routes
     }

     return userRole === requiredRole;
   }

   /**
    * Check if user is an operator
    * @param userRole Current user's role
    * @returns True if user is an operator
    */
   export function isOperator(userRole: UserRole): boolean {
     return userRole === 'operator';
   }

   /**
    * Check if user is a learner
    * @param userRole Current user's role
    * @returns True if user is a learner
    */
   export function isLearner(userRole: UserRole): boolean {
     return userRole === 'learner';
   }

   /**
    * Authorization error class
    */
   export class AuthorizationError extends Error {
     constructor(message: string = 'Insufficient permissions') {
       super(message);
       this.name = 'AuthorizationError';
     }
   }

   /**
    * Assert user has required role, throw error if not
    * @param userRole Current user's role
    * @param requiredRole Required role for access
    * @throws AuthorizationError if user lacks permissions
    */
   export function assertRole(userRole: UserRole, requiredRole: UserRole): void {
     if (!hasRole(userRole, requiredRole)) {
       throw new AuthorizationError(
         `Access denied. Required role: ${requiredRole}, current role: ${userRole}`
       );
     }
   }

   /**
    * Assert user is an operator
    * @param userRole Current user's role
    * @throws AuthorizationError if user is not an operator
    */
   export function assertOperator(userRole: UserRole): void {
     if (!isOperator(userRole)) {
       throw new AuthorizationError('Access denied. Operator role required.');
     }
   }
   ```

2. Export from `packages/core/src/index.ts`:
   ```typescript
   export * from './auth/authorization';
   ```

**Files Created**:

- `packages/core/src/auth/authorization.ts`

---

### Task 2: Create Fastify Authorization Plugin

**Description**: Build Fastify plugin for role-based route protection.

**Implementation Plan**:

1. Create `packages/api/src/plugins/authorization.ts`:

   ```typescript
   import { FastifyPluginAsync } from 'fastify';
   import fp from 'fastify-plugin';
   import { UserRole } from '@polyladder/core';

   /**
    * Extend Fastify request with user information
    */
   declare module 'fastify' {
     interface FastifyRequest {
       user?: {
         userId: string;
         role: UserRole;
       };
     }
   }

   /**
    * Authorization plugin
    * Adds decorators for requiring specific roles
    */
   const authorizationPlugin: FastifyPluginAsync = async (fastify) => {
     /**
      * Require authentication (any role)
      */
     fastify.decorate('requireAuth', function () {
       return async function (request: any, reply: any) {
         if (!request.user) {
           return reply.status(401).send({
             error: 'Unauthorized',
             message: 'Authentication required',
           });
         }
       };
     });

     /**
      * Require operator role
      */
     fastify.decorate('requireOperator', function () {
       return async function (request: any, reply: any) {
         if (!request.user) {
           return reply.status(401).send({
             error: 'Unauthorized',
             message: 'Authentication required',
           });
         }

         if (request.user.role !== 'operator') {
           return reply.status(403).send({
             error: 'Forbidden',
             message: 'Operator role required',
           });
         }
       };
     });

     /**
      * Require learner role (any authenticated user)
      */
     fastify.decorate('requireLearner', function () {
       return async function (request: any, reply: any) {
         if (!request.user) {
           return reply.status(401).send({
             error: 'Unauthorized',
             message: 'Authentication required',
           });
         }
       };
     });
   };

   export default fp(authorizationPlugin, {
     name: 'authorization',
   });
   ```

2. Install fastify-plugin if not present:
   ```bash
   pnpm --filter @polyladder/api add fastify-plugin
   ```

**Files Created**:

- `packages/api/src/plugins/authorization.ts`

---

### Task 3: Create Authorization Middleware

**Description**: Build middleware to extract user from JWT and attach to request.

**Implementation Plan**:

1. Create `packages/api/src/middleware/auth.ts`:

   ```typescript
   import { FastifyRequest, FastifyReply } from 'fastify';
   import { verifyToken } from '@polyladder/core';

   /**
    * Authentication middleware
    * Extracts JWT from Authorization header and verifies it
    */
   export async function authMiddleware(
     request: FastifyRequest,
     reply: FastifyReply
   ): Promise<void> {
     const authHeader = request.headers.authorization;

     if (!authHeader || !authHeader.startsWith('Bearer ')) {
       return; // No token provided, user remains undefined
     }

     const token = authHeader.substring(7); // Remove 'Bearer ' prefix

     try {
       const jwtSecret = process.env.JWT_SECRET;
       if (!jwtSecret) {
         throw new Error('JWT_SECRET not configured');
       }

       const payload = verifyToken(token, jwtSecret);

       // Attach user to request
       request.user = {
         userId: payload.userId,
         role: payload.role,
       };
     } catch (error) {
       // Invalid token - return 401
       return reply.status(401).send({
         error: 'Unauthorized',
         message: error instanceof Error ? error.message : 'Invalid token',
       });
     }
   }

   /**
    * Optional authentication middleware
    * Extracts JWT if present but doesn't require it
    */
   export async function optionalAuthMiddleware(
     request: FastifyRequest,
     _reply: FastifyReply
   ): Promise<void> {
     const authHeader = request.headers.authorization;

     if (!authHeader || !authHeader.startsWith('Bearer ')) {
       return; // No token provided
     }

     const token = authHeader.substring(7);

     try {
       const jwtSecret = process.env.JWT_SECRET;
       if (!jwtSecret) {
         return;
       }

       const payload = verifyToken(token, jwtSecret);
       request.user = {
         userId: payload.userId,
         role: payload.role,
       };
     } catch {
       // Invalid token - ignore, user remains undefined
     }
   }
   ```

**Files Created**:

- `packages/api/src/middleware/auth.ts`

---

### Task 4: Create Route Protection Helpers

**Description**: Build convenient decorators for protecting routes by role.

**Implementation Plan**:

1. Create `packages/api/src/decorators/route-protection.ts`:

   ```typescript
   import { FastifyInstance } from 'fastify';
   import { authMiddleware } from '../middleware/auth';

   /**
    * Protect route - require authentication
    */
   export function protectRoute(fastify: FastifyInstance) {
     return {
       preHandler: [authMiddleware, fastify.requireAuth()],
     };
   }

   /**
    * Protect route - require operator role
    */
   export function protectOperatorRoute(fastify: FastifyInstance) {
     return {
       preHandler: [authMiddleware, fastify.requireOperator()],
     };
   }

   /**
    * Protect route - require learner role (any authenticated user)
    */
   export function protectLearnerRoute(fastify: FastifyInstance) {
     return {
       preHandler: [authMiddleware, fastify.requireLearner()],
     };
   }

   /**
    * Optional auth - attach user if present, don't require it
    */
   export function optionalAuth() {
     return {
       preHandler: [authMiddleware],
     };
   }
   ```

**Files Created**:

- `packages/api/src/decorators/route-protection.ts`

---

### Task 5: Update Type Declarations

**Description**: Add TypeScript declarations for Fastify decorators.

**Implementation Plan**:

1. Create `packages/api/src/types/fastify.d.ts`:

   ```typescript
   import { FastifyRequest, FastifyReply } from 'fastify';
   import { UserRole } from '@polyladder/core';

   declare module 'fastify' {
     interface FastifyInstance {
       requireAuth: () => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

       requireOperator: () => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

       requireLearner: () => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
     }

     interface FastifyRequest {
       user?: {
         userId: string;
         role: UserRole;
       };
     }
   }
   ```

2. Update `packages/api/tsconfig.json` to include type declarations:
   ```json
   {
     "extends": "../../tsconfig.json",
     "compilerOptions": {
       "outDir": "./dist",
       "rootDir": "./src",
       "types": ["node"]
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist", "tests"]
   }
   ```

**Files Created**:

- `packages/api/src/types/fastify.d.ts`

---

### Task 6: Create Unit Tests

**Description**: Test authorization logic and role checking.

**Implementation Plan**:

1. Create `packages/core/tests/auth/authorization.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import {
     hasRole,
     isOperator,
     isLearner,
     assertRole,
     assertOperator,
     AuthorizationError,
   } from '../../src/auth/authorization';

   describe('Authorization', () => {
     describe('hasRole', () => {
       it('should allow operator to access learner routes', () => {
         expect(hasRole('operator', 'learner')).toBe(true);
       });

       it('should allow learner to access learner routes', () => {
         expect(hasRole('learner', 'learner')).toBe(true);
       });

       it('should deny learner access to operator routes', () => {
         expect(hasRole('learner', 'operator')).toBe(false);
       });

       it('should allow operator to access operator routes', () => {
         expect(hasRole('operator', 'operator')).toBe(true);
       });
     });

     describe('isOperator', () => {
       it('should return true for operator role', () => {
         expect(isOperator('operator')).toBe(true);
       });

       it('should return false for learner role', () => {
         expect(isOperator('learner')).toBe(false);
       });
     });

     describe('isLearner', () => {
       it('should return true for learner role', () => {
         expect(isLearner('learner')).toBe(true);
       });

       it('should return false for operator role', () => {
         expect(isLearner('operator')).toBe(false);
       });
     });

     describe('assertRole', () => {
       it('should not throw for valid role', () => {
         expect(() => assertRole('operator', 'operator')).not.toThrow();
       });

       it('should throw AuthorizationError for invalid role', () => {
         expect(() => assertRole('learner', 'operator')).toThrow(AuthorizationError);
       });
     });

     describe('assertOperator', () => {
       it('should not throw for operator', () => {
         expect(() => assertOperator('operator')).not.toThrow();
       });

       it('should throw AuthorizationError for non-operator', () => {
         expect(() => assertOperator('learner')).toThrow(AuthorizationError);
       });
     });
   });
   ```

**Files Created**:

- `packages/core/tests/auth/authorization.test.ts`

---

### Task 7: Document Authorization Patterns

**Description**: Create documentation for using authorization in routes.

**Implementation Plan**:

1. Create `docs/AUTH_PATTERNS.md`:

   ```markdown
   # Authorization Patterns

   ## Route Protection

   ### Require Authentication (Any Role)

   \`\`\`typescript
   import { protectRoute } from '../decorators/route-protection';

   fastify.get('/api/v1/protected',
   protectRoute(fastify),
   async (request, reply) => {
   // Access request.user.userId and request.user.role
   return { message: 'Protected content' };
   }
   );
   \`\`\`

   ### Require Operator Role

   \`\`\`typescript
   import { protectOperatorRoute } from '../decorators/route-protection';

   fastify.get('/api/v1/operational/dashboard',
   protectOperatorRoute(fastify),
   async (request, reply) => {
   // Only operators can access this
   return { message: 'Operator dashboard' };
   }
   );
   \`\`\`

   ### Optional Authentication

   \`\`\`typescript
   import { optionalAuth } from '../decorators/route-protection';

   fastify.get('/api/v1/public',
   optionalAuth(),
   async (request, reply) => {
   // request.user may or may not be present
   if (request.user) {
   return { message: `Hello ${request.user.userId}` };
   }
   return { message: 'Hello guest' };
   }
   );
   \`\`\`

   ## Checking Roles in Business Logic

   \`\`\`typescript
   import { assertOperator, AuthorizationError } from '@polyladder/core';

   export function performOperatorAction(userRole: UserRole) {
   try {
   assertOperator(userRole);
   // Perform action
   } catch (error) {
   if (error instanceof AuthorizationError) {
   // Handle authorization error
   }
   }
   }
   \`\`\`

   ## Error Responses

   ### 401 Unauthorized

   - No token provided
   - Invalid token
   - Expired token

   ### 403 Forbidden

   - Valid token but insufficient role
   ```

**Files Created**:

- `docs/AUTH_PATTERNS.md`

---

## Dependencies

- **Blocks**: F019 (authentication endpoints), F020 (operational endpoints)
- **Depends on**: F004 (user registration & login), F002 (core domain model)

---

## Notes

- Operators can access all learner routes (superset permissions)
- Learners cannot access operator routes
- 401 (Unauthorized) = no valid authentication
- 403 (Forbidden) = authenticated but insufficient permissions
- JWT payload includes role; no additional database query needed for authorization
- Role changes require new JWT (logout/login cycle)
- Future: Consider more granular permissions system if needed
- Authorization checks happen at route level, not in business logic
