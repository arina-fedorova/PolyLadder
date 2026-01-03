import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { DictationExercise } from './DictationExercise';

interface DictationExerciseData {
  exerciseId: string;
  audioUrl: string;
  correctTranscript: string;
  meaningId: string;
  cefrLevel: string;
  wordCount: number;
}

interface DictationExercisesResponse {
  exercises: DictationExerciseData[];
  count: number;
}

interface DictationValidationResult {
  isCorrect: boolean;
  characterAccuracy: number;
  wordAccuracy: number;
  diff: Array<{
    type: 'correct' | 'substitution' | 'insertion' | 'deletion';
    expected?: string;
    actual?: string;
    position: number;
  }>;
  correctTranscript: string;
  qualityRating: number;
}

interface DictationStats {
  totalExercises: number;
  correctCount: number;
  accuracy: number;
  avgCharacterAccuracy: number | null;
}

interface DictationPracticeSessionProps {
  language: string;
}

export function DictationPracticeSession({ language }: DictationPracticeSessionProps) {
  const queryClient = useQueryClient();
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [feedback, setFeedback] = useState<DictationValidationResult | null>(null);
  const totalTimeRef = useRef<number>(0);
  const totalAccuracyRef = useRef<number>(0);

  const { data: response, isLoading } = useQuery<DictationExercisesResponse>({
    queryKey: ['dictation-exercises', language],
    queryFn: async () => {
      return api.get<DictationExercisesResponse>(
        `/learning/dictation/exercises?language=${language}&limit=10`
      );
    },
  });

  const exercises = response?.exercises ?? [];

  const submitMutation = useMutation({
    mutationFn: async (payload: {
      exerciseId: string;
      userTranscript: string;
      correctTranscript: string;
      meaningId: string;
      timeSpentMs: number;
    }) => {
      return api.post<DictationValidationResult>('/learning/dictation/submit', payload);
    },
    onSuccess: (result, variables) => {
      setFeedback(result);
      totalTimeRef.current += variables.timeSpentMs;
      totalAccuracyRef.current += result.characterAccuracy;

      if (result.isCorrect) {
        setCorrectCount((prev) => prev + 1);
      } else {
        setIncorrectCount((prev) => prev + 1);
      }
    },
  });

  const { data: statsResponse } = useQuery<{ stats: DictationStats }>({
    queryKey: ['dictation-stats', language],
    queryFn: async () => {
      return api.get<{ stats: DictationStats }>(`/learning/dictation/stats?language=${language}`);
    },
    enabled: currentExerciseIndex > 0,
    refetchInterval: 5000,
  });

  const stats = statsResponse?.stats;

  if (isLoading) {
    return <div className="text-center py-8">Loading exercises...</div>;
  }

  if (!exercises || exercises.length === 0) {
    return (
      <div className="card p-8 text-center max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-green-600 mb-4">All Done!</h3>
        <p className="text-gray-700 mb-4">No dictation exercises available right now.</p>
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
    const avgAccuracy =
      totalAnswered > 0 ? Math.round((totalAccuracyRef.current / totalAnswered) * 100) : 0;

    return (
      <div className="card p-8 text-center max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-green-600 mb-4">Session Complete!</h3>

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
            <div className="stat-value text-indigo-600">{avgAccuracy}%</div>
            <div className="stat-title">Avg Accuracy</div>
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
            setFeedback(null);
            totalTimeRef.current = 0;
            totalAccuracyRef.current = 0;
            void queryClient.invalidateQueries({ queryKey: ['dictation-exercises'] });
          }}
          className="btn btn-primary"
        >
          Start New Session
        </button>
      </div>
    );
  }

  const currentExercise = exercises[currentExerciseIndex];

  const handleSubmit = (userTranscript: string, timeSpentMs: number) => {
    submitMutation.mutate({
      exerciseId: currentExercise.exerciseId,
      userTranscript,
      correctTranscript: currentExercise.correctTranscript,
      meaningId: currentExercise.meaningId,
      timeSpentMs,
    });
  };

  const handleNext = () => {
    setCurrentExerciseIndex((prev) => prev + 1);
    setFeedback(null);
  };

  const progressPercent = ((currentExerciseIndex + 1) / exercises.length) * 100;

  return (
    <div className="dictation-practice-session max-w-3xl mx-auto p-6">
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
            className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
      </div>

      {/* Exercise */}
      <DictationExercise
        exercise={currentExercise}
        onSubmit={handleSubmit}
        feedback={feedback}
        disabled={submitMutation.isPending}
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
