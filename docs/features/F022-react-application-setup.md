# F022: React Application Setup

**Feature Code**: F022
**Created**: 2025-12-17
**Phase**: 6 - Frontend Foundation
**Status**: ✅ Completed
**Completed**: 2025-12-20
**PR**: #25

---

## Description

Initialize React single-page application (SPA) with Vite build tool, React Router for navigation, TanStack Query for data fetching, and Tailwind CSS for styling. Establish project folder structure and development workflow.

## Success Criteria

- [x] Vite + React + TypeScript project initialized in packages/web
- [x] React Router v7 configured with basic routes
- [x] TanStack Query v5 setup with QueryClient
- [x] Tailwind CSS v3 installed and configured
- [x] Folder structure defined (components/, pages/, hooks/, api/, utils/)
- [x] Development server runs on http://localhost:5173
- [x] Production build generates optimized assets

---

## Tasks

### Task 1: Initialize Vite React Project

**Description**: Create React + TypeScript project using Vite template.

**Implementation Plan**:

From repository root, run:

```bash
cd packages
pnpm create vite@latest web --template react-ts
cd web
pnpm install
```

Update `packages/web/package.json`:

```json
{
  "name": "@polyladder/web",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 5173 --host",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@typescript-eslint/eslint-plugin": "^6.21.0",
    "@typescript-eslint/parser": "^6.21.0",
    "@vitejs/plugin-react": "^4.3.0",
    "eslint": "^8.57.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.5",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

Update `packages/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    /* Path aliases */
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Files Created**:

- `packages/web/` directory structure
- `packages/web/package.json`
- `packages/web/tsconfig.json`
- `packages/web/vite.config.ts`

---

### Task 2: Install Core Dependencies

**Description**: Install routing, data fetching, and styling libraries.

**Implementation Plan**:

Install dependencies:

```bash
cd packages/web

# Routing
pnpm add react-router-dom

# Data fetching and state management
pnpm add @tanstack/react-query @tanstack/react-query-devtools

# HTTP client
pnpm add axios

# Forms and validation
pnpm add react-hook-form zod @hookform/resolvers

# Styling
pnpm add -D tailwindcss postcss autoprefixer
pnpm add clsx tailwind-merge

# Icons (optional but common)
pnpm add lucide-react

# Type definitions
pnpm add -D @types/node
```

Update `packages/web/package.json` to include new dependencies:

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0",
    "@tanstack/react-query": "^5.55.0",
    "@tanstack/react-query-devtools": "^5.55.0",
    "axios": "^1.7.0",
    "react-hook-form": "^7.53.0",
    "zod": "^3.23.0",
    "@hookform/resolvers": "^3.9.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.5.0",
    "lucide-react": "^0.441.0"
  },
  "devDependencies": {
    "@types/node": "^20.16.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@typescript-eslint/eslint-plugin": "^6.21.0",
    "@typescript-eslint/parser": "^6.21.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "eslint": "^8.57.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.5",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

**Files Modified**: `packages/web/package.json`

---

### Task 3: Configure Tailwind CSS

**Description**: Setup Tailwind CSS with configuration and base styles.

**Implementation Plan**:

Initialize Tailwind:

```bash
cd packages/web
npx tailwindcss init -p
```

Create `packages/web/tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
```

Create `packages/web/postcss.config.js`:

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

Create `packages/web/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom base styles */
@layer base {
  html {
    @apply antialiased;
  }

  body {
    @apply bg-gray-50 text-gray-900;
  }
}

/* Custom component styles */
@layer components {
  .btn-primary {
    @apply px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors;
  }

  .btn-secondary {
    @apply px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition-colors;
  }

  .input {
    @apply w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500;
  }

  .card {
    @apply bg-white rounded-lg shadow-md p-6;
  }
}
```

Update `packages/web/src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css'; // Import Tailwind styles

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**Files Created**:

- `packages/web/tailwind.config.js`
- `packages/web/postcss.config.js`
- `packages/web/src/index.css`
- Update `packages/web/src/main.tsx`

---

### Task 4: Setup Folder Structure

**Description**: Create organized folder structure for scalable React application.

**Implementation Plan**:

Create directory structure:

```bash
cd packages/web/src
mkdir -p components/{common,layout,auth,learning,operational}
mkdir -p pages/{public,learner,operator}
mkdir -p hooks
mkdir -p api
mkdir -p lib
mkdir -p types
mkdir -p contexts
mkdir -p utils
```

Create `packages/web/src/lib/utils.ts` (utility functions):

```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with proper precedence
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Delay execution (useful for testing loading states)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

Create `packages/web/src/types/index.ts`:

```typescript
// API response types
export interface User {
  id: string;
  email: string;
  role: 'learner' | 'operator';
  createdAt: string;
}

export interface Language {
  id: string;
  name: string;
  nativeName: string;
  isoCode: string;
}

export interface ApiError {
  statusCode: number;
  message: string;
  requestId: string;
}

// Common UI types
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';
```

Create `packages/web/src/vite-env.d.ts`:

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // Add more env variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

Create `packages/web/.env.development`:

```env
VITE_API_URL=http://localhost:3000/api/v1
```

Create `packages/web/.env.production`:

```env
VITE_API_URL=/api/v1
```

**Folder Structure**:

```
packages/web/src/
├── components/
│   ├── common/         # Reusable UI components (Button, Input, Card, etc.)
│   ├── layout/         # Layout components (Header, Sidebar, Footer)
│   ├── auth/           # Auth-related components
│   ├── learning/       # Learner-facing components
│   └── operational/    # Operator-facing components
├── pages/
│   ├── public/         # Public pages (Landing, About)
│   ├── learner/        # Learner pages (Dashboard, Exercises, Review)
│   └── operator/       # Operator pages (ContentReview, Pipeline)
├── hooks/              # Custom React hooks
├── api/                # API client and request functions
├── lib/                # Third-party library configurations
├── types/              # TypeScript type definitions
├── contexts/           # React contexts (Auth, Theme, etc.)
├── utils/              # Utility functions
├── App.tsx             # Root component
├── main.tsx            # Entry point
└── index.css           # Global styles
```

**Files Created**:

- Directory structure as above
- `packages/web/src/lib/utils.ts`
- `packages/web/src/types/index.ts`
- `packages/web/src/vite-env.d.ts`
- `packages/web/.env.development`
- `packages/web/.env.production`

---

### Task 5: Configure React Router

**Description**: Setup React Router with basic route structure.

**Implementation Plan**:

Create `packages/web/src/App.tsx`:

```tsx
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Placeholder pages (to be implemented in F023-F024)
const LandingPage = () => <div>Landing Page</div>;
const LoginPage = () => <div>Login Page</div>;
const RegisterPage = () => <div>Register Page</div>;
const DashboardPage = () => <div>Dashboard (Protected)</div>;
const NotFoundPage = () => <div>404 Not Found</div>;

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected routes (to be wrapped with auth in F024) */}
        <Route path="/dashboard" element={<DashboardPage />} />

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

Update `packages/web/vite.config.ts` to handle client-side routing:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true, // Listen on all addresses (for Docker)
    proxy: {
      // Proxy API requests to backend during development
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
```

**Files Created**:

- `packages/web/src/App.tsx`
- Update `packages/web/vite.config.ts`

---

### Task 6: Configure TanStack Query (React Query)

**Description**: Setup QueryClient with sensible defaults for data fetching.

**Implementation Plan**:

Create `packages/web/src/lib/react-query.ts`:

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Refetch on window focus by default
      refetchOnWindowFocus: true,
      // Retry failed requests 3 times
      retry: 3,
      // Cache data for 5 minutes by default
      staleTime: 5 * 60 * 1000,
      // Keep unused data in cache for 10 minutes
      gcTime: 10 * 60 * 1000,
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
    },
  },
});
```

Update `packages/web/src/main.tsx` to wrap app with QueryClientProvider:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import App from './App.tsx';
import { queryClient } from './lib/react-query';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {/* React Query Devtools (only in development) */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
);
```

