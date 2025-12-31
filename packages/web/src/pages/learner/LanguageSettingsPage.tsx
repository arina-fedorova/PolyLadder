import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { UserPreferences } from '../../types';

const AVAILABLE_LANGUAGES: Record<string, string> = {
  EN: 'English',
  ES: 'Spanish',
  IT: 'Italian',
  PT: 'Portuguese',
  SL: 'Slovenian',
};

const MAX_LANGUAGES = 5;

interface AddLanguageModalProps {
  currentLanguages: string[];
  onAdd: (language: string) => void;
  onClose: () => void;
}

function AddLanguageModal({ currentLanguages, onAdd, onClose }: AddLanguageModalProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');

  const availableLanguages = Object.entries(AVAILABLE_LANGUAGES).filter(
    ([code]) => !currentLanguages.includes(code)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Add a Language</h2>
            <p className="mt-2 text-sm text-gray-600">
              Choose a language to add to your studied languages list.
            </p>
          </div>

          <div>
            <label htmlFor="language-select" className="block text-sm font-medium text-gray-700">
              Select Language
            </label>
            <select
              id="language-select"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">-- Choose a language --</option>
              {availableLanguages.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {selectedLanguage && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm text-blue-800">
                You'll need to complete the orthography gate (CEFR A0) for this language before
                accessing other content.
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => {
                if (selectedLanguage) {
                  onAdd(selectedLanguage);
                  setSelectedLanguage('');
                }
              }}
              disabled={!selectedLanguage}
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add Language
            </button>
            <button
              onClick={onClose}
              className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LanguageSettingsPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const queryClient = useQueryClient();

  // Fetch user preferences
  const { data: preferences, isLoading } = useQuery({
    queryKey: ['user-preferences'],
    queryFn: async () => {
      return api.get<UserPreferences>('/learning/preferences');
    },
  });

  // Add language mutation
  const addLanguageMutation = useMutation({
    mutationFn: async (language: string) => {
      return api.post('/learning/preferences/languages', { language });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user-preferences'] });
      setShowAddModal(false);
    },
  });

  // Remove language mutation
  const removeLanguageMutation = useMutation({
    mutationFn: async (language: string) => {
      return api.delete(`/learning/preferences/languages/${language}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user-preferences'] });
    },
  });

  // Update focus mode mutation
  const updateFocusMutation = useMutation({
    mutationFn: async (data: { enabled: boolean; language?: string }) => {
      return api.post('/learning/preferences/focus', data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user-preferences'] });
    },
  });

  const handleAddLanguage = (language: string) => {
    addLanguageMutation.mutate(language);
  };

  const handleRemoveLanguage = (language: string) => {
    if (preferences && preferences.studiedLanguages.length === 1) {
      alert('You must study at least one language.');
      return;
    }

    const languageName = AVAILABLE_LANGUAGES[language];
    if (
      window.confirm(
        `Remove ${languageName}?\n\nYour progress will be hidden but not deleted. You can restore it by re-adding this language.`
      )
    ) {
      removeLanguageMutation.mutate(language);
    }
  };

  const handleToggleFocus = (enabled: boolean) => {
    if (!enabled) {
      updateFocusMutation.mutate({ enabled: false });
    } else if (preferences) {
      // Default to first language when enabling
      updateFocusMutation.mutate({
        enabled: true,
        language: preferences.studiedLanguages[0],
      });
    }
  };

  const handleChangeFocusLanguage = (language: string) => {
    updateFocusMutation.mutate({ enabled: true, language });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!preferences) {
    return <div className="p-6">Failed to load preferences</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Language Settings</h1>
        <p className="mt-2 text-gray-600">
          Manage your studied languages and focus mode preferences
        </p>
      </div>

      {/* Studied Languages Section */}
      <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Studied Languages ({preferences.studiedLanguages.length}/{MAX_LANGUAGES})
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Languages you're currently learning. You can study up to {MAX_LANGUAGES} languages
              simultaneously.
            </p>
          </div>
          {preferences.studiedLanguages.length < MAX_LANGUAGES && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add Language
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {preferences.studiedLanguages.map((lang) => (
            <div
              key={lang}
              className="flex items-center justify-between rounded-lg border-2 border-gray-200 bg-white p-4 hover:border-blue-300"
            >
              <div>
                <h3 className="font-semibold text-gray-900">{AVAILABLE_LANGUAGES[lang]}</h3>
                <p className="text-sm text-gray-500">Language code: {lang}</p>
              </div>
              <button
                onClick={() => handleRemoveLanguage(lang)}
                disabled={preferences.studiedLanguages.length === 1}
                className="text-red-600 hover:text-red-800 disabled:cursor-not-allowed disabled:text-gray-400"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {preferences.studiedLanguages.length === 0 && (
          <div className="py-8 text-center text-gray-500">
            No languages added yet. Click "Add Language" to get started.
          </div>
        )}
      </section>

      {/* Focus Mode Section */}
      <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Focus Mode</h2>
          <p className="mt-1 text-sm text-gray-600">
            Focus on a single language to reduce cognitive load and improve retention.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={preferences.focusModeEnabled}
              onChange={(e) => handleToggleFocus(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="font-medium text-gray-900">Enable focus mode</span>
          </label>
        </div>

        {preferences.focusModeEnabled && (
          <div className="mt-4 space-y-3">
            <label htmlFor="focus-language" className="block text-sm font-medium text-gray-700">
              Focused Language
            </label>
            <select
              id="focus-language"
              value={preferences.focusLanguage || ''}
              onChange={(e) => handleChangeFocusLanguage(e.target.value)}
              className="block w-full max-w-md rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {preferences.studiedLanguages.map((lang) => (
                <option key={lang} value={lang}>
                  {AVAILABLE_LANGUAGES[lang]}
                </option>
              ))}
            </select>
            <p className="text-sm text-gray-600">
              Only content from{' '}
              {AVAILABLE_LANGUAGES[preferences.focusLanguage || preferences.studiedLanguages[0]]}{' '}
              will be shown in your learning sessions.
            </p>
          </div>
        )}

        {!preferences.focusModeEnabled && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm text-gray-700">
              Focus mode is disabled. You'll see content from all studied languages.
            </p>
          </div>
        )}
      </section>

      {/* Add Language Modal */}
      {showAddModal && (
        <AddLanguageModal
          currentLanguages={preferences.studiedLanguages}
          onAdd={handleAddLanguage}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
