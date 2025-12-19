# Authorization Patterns

## Route Protection

### Require Authentication (Any Role)

```typescript
import { protectRoute } from '../decorators/route-protection';

fastify.get('/api/v1/protected', protectRoute(fastify), async (request, reply) => {
  // Access request.user.userId and request.user.role
  return { message: 'Protected content' };
});
```

### Require Operator Role

```typescript
import { protectOperatorRoute } from '../decorators/route-protection';

fastify.get(
  '/api/v1/operational/dashboard',
  protectOperatorRoute(fastify),
  async (request, reply) => {
    // Only operators can access this
    return { message: 'Operator dashboard' };
  }
);
```

### Optional Authentication

```typescript
import { optionalAuth } from '../decorators/route-protection';

fastify.get('/api/v1/public', optionalAuth(), async (request, reply) => {
  // request.user may or may not be present
  if (request.user) {
    return { message: `Hello ${request.user.userId}` };
  }
  return { message: 'Hello guest' };
});
```

## Checking Roles in Business Logic

```typescript
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
```

## Error Responses

### 401 Unauthorized

- No token provided
- Invalid token
- Expired token

### 403 Forbidden

- Valid token but insufficient role
