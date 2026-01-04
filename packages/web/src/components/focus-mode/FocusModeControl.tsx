import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

interface FocusModeSettings {
  enabled: boolean;
  focusLanguage: string | null;
  activatedAt: string | null;
  lastToggled: string | null;
}

interface FocusModeStats {
  totalFocusSessions: number;
  currentStreak: number;
  longestStreak: number;
  totalFocusedMinutes: number;
  languageBreakdown: Array<{
    language: string;
    sessionsCount: number;
    minutesPracticed: number;
  }>;
}

interface UserLanguage {
  id: string;
  language: string;
  orthographyCompleted: boolean;
  orthographyAccuracy: number | null;
  startedAt: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  EN: 'English',
  RU: 'Russian',
  DE: 'German',
  FR: 'French',
  ES: 'Spanish',
  IT: 'Italian',
  PT: 'Portuguese',
  ZH: 'Chinese',
  JA: 'Japanese',
  AR: 'Arabic',
  SL: 'Slovenian',
};

const LANGUAGE_COLORS: Record<string, string> = {
  EN: 'bg-blue-100 text-blue-800 border-blue-300',
  RU: 'bg-red-100 text-red-800 border-red-300',
  DE: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  FR: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  ES: 'bg-orange-100 text-orange-800 border-orange-300',
  IT: 'bg-green-100 text-green-800 border-green-300',
  PT: 'bg-teal-100 text-teal-800 border-teal-300',
  ZH: 'bg-pink-100 text-pink-800 border-pink-300',
  JA: 'bg-purple-100 text-purple-800 border-purple-300',
  AR: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  SL: 'bg-cyan-100 text-cyan-800 border-cyan-300',
};

