# F024: Protected Routes & Navigation

**Feature Code**: F024
**Created**: 2025-12-17
**Phase**: 6 - Frontend Foundation
**Status**: ✅ Completed
**Completed**: 2025-12-20

---

## Description

Implement protected route wrapper component that enforces authentication, role-based route guards for operator-only pages, main application navigation (header with user menu), and responsive layout system.

## Success Criteria

- [x] ProtectedRoute wrapper component requires authentication
- [x] Redirects to /login if not authenticated
- [x] Role-based protection for operator routes
- [x] Main application header with logo and user menu
- [x] User menu with profile and logout options
- [x] Responsive layout system with mobile support
- [x] Loading state during auth initialization

---

## Tasks

### Task 1: Create ProtectedRoute Component

**Description**: Higher-order component that checks authentication before rendering protected pages.

**Implementation Plan**:

Create `packages/web/src/components/auth/ProtectedRoute.tsx`:

```tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'learner' | 'operator';
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking auth status
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - redirect to login
  if (!isAuthenticated) {
    // Save intended destination to redirect after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role-based access
  if (requiredRole && user?.role !== requiredRole) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900">403</h1>
          <p className="mt-4 text-lg text-gray-600">
            You don't have permission to access this page.
          </p>
          <a href="/dashboard" className="mt-8 inline-block btn-primary">
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  // Authenticated and authorized - render children
  return <>{children}</>;
}
```

**Files Created**: `packages/web/src/components/auth/ProtectedRoute.tsx`

---

### Task 2: Create Main Layout Component

**Description**: Layout wrapper with header, main content area, and optional sidebar.

**Implementation Plan**:

Create `packages/web/src/components/layout/MainLayout.tsx`:

```tsx
import React, { ReactNode } from 'react';
import { Header } from './Header';

interface MainLayoutProps {
  children: ReactNode;
  showSidebar?: boolean;
}

export function MainLayout({ children, showSidebar = false }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="flex">
        {showSidebar && (
          <aside className="hidden md:block w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-4rem)]">
            <nav className="p-4">
              {/* Sidebar content - to be implemented in operator/learner UI features */}
              <p className="text-sm text-gray-500">Sidebar</p>
            </nav>
          </aside>
        )}

        <main className="flex-1">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
```

**Files Created**: `packages/web/src/components/layout/MainLayout.tsx`

---

### Task 3: Create Header Component with User Menu

**Description**: Application header with logo, navigation links, and user dropdown menu.

**Implementation Plan**:

Create `packages/web/src/components/layout/Header.tsx`:

```tsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Menu, X, User, LogOut, Settings } from 'lucide-react';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link to="/dashboard" className="flex items-center">
              <span className="text-2xl font-bold text-primary-600">PolyLadder</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            {user?.role === 'learner' && (
              <>
                <Link
                  to="/dashboard"
                  className="text-gray-700 hover:text-primary-600 transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  to="/learn"
                  className="text-gray-700 hover:text-primary-600 transition-colors"
                >
                  Learn
                </Link>
                <Link
                  to="/review"
                  className="text-gray-700 hover:text-primary-600 transition-colors"
                >
                  Review
                </Link>
                <Link
                  to="/progress"
                  className="text-gray-700 hover:text-primary-600 transition-colors"
                >
                  Progress
                </Link>
              </>
            )}

            {user?.role === 'operator' && (
              <>
                <Link
                  to="/operator/pipeline"
                  className="text-gray-700 hover:text-primary-600 transition-colors"
                >
                  Pipeline
                </Link>
                <Link
                  to="/operator/review-queue"
                  className="text-gray-700 hover:text-primary-600 transition-colors"
                >
                  Review Queue
                </Link>
                <Link
                  to="/operator/content"
                  className="text-gray-700 hover:text-primary-600 transition-colors"
                >
                  Content
                </Link>
              </>
            )}
          </nav>

          {/* User Menu */}
          <div className="flex items-center space-x-4">
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center space-x-2 text-gray-700 hover:text-primary-600 transition-colors"
              >
                <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <span className="hidden md:block text-sm font-medium">
                  {user?.email.split('@')[0]}
                </span>
              </button>

              {/* Dropdown Menu */}
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <div className="px-4 py-2 border-b border-gray-200">
                    <p className="text-sm text-gray-900 font-medium">{user?.email}</p>
                    <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
                  </div>

                  <Link
                    to="/settings"
                    className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </Link>

                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      handleLogout();
                    }}
                    className="flex items-center w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </button>
                </div>
              )}
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-md text-gray-700 hover:text-primary-600"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 py-4">
            <nav className="flex flex-col space-y-2">
              {user?.role === 'learner' && (
                <>
                  <Link
                    to="/dashboard"
                    className="px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-md"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                  <Link
                    to="/learn"
                    className="px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-md"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Learn
                  </Link>
                  <Link
                    to="/review"
                    className="px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-md"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Review
                  </Link>
                  <Link
                    to="/progress"
                    className="px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-md"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Progress
                  </Link>
                </>
              )}

              {user?.role === 'operator' && (
                <>
                  <Link
                    to="/operator/pipeline"
                    className="px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-md"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Pipeline
                  </Link>
                  <Link
                    to="/operator/review-queue"
                    className="px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-md"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Review Queue
                  </Link>
                  <Link
                    to="/operator/content"
                    className="px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-md"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Content
                  </Link>
                </>
              )}
            </nav>
          </div>
        )}
      </div>

      {/* Click outside to close user menu */}
      {userMenuOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
      )}
    </header>
  );
}
```

