# F023: Authentication UI

**Feature Code**: F023
**Created**: 2025-12-17
**Phase**: 6 - Frontend Foundation
**Status**: ✅ Completed
**Completed**: 2025-12-20
**PR**: #26

---

## Description

Build user-facing authentication pages (registration and login), authentication context for app-wide state management, JWT token storage in localStorage, and API client with automatic token injection and 401 error handling.

## Success Criteria

- [ ] Registration page at /register with email, password, and base language selection
- [ ] Login page at /login with email and password
- [ ] AuthContext provides user state, login(), logout(), and isAuthenticated
- [ ] JWT access/refresh tokens stored in localStorage
- [ ] API client automatically injects JWT in Authorization header
- [ ] 401 errors trigger automatic redirect to /login
- [ ] Form validation with React Hook Form + Zod schemas

---

## Tasks

### Task 1: Create API Client with Authentication

**Description**: Axios instance with interceptors for JWT injection and 401 error handling.

**Implementation Plan**:

Create `packages/web/src/api/client.ts`:

```typescript
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 second timeout
});

// Request interceptor: Add JWT to Authorization header
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const accessToken = localStorage.getItem('accessToken');

    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: Handle 401 errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // If 401 error and we have a refresh token, try to refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = localStorage.getItem('refreshToken');

      if (refreshToken) {
        try {
          // Try to refresh access token
          const response = await axios.post(`${API_URL}/auth/refresh`, {
            refreshToken,
          });

          const { accessToken: newAccessToken } = response.data;

          // Update stored token
          localStorage.setItem('accessToken', newAccessToken);

          // Retry original request with new token
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          }

          return apiClient(originalRequest);
        } catch (refreshError) {
          // Refresh failed - clear tokens and redirect to login
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      }

      // No refresh token - redirect to login
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export default apiClient;
```

Create `packages/web/src/api/auth.ts` (auth-specific API functions):

```typescript
import apiClient from './client';
import { User } from '@/types';

export interface RegisterRequest {
  email: string;
  password: string;
  role?: 'learner' | 'operator';
}

export interface RegisterResponse {
  userId: string;
  email: string;
  role: 'learner' | 'operator';
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export const authApi = {
  async register(data: RegisterRequest): Promise<RegisterResponse> {
    const response = await apiClient.post<RegisterResponse>('/auth/register', data);
    return response.data;
  },

  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>('/auth/login', data);
    return response.data;
  },

  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<User>('/auth/me');
    return response.data;
  },

  async logout(refreshToken: string): Promise<void> {
    await apiClient.post('/auth/logout', { refreshToken });
  },
};
```

**Files Created**:

- `packages/web/src/api/client.ts`
- `packages/web/src/api/auth.ts`

---

### Task 2: Create Authentication Context

**Description**: React context providing auth state and methods (login, logout, register).

**Implementation Plan**:

Create `packages/web/src/contexts/AuthContext.tsx`:

```typescript
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, LoginRequest, RegisterRequest } from '@/api/auth';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is already logged in on mount
  useEffect(() => {
    const initAuth = async () => {
      const accessToken = localStorage.getItem('accessToken');

      if (accessToken) {
        try {
          const currentUser = await authApi.getCurrentUser();
          setUser(currentUser);
        } catch (error) {
          // Token invalid, clear it
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        }
      }

      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (credentials: LoginRequest) => {
    try {
      const response = await authApi.login(credentials);

      // Store tokens
      localStorage.setItem('accessToken', response.accessToken);
      localStorage.setItem('refreshToken', response.refreshToken);

      // Set user
      setUser(response.user);
    } catch (error) {
      throw error;
    }
  };

  const register = async (data: RegisterRequest) => {
    try {
      await authApi.register(data);

      // After registration, log the user in
      await login({ email: data.email, password: data.password });
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        await authApi.logout(refreshToken);
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear tokens and user state regardless of API call success
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

Update `packages/web/src/App.tsx` to wrap with AuthProvider:

```tsx
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';