export function FocusModeControl() {
  const queryClient = useQueryClient();
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);

  // Fetch focus mode settings
  const { data: settingsData, isLoading: settingsLoading } = useQuery<FocusModeSettings>({
    queryKey: ['focus-mode-settings'],
    queryFn: () => api.get('/learning/focus/settings'),
  });

  // Fetch user's languages
  const { data: languagesData } = useQuery<{ languages: UserLanguage[] }>({
    queryKey: ['user-languages'],
    queryFn: () => api.get('/learning/languages'),
  });

  // Fetch stats when focus mode is enabled
  const { data: statsData } = useQuery<FocusModeStats>({
    queryKey: ['focus-mode-stats'],
    queryFn: () => api.get('/learning/focus/stats'),
    enabled: settingsData?.enabled || false,
  });

  // Enable focus mode
  const enableMutation = useMutation({
    mutationFn: (language: string) => api.post('/learning/focus/enable', { language }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['focus-mode-settings'] });
      void queryClient.invalidateQueries({ queryKey: ['focus-mode-stats'] });
      setShowLanguageSelector(false);
    },
  });

  // Disable focus mode
  const disableMutation = useMutation({
    mutationFn: () => api.post('/learning/focus/disable', {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['focus-mode-settings'] });
    },
  });

  // Switch focus language
  const switchMutation = useMutation({
    mutationFn: (language: string) => api.post('/learning/focus/switch', { language }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['focus-mode-settings'] });
      void queryClient.invalidateQueries({ queryKey: ['focus-mode-stats'] });
      setShowLanguageSelector(false);
    },
  });

  const handleToggleFocusMode = () => {
    if (settingsData?.enabled) {
      disableMutation.mutate();
    } else {
      setShowLanguageSelector(true);
    }
  };

  const handleSelectLanguage = (language: string) => {
    if (settingsData?.enabled && settingsData.focusLanguage === language) {
      return;
    }

    if (settingsData?.enabled) {
      switchMutation.mutate(language);
    } else {
      enableMutation.mutate(language);
    }
  };

  const isLoading =
    enableMutation.isPending || disableMutation.isPending || switchMutation.isPending;

  if (settingsLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
        <div className="text-sm text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Focus Mode Toggle */}
      <div className="flex items-center justify-between p-4 bg-white rounded-lg shadow">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">Focus Mode</h3>
          <p className="text-sm text-gray-600">
            {settingsData?.enabled
              ? `Practicing ${LANGUAGE_NAMES[settingsData.focusLanguage || ''] || settingsData.focusLanguage} exclusively`
              : 'Practice all languages (parallel learning)'}
          </p>
        </div>
        <button
          onClick={handleToggleFocusMode}
          disabled={isLoading}
          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors disabled:opacity-50 ${
            settingsData?.enabled ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
              settingsData?.enabled ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Current Focus Language Display */}
      {settingsData?.enabled && settingsData.focusLanguage && (
        <div className="p-4 bg-white rounded-lg shadow">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-900">Current Focus</h4>
            <button
              onClick={() => setShowLanguageSelector(!showLanguageSelector)}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Change Language
            </button>
          </div>
          <div
            className={`inline-block px-4 py-2 rounded-lg font-semibold border-2 ${
              LANGUAGE_COLORS[settingsData.focusLanguage] ||
              'bg-gray-100 text-gray-800 border-gray-300'
            }`}
          >
            {LANGUAGE_NAMES[settingsData.focusLanguage] || settingsData.focusLanguage}
          </div>

          {/* Focus Session Stats */}
          {statsData && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-gray-50 rounded">
                <div className="text-2xl font-bold text-gray-900">{statsData.currentStreak}</div>
                <div className="text-xs text-gray-600">Day Streak</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded">
                <div className="text-2xl font-bold text-gray-900">
                  {statsData.totalFocusSessions}
                </div>
                <div className="text-xs text-gray-600">Sessions</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded">
                <div className="text-2xl font-bold text-gray-900">
                  {Math.round(statsData.totalFocusedMinutes)}
                </div>
                <div className="text-xs text-gray-600">Minutes</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Language Selector */}
      {(showLanguageSelector || !settingsData?.enabled) && languagesData && (
        <div className="p-4 bg-white rounded-lg shadow">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-900">Select Focus Language</h4>
            {showLanguageSelector && settingsData?.enabled && (
              <button
                onClick={() => setShowLanguageSelector(false)}
                className="text-sm text-gray-600 hover:text-gray-700"
              >
                Cancel
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {languagesData.languages.map((lang) => (
              <button
                key={lang.id}
                onClick={() => handleSelectLanguage(lang.language)}
                disabled={isLoading}
                className={`px-4 py-3 rounded-lg border-2 font-semibold transition-all ${
                  settingsData?.focusLanguage === lang.language
                    ? LANGUAGE_COLORS[lang.language] || 'bg-gray-100 text-gray-800 border-gray-300'
                    : 'border-gray-300 hover:border-gray-400'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="text-sm">{LANGUAGE_NAMES[lang.language] || lang.language}</div>
                <div className="text-xs text-gray-600 mt-1">
                  {lang.orthographyCompleted ? 'Ready' : 'In Progress'}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Focus Mode Benefits */}
      {!settingsData?.enabled && (
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="font-semibold text-blue-900 mb-2">Why Use Focus Mode?</h4>
          <ul className="space-y-1 text-sm text-blue-800">
            <li>Deep immersion in one language</li>
            <li>Build stronger neural pathways</li>
            <li>Reduce language switching fatigue</li>
            <li>Perfect for intensive study sessions</li>
          </ul>
        </div>
      )}

      {/* Active Mode Info */}
      {settingsData?.enabled && (
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <h4 className="font-semibold text-green-900 mb-2">Focus Mode Active</h4>
          <p className="text-sm text-green-800">
            All practice sessions will use{' '}
            {LANGUAGE_NAMES[settingsData.focusLanguage || ''] || settingsData.focusLanguage} only.
            Toggle off to return to parallel learning.
          </p>
        </div>
      )}
    </div>
  );
}