**Files Created**: `packages/web/src/components/layout/Header.tsx`

---

### Task 4: Update App.tsx with Protected Routes

**Description**: Wrap protected routes with ProtectedRoute component and MainLayout.

**Implementation Plan**:

Update `packages/web/src/App.tsx`:

```tsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { LoginPage } from '@/pages/public/LoginPage';
import { RegisterPage } from '@/pages/public/RegisterPage';
import { LandingPage } from '@/pages/public/LandingPage';

// Placeholder pages (to be implemented in later features)
const DashboardPage = () => (
  <div>
    <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
    <p className="mt-2 text-gray-600">Welcome to PolyLadder!</p>
  </div>
);

const LearnPage = () => <div>Learn Page</div>;
const ReviewPage = () => <div>Review Page</div>;
const ProgressPage = () => <div>Progress Page</div>;
const SettingsPage = () => <div>Settings Page</div>;

const OperatorPipelinePage = () => <div>Operator Pipeline</div>;
const OperatorReviewQueuePage = () => <div>Operator Review Queue</div>;
const OperatorContentPage = () => <div>Operator Content</div>;

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

          {/* Protected learner routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <DashboardPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/learn"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <LearnPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/review"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <ReviewPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/progress"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <ProgressPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <SettingsPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          {/* Protected operator routes */}
          <Route
            path="/operator/pipeline"
            element={
              <ProtectedRoute requiredRole="operator">
                <MainLayout showSidebar>
                  <OperatorPipelinePage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/operator/review-queue"
            element={
              <ProtectedRoute requiredRole="operator">
                <MainLayout showSidebar>
                  <OperatorReviewQueuePage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/operator/content"
            element={
              <ProtectedRoute requiredRole="operator">
                <MainLayout showSidebar>
                  <OperatorContentPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          {/* Redirect /operator to pipeline */}
          <Route path="/operator" element={<Navigate to="/operator/pipeline" replace />} />

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

### Task 5: Create Landing Page Component

**Description**: Public landing page with hero section and call-to-action buttons.

**Implementation Plan**:

Create `packages/web/src/pages/public/LandingPage.tsx`:

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { Globe, Zap, Users } from 'lucide-react';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <span className="text-2xl font-bold text-primary-600">PolyLadder</span>
            <div className="space-x-4">
              <Link to="/login" className="text-gray-700 hover:text-primary-600 transition-colors">
                Login
              </Link>
              <Link to="/register" className="btn-primary">
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Accelerated Language Learning for <span className="text-primary-600">Polyglots</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Learn multiple languages simultaneously with our unique parallel learning approach.
            Master orthography, vocabulary, and grammar faster than traditional methods.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register" className="btn-primary text-lg px-8 py-3">
              Start Learning Free
            </Link>
            <a href="#features" className="btn-secondary text-lg px-8 py-3">
              Learn More
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid md:grid-cols-3 gap-12">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
              <Globe className="w-8 h-8 text-primary-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Parallel Learning</h3>
            <p className="text-gray-600">
              Learn 2-5 languages simultaneously by leveraging cross-linguistic patterns and
              cognitive transfer.
            </p>
          </div>

          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
              <Zap className="w-8 h-8 text-primary-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Spaced Repetition</h3>
            <p className="text-gray-600">
              Optimized review scheduling using SM-2 algorithm ensures long-term retention and
              efficient study sessions.
            </p>
          </div>

          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
              <Users className="w-8 h-8 text-primary-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Expert Content</h3>
            <p className="text-gray-600">
              High-quality lessons curated by language operators with quality gates ensuring
              accuracy.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary-600 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to accelerate your language learning?
          </h2>
          <p className="text-xl text-primary-100 mb-8">
            Join thousands of learners mastering multiple languages simultaneously.
          </p>
          <Link
            to="/register"
            className="btn-secondary text-lg px-8 py-3 bg-white text-primary-600 hover:bg-gray-100"
          >
            Get Started Now
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p>&copy; 2025 PolyLadder. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
```

**Files Created**: `packages/web/src/pages/public/LandingPage.tsx`

---

### Task 6: Add Click-Outside Hook for Dropdown Menus

**Description**: Reusable hook to detect clicks outside of elements (for closing dropdowns).

