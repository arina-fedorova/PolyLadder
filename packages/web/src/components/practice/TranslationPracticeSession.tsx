import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { TranslationExercise } from './TranslationExercise';

interface TranslationExerciseData {
  exerciseId: string;
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
  acceptableTranslations: string[];
  hint: {
    firstWord: string;
    wordCount: number;
  };
  cefrLevel: string;
  meaningId: string;
}

interface TranslationExercisesResponse {
  exercises: TranslationExerciseData[];
  count: number;
}

interface TranslationValidationResult {
  isCorrect: boolean;
  similarity: number;
  matchedTranslation: string | null;
  alternativeTranslations: string[];
  feedback: string;
  qualityRating: number;
}

interface TranslationStats {
  totalExercises: number;
  correctCount: number;
  accuracy: number;
  avgSimilarity: number | null;
}

interface HintResponse {
  hint: string;
}

interface TranslationPracticeSessionProps {
  sourceLanguage: string;
  targetLanguage: string;
}

export function TranslationPracticeSession({
  sourceLanguage,
  targetLanguage,
}: TranslationPracticeSessionProps) {
  const queryClient = useQueryClient();
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [feedback, setFeedback] = useState<TranslationValidationResult | null>(null);
  const totalTimeRef = useRef<number>(0);
  const totalSimilarityRef = useRef<number>(0);

  const { data: response, isLoading } = useQuery<TranslationExercisesResponse>({
    queryKey: ['translation-exercises', sourceLanguage, targetLanguage],
    queryFn: async () => {
      return api.get<TranslationExercisesResponse>(
        `/learning/translation/exercises?sourceLanguage=${sourceLanguage}&targetLanguage=${targetLanguage}&limit=10`
      );
    },
  });

  const exercises = response?.exercises ?? [];

  const submitMutation = useMutation({
    mutationFn: async (payload: {
      exerciseId: string;
      userTranslation: string;
      acceptableTranslations: string[];
      meaningId: string;
      timeSpentMs: number;
    }) => {
      return api.post<TranslationValidationResult>('/learning/translation/submit', payload);
    },
    onSuccess: (result, variables) => {
      setFeedback(result);
      totalTimeRef.current += variables.timeSpentMs;
      totalSimilarityRef.current += result.similarity;
      setAttemptCount((prev) => prev + 1);

      if (result.isCorrect) {
        setCorrectCount((prev) => prev + 1);
      } else {
        setIncorrectCount((prev) => prev + 1);
      }
    },
  });

  const hintMutation = useMutation({
    mutationFn: async (payload: { acceptableTranslations: string[]; hintLevel: number }) => {
      return api.post<HintResponse>('/learning/translation/hint', payload);
    },
  });

  const { data: statsResponse } = useQuery<{ stats: TranslationStats }>({
    queryKey: ['translation-stats', sourceLanguage, targetLanguage],
    queryFn: async () => {
      return api.get<{ stats: TranslationStats }>(
        `/learning/translation/stats?sourceLanguage=${sourceLanguage}&targetLanguage=${targetLanguage}`
      );
    },
    enabled: currentExerciseIndex > 0,
    refetchInterval: 5000,
  });

  const stats = statsResponse?.stats;

  const getLanguageName = (code: string) => {
    const names: Record<string, string> = {
      EN: 'English',
      RU: 'Russian',
      DE: 'German',
      FR: 'French',
      ES: 'Spanish',
      IT: 'Italian',
      PT: 'Portuguese',
      ZH: 'Chinese',
      JA: 'Japanese',
      KO: 'Korean',
    };
    return names[code.toUpperCase()] || code;
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading translation exercises...</div>;
  }

  if (!exercises || exercises.length === 0) {
    return (
      <div className="card p-8 text-center max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-green-600 mb-4">All Done!</h3>
        <p className="text-gray-700 mb-4">
          No translation exercises available for {getLanguageName(sourceLanguage)} →{' '}
          {getLanguageName(targetLanguage)} right now.
        </p>
        <p className="text-sm text-gray-600">
          Add more words with translations to your learning queue or wait for items to become due.
        </p>
      </div>
    );
  }

  if (currentExerciseIndex >= exercises.length) {
    const totalAnswered = correctCount + incorrectCount;
    const sessionAccuracy =
      totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
    const avgTime = totalAnswered > 0 ? Math.round(totalTimeRef.current / totalAnswered / 1000) : 0;
    const avgSimilarity =
      totalAnswered > 0 ? Math.round((totalSimilarityRef.current / totalAnswered) * 100) : 0;

    return (
      <div className="card p-8 text-center max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-green-600 mb-4">Session Complete!</h3>
        <p className="text-gray-600 mb-6">
          {getLanguageName(sourceLanguage)} → {getLanguageName(targetLanguage)}
        </p>

        <div className="grid grid-cols-3 gap-4 my-6">
          <div className="stat">
            <div className="stat-value text-green-600">{correctCount}</div>
            <div className="stat-title">Correct</div>
          </div>
          <div className="stat">
            <div className="stat-value text-red-600">{incorrectCount}</div>
            <div className="stat-title">Incorrect</div>
          </div>
          <div className="stat">
            <div className="stat-value text-blue-600">{sessionAccuracy}%</div>
            <div className="stat-title">Session Score</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 my-6">
          <div className="stat">
            <div className="stat-value text-purple-600">{avgTime}s</div>
            <div className="stat-title">Avg Time</div>
          </div>
          <div className="stat">
            <div className="stat-value text-indigo-600">{avgSimilarity}%</div>
            <div className="stat-title">Avg Similarity</div>
          </div>
        </div>

        {stats && (
          <div className="my-6 p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-2">Overall Stats (7 days)</div>
            <div className="text-lg font-semibold">{stats.accuracy}% accuracy</div>
            <div className="text-sm text-gray-500">{stats.totalExercises} exercises completed</div>
          </div>
        )}

        <button
          onClick={() => {
            setCurrentExerciseIndex(0);
            setCorrectCount(0);
            setIncorrectCount(0);
            setAttemptCount(0);
            setFeedback(null);
            totalTimeRef.current = 0;
            totalSimilarityRef.current = 0;
            void queryClient.invalidateQueries({ queryKey: ['translation-exercises'] });
          }}
          className="btn btn-primary"
        >
          Start New Session
        </button>
      </div>
    );
  }

  const currentExercise = exercises[currentExerciseIndex];

  const handleSubmit = (userTranslation: string, timeSpentMs: number) => {
    submitMutation.mutate({
      exerciseId: currentExercise.exerciseId,
      userTranslation,
      acceptableTranslations: currentExercise.acceptableTranslations,
      meaningId: currentExercise.meaningId,
      timeSpentMs,
    });
  };

  const handleRequestHint = async (hintLevel: number): Promise<string> => {
    const result = await hintMutation.mutateAsync({
      acceptableTranslations: currentExercise.acceptableTranslations,
      hintLevel,
    });
    return result.hint;
  };

  const handleNext = () => {
    setCurrentExerciseIndex((prev) => prev + 1);
    setFeedback(null);
    setAttemptCount(0);
  };

  const progressPercent = ((currentExerciseIndex + 1) / exercises.length) * 100;

  return (
    <div className="translation-practice-session max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-4">
        <h2 className="text-xl font-semibold text-gray-700">Translation Practice</h2>
        <p className="text-sm text-gray-500">
          {getLanguageName(sourceLanguage)} → {getLanguageName(targetLanguage)}
        </p>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>
            Exercise {currentExerciseIndex + 1} of {exercises.length}
          </span>
          <span className="flex gap-4">
            <span className="text-green-600">✓ {correctCount}</span>
            <span className="text-red-600">✗ {incorrectCount}</span>
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
      </div>

      {/* Exercise */}
      <TranslationExercise
        exercise={currentExercise}
        onSubmit={handleSubmit}
        onRequestHint={handleRequestHint}
        feedback={feedback}
        disabled={submitMutation.isPending}
        attemptCount={attemptCount}
      />

      {/* Next button */}
      {feedback && (
        <div className="text-center mt-4">
          <button onClick={handleNext} className="btn btn-primary">
            {currentExerciseIndex < exercises.length - 1 ? 'Next Exercise' : 'See Results'}
          </button>
        </div>
      )}
    </div>
  );
}
