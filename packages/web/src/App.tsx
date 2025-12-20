import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Placeholder pages (to be implemented in F023-F024)
const LandingPage = () => (
  <div className="flex h-screen items-center justify-center">
    <div className="card">
      <h1 className="text-3xl font-bold text-primary-600 mb-4">PolyLadder</h1>
      <p className="text-gray-600">Parallel Language Learning Platform</p>
    </div>
  </div>
);

const LoginPage = () => (
  <div className="flex h-screen items-center justify-center">
    <div className="card">
      <h2 className="text-2xl font-bold mb-4">Login</h2>
      <p>Login page (to be implemented)</p>
    </div>
  </div>
);

const RegisterPage = () => (
  <div className="flex h-screen items-center justify-center">
    <div className="card">
      <h2 className="text-2xl font-bold mb-4">Register</h2>
      <p>Register page (to be implemented)</p>
    </div>
  </div>
);

const DashboardPage = () => (
  <div className="flex h-screen items-center justify-center">
    <div className="card">
      <h2 className="text-2xl font-bold mb-4">Dashboard</h2>
      <p>Protected dashboard (to be implemented)</p>
    </div>
  </div>
);

const NotFoundPage = () => (
  <div className="flex h-screen items-center justify-center">
    <div className="card">
      <h2 className="text-2xl font-bold mb-4">404 Not Found</h2>
      <p>The page you are looking for does not exist.</p>
    </div>
  </div>
);

export function App() {
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
