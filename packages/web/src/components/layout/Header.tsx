import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Menu, X, User, LogOut } from 'lucide-react';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    void navigate('/login');
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link to="/dashboard" className="flex items-center">
              <span className="text-2xl font-bold text-primary-600">PolyLadder</span>
            </Link>
          </div>

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
                  to="/operator/failures"
                  className="text-red-600 hover:text-red-700 transition-colors"
                >
                  Failures
                </Link>
                <Link
                  to="/operator/corpus"
                  className="text-gray-700 hover:text-primary-600 transition-colors"
                >
                  Corpus
                </Link>
                <Link
                  to="/operator/curriculum"
                  className="text-gray-700 hover:text-primary-600 transition-colors"
                >
                  Curriculum
                </Link>
                <Link
                  to="/operator/documents"
                  className="text-gray-700 hover:text-primary-600 transition-colors"
                >
                  Documents
                </Link>
                <Link
                  to="/operator/mappings"
                  className="text-gray-700 hover:text-primary-600 transition-colors"
                >
                  Mappings
                </Link>
              </>
            )}
          </nav>

          <div className="hidden md:flex items-center space-x-4">
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <User className="w-5 h-5 text-gray-600" />
                <span className="text-sm text-gray-700">{user?.email}</span>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <div className="px-4 py-2 border-b border-gray-200">
                    <p className="text-sm font-medium text-gray-900">{user?.email}</p>
                    <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
                  </div>
                  <button
                    onClick={() => {
                      handleLogout().catch((err: Error) => {
                        console.error('Logout error:', err);
                      });
                    }}
                    className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white">
          <nav className="px-4 py-4 space-y-2">
            {user?.role === 'learner' && (
              <>
                <Link
                  to="/dashboard"
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Dashboard
                </Link>
                <Link
                  to="/learn"
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Learn
                </Link>
                <Link
                  to="/review"
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Review
                </Link>
              </>
            )}

            {user?.role === 'operator' && (
              <>
                <Link
                  to="/operator/pipeline"
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Pipeline
                </Link>
                <Link
                  to="/operator/review-queue"
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Review Queue
                </Link>
                <Link
                  to="/operator/failures"
                  className="block px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Failures
                </Link>
                <Link
                  to="/operator/corpus"
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Corpus
                </Link>
                <Link
                  to="/operator/curriculum"
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Curriculum
                </Link>
                <Link
                  to="/operator/documents"
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Documents
                </Link>
                <Link
                  to="/operator/mappings"
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Mappings
                </Link>
              </>
            )}

            <div className="pt-4 mt-4 border-t border-gray-200">
              <div className="px-4 py-2">
                <p className="text-sm font-medium text-gray-900">{user?.email}</p>
                <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
              </div>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout().catch((err: Error) => {
                    console.error('Logout error:', err);
                  });
                }}
                className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