Create example query hook `packages/web/src/hooks/useUser.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { User } from '@/types';

// Placeholder API function (to be implemented in F023)
async function fetchCurrentUser(): Promise<User> {
  const response = await fetch('/api/v1/auth/me', {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user');
  }

  return response.json();
}

export function useUser() {
  return useQuery({
    queryKey: ['user', 'me'],
    queryFn: fetchCurrentUser,
    // Don't refetch automatically
    staleTime: Infinity,
    // Only fetch when we have a token
    enabled: !!localStorage.getItem('accessToken'),
  });
}
```

**Files Created**:

- `packages/web/src/lib/react-query.ts`
- `packages/web/src/hooks/useUser.ts`
- Update `packages/web/src/main.tsx`

---

## Open Questions

None - frontend setup follows standard React best practices.

---

## Dependencies

- **Blocks**: F023 (Authentication UI), F024 (Protected Routes)
- **Depends on**: F000 (Project Setup)

---

## Notes

### Technology Choices

- **Vite**: Fast dev server with hot module replacement (HMR), optimized builds
- **React Router v6**: Declarative routing with nested routes support
- **TanStack Query**: Server state management, automatic caching, background refetching
- **Tailwind CSS**: Utility-first CSS framework, customizable design system
- **TypeScript**: Type safety, better IDE support, catch errors early

### Development Workflow

1. Start dev server: `pnpm dev` (runs on http://localhost:5173)
2. API requests proxied to http://localhost:3000 during development
3. React Query Devtools available at bottom of screen
4. Type checking: `pnpm type-check`
5. Build for production: `pnpm build`

### Environment Variables

- Use `VITE_` prefix for all env variables (Vite requirement)
- Access via `import.meta.env.VITE_API_URL`
- Different values for development vs production

### Code Organization

- **components/**: Reusable UI components, organized by feature area
- **pages/**: Page-level components, organized by user role
- **hooks/**: Custom React hooks for shared logic
- **api/**: API client configuration and request functions
- **lib/**: Third-party library setup (React Query, etc.)
- **types/**: Shared TypeScript types
- **contexts/**: React context providers
- **utils/**: Pure utility functions

### Future Enhancements

- Add i18n (internationalization) library for multi-language support
- Add error boundary component for graceful error handling
- Add loading skeleton components for better perceived performance
- Add animation library (Framer Motion) for smooth transitions
