import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

interface InterferencePattern {
  id: string;
  userId: string;
  targetLanguage: string;
  sourceLanguage: string;
  targetItemId: string;
  targetText: string;
  interferingItemId: string;
  interferingText: string;
  interferenceType: 'vocabulary' | 'grammar' | 'syntax';
  confidenceScore: number;
  occurrenceCount: number;
  lastOccurrence: string;
  remediationCompleted: boolean;
  createdAt: string;
}

interface LanguagePair {
  targetLanguage: string;
  sourceLanguage: string;
  count: number;
}

interface InterferenceSummary {
  totalPatterns: number;
  activePatterns: number;
  remediatedPatterns: number;
  topInterferenceLanguagePairs: LanguagePair[];
  recentPatterns: InterferencePattern[];
}

interface RemediationExercise {
  id: string;
  patternId: string;
  exerciseType: 'contrast' | 'fill_blank' | 'multiple_choice';
  targetItem: { language: string; text: string; translation: string };
  interferingItem: { language: string; text: string; translation: string };
  prompt: string;
  correctAnswer: string;
  distractors: string[];
}

interface InterferenceReduction {
  rate: number;
  trend: 'improving' | 'stable' | 'worsening';
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

export function InterferenceDashboard() {
  const queryClient = useQueryClient();
  const [activePatternId, setActivePatternId] = useState<string | null>(null);
  const [includeRemediated, setIncludeRemediated] = useState(false);

  // Fetch summary
  const { data: summaryData, isLoading: summaryLoading } = useQuery<{
    summary: InterferenceSummary;
  }>({
    queryKey: ['interference-summary'],
    queryFn: () => api.get('/learning/interference/summary'),
  });

  // Fetch patterns
  const { data: patternsData, isLoading: patternsLoading } = useQuery<{
    patterns: InterferencePattern[];
  }>({
    queryKey: ['interference-patterns', includeRemediated],
    queryFn: () =>
      api.get(`/learning/interference/patterns?includeRemediated=${includeRemediated}`),
  });

  // Fetch remediation exercises
  const { data: exercisesData } = useQuery<{ exercises: RemediationExercise[] }>({
    queryKey: ['remediation-exercises', activePatternId],
    queryFn: () => api.get(`/learning/interference/remediation/${activePatternId}`),
    enabled: !!activePatternId,
  });

  // Fetch reduction stats for active pattern
  const { data: reductionData } = useQuery<{ reduction: InterferenceReduction }>({
    queryKey: ['interference-reduction', activePatternId],
    queryFn: () => api.get(`/learning/interference/reduction/${activePatternId}`),
    enabled: !!activePatternId,
  });

  // Submit remediation attempt
  const submitAttemptMutation = useMutation({
    mutationFn: (payload: {
      exerciseId: string;
      userAnswer: string;
      isCorrect: boolean;
      timeSpent: number;
    }) => api.post('/learning/interference/remediation/submit', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['interference-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['interference-patterns'] });
    },
  });

  // Mark pattern complete
  const markCompleteMutation = useMutation({
    mutationFn: (patternId: string) =>
      api.post(`/learning/interference/patterns/${patternId}/complete`, {}),
    onSuccess: () => {
      setActivePatternId(null);
      void queryClient.invalidateQueries({ queryKey: ['interference-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['interference-patterns'] });
    },
  });

  const summary = summaryData?.summary;
  const patterns = patternsData?.patterns || [];
  const exercises = exercisesData?.exercises || [];
  const reduction = reductionData?.reduction;

  if (summaryLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Remediation exercise view
  if (activePatternId && exercises.length > 0) {
    return (
      <RemediationSession
        exercises={exercises}
        reduction={reduction}
        onSubmit={(exerciseId, answer, isCorrect, timeSpent) => {
          submitAttemptMutation.mutate({
            exerciseId,
            userAnswer: answer,
            isCorrect,
            timeSpent,
          });
        }}
        onComplete={() => {
          markCompleteMutation.mutate(activePatternId);
        }}
        onBack={() => setActivePatternId(null)}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Interference Detection</h2>
        <p className="text-gray-600 mt-1">Track and remediate language interference patterns</p>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4 text-center">
            <div className="text-sm text-gray-600 mb-1">Total Patterns</div>
            <div className="text-3xl font-bold text-gray-800">{summary.totalPatterns}</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-sm text-gray-600 mb-1">Active</div>
            <div className="text-3xl font-bold text-orange-600">{summary.activePatterns}</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-sm text-gray-600 mb-1">Remediated</div>
            <div className="text-3xl font-bold text-green-600">{summary.remediatedPatterns}</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-sm text-gray-600 mb-1">Success Rate</div>
            <div className="text-3xl font-bold text-blue-600">
              {summary.totalPatterns > 0
                ? Math.round((summary.remediatedPatterns / summary.totalPatterns) * 100)
                : 0}
              %
            </div>
          </div>
        </div>
      )}

      {/* Top Interference Pairs */}
      {summary && summary.topInterferenceLanguagePairs.length > 0 && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">Most Common Interference Pairs</h3>
          <div className="flex flex-wrap gap-3">
            {summary.topInterferenceLanguagePairs.map((pair, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-gray-100 px-4 py-2 rounded-lg">
                <span
                  className={`px-2 py-1 rounded text-sm font-medium ${
                    LANGUAGE_COLORS[pair.sourceLanguage] || 'bg-gray-200'
                  }`}
                >
                  {LANGUAGE_NAMES[pair.sourceLanguage] || pair.sourceLanguage}
                </span>
                <span className="text-gray-500">→</span>
                <span
                  className={`px-2 py-1 rounded text-sm font-medium ${
                    LANGUAGE_COLORS[pair.targetLanguage] || 'bg-gray-200'
                  }`}
                >
                  {LANGUAGE_NAMES[pair.targetLanguage] || pair.targetLanguage}
                </span>
                <span className="text-gray-600 text-sm">({pair.count})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Patterns List */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Interference Patterns</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeRemediated}
              onChange={(e) => setIncludeRemediated(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show remediated
          </label>
        </div>

        {patternsLoading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-100 rounded"></div>
            ))}
          </div>
        ) : patterns.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-lg mb-2">No interference patterns detected</p>
            <p className="text-sm">
              Patterns will appear here when similar words from different languages are confused
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {patterns.map((pattern) => (
              <div
                key={pattern.id}
                className={`border-2 rounded-lg p-4 transition-colors ${
                  pattern.remediationCompleted
                    ? 'border-green-200 bg-green-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xl font-semibold">{pattern.interferingText}</span>
                      <span className="text-gray-400">→</span>
                      <span className="text-xl font-semibold text-green-700">
                        {pattern.targetText}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-600">
                      <span
                        className={`px-2 py-0.5 rounded ${
                          LANGUAGE_COLORS[pattern.sourceLanguage] || 'bg-gray-100'
                        }`}
                      >
                        {LANGUAGE_NAMES[pattern.sourceLanguage] || pattern.sourceLanguage}
                      </span>
                      <span>→</span>
                      <span
                        className={`px-2 py-0.5 rounded ${
                          LANGUAGE_COLORS[pattern.targetLanguage] || 'bg-gray-100'
                        }`}
                      >
                        {LANGUAGE_NAMES[pattern.targetLanguage] || pattern.targetLanguage}
                      </span>
                      <span className="text-gray-400">|</span>
                      <span>Occurrences: {pattern.occurrenceCount}</span>
                      <span className="text-gray-400">|</span>
                      <span>Confidence: {Math.round(pattern.confidenceScore * 100)}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {pattern.remediationCompleted ? (
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                        Remediated
                      </span>
                    ) : (
                      <button
                        onClick={() => setActivePatternId(pattern.id)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                      >
                        Practice
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface RemediationSessionProps {
  exercises: RemediationExercise[];
  reduction?: InterferenceReduction;
  onSubmit: (exerciseId: string, answer: string, isCorrect: boolean, timeSpent: number) => void;
  onComplete: () => void;
  onBack: () => void;
}

function RemediationSession({
  exercises,
  reduction,
  onSubmit,
  onComplete,
  onBack,
}: RemediationSessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [startTime] = useState(Date.now());
  const [correctCount, setCorrectCount] = useState(0);
  const [userInput, setUserInput] = useState('');

  const currentExercise = exercises[currentIndex];
  const isLastExercise = currentIndex === exercises.length - 1;
  const allOptions = [currentExercise.correctAnswer, ...currentExercise.distractors].sort(
    () => Math.random() - 0.5
  );

  const handleAnswer = (answer: string) => {
    if (showResult) return;

    setSelectedAnswer(answer);
    setShowResult(true);

    const isCorrect =
      answer.toLowerCase().trim() === currentExercise.correctAnswer.toLowerCase().trim();
    const timeSpent = Date.now() - startTime;

    if (isCorrect) {
      setCorrectCount((prev) => prev + 1);
    }

    onSubmit(currentExercise.id, answer, isCorrect, timeSpent);
  };

  const handleNext = () => {
    if (isLastExercise) {
      onComplete();
    } else {
      setCurrentIndex((prev) => prev + 1);
      setSelectedAnswer(null);
      setShowResult(false);
      setUserInput('');
    }
  };

  const progress = ((currentIndex + 1) / exercises.length) * 100;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-gray-600 hover:text-gray-800 flex items-center gap-1"
        >
          <span>←</span> Back
        </button>
        <h2 className="text-xl font-bold">Remediation Exercise</h2>
        <div className="w-20"></div>
      </div>

      {/* Progress */}
      <div className="card p-4">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>
            Exercise {currentIndex + 1} / {exercises.length}
          </span>
          <span>Correct: {correctCount}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Reduction Trend */}
      {reduction && (
        <div
          className={`rounded-lg px-4 py-2 text-sm ${
            reduction.trend === 'improving'
              ? 'bg-green-100 text-green-800'
              : reduction.trend === 'stable'
                ? 'bg-gray-100 text-gray-800'
                : 'bg-orange-100 text-orange-800'
          }`}
        >
          Trend: {reduction.trend.charAt(0).toUpperCase() + reduction.trend.slice(1)} (
          {reduction.rate > 0 ? '+' : ''}
          {reduction.rate.toFixed(1)}%)
        </div>
      )}

      {/* Exercise Card */}
      <div className="card p-6">
        <div className="text-center mb-6">
          <div className="text-sm text-gray-500 mb-2 uppercase tracking-wide">
            {currentExercise.exerciseType.replace('_', ' ')}
          </div>
          <h3 className="text-xl font-medium">{currentExercise.prompt}</h3>
        </div>

        {/* Answer options based on exercise type */}
        {currentExercise.exerciseType === 'fill_blank' ? (
          <div className="space-y-4">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && userInput.trim() && !showResult) {
                  handleAnswer(userInput.trim());
                }
              }}
              disabled={showResult}
              placeholder="Type your answer..."
              className="w-full px-4 py-3 border-2 rounded-lg text-lg focus:border-blue-500 outline-none disabled:bg-gray-100"
            />
            {!showResult && (
              <button
                onClick={() => handleAnswer(userInput.trim())}
                disabled={!userInput.trim()}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
              >
                Submit
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            {allOptions.map((option, idx) => {
              const isSelected = selectedAnswer === option;
              const isCorrect = option === currentExercise.correctAnswer;
              const showCorrectness = showResult && (isSelected || isCorrect);

              return (
                <button
                  key={idx}
                  onClick={() => handleAnswer(option)}
                  disabled={showResult}
                  className={`p-4 rounded-lg border-2 text-lg font-medium transition-all ${
                    showCorrectness
                      ? isCorrect
                        ? 'border-green-500 bg-green-50 text-green-800'
                        : isSelected
                          ? 'border-red-500 bg-red-50 text-red-800'
                          : 'border-gray-200'
                      : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        )}

        {/* Result and explanation */}
        {showResult && (
          <div className="mt-6 space-y-4">
            <div
              className={`p-4 rounded-lg ${
                selectedAnswer?.toLowerCase().trim() ===
                currentExercise.correctAnswer.toLowerCase().trim()
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {selectedAnswer?.toLowerCase().trim() ===
              currentExercise.correctAnswer.toLowerCase().trim()
                ? 'Correct!'
                : `Incorrect. The correct answer is "${currentExercise.correctAnswer}"`}
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-2">Remember the difference:</div>
              <div className="flex items-center justify-center gap-6">
                <div className="text-center">
                  <div className="text-sm text-gray-500 mb-1">
                    {LANGUAGE_NAMES[currentExercise.targetItem.language]}
                  </div>
                  <div className="text-lg font-semibold text-green-700">
                    {currentExercise.targetItem.text}
                  </div>
                </div>
                <div className="text-gray-400 text-2xl">≠</div>
                <div className="text-center">
                  <div className="text-sm text-gray-500 mb-1">
                    {LANGUAGE_NAMES[currentExercise.interferingItem.language]}
                  </div>
                  <div className="text-lg font-semibold text-orange-700">
                    {currentExercise.interferingItem.text}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleNext}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              {isLastExercise ? 'Complete' : 'Next'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default InterferenceDashboard;
