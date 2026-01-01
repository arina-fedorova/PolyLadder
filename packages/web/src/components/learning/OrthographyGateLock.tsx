import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../api/client';

interface OrthographyGateProgress {
  language: string;
  status: 'locked' | 'unlocked' | 'completed';
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OrthographyGateLockProps {
  language: string;
  children: React.ReactNode;
  showProgress?: boolean;
}

export function OrthographyGateLock({
  language,
  children,
  showProgress = true,
}: OrthographyGateLockProps) {
  const { data: gateProgress, isLoading } = useQuery({
    queryKey: ['orthography-gate', language],
    queryFn: async () => {
      return api.get<OrthographyGateProgress>(
        `/learning/orthography-gate/status?language=${language}`
      );
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (gateProgress?.status === 'completed') {
    return <>{children}</>;
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="card border-2 border-yellow-300 bg-yellow-50 p-8 text-center space-y-6">
        <div className="flex justify-center">
          <svg
            className="w-24 h-24 text-yellow-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Orthography Gate Locked</h2>
          <p className="text-gray-700">
            Before you can access vocabulary and grammar for{' '}
            <span className="font-semibold">{language}</span>, you need to complete the orthography
            lessons (alphabet, pronunciation, and writing system).
          </p>
        </div>

        {showProgress && gateProgress && (
          <div className="space-y-3">
            <div className="bg-white rounded-lg p-4 border border-yellow-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Status</span>
                <span
                  className={`text-sm font-bold ${
                    gateProgress.status === 'unlocked' ? 'text-blue-600' : 'text-gray-600'
                  }`}
                >
                  {gateProgress.status === 'locked' && 'Not Started'}
                  {gateProgress.status === 'unlocked' && 'In Progress'}
                </span>
              </div>

              <p className="text-sm text-gray-600 text-left">
                {gateProgress.status === 'locked' && (
                  <>You haven&apos;t started the orthography lessons yet.</>
                )}
                {gateProgress.status === 'unlocked' && (
                  <>You&apos;ve started! Complete all orthography lessons to unlock this content.</>
                )}
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-center gap-4">
          <Link to={`/learning/orthography/${language}`} className="btn btn-primary px-6 py-3">
            {gateProgress?.status === 'locked'
              ? 'Start Orthography Lessons'
              : 'Continue Orthography Lessons'}
          </Link>
        </div>

        <p className="text-xs text-gray-500">
          This gate ensures you understand the writing system before learning vocabulary and
          grammar.
        </p>
      </div>
    </div>
  );
}
