import { useQuery } from '@tanstack/react-query';
import api from '@/api/client';
import { WordStateBadge } from './WordStateBadge';

interface WordStateStats {
  unknownCount: number;
  learningCount: number;
  knownCount: number;
  totalWords: number;
}

interface WordStateProgressProps {
  language: string;
}

export function WordStateProgress({ language }: WordStateProgressProps) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['word-state-stats', language],
    queryFn: async () => {
      const response = await api.get<WordStateStats>(
        `/learning/word-state/stats?language=${language}`
      );
      return response;
    },
  });

  if (isLoading) {
    return (
      <div className="card p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!stats || stats.totalWords === 0) {
    return (
      <div className="card p-6 text-center text-gray-500">
        No vocabulary words yet. Start learning to see your progress!
      </div>
    );
  }

  const knownPercentage = (stats.knownCount / stats.totalWords) * 100;
  const learningPercentage = (stats.learningCount / stats.totalWords) * 100;
  const unknownPercentage = (stats.unknownCount / stats.totalWords) * 100;

  return (
    <div className="card p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Vocabulary Progress</h3>
        <p className="text-sm text-gray-600">{stats.totalWords} total words</p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden flex">
          {stats.knownCount > 0 && (
            <div
              className="bg-green-500 h-full transition-all"
              style={{ width: `${knownPercentage}%` }}
              title={`${stats.knownCount} known (${Math.round(knownPercentage)}%)`}
            ></div>
          )}
          {stats.learningCount > 0 && (
            <div
              className="bg-yellow-500 h-full transition-all"
              style={{ width: `${learningPercentage}%` }}
              title={`${stats.learningCount} learning (${Math.round(learningPercentage)}%)`}
            ></div>
          )}
          {stats.unknownCount > 0 && (
            <div
              className="bg-gray-400 h-full transition-all"
              style={{ width: `${unknownPercentage}%` }}
              title={`${stats.unknownCount} unknown (${Math.round(unknownPercentage)}%)`}
            ></div>
          )}
        </div>
      </div>

      {/* State Breakdown */}
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <WordStateBadge state="known" />
          <p className="text-2xl font-bold text-gray-900 mt-2">{stats.knownCount}</p>
          <p className="text-xs text-gray-500">{Math.round(knownPercentage)}%</p>
        </div>

        <div className="text-center">
          <WordStateBadge state="learning" />
          <p className="text-2xl font-bold text-gray-900 mt-2">{stats.learningCount}</p>
          <p className="text-xs text-gray-500">{Math.round(learningPercentage)}%</p>
        </div>

        <div className="text-center">
          <WordStateBadge state="unknown" />
          <p className="text-2xl font-bold text-gray-900 mt-2">{stats.unknownCount}</p>
          <p className="text-xs text-gray-500">{Math.round(unknownPercentage)}%</p>
        </div>
      </div>

      {/* Insights */}
      <div className="pt-4 border-t border-gray-200">
        <p className="text-sm text-gray-700">
          {stats.knownCount === 0 && (
            <>Keep practicing! Complete 5+ successful reviews to mark words as known.</>
          )}
          {stats.knownCount > 0 && stats.knownCount < stats.totalWords / 2 && (
            <>Great progress! You&apos;ve mastered {stats.knownCount} words.</>
          )}
          {stats.knownCount >= stats.totalWords / 2 && (
            <>Excellent work! You know more than half of your vocabulary.</>
          )}
        </p>
      </div>
    </div>
  );
}
