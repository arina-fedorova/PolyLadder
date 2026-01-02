import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useAudioPlayback } from '../../hooks/useAudioPlayback';

interface Utterance {
  utteranceId: string;
  meaningId: string;
  text: string;
  language: string;
  register: string | null;
  usageNotes: string | null;
  audioUrl: string | null;
}

interface WordState {
  state: 'unknown' | 'learning' | 'known';
  successfulReviews: number;
  totalReviews: number;
}

interface VocabularyLessonData {
  meaning: {
    meaningId: string;
    level: string;
    tags: string[];
  };
  utterances: Utterance[];
  wordState: WordState;
}

interface VocabularyLessonProps {
  language: string;
}

export function VocabularyLesson({ language }: VocabularyLessonProps) {
  const { meaningId } = useParams<{ meaningId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showTranslations, setShowTranslations] = useState(false);
  const { play, isPlaying } = useAudioPlayback();

  const { data, isLoading, error } = useQuery<VocabularyLessonData>({
    queryKey: ['vocabulary-lesson', meaningId, language],
    queryFn: async () => {
      return api.get<VocabularyLessonData>(
        `/learning/vocabulary-introduction/${meaningId}/lesson?language=${language}`
      );
    },
    enabled: !!meaningId,
  });

  const markIntroducedMutation = useMutation({
    mutationFn: async () => {
      if (!meaningId) throw new Error('No meaning ID');
      return api.post<{ success: boolean; markedCount: number; message: string }>(
        `/learning/vocabulary-introduction/mark-introduced`,
        { meaningIds: [meaningId] }
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vocabulary-next'] });
      void navigate(`/learn/${language}/vocabulary`);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading vocabulary lesson...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="card p-8 text-center max-w-md">
          <h3 className="text-xl font-bold text-red-600 mb-2">Vocabulary Not Found</h3>
          <p className="text-gray-600 mb-4">The requested vocabulary item could not be found.</p>
          <button
            onClick={() => {
              void navigate(`/learn/${language}/vocabulary`);
            }}
            className="btn btn-primary"
          >
            Back to Vocabulary
          </button>
        </div>
      </div>
    );
  }

  const { meaning, utterances, wordState } = data;

  // Extract word from meaningId (format: "language-word-id")
  const wordText = meaningId?.split('-').slice(1, -1).join('-') || 'Unknown';

  const getRegisterColor = (register: string | null) => {
    switch (register) {
      case 'formal':
        return 'bg-blue-100 text-blue-800';
      case 'informal':
        return 'bg-green-100 text-green-800';
      case 'colloquial':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="vocabulary-lesson max-w-4xl mx-auto p-6">
      {/* Word Header */}
      <div className="card p-8 mb-6">
        <div className="text-center mb-6">
          <h1 className="text-5xl font-bold mb-4">{wordText}</h1>

          <div className="flex gap-3 justify-center items-center flex-wrap mb-4">
            <span className="badge badge-lg bg-blue-500 text-white">{meaning.level}</span>
            <span className="badge badge-lg bg-purple-500 text-white">
              {wordState.state === 'known'
                ? 'Known'
                : wordState.state === 'learning'
                  ? 'Learning'
                  : 'New'}
            </span>
            {meaning.tags.map((tag, idx) => (
              <span key={idx} className="badge badge-lg bg-gray-200 text-gray-700">
                {tag}
              </span>
            ))}
          </div>

          <div className="flex gap-3 justify-center">
            <button
              onClick={() => markIntroducedMutation.mutate()}
              className="btn btn-secondary"
              disabled={markIntroducedMutation.isPending}
            >
              {wordState.state === 'known' ? 'Mark as Learning' : 'Mark as Known'}
            </button>
            <button
              onClick={() => {
                void navigate(`/learn/${language}/vocabulary`);
              }}
              className="btn btn-outline"
            >
              Back to List
            </button>
          </div>
        </div>

        {/* Progress Info */}
        {wordState.totalReviews > 0 && (
          <div className="bg-gray-50 p-4 rounded-lg text-center">
            <p className="text-sm text-gray-600">
              Reviews: {wordState.successfulReviews} / {wordState.totalReviews} successful
            </p>
          </div>
        )}
      </div>

      {/* Example Sentences */}
      <div className="card p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Example Sentences</h2>
          <button
            onClick={() => setShowTranslations(!showTranslations)}
            className="btn btn-secondary btn-sm"
          >
            {showTranslations ? 'Hide' : 'Show'} Usage Notes
          </button>
        </div>

        {utterances.length === 0 ? (
          <p className="text-gray-500 text-center py-4">
            No example sentences available for this word.
          </p>
        ) : (
          <div className="space-y-4">
            {utterances.map((utterance) => (
              <div
                key={utterance.utteranceId}
                className="border-l-4 border-blue-500 pl-4 py-2 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <p className="text-lg flex-1">{utterance.text}</p>
                  {utterance.audioUrl && (
                    <button
                      onClick={() => {
                        void play(utterance.audioUrl!);
                      }}
                      className={`btn btn-sm btn-circle ${isPlaying ? 'btn-primary' : 'btn-ghost'}`}
                      title="Play audio"
                      disabled={isPlaying}
                    >
                      🔊
                    </button>
                  )}
                </div>

                {utterance.register && (
                  <span className={`badge badge-sm mt-2 ${getRegisterColor(utterance.register)}`}>
                    {utterance.register}
                  </span>
                )}

                {showTranslations && utterance.usageNotes && (
                  <p className="text-sm text-gray-600 mt-2 italic">Note: {utterance.usageNotes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        <button
          onClick={() => {
            void navigate(-1);
          }}
          className="btn btn-secondary"
        >
          ← Previous
        </button>
        <button
          onClick={() => {
            void navigate(`/learn/${language}/practice`);
          }}
          className="btn btn-primary"
        >
          Practice This Word →
        </button>
      </div>
    </div>
  );
}
