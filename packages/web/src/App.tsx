import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { LoginPage } from '@/pages/public/LoginPage';
import { RegisterPage } from '@/pages/public/RegisterPage';
import { DashboardPage } from '@/pages/learner/DashboardPage';
import { OperatorDashboardPage } from '@/pages/operator/OperatorDashboardPage';
import { CorpusExplorerPage } from '@/pages/operator/CorpusExplorerPage';
import { CurriculumPage } from '@/pages/operator/CurriculumPage';
import { DocumentLibraryPage } from '@/pages/operator/DocumentLibraryPage';
import { PipelineTaskDetailPage } from '@/pages/operator/PipelineTaskDetailPage';
import { PipelinesPage } from '@/pages/operator/PipelinesPage';
import { PipelineDetailPage } from '@/pages/operator/PipelineDetailPage';
import { PipelineStatusPage } from '@/pages/operator/PipelineStatusPage';
import { DraftReviewPage } from '@/pages/operator/DraftReviewPage';

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

const DashboardRedirect = () => {
  const { user } = useAuth();
  if (user?.role === 'operator') {
    return <Navigate to="/operator/pipelines" replace />;
  }
  return <DashboardPage />;
};

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
                  <DashboardRedirect />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/operator/pipelines"
            element={
              <ProtectedRoute requiredRole="operator">
                <MainLayout>
                  <PipelinesPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/operator/pipelines/:pipelineId"
            element={
              <ProtectedRoute requiredRole="operator">
                <MainLayout>
                  <PipelineDetailPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/operator/pipeline-status"
            element={
              <ProtectedRoute requiredRole="operator">
                <MainLayout>
                  <PipelineStatusPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/operator/dashboard"
            element={
              <ProtectedRoute requiredRole="operator">
                <MainLayout>
                  <OperatorDashboardPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route path="/operator" element={<Navigate to="/operator/pipelines" replace />} />
          <Route
            path="/operator/pipeline"
            element={<Navigate to="/operator/pipelines" replace />}
          />

          <Route
            path="/operator/corpus"
            element={
              <ProtectedRoute requiredRole="operator">
                <MainLayout>
                  <CorpusExplorerPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/operator/curriculum"
            element={
              <ProtectedRoute requiredRole="operator">
                <MainLayout>
                  <CurriculumPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/operator/documents"
            element={
              <ProtectedRoute requiredRole="operator">
                <MainLayout>
                  <DocumentLibraryPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/operator/pipeline/tasks/:taskId"
            element={
              <ProtectedRoute requiredRole="operator">
                <MainLayout>
                  <PipelineTaskDetailPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/operator/draft-review"
            element={
              <ProtectedRoute requiredRole="operator">
                <MainLayout>
                  <DraftReviewPage />
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
