import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { FlashCard } from './FlashCard';

type MixingStrategy = 'equal' | 'weighted' | 'random';
type PracticeType = 'recall' | 'recognition';

interface MixedItemContent {
  text: string;
  definition: string | null;
  audioUrl: string | null;
  level: string;
}

interface MixedExerciseItem {
  id: string;
  language: string;
  practiceType: PracticeType;
  meaningId: string;
  content: MixedItemContent;
  estimatedDifficulty: number;
}

interface MixedSession {
  sessionId: string;
  languages: string[];
  mixingStrategy: MixingStrategy;
  items: MixedExerciseItem[];
}

interface LanguagePerformance {
  language: string;
  itemsAttempted: number;
  correctAnswers: number;
  averageTime: number;
  accuracy: number;
}

interface MixedSessionSummary {
  sessionId: string;
  totalItems: number;
  totalCorrect: number;
  totalTime: number;
  languageBreakdown: LanguagePerformance[];
  switchingEfficiency: number;
}

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

export function MixedPracticeSession() {
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<MixedExerciseItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [sessionComplete, setSessionComplete] = useState(false);
  const [languages, setLanguages] = useState<string[]>([]);

  // Configuration state
  const [config, setConfig] = useState({
    practiceTypes: ['recall', 'recognition'] as PracticeType[],
    itemsPerLanguage: 10,
    mixingStrategy: 'equal' as MixingStrategy,
    totalItems: 20,
  });

  // Start session mutation
  const startMutation = useMutation({
    mutationFn: async () => {
      return api.post<MixedSession>('/learning/mixed/start', config);
    },
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setItems(data.items);
      setLanguages(data.languages);
      setCurrentIndex(0);
      setStartTime(Date.now());
      setSessionComplete(false);
    },
  });

  // Submit attempt mutation
  const submitMutation = useMutation({
    mutationFn: async (payload: {
      sessionId: string;
      itemId: string;
      itemType: string;
      language: string;
      isCorrect: boolean;
      timeSpent: number;
    }) => {
      return api.post('/learning/mixed/submit', payload);
    },
  });

  // Get summary query
  const { data: summaryData } = useQuery<{ summary: MixedSessionSummary }>({
    queryKey: ['mixed-summary', sessionId],
    queryFn: async () => {
      return api.get(`/learning/mixed/summary/${sessionId}`);
    },
    enabled: sessionComplete && !!sessionId,
  });

  const summary = summaryData?.summary;

  const handleStartSession = () => {
    startMutation.mutate();
  };

  const handleAssessment = (quality: number) => {
    const currentItem = items[currentIndex];
    const timeSpent = Math.floor((Date.now() - startTime) / 1000);

    // Quality 3+ is considered correct in SM-2
    const isCorrect = quality >= 3;

    submitMutation.mutate(
      {
        sessionId: sessionId!,
        itemId: currentItem.id,
        itemType: currentItem.practiceType,
        language: currentItem.language,
        isCorrect,
        timeSpent,
      },
      {
        onSuccess: () => {
          if (currentIndex < items.length - 1) {
            setTimeout(() => {
              setCurrentIndex((prev) => prev + 1);
              setStartTime(Date.now());
            }, 500);
          } else {
            setSessionComplete(true);
          }
        },
      }
    );
  };

  const resetSession = () => {
    setSessionId(null);
    setItems([]);
    setCurrentIndex(0);
    setSessionComplete(false);
    void queryClient.invalidateQueries({ queryKey: ['mixed-summary'] });
  };

  // Pre-session configuration
  if (!sessionId) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="card p-8">
          <h2 className="text-2xl font-bold mb-4">Mixed Language Practice</h2>
          <p className="text-gray-600 mb-6">
            Practice all your languages in one session to build mental agility and reduce
            interference.
          </p>

          <div className="space-y-6">
            {/* Mixing Strategy */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mixing Strategy
              </label>
              <div className="flex gap-3">
                {(['equal', 'weighted', 'random'] as MixingStrategy[]).map((strategy) => (
                  <button
                    key={strategy}
                    onClick={() => setConfig((prev) => ({ ...prev, mixingStrategy: strategy }))}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      config.mixingStrategy === strategy
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {strategy.charAt(0).toUpperCase() + strategy.slice(1)}
                  </button>
                ))}
              </div>
              <p className="text-sm text-gray-500 mt-2">
                {config.mixingStrategy === 'equal' && 'Equal items from each language'}
                {config.mixingStrategy === 'weighted' && 'More items from weaker languages'}
                {config.mixingStrategy === 'random' && 'Random selection across all languages'}
              </p>
            </div>

            {/* Total Items */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Total Items: {config.totalItems}
              </label>
              <input
                type="range"
                min="10"
                max="50"
                step="5"
                value={config.totalItems}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, totalItems: parseInt(e.target.value) }))
                }
                className="w-full h-2 bg-gray-200 rounded-lg cursor-pointer"
              />
            </div>

            {/* Start Button */}
            <button
              onClick={handleStartSession}
              disabled={startMutation.isPending}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {startMutation.isPending ? 'Starting...' : 'Start Mixed Session'}
            </button>

            {startMutation.isError && (
              <div className="text-red-600 text-center">
                {startMutation.error instanceof Error
                  ? startMutation.error.message
                  : 'Failed to start session. Make sure you have at least 2 active languages.'}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Session complete with summary
  if (sessionComplete && summary) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Summary Header */}
        <div className="card p-8">
          <h2 className="text-3xl font-bold mb-6 text-center">Session Complete!</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg text-center">
              <div className="text-sm text-gray-600 mb-1">Total Items</div>
              <div className="text-3xl font-bold text-blue-600">{summary.totalItems}</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg text-center">
              <div className="text-sm text-gray-600 mb-1">Correct</div>
              <div className="text-3xl font-bold text-green-600">{summary.totalCorrect}</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg text-center">
              <div className="text-sm text-gray-600 mb-1">Accuracy</div>
              <div className="text-3xl font-bold text-purple-600">
                {summary.totalItems > 0
                  ? Math.round((summary.totalCorrect / summary.totalItems) * 100)
                  : 0}
                %
              </div>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg text-center">
              <div className="text-sm text-gray-600 mb-1">Switching</div>
              <div className="text-3xl font-bold text-orange-600">
                {Math.round(summary.switchingEfficiency * 100)}%
              </div>
            </div>
          </div>
        </div>

        {/* Per-Language Breakdown */}
        <div className="card p-6">
          <h3 className="text-xl font-bold mb-4">Performance by Language</h3>
          <div className="space-y-4">
            {summary.languageBreakdown.map((lang) => (
              <div
                key={lang.language}
                className="border-2 border-gray-200 rounded-lg p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <span
                    className={`px-4 py-2 rounded-lg font-semibold border-2 ${
                      LANGUAGE_COLORS[lang.language] || 'bg-gray-100 text-gray-800 border-gray-300'
                    }`}
                  >
                    {LANGUAGE_NAMES[lang.language] || lang.language}
                  </span>
                  <span className="text-gray-600">{lang.itemsAttempted} items</span>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-sm text-gray-500">Correct</div>
                    <div className="font-semibold">
                      {lang.correctAnswers}/{lang.itemsAttempted}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-500">Avg Time</div>
                    <div className="font-semibold">{lang.averageTime.toFixed(1)}s</div>
                  </div>
                  <div
                    className={`text-2xl font-bold ${
                      lang.accuracy >= 0.8
                        ? 'text-green-600'
                        : lang.accuracy >= 0.6
                          ? 'text-yellow-600'
                          : 'text-red-600'
                    }`}
                  >
                    {Math.round(lang.accuracy * 100)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Switching Efficiency Insight */}
        <div
          className={`rounded-lg p-6 border-l-4 ${
            summary.switchingEfficiency >= 0.8
              ? 'bg-green-50 border-green-400'
              : summary.switchingEfficiency >= 0.6
                ? 'bg-yellow-50 border-yellow-400'
                : 'bg-orange-50 border-orange-400'
          }`}
        >
          <h4 className="font-semibold mb-2">Language Switching Analysis</h4>
          <p className="text-gray-700">
            {summary.switchingEfficiency >= 0.8
              ? 'Excellent! You handle language switches very well with minimal errors.'
              : summary.switchingEfficiency >= 0.6
                ? 'Good switching ability. Continue practicing to improve consistency.'
                : 'Language switches are challenging for you. This is normal - keep practicing!'}
          </p>
          <div className="mt-2 text-sm text-gray-600">
            Accuracy after switching languages: {Math.round(summary.switchingEfficiency * 100)}%
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={resetSession}
            className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Start Another Session
          </button>
        </div>
      </div>
    );
  }

  // Active session
  const currentItem = items[currentIndex];
  const previousItem = currentIndex > 0 ? items[currentIndex - 1] : null;
  const languageSwitched = previousItem && previousItem.language !== currentItem.language;
  const progress = ((currentIndex + 1) / items.length) * 100;

  // Convert item to FlashCard format
  const flashCardData = {
    meaningId: currentItem.meaningId,
    word: currentItem.content.text,
    definition: currentItem.content.definition || 'No definition available',
    audioUrl: currentItem.content.audioUrl,
    cefrLevel: currentItem.content.level,
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Progress Bar */}
      <div className="card p-4">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>
            Progress: {currentIndex + 1} / {items.length}
          </span>
          <span>{Math.round(progress)}% Complete</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Language indicators */}
        <div className="flex gap-2 mt-3">
          {languages.map((lang) => {
            const langItems = items.filter((i) => i.language === lang);
            const completedLangItems = langItems.filter(
              (_, idx) => items.indexOf(langItems[idx]) < currentIndex
            );
            return (
              <div
                key={lang}
                className={`px-3 py-1 rounded text-sm ${
                  LANGUAGE_COLORS[lang] || 'bg-gray-100 text-gray-800'
                }`}
              >
                {lang}: {completedLangItems.length}/{langItems.length}
              </div>
            );
          })}
        </div>
      </div>

      {/* Language Indicator and Switch Alert */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span
            className={`px-6 py-3 rounded-lg font-bold text-lg border-2 ${
              LANGUAGE_COLORS[currentItem.language] || 'bg-gray-100 text-gray-800 border-gray-300'
            }`}
          >
            {LANGUAGE_NAMES[currentItem.language] || currentItem.language}
          </span>
          {languageSwitched && (
            <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded text-sm font-medium animate-pulse">
              Language Switch!
            </span>
          )}
        </div>
        <div className="text-sm text-gray-600">
          Difficulty: {'★'.repeat(currentItem.estimatedDifficulty)}
          {'☆'.repeat(5 - currentItem.estimatedDifficulty)}
        </div>
      </div>

      {/* Flash Card */}
      <FlashCard
        card={flashCardData}
        onAssessment={handleAssessment}
        disabled={submitMutation.isPending}
      />

      {/* Keyboard Hints */}
      <div className="text-center text-sm text-gray-500">
        <p>Keyboard shortcuts: Space to flip | 1-4 for ratings</p>
      </div>
    </div>
  );
}
