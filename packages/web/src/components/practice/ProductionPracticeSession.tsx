import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { ProductionExercise } from './ProductionExercise';

type SelfRating = 'again' | 'hard' | 'good' | 'easy';

interface ProductionExerciseData {
  exerciseId: string;
  text: string;
  audioUrl: string;
  audioLength: number;
  romanization: string | null;
  translation: string | null;
  meaningId: string;
  cefrLevel: string;
  language: string;
}

interface ProductionExercisesResponse {
  exercises: ProductionExerciseData[];
  count: number;
}

interface ProductionStats {
  totalExercises: number;
  correctCount: number;
  accuracy: number;
  avgQuality: number | null;
}

interface ProductionPracticeSessionProps {
  language: string;
}

export function ProductionPracticeSession({ language }: ProductionPracticeSessionProps) {
  const queryClient = useQueryClient();
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastRating, setLastRating] = useState<SelfRating | null>(null);
  const totalTimeRef = useRef<number>(0);

  const { data: response, isLoading } = useQuery<ProductionExercisesResponse>({
    queryKey: ['production-exercises', language],
    queryFn: async () => {
      return api.get<ProductionExercisesResponse>(
        `/learning/production/exercises?language=${language}&limit=10`
      );
    },
  });

  const exercises = response?.exercises ?? [];

  const submitMutation = useMutation({
    mutationFn: async (payload: {
      meaningId: string;
      selfRating: SelfRating;
      recordingDuration: number;
      attemptNumber: number;
      timeSpentMs: number;
    }) => {
      return api.post<{ success: boolean; qualityRating: number }>(
        '/learning/production/assess',
        payload
      );
    },
    onSuccess: (result, variables) => {
      totalTimeRef.current += variables.timeSpentMs;
      setLastRating(variables.selfRating);
      setShowFeedback(true);

      if (result.qualityRating >= 3) {
        setCorrectCount((prev) => prev + 1);
      } else {
        setIncorrectCount((prev) => prev + 1);
      }
    },
  });

  const { data: statsResponse } = useQuery<{ stats: ProductionStats }>({
    queryKey: ['production-stats', language],
    queryFn: async () => {
      return api.get<{ stats: ProductionStats }>(`/learning/production/stats?language=${language}`);
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
      ZH: 'Chinese',
      JA: 'Japanese',
      AR: 'Arabic',
    };
    return names[code.toUpperCase()] || code;
  };

  const getRatingFeedback = (rating: SelfRating): { message: string; color: string } => {
    switch (rating) {
      case 'again':
        return { message: "Don't worry! Practice makes perfect.", color: 'text-red-600' };
      case 'hard':
        return { message: "Keep practicing - you're getting better!", color: 'text-orange-600' };
      case 'good':
        return { message: 'Nice work! Your pronunciation is improving.', color: 'text-green-600' };
      case 'easy':
        return { message: 'Excellent! Great pronunciation!', color: 'text-blue-600' };
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading production exercises...</div>;
  }

  if (!exercises || exercises.length === 0) {
    return (
      <div className="card p-8 text-center max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-green-600 mb-4">All Done!</h3>
        <p className="text-gray-700 mb-4">
          No pronunciation exercises available for {getLanguageName(language)} right now.
        </p>
        <p className="text-sm text-gray-600">
          Add more words with audio to your learning queue or wait for items to become due.
        </p>
      </div>
    );
  }

  if (currentExerciseIndex >= exercises.length) {
    const totalAnswered = correctCount + incorrectCount;
    const sessionAccuracy =
      totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
    const avgTime = totalAnswered > 0 ? Math.round(totalTimeRef.current / totalAnswered / 1000) : 0;

    return (
      <div className="card p-8 text-center max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-green-600 mb-4">Session Complete!</h3>
        <p className="text-gray-600 mb-6">{getLanguageName(language)} Pronunciation Practice</p>

        <div className="grid grid-cols-3 gap-4 my-6">
          <div className="stat">
            <div className="stat-value text-green-600">{correctCount}</div>
            <div className="stat-title">Good/Easy</div>
          </div>
          <div className="stat">
            <div className="stat-value text-red-600">{incorrectCount}</div>
            <div className="stat-title">Again/Hard</div>
          </div>
          <div className="stat">
            <div className="stat-value text-blue-600">{sessionAccuracy}%</div>
            <div className="stat-title">Session Score</div>
          </div>
        </div>

        <div className="my-6">
          <div className="stat">
            <div className="stat-value text-purple-600">{avgTime}s</div>
            <div className="stat-title">Avg Time per Exercise</div>
          </div>
        </div>

        {stats && (
          <div className="my-6 p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-2">Overall Stats (7 days)</div>
            <div className="text-lg font-semibold">{stats.accuracy}% success rate</div>
            <div className="text-sm text-gray-500">{stats.totalExercises} exercises completed</div>
          </div>
        )}

        <button
          onClick={() => {
            setCurrentExerciseIndex(0);
            setCorrectCount(0);
            setIncorrectCount(0);
            setShowFeedback(false);
            setLastRating(null);
            totalTimeRef.current = 0;
            void queryClient.invalidateQueries({ queryKey: ['production-exercises'] });
          }}
          className="btn btn-primary"
        >
          Start New Session
        </button>
      </div>
    );
  }

  const currentExercise = exercises[currentExerciseIndex];

  const handleSubmit = (
    selfRating: SelfRating,
    recordingDuration: number,
    attemptNumber: number,
    timeSpentMs: number
  ) => {
    submitMutation.mutate({
      meaningId: currentExercise.meaningId,
      selfRating,
      recordingDuration,
      attemptNumber,
      timeSpentMs,
    });
  };

  const handleNext = () => {
    setCurrentExerciseIndex((prev) => prev + 1);
    setShowFeedback(false);
    setLastRating(null);
  };

  const progressPercent = ((currentExerciseIndex + 1) / exercises.length) * 100;

  return (
    <div className="production-practice-session max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-4">
        <h2 className="text-xl font-semibold text-gray-700">Pronunciation Practice</h2>
        <p className="text-sm text-gray-500">{getLanguageName(language)}</p>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>
            Exercise {currentExerciseIndex + 1} of {exercises.length}
          </span>
          <span className="flex gap-4">
            <span className="text-green-600">{correctCount} Good/Easy</span>
            <span className="text-red-600">{incorrectCount} Again/Hard</span>
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
      </div>

      {/* Exercise */}
      <ProductionExercise
        exercise={currentExercise}
        onSubmit={handleSubmit}
        disabled={submitMutation.isPending || showFeedback}
      />

      {/* Feedback and Next button */}
      {showFeedback && lastRating && (
        <div className="text-center mt-6 space-y-4">
          <div className={`text-lg font-semibold ${getRatingFeedback(lastRating).color}`}>
            {getRatingFeedback(lastRating).message}
          </div>
          <button onClick={handleNext} className="btn btn-primary">
            {currentExerciseIndex < exercises.length - 1 ? 'Next Exercise' : 'See Results'}
          </button>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg text-sm text-gray-700">
        <strong>Instructions:</strong>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>Listen to the native speaker audio carefully</li>
          <li>Click "Start Recording" when ready (3-second countdown)</li>
          <li>Speak clearly into your microphone</li>
          <li>Listen to your recording and compare with native audio</li>
          <li>Honestly assess your pronunciation quality</li>
        </ul>
      </div>
    </div>
  );
}
