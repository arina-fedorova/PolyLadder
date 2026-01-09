import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Language } from '@polyladder/types';

const LANGUAGE_NAMES: Record<Language, string> = {
  [Language.EN]: 'English (US)',
  [Language.IT]: 'Italian',
  [Language.PT]: 'Portuguese (Portugal)',
  [Language.SL]: 'Slovenian',
  [Language.ES]: 'Spanish (Spain)',
};

interface FocusModeSetupProps {
  studiedLanguages: Language[];
  onComplete: (enabled: boolean, language: Language | null) => void;
}

export function FocusModeSetup({ studiedLanguages, onComplete }: FocusModeSetupProps) {
  const [enabled, setEnabled] = useState(false);
  const [focusLanguage, setFocusLanguage] = useState<Language | null>(null);
  const navigate = useNavigate();

  const handleContinue = () => {
    onComplete(enabled, focusLanguage);
    void navigate('/onboarding/complete');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Focus Mode (Optional)</h1>
          <p className="mt-4 text-gray-600">
            Focus mode temporarily narrows your learning to one language for intensive practice. You
            can switch or disable this anytime.
          </p>
        </div>

        <div className="card">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
            />
            <span className="ml-3 text-lg font-medium text-gray-900">Enable focus mode</span>
          </label>

          {enabled && (
            <div className="mt-6">
              <label
                htmlFor="focus-language"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Which language do you want to focus on?
              </label>
              <select
                id="focus-language"
                value={focusLanguage || ''}
                onChange={(e) => setFocusLanguage((e.target.value as Language) || null)}
                className="input"
              >
                <option value="">Select a language</option>
                {studiedLanguages.map((lang) => (
                  <option key={lang} value={lang}>
                    {LANGUAGE_NAMES[lang]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => {
              void navigate('/onboarding/studied-languages');
            }}
            className="btn-secondary flex-1"
          >
            Back
          </button>
          <button onClick={handleContinue} className="btn-primary flex-1">
            {enabled && focusLanguage ? 'Start Learning' : 'Skip Focus Mode'}
          </button>
        </div>
      </div>
    </div>
  );
}
