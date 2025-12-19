# Session Management

## Overview

PolyLadder uses stateless JWT-based authentication. No server-side session storage is required.

## Session Lifecycle

### 1. Registration/Login

```
Client → POST /api/v1/auth/register or /login
Server → Generate JWT (expires in 7 days)
Server → Return JWT to client
Client → Store JWT in localStorage
```

### 2. Authenticated Requests

```
Client → Send request with Authorization: Bearer <token>
Server → Verify JWT signature
Server → Check expiration
Server → Extract userId and role
Server → Process request
```

### 3. Logout

```
Client → Remove JWT from localStorage
Client → Redirect to login page
```

## Token Structure

JWT payload contains:

- `userId`: User's UUID
- `role`: 'learner' or 'operator'
- `iat`: Issued at (Unix timestamp)
- `exp`: Expires at (Unix timestamp)

Example decoded JWT:

```json
{
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "role": "learner",
  "iat": 1705320000,
  "exp": 1705924800
}
```

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

```typescript
import { createTestToken } from './tests/helpers/auth';

const token = createTestToken('user-id', 'learner');
const response = await request.get('/api/v1/protected').set('Authorization', `Bearer ${token}`);
```
