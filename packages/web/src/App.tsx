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

export function App() {
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
