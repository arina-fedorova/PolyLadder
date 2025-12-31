import { useState } from 'react';
import { Language } from '@polyladder/core/domain';
import api from '@/api/client';

export function useOnboarding() {
  const [baseLanguage, setBaseLanguage] = useState<Language | null>(null);
  const [studiedLanguages, setStudiedLanguages] = useState<Language[]>([]);
  const [focusModeEnabled, setFocusModeEnabled] = useState(false);
  const [focusLanguage, setFocusLanguage] = useState<Language | null>(null);

  const completeOnboarding = async () => {
    await api.put('/learning/preferences', {
      studiedLanguages,
      focusModeEnabled,
      focusLanguage,
      onboardingCompleted: true,
    });

    if (focusModeEnabled && focusLanguage) {
      await api.post('/learning/preferences/focus', {
        enabled: true,
        language: focusLanguage,
      });
    }

    for (const lang of studiedLanguages) {
      await api.post('/learning/languages', { language: lang });
    }
  };

  const skipOnboarding = async () => {
    await api.put('/learning/preferences', {
      onboardingCompleted: true,
    });
  };

  return {
    baseLanguage,
    setBaseLanguage,
    studiedLanguages,
    setStudiedLanguages,
    focusModeEnabled,
    setFocusModeEnabled,
    focusLanguage,
    setFocusLanguage,
    completeOnboarding,
    skipOnboarding,
  };
}
