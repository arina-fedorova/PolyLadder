import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/api/client';

interface UserPreferences {
  onboardingCompleted: boolean;
}

interface OnboardingCheckProps {
  children: React.ReactNode;
}

export function OnboardingCheck({ children }: OnboardingCheckProps) {
  const { user } = useAuth();
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== 'learner') {
      setLoading(false);
      return;
    }

    api
      .get<UserPreferences>('/learning/preferences')
      .then((prefs) => {
        setOnboardingCompleted(prefs.onboardingCompleted);
      })
      .catch((error: Error) => {
        console.error('Failed to fetch preferences:', error);
        setOnboardingCompleted(false);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (user?.role === 'learner' && onboardingCompleted === false) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
