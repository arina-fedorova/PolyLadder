import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { FlashCard } from './FlashCard';

interface RecallCard {
  meaningId: string;
  word: string;
  definition: string;
  audioUrl?: string | null;
  cefrLevel: string;
}

interface RecallStats {
  totalItems: number;
  dueNow: number;
  dueToday: number;
  learned: number;
}

interface RecallPracticeSessionProps {
  language: string;
}

export function RecallPracticeSession({ language }: RecallPracticeSessionProps) {
  const queryClient = useQueryClient();
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [reviewedCards, setReviewedCards] = useState<string[]>([]);

  const { data: cards, isLoading } = useQuery<RecallCard[]>({
    queryKey: ['recall-due', language],
    queryFn: async () => {
      return api.get<RecallCard[]>(`/learning/recall/due?language=${language}`);
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (payload: { meaningId: string; quality: number }) => {
      return api.post('/learning/recall/review', {
        meaningId: payload.meaningId,
        quality: payload.quality,
        language,
      });
    },
    onSuccess: (_result, variables) => {
      setReviewedCards((prev) => [...prev, variables.meaningId]);

      // Move to next card after short delay
      setTimeout(() => {
        setCurrentCardIndex((prev) => prev + 1);
      }, 500);
    },
  });

  const { data: stats } = useQuery<RecallStats>({
    queryKey: ['recall-stats', language],
    queryFn: async () => {
      return api.get<RecallStats>(`/learning/recall/stats?language=${language}`);
    },
    enabled: reviewedCards.length > 0,
    refetchInterval: 5000, // Update every 5 seconds
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading review queue...</div>;
  }

  if (!cards || cards.length === 0) {
    return (
      <div className="card p-8 text-center max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-green-600 mb-4">🎉 All Reviews Complete!</h3>
        <p className="text-gray-700 mb-4">You&apos;ve reviewed all cards due today. Great work!</p>
        <p className="text-sm text-gray-600">Come back tomorrow for more practice.</p>
      </div>
    );
  }

  if (currentCardIndex >= cards.length) {
    return (
      <div className="card p-8 text-center max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-green-600 mb-4">Session Complete!</h3>

        {stats && (
          <div className="grid grid-cols-2 gap-4 my-6">
            <div className="stat">
              <div className="stat-value text-blue-600">{stats.dueNow || 0}</div>
              <div className="stat-title">Due Now</div>
            </div>
            <div className="stat">
              <div className="stat-value text-green-600">{stats.learned || 0}</div>
              <div className="stat-title">Learned</div>
            </div>
          </div>
        )}

        <button
          onClick={() => {
            setCurrentCardIndex(0);
            setReviewedCards([]);
            void queryClient.invalidateQueries({ queryKey: ['recall-due'] });
          }}
          className="btn btn-primary"
        >
          Start New Session
        </button>
      </div>
    );
  }

  const currentCard = cards[currentCardIndex];

  const handleAssessment = (quality: number): void => {
    submitMutation.mutate({
      meaningId: currentCard.meaningId,
      quality,
    });
  };

  return (
    <div className="recall-practice-session max-w-3xl mx-auto p-6">
      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>
            Card {currentCardIndex + 1} of {cards.length}
          </span>
          <span>{reviewedCards.length} reviewed</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all"
            style={{ width: `${((currentCardIndex + 1) / cards.length) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Card */}
      <FlashCard
        card={currentCard}
        onAssessment={handleAssessment}
        disabled={submitMutation.isPending}
      />

      {/* Keyboard Hints */}
      <div className="text-center mt-4 text-sm text-gray-500">
        <p>Keyboard shortcuts: Space to flip | 1-4 for ratings</p>
      </div>
    </div>
  );
}
