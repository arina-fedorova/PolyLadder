import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

interface QueueItem {
  id: string;
  itemType: string;
  itemId: string;
  dueDate: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  content: {
    wordText?: string;
    translation?: string;
    definition?: string;
    audioUrl?: string;
    level?: string;
  };
}

interface QueueResponse {
  total: number;
  items: QueueItem[];
  nextReviewAt: string | null;
}

interface StartSessionResponse {
  sessionId: string;
  itemsInQueue: number;
  startedAt: string;
}

interface SessionStats {
  sessionId: string;
  itemsReviewed: number;
  correctCount: number;
  accuracyPct: number;
  durationSeconds: number;
  avgResponseTimeMs: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
}

interface ReviewPracticeSessionProps {
  language: string;
}

type Rating = 'again' | 'hard' | 'good' | 'easy';

export function ReviewPracticeSession({ language }: ReviewPracticeSessionProps) {
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionStats, setSessionStats] = useState({ itemsReviewed: 0, correctCount: 0 });
  const [finalStats, setFinalStats] = useState<SessionStats | null>(null);
  const cardStartTimeRef = useRef<number>(Date.now());

  // Start session on mount
  const startSessionMutation = useMutation({
    mutationFn: async () => {
      return api.post<StartSessionResponse>(
        `/learning/review/session/start?language=${language}`,
        {}
      );
    },
    onSuccess: (result) => {
      setSessionId(result.sessionId);
    },
  });

  useEffect(() => {
    startSessionMutation.mutate();
  }, []);

  // Fetch queue
  const { data: queueResponse, isLoading: queueLoading } = useQuery<QueueResponse>({
    queryKey: ['review-queue', language],
    queryFn: async () => {
      return api.get<QueueResponse>(`/learning/review/queue?language=${language}&limit=50`);
    },
    enabled: !!sessionId,
  });

  const items = queueResponse?.items ?? [];

  // Submit review mutation
  const submitMutation = useMutation({
    mutationFn: async (payload: {
      itemId: string;
      itemType: string;
      rating: Rating;
      responseTimeMs: number;
      wasCorrect: boolean;
    }) => {
      return api.post('/learning/review/submit', {
        ...payload,
        sessionId,
      });
    },
    onSuccess: (_result, variables) => {
      setSessionStats((prev) => ({
        itemsReviewed: prev.itemsReviewed + 1,
        correctCount: prev.correctCount + (variables.wasCorrect ? 1 : 0),
      }));
    },
  });

  // Complete session mutation
  const completeSessionMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error('No session');
      return api.post<SessionStats>(`/learning/review/session/${sessionId}/complete`, {});
    },
    onSuccess: (result) => {
      setFinalStats(result);
      void queryClient.invalidateQueries({ queryKey: ['review-queue'] });
    },
  });

  const handleShowAnswer = () => {
    setShowAnswer(true);
  };

  const handleRate = (rating: Rating) => {
    if (items.length === 0 || currentIndex >= items.length) return;

    const currentItem = items[currentIndex];
    const responseTimeMs = Date.now() - cardStartTimeRef.current;
    const wasCorrect = rating !== 'again';

    submitMutation.mutate(
      {
        itemId: currentItem.itemId,
        itemType: currentItem.itemType,
        rating,
        responseTimeMs,
        wasCorrect,
      },
      {
        onSuccess: () => {
          if (currentIndex < items.length - 1) {
            setCurrentIndex((prev) => prev + 1);
            setShowAnswer(false);
            cardStartTimeRef.current = Date.now();
          } else {
            // Session complete
            completeSessionMutation.mutate();
          }
        },
      }
    );
  };

  const handleEndSession = () => {
    completeSessionMutation.mutate();
  };

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

  // Loading state
  if (startSessionMutation.isPending || queueLoading) {
    return <div className="text-center py-8">Loading review session...</div>;
  }

  // No items due
  if (!items || items.length === 0) {
    return (
      <div className="card p-8 text-center max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-green-600 mb-4">All Reviews Complete!</h3>
        <p className="text-gray-700 mb-4">
          No items due for review in {getLanguageName(language)} right now.
        </p>
        {queueResponse?.nextReviewAt && (
          <p className="text-sm text-gray-600">
            Next review: {new Date(queueResponse.nextReviewAt).toLocaleDateString()}
          </p>
        )}
      </div>
    );
  }

  // Session complete
  if (finalStats) {
    const durationMin = Math.floor(finalStats.durationSeconds / 60);
    const durationSec = finalStats.durationSeconds % 60;

    return (
      <div className="card p-8 text-center max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-green-600 mb-4">Session Complete!</h3>
        <p className="text-gray-600 mb-6">{getLanguageName(language)} Review</p>

        <div className="grid grid-cols-2 gap-4 my-6">
          <div className="stat">
            <div className="stat-value text-blue-600">{finalStats.itemsReviewed}</div>
            <div className="stat-title">Items Reviewed</div>
          </div>
          <div className="stat">
            <div className="stat-value text-green-600">{finalStats.correctCount}</div>
            <div className="stat-title">Correct</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 my-6">
          <div className="stat">
            <div className="stat-value text-purple-600">{finalStats.accuracyPct}%</div>
            <div className="stat-title">Accuracy</div>
          </div>
          <div className="stat">
            <div className="stat-value text-indigo-600">
              {durationMin}m {durationSec}s
            </div>
            <div className="stat-title">Duration</div>
          </div>
        </div>

        <button
          onClick={() => {
            setSessionId(null);
            setCurrentIndex(0);
            setShowAnswer(false);
            setSessionStats({ itemsReviewed: 0, correctCount: 0 });
            setFinalStats(null);
            void queryClient.invalidateQueries({ queryKey: ['review-queue'] });
            startSessionMutation.mutate();
          }}
          className="btn btn-primary"
        >
          Start New Session
        </button>
      </div>
    );
  }

  const currentItem = items[currentIndex];
  const progressPercent = ((currentIndex + 1) / items.length) * 100;

  return (
    <div className="review-session max-w-2xl mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-4">
        <h2 className="text-xl font-semibold text-gray-700">Spaced Repetition Review</h2>
        <p className="text-sm text-gray-500">{getLanguageName(language)}</p>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>
            Card {currentIndex + 1} of {items.length}
          </span>
          <span>
            {sessionStats.correctCount}/{sessionStats.itemsReviewed} correct
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
      </div>

      {/* Flashcard */}
      <div className="card p-8 bg-white shadow-lg rounded-xl mb-6">
        <div className="text-center">
          {/* Front of card */}
          <div className="mb-6">
            <p className="text-xs text-gray-400 uppercase mb-2">{currentItem.itemType}</p>
            <h3 className="text-3xl font-bold text-gray-800">
              {currentItem.content.wordText || currentItem.content.definition || 'Review Item'}
            </h3>
            {currentItem.content.level && (
              <span className="inline-block mt-2 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
                {currentItem.content.level}
              </span>
            )}
          </div>

          {/* Back of card (shown when answer revealed) */}
          {showAnswer && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-xl text-gray-700">
                {currentItem.content.definition ||
                  currentItem.content.translation ||
                  'Answer revealed'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {!showAnswer ? (
        <div className="text-center">
          <button
            onClick={handleShowAnswer}
            className="btn btn-primary px-8 py-3 text-lg"
            disabled={submitMutation.isPending}
          >
            Show Answer
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => handleRate('again')}
            className="btn bg-red-500 hover:bg-red-600 text-white py-3"
            disabled={submitMutation.isPending}
          >
            <div className="text-sm font-semibold">Again</div>
            <div className="text-xs opacity-75">1 day</div>
          </button>
          <button
            onClick={() => handleRate('hard')}
            className="btn bg-orange-500 hover:bg-orange-600 text-white py-3"
            disabled={submitMutation.isPending}
          >
            <div className="text-sm font-semibold">Hard</div>
            <div className="text-xs opacity-75">
              {Math.max(1, Math.round(currentItem.intervalDays * 0.8))}d
            </div>
          </button>
          <button
            onClick={() => handleRate('good')}
            className="btn bg-green-500 hover:bg-green-600 text-white py-3"
            disabled={submitMutation.isPending}
          >
            <div className="text-sm font-semibold">Good</div>
            <div className="text-xs opacity-75">
              {Math.round(currentItem.intervalDays * currentItem.easeFactor)}d
            </div>
          </button>
          <button
            onClick={() => handleRate('easy')}
            className="btn bg-blue-500 hover:bg-blue-600 text-white py-3"
            disabled={submitMutation.isPending}
          >
            <div className="text-sm font-semibold">Easy</div>
            <div className="text-xs opacity-75">
              {Math.round(currentItem.intervalDays * currentItem.easeFactor * 1.3)}d
            </div>
          </button>
        </div>
      )}

      {/* End session button */}
      <div className="text-center mt-6">
        <button
          onClick={handleEndSession}
          className="text-gray-500 hover:text-gray-700 text-sm"
          disabled={completeSessionMutation.isPending}
        >
          End Session Early
        </button>
      </div>

      {/* Instructions */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg text-sm text-gray-700">
        <strong>Rating Guide:</strong>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>
            <strong>Again:</strong> Complete blank, need to see again soon
          </li>
          <li>
            <strong>Hard:</strong> Remembered with difficulty
          </li>
          <li>
            <strong>Good:</strong> Remembered with some hesitation
          </li>
          <li>
            <strong>Easy:</strong> Perfect recall, no hesitation
          </li>
        </ul>
      </div>
    </div>
  );
}
