import { Routes, Route, Navigate } from 'react-router-dom';
import { Welcome } from '@/components/onboarding/Welcome';
import { BaseLanguageSelection } from '@/components/onboarding/BaseLanguageSelection';
import { StudiedLanguagesSelection } from '@/components/onboarding/StudiedLanguagesSelection';
import { FocusModeSetup } from '@/components/onboarding/FocusModeSetup';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

function SkipOnboarding() {
  const { skipOnboarding } = useOnboarding();
  const navigate = useNavigate();

  useEffect(() => {
    void skipOnboarding()
      .then(() => {
        void navigate('/dashboard');
      })
      .catch((error: Error) => {
        console.error('Failed to skip onboarding:', error);
      });
  }, [skipOnboarding, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p>Skipping onboarding...</p>
    </div>
  );
}

function OnboardingComplete() {
  const { completeOnboarding } = useOnboarding();
  const navigate = useNavigate();

  useEffect(() => {
    void completeOnboarding()
      .then(() => {
        void navigate('/dashboard');
      })
      .catch((error: Error) => {
        console.error('Failed to complete onboarding:', error);
      });
  }, [completeOnboarding, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p>Completing onboarding...</p>
    </div>
  );
}

export function OnboardingPage() {
  const onboarding = useOnboarding();

  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route
        path="/base-language"
        element={<BaseLanguageSelection onSelect={onboarding.setBaseLanguage} />}
      />
      <Route
        path="/studied-languages"
        element={
          onboarding.baseLanguage ? (
            <StudiedLanguagesSelection
              baseLanguage={onboarding.baseLanguage}
              onSelect={onboarding.setStudiedLanguages}
            />
          ) : (
            <Navigate to="/onboarding/base-language" replace />
          )
        }
      />
      <Route
        path="/focus-mode"
        element={
          onboarding.studiedLanguages.length > 0 ? (
            <FocusModeSetup
              studiedLanguages={onboarding.studiedLanguages}
              onComplete={(enabled, language) => {
                onboarding.setFocusModeEnabled(enabled);
                onboarding.setFocusLanguage(language);
              }}
            />
          ) : (
            <Navigate to="/onboarding/studied-languages" replace />
          )
        }
      />
      <Route path="/skip" element={<SkipOnboarding />} />
      <Route path="/complete" element={<OnboardingComplete />} />
    </Routes>
  );
}