**Implementation Plan**:

Create `packages/web/src/hooks/useClickOutside.ts`:

```typescript
import { useEffect, RefObject } from 'react';

/**
 * Hook that alerts clicks outside of the passed ref
 */
export function useClickOutside<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T>,
  handler: (event: MouseEvent | TouchEvent) => void
) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      const el = ref?.current;

      // Do nothing if clicking ref's element or descendent elements
      if (!el || el.contains(event.target as Node)) {
        return;
      }

      handler(event);
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}
```

Update Header to use this hook:

```tsx
// In Header.tsx, add at top:
import { useClickOutside } from '@/hooks/useClickOutside';
import { useRef } from 'react';

// Inside Header component:
const userMenuRef = useRef<HTMLDivElement>(null);
useClickOutside(userMenuRef, () => setUserMenuOpen(false));

// Wrap dropdown in ref:
<div ref={userMenuRef} className="relative">
  {/* user menu button and dropdown */}
</div>;
```

**Files Created**: `packages/web/src/hooks/useClickOutside.ts`

---

## Open Questions

### Question 1: Sidebar Content Structure

**Context**: MainLayout has sidebar placeholder for operator pages. What should sidebar contain?

**Options**:

1. Navigation links only (same as header)
   - Pros: Simple, consistent with header
   - Cons: Redundant with header
2. Quick stats + navigation (e.g., "Items in queue: 42")
   - Pros: More useful, contextual info
   - Cons: Needs API calls to populate
3. Defer sidebar to F025-F028 (Operational UI features)
   - Pros: Sidebar designed when operator features are implemented
   - Cons: Placeholder for now

**Temporary Plan**: Option 3 - leave sidebar as placeholder div. F025-F028 will define operator sidebar content.

---

### Question 2: Mobile Navigation Behavior

**Context**: Mobile menu currently slides down from header. Should it be a full-screen overlay or drawer?

**Options**:

1. Dropdown from header (current)
   - Pros: Simple, space-efficient
   - Cons: Can be cramped with many nav items
2. Full-screen overlay menu
   - Pros: More space, better for long menus
   - Cons: More disruptive
3. Slide-in drawer from side
   - Pros: Familiar pattern, smooth animation
   - Cons: More complex implementation

**Temporary Plan**: Keep dropdown (option 1) for MVP. Most operators will use desktop anyway. Can enhance mobile UX post-launch.

---

### Question 3: Auth State Persistence After Page Refresh

**Context**: User menu shows loading spinner briefly on page refresh while auth state loads. Should we persist auth state to avoid flicker?

**Options**:

1. Current approach: check localStorage token on mount
   - Pros: Simple, secure (validates with server)
   - Cons: Brief loading flicker
2. Cache user object in localStorage
   - Pros: Instant auth state, no flicker
   - Cons: Stale data if user is deleted/role changed on server
3. Use service worker for auth state
   - Pros: Fast, reliable
   - Cons: Overkill for MVP

**Temporary Plan**: Keep option 1 (current). Loading flicker is <500ms on good connection. Can optimize post-launch if users complain.

---

## Dependencies

- **Blocks**: F025 (Operational UI), F029 (User Onboarding)
- **Depends on**: F022 (React Setup), F023 (Authentication UI)

---

## Notes

### Route Protection Levels

1. **Public routes**: Accessible to all users (/, /login, /register)
2. **Protected routes**: Require authentication (/dashboard, /learn, /review)
3. **Role-protected routes**: Require specific role (/operator/\*)

### Navigation Structure

**Learner Navigation**:

- Dashboard: Overview of progress, upcoming reviews
- Learn: Access to learning modules (orthography, vocabulary, grammar)
- Review: SRS review sessions
- Progress: Analytics and statistics

**Operator Navigation**:

- Pipeline: Content refinement pipeline health dashboard
- Review Queue: Pending content requiring manual review
- Content: Browse and manage approved content

### Responsive Design

- **Desktop (≥768px)**: Full header with all nav links, user menu
- **Mobile (<768px)**: Hamburger menu, collapsible navigation
- **Sidebar**: Hidden on mobile (<768px), visible on desktop for operator pages

### Layout System

The MainLayout component provides:

- Consistent header across all protected pages
- Optional sidebar for pages that need it (operator tools)
- Max-width content container for readability
- Responsive padding and spacing

### Accessibility Considerations

- Keyboard navigation support (tab, enter, escape)
- Focus management for dropdown menus
- Semantic HTML (nav, header, main elements)
- ARIA labels for icon buttons (future enhancement)
- Skip-to-content link (future enhancement)

### Future Enhancements

- Add breadcrumb navigation for deep pages
- Add search bar in header for operators
- Add notification bell icon with count badge
- Add dark mode toggle
- Add keyboard shortcuts (e.g., Cmd+K for search)
- Add persistent sidebar state (open/closed preference)