// Pages (to be created)
const LandingPage = () => <div>Landing Page</div>;
const LoginPage = () => <div>Login Page</div>;
const RegisterPage = () => <div>Register Page</div>;
const DashboardPage = () => <div>Dashboard (Protected)</div>;
const NotFoundPage = () => <div>404 Not Found</div>;

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
```

**Files Created**:

- `packages/web/src/contexts/AuthContext.tsx`
- Update `packages/web/src/App.tsx`

---

### Task 3: Create Login Page

**Description**: Login form with email and password, form validation, error handling.

**Implementation Plan**:

Create `packages/web/src/pages/public/LoginPage.tsx`:

```tsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { AxiosError } from 'axios';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setApiError(null);

    try {
      await login(data);
      navigate('/dashboard');
    } catch (error) {
      const axiosError = error as AxiosError<{ error: { message: string } }>;
      setApiError(axiosError.response?.data?.error?.message || 'Login failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">PolyLadder</h1>
          <h2 className="mt-6 text-xl text-gray-700">Sign in to your account</h2>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6 card">
          {apiError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {apiError}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email address
            </label>
            <input
              {...register('email')}
              type="email"
              id="email"
              autoComplete="email"
              className="input mt-1"
              placeholder="you@example.com"
            />
            {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              {...register('password')}
              type="password"
              id="password"
              autoComplete="current-password"
              className="input mt-1"
              placeholder="••••••••"
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>

          <p className="text-center text-sm text-gray-600">
            Don't have an account?{' '}
            <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">
              Sign up
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
```

**Files Created**: `packages/web/src/pages/public/LoginPage.tsx`

---

### Task 4: Create Registration Page

**Description**: Registration form with email, password confirmation, and base language selection.

**Implementation Plan**:

Create `packages/web/src/pages/public/RegisterPage.tsx`:

```tsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { AxiosError } from 'axios';

const registerSchema = z
  .object({
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
    role: z.enum(['learner', 'operator']).optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const { register: registerUser } = useAuth();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: 'learner',
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    setApiError(null);

    try {
      await registerUser({
        email: data.email,
        password: data.password,
        role: data.role,
      });

      // User is automatically logged in after registration
      navigate('/dashboard');
    } catch (error) {
      const axiosError = error as AxiosError<{ error: { message: string } }>;
      setApiError(
        axiosError.response?.data?.error?.message || 'Registration failed. Please try again.'
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">PolyLadder</h1>
          <h2 className="mt-6 text-xl text-gray-700">Create your account</h2>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6 card">
          {apiError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {apiError}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email address
            </label>
            <input
              {...register('email')}
              type="email"
              id="email"
              autoComplete="email"
              className="input mt-1"
              placeholder="you@example.com"
            />
            {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              {...register('password')}
              type="password"
              id="password"
              autoComplete="new-password"
              className="input mt-1"
              placeholder="••••••••"
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              At least 8 characters, with uppercase, lowercase, and number
            </p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
              Confirm Password
            </label>
            <input
              {...register('confirmPassword')}
              type="password"
              id="confirmPassword"
              autoComplete="new-password"
              className="input mt-1"
              placeholder="••••••••"
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700">
              Account Type
            </label>
            <select {...register('role')} id="role" className="input mt-1">
              <option value="learner">Learner</option>
              <option value="operator">Operator (Content Reviewer)</option>
            </select>
            {errors.role && <p className="mt-1 text-sm text-red-600">{errors.role.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </button>

          <p className="text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
```

**Files Created**: `packages/web/src/pages/public/RegisterPage.tsx`

---

### Task 5: Update App.tsx with Real Pages

**Description**: Replace placeholder pages with real LoginPage and RegisterPage components.

**Implementation Plan**:

Update `packages/web/src/App.tsx`:

```tsx
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { LoginPage } from '@/pages/public/LoginPage';
import { RegisterPage } from '@/pages/public/RegisterPage';

// Placeholders for pages not yet implemented
const LandingPage = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-center">
      <h1 className="text-4xl font-bold text-gray-900">Welcome to PolyLadder</h1>
      <p className="mt-4 text-lg text-gray-600">Accelerated language learning for polyglots</p>
      <div className="mt-8 space-x-4">
        <a href="/login" className="btn-primary">
          Login
        </a>
        <a href="/register" className="btn-secondary">
          Sign Up
        </a>
      </div>
    </div>
  </div>
);

const DashboardPage = () => (
  <div className="p-8">
    <h1 className="text-2xl font-bold">Dashboard</h1>
    <p className="text-gray-600">Protected page (requires auth)</p>
  </div>
);

const NotFoundPage = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-center">
      <h1 className="text-6xl font-bold text-gray-900">404</h1>
      <p className="mt-4 text-lg text-gray-600">Page not found</p>
      <a href="/" className="mt-8 inline-block btn-primary">
        Go Home
      </a>
    </div>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected routes (to be wrapped with auth guard in F024) */}
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
```

**Files Modified**: `packages/web/src/App.tsx`

---

## Open Questions

### Question 1: Password Reset Flow

**Context**: Users will inevitably forget passwords. Should we implement password reset in MVP?

**Options**:

1. Add password reset flow (email verification required)
   - Pros: Better UX, expected feature
   - Cons: Requires email service (SendGrid, Postmark, etc.)
2. Defer to post-MVP
   - Pros: Simpler MVP
   - Cons: Operators must manually reset passwords in database

**Temporary Plan**: Defer to post-MVP. Operators can manually update password_hash in database if needed. Add password reset as first post-launch feature.

---

### Question 2: "Remember Me" Checkbox

**Context**: Should login have "Remember me" option for longer-lived sessions?

**Options**:

1. Add checkbox that extends refresh token to 30 days
   - Pros: Better UX for frequent users
   - Cons: More complex token management
2. Always use 7-day refresh token (current)
   - Pros: Simpler, still reasonable duration
   - Cons: Users must re-login weekly

**Temporary Plan**: Use 7-day refresh token for all users. Add "Remember me" if users complain about frequent re-logins.

---

### Question 3: Social Login (OAuth)

**Context**: Should we support "Sign in with Google" / "Sign in with GitHub"?

**Options**:

1. Add OAuth providers (Google, GitHub, Apple)
   - Pros: Faster signup, no password management for users
   - Cons: Requires OAuth setup, more complex authentication flow
2. Email/password only (current)
   - Pros: Simple, no external dependencies
   - Cons: Higher friction for signup

**Temporary Plan**: Email/password only for MVP. Add OAuth in future if user acquisition metrics show signup drop-off.

---

## Dependencies

- **Blocks**: F024 (Protected Routes), F029 (User Onboarding)
- **Depends on**: F019 (Authentication Endpoints), F022 (React Application Setup)

---

## Notes

### Token Storage

- **Access token**: Short-lived (15 minutes), stored in localStorage
- **Refresh token**: Long-lived (7 days), stored in localStorage
- **Security consideration**: localStorage is vulnerable to XSS attacks. For production, consider:
  - Storing refresh token in httpOnly cookie (requires backend change)
  - Using a more secure storage mechanism
  - Implementing strict CSP (Content Security Policy)

### Authentication Flow

1. User submits login form
2. Frontend calls POST /api/v1/auth/login
3. Backend returns accessToken + refreshToken + user
4. Frontend stores tokens in localStorage
5. Frontend sets user in AuthContext
6. All subsequent API requests include Authorization header with accessToken
7. When accessToken expires (401 error), axios interceptor automatically:
   - Calls POST /api/v1/auth/refresh with refreshToken
   - Gets new accessToken
   - Retries original request with new token
8. If refresh fails, user is redirected to /login

### Form Validation

- **React Hook Form**: Performant form state management with minimal re-renders
- **Zod**: TypeScript-first schema validation
- **@hookform/resolvers**: Connects Zod schemas to React Hook Form
- Validation happens on blur and submit (not on every keystroke)

### Error Handling

- **API errors**: Displayed at top of form in red alert box
- **Validation errors**: Shown below each input field
- **Network errors**: Caught by axios interceptor, user-friendly message shown

### Accessibility

- Proper label associations (htmlFor)
- Input autocomplete attributes for better browser autofill
- Keyboard navigation support (tab order)
- Error messages linked to inputs via aria-describedby (future enhancement)

### Future Enhancements

- Add password strength meter during registration
- Add "Show password" toggle button
- Add email verification flow (send confirmation email)
- Add CAPTCHA to prevent bot signups
- Add rate limiting UI feedback (too many login attempts)
