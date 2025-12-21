import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { LoginPage } from '@/pages/public/LoginPage';
import { RegisterPage } from '@/pages/public/RegisterPage';
import { DashboardPage } from '@/pages/learner/DashboardPage';
import { OperatorDashboardPage } from '@/pages/operator/OperatorDashboardPage';
import { ReviewQueuePage } from '@/pages/operator/ReviewQueuePage';
import { FailuresPage } from '@/pages/operator/FailuresPage';
import { CorpusExplorerPage } from '@/pages/operator/CorpusExplorerPage';

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

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

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
            path="/operator/dashboard"
            element={
              <ProtectedRoute requiredRole="operator">
                <MainLayout showSidebar>
                  <OperatorDashboardPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/operator/pipeline"
            element={
              <ProtectedRoute requiredRole="operator">
                <MainLayout showSidebar>
                  <OperatorDashboardPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/operator/review-queue"
            element={
              <ProtectedRoute requiredRole="operator">
                <MainLayout showSidebar>
                  <ReviewQueuePage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/operator/failures"
            element={
              <ProtectedRoute requiredRole="operator">
                <MainLayout showSidebar>
                  <FailuresPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/operator/corpus"
            element={
              <ProtectedRoute requiredRole="operator">
                <MainLayout showSidebar>
                  <CorpusExplorerPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
