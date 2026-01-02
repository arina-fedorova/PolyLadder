import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';

interface VocabularyItem {
  meaningId: string;
  level: string;
  tags: string[];
  utteranceCount: number;
}

interface VocabularyQueueData {
  vocabulary: VocabularyItem[];
}

interface VocabularyQueueProps {
  language: string;
  maxLevel?: string;
}

export function VocabularyQueue({ language, maxLevel = 'C2' }: VocabularyQueueProps) {
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery<VocabularyQueueData>({
    queryKey: ['vocabulary-next', language, maxLevel],
    queryFn: async () => {
      return api.get<VocabularyQueueData>(
        `/learning/vocabulary-introduction/next?language=${language}&maxLevel=${maxLevel}&batchSize=20`
      );
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading vocabulary queue...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-8 text-center bg-red-50">
        <h3 className="text-xl font-bold text-red-600 mb-2">Error Loading Vocabulary</h3>
        <p className="text-gray-600">Failed to load vocabulary. Please try again later.</p>
      </div>
    );
  }

  if (!data?.vocabulary || data.vocabulary.length === 0) {
    return (
      <div className="card p-8 text-center">
        <h3 className="text-xl font-bold text-gray-600 mb-2">No New Vocabulary Available</h3>
        <p className="text-gray-500">
          You've completed all available vocabulary for your current level. Complete more curriculum
          concepts to unlock new vocabulary.
        </p>
      </div>
    );
  }

  const handleWordClick = (meaningId: string): void => {
    void navigate(`/learn/${language}/vocabulary/${meaningId}`);
  };

  // Extract word from meaningId (format: "language-word-id")
  const extractWord = (meaningId: string) => {
    return meaningId.split('-').slice(1, -1).join('-') || 'Unknown';
  };

  return (
    <div className="vocabulary-queue">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">New Vocabulary to Learn</h2>
        <p className="text-gray-600">
          {data.vocabulary.length} word{data.vocabulary.length !== 1 ? 's' : ''} available
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.vocabulary.map((item) => (
          <div
            key={item.meaningId}
            onClick={() => handleWordClick(item.meaningId)}
            className="card p-4 cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200"
          >
            <h3 className="text-xl font-bold mb-3">{extractWord(item.meaningId)}</h3>

            <div className="flex flex-wrap gap-2 mb-3">
              <span className="badge badge-sm bg-blue-500 text-white">{item.level}</span>
              {item.tags.slice(0, 2).map((tag, idx) => (
                <span key={idx} className="badge badge-sm bg-gray-200 text-gray-700">
                  {tag}
                </span>
              ))}
              {item.tags.length > 2 && (
                <span className="badge badge-sm bg-gray-100 text-gray-500">
                  +{item.tags.length - 2} more
                </span>
              )}
            </div>

            <div className="text-sm text-gray-600">
              {item.utteranceCount} example sentence{item.utteranceCount !== 1 ? 's' : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
