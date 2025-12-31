import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Language } from '@polyladder/core/domain';

const LANGUAGE_NAMES: Record<Language, string> = {
  [Language.EN]: 'English (US)',
  [Language.IT]: 'Italian',
  [Language.PT]: 'Portuguese (Portugal)',
  [Language.SL]: 'Slovenian',
  [Language.ES]: 'Spanish (Spain)',
};

interface BaseLanguageSelectionProps {
  onSelect: (language: Language) => void;
}

export function BaseLanguageSelection({ onSelect }: BaseLanguageSelectionProps) {
  const [selected, setSelected] = useState<Language | null>(null);
  const navigate = useNavigate();

  const handleContinue = () => {
    if (selected) {
      onSelect(selected);
      void navigate('/onboarding/studied-languages');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Select Your Base Language</h1>
          <p className="mt-4 text-gray-600">
            This is the language you already know well. It will be used for explanations and
            translations.
          </p>
          <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-4 py-2 inline-block">
            ⚠️ This cannot be changed later.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
            <button
              key={code}
              onClick={() => setSelected(code as Language)}
              className={`p-6 rounded-lg border-2 transition-all ${
                selected?.toString() === code
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <span className="text-lg font-medium">{name}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => {
              void navigate('/onboarding');
            }}
            className="btn-secondary flex-1"
          >
            Back
          </button>
          <button
            onClick={handleContinue}
            disabled={!selected}
            className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
