import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { ClozeExercise } from './ClozeExercise';

interface ClozeExerciseData {
  exerciseId: string;
  sentenceWithBlank: string;
  correctAnswer: string;
  alternativeAnswers: string[];
  hint: {
    firstLetter: string;
    wordLength: number;
    partOfSpeech: string | null;
  };
  context: string | null;
  audioUrl: string | null;
  explanation: string;
  cefrLevel: string;
  meaningId: string | null;
}

interface ClozeExercisesResponse {
  exercises: ClozeExerciseData[];
  count: number;
}

interface ClozeValidationResult {
  isCorrect: boolean;
  similarity: number;
  feedback: string;
  correctAnswer: string;
  partialCredit: number;
}

interface ClozeStats {
  totalExercises: number;
  correctCount: number;
  accuracy: number;
  avgTimeMs: number | null;
}

interface ClozePracticeSessionProps {
  language: string;
}

export function ClozePracticeSession({ language }: ClozePracticeSessionProps) {
  const queryClient = useQueryClient();
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [feedback, setFeedback] = useState<ClozeValidationResult | null>(null);
  const totalTimeRef = useRef<number>(0);

  const { data: response, isLoading } = useQuery<ClozeExercisesResponse>({
    queryKey: ['cloze-exercises', language],
    queryFn: async () => {
      return api.get<ClozeExercisesResponse>(
        `/learning/cloze/exercises?language=${language}&limit=10`
      );
    },
  });

  const exercises = response?.exercises ?? [];

  const submitMutation = useMutation({
    mutationFn: async (payload: {
      exerciseId: string;
      userAnswer: string;
      correctAnswer: string;
      alternativeAnswers: string[];
      meaningId: string | null;
      timeSpentMs: number;
    }) => {
      return api.post<ClozeValidationResult>('/learning/cloze/submit', payload);
    },
    onSuccess: (result, variables) => {
      setFeedback(result);
      totalTimeRef.current += variables.timeSpentMs;

      if (result.isCorrect) {
        setCorrectCount((prev) => prev + 1);
        // Auto-advance after delay
        setTimeout(() => {
          setCurrentExerciseIndex((prev) => prev + 1);
          setFeedback(null);
          setAttemptCount(0);
        }, 2000);
      } else {
        setIncorrectCount((prev) => prev + 1);
        setAttemptCount((prev) => prev + 1);
      }
    },
  });

  const { data: statsResponse } = useQuery<{ stats: ClozeStats }>({
    queryKey: ['cloze-stats', language],
    queryFn: async () => {
      return api.get<{ stats: ClozeStats }>(`/learning/cloze/stats?language=${language}`);
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
        <p className="text-gray-700 mb-4">No cloze exercises available right now.</p>
        <p className="text-sm text-gray-600">
          Add more words to your learning queue or wait for items to become due.
        </p>
      </div>
    );
  }

  if (currentExerciseIndex >= exercises.length) {
    const totalAnswered = correctCount + incorrectCount;
    const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
    const avgTime = totalAnswered > 0 ? Math.round(totalTimeRef.current / totalAnswered / 1000) : 0;

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
            <div className="stat-value text-blue-600">{accuracy}%</div>
            <div className="stat-title">Accuracy</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 my-6">
          <div className="stat">
            <div className="stat-value text-purple-600">{avgTime}s</div>
            <div className="stat-title">Avg Time</div>
          </div>
          {stats && (
            <div className="stat">
              <div className="stat-value text-green-600">{stats.accuracy}%</div>
              <div className="stat-title">Overall Accuracy</div>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            setCurrentExerciseIndex(0);
            setCorrectCount(0);
            setIncorrectCount(0);
            setAttemptCount(0);
            setFeedback(null);
            totalTimeRef.current = 0;
            void queryClient.invalidateQueries({ queryKey: ['cloze-exercises'] });
          }}
          className="btn btn-primary"
        >
          Start New Session
        </button>
      </div>
    );
  }

  const currentExercise = exercises[currentExerciseIndex];

  const handleSubmit = (userAnswer: string, timeSpentMs: number) => {
    submitMutation.mutate({
      exerciseId: currentExercise.exerciseId,
      userAnswer,
      correctAnswer: currentExercise.correctAnswer,
      alternativeAnswers: currentExercise.alternativeAnswers,
      meaningId: currentExercise.meaningId,
      timeSpentMs,
    });
  };

  const handleTryAgain = () => {
    setFeedback(null);
  };

  const progressPercent = ((currentExerciseIndex + 1) / exercises.length) * 100;

  return (
    <div className="cloze-practice-session max-w-3xl mx-auto p-6">
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
            className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
      </div>

      {/* Exercise */}
      <ClozeExercise
        exercise={currentExercise}
        onSubmit={handleSubmit}
        feedback={feedback}
        disabled={submitMutation.isPending}
        attemptCount={attemptCount}
      />

      {/* Try Again button for incorrect answers */}
      {feedback && !feedback.isCorrect && (
        <div className="text-center mt-4">
          <button onClick={handleTryAgain} className="btn btn-outline">
            Try Again
          </button>
          <button
            onClick={() => {
              setCurrentExerciseIndex((prev) => prev + 1);
              setFeedback(null);
              setAttemptCount(0);
            }}
            className="btn btn-ghost ml-2"
          >
            Skip to Next
          </button>
        </div>
      )}
    </div>
  );
}
