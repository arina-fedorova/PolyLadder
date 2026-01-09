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

interface StudiedLanguagesSelectionProps {
  baseLanguage: Language;
  onSelect: (languages: Language[]) => void;
}

export function StudiedLanguagesSelection({
  baseLanguage,
  onSelect,
}: StudiedLanguagesSelectionProps) {
  const [selected, setSelected] = useState<Language[]>([]);
  const navigate = useNavigate();

  const toggleLanguage = (lang: Language) => {
    if (lang === baseLanguage) return;

    if (selected.includes(lang)) {
      setSelected(selected.filter((l) => l !== lang));
    } else if (selected.length < 5) {
      setSelected([...selected, lang]);
    }
  };

  const handleContinue = () => {
    if (selected.length > 0) {
      onSelect(selected);
      void navigate('/onboarding/focus-mode');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Which Languages Do You Want to Learn?
          </h1>
          <p className="mt-4 text-gray-600">Select 1-5 languages. You can add more later.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Object.entries(LANGUAGE_NAMES).map(([code, name]) => {
            const lang = code as Language;
            const isBase = lang === baseLanguage;
            const isSelected = selected.includes(lang);
            const isDisabled = isBase || (selected.length >= 5 && !isSelected);

            return (
              <button
                key={code}
                onClick={() => toggleLanguage(lang)}
                disabled={isDisabled}
                className={`p-6 rounded-lg border-2 transition-all ${
                  isSelected
                    ? 'border-primary-600 bg-primary-50'
                    : isDisabled
                      ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <span className="text-lg font-medium">
                  {name}
                  {isBase && ' (Base)'}
                </span>
              </button>
            );
          })}
        </div>

        <div className="text-center text-sm text-gray-600">
          {selected.length}/5 languages selected
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => {
              void navigate('/onboarding/base-language');
            }}
            className="btn-secondary flex-1"
          >
            Back
          </button>
          <button
            onClick={handleContinue}
            disabled={selected.length === 0}
            className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
