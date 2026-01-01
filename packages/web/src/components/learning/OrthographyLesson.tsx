import { useState, useEffect } from 'react';
import api from '@/api/client';

interface OrthographyExample {
  word: string;
  audioUrl: string | null;
}

interface OrthographyLessonData {
  conceptId: string;
  letter: string;
  ipa: string;
  soundDescription: string;
  examples: OrthographyExample[];
  completed: boolean;
}

interface OrthographyResponse {
  lessons: OrthographyLessonData[];
  totalLessons: number;
  completedLessons: number;
  orthographyCompleted: boolean;
}

interface OrthographyLessonProps {
  language: string;
  onComplete?: () => void;
}

export function OrthographyLesson({ language, onComplete }: OrthographyLessonProps) {
  const [lessons, setLessons] = useState<OrthographyLessonData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalLessons, setTotalLessons] = useState(0);
  const [completedLessons, setCompletedLessons] = useState(0);

  useEffect(() => {
    void loadLessons();
  }, [language]);

  const loadLessons = async () => {
    try {
      setLoading(true);
      setError(null);
      const data: OrthographyResponse = await api.get(`/learning/orthography/${language}`);
      setLessons(data.lessons);
      setTotalLessons(data.totalLessons);
      setCompletedLessons(data.completedLessons);

      // Find first incomplete lesson
      const firstIncomplete = data.lessons.findIndex((l) => !l.completed);
      if (firstIncomplete !== -1) {
        setCurrentIndex(firstIncomplete);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lessons');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    try {
      const currentLesson = lessons[currentIndex];

      // Mark lesson as completed
      await api.post<{ success: boolean }>('/learning/orthography/progress', {
        conceptId: currentLesson.conceptId,
      });

      // Update local state
      const updatedLessons = [...lessons];
      updatedLessons[currentIndex].completed = true;
      setLessons(updatedLessons);
      setCompletedLessons(completedLessons + 1);

      // Move to next lesson
      if (currentIndex < lessons.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        // All lessons completed
        if (onComplete) {
          onComplete();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark lesson as completed');
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < lessons.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const playAudio = (url: string | null) => {
    if (!url) {
      console.warn('No audio URL provided');
      return;
    }

    try {
      const audio = new Audio(url);
      void audio.play();
    } catch (err) {
      console.error('Failed to play audio:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
          <p className="mt-4 text-gray-600">Loading lessons...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error: {error}</p>
        <button
          onClick={() => void loadLessons()}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (lessons.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800">No orthography lessons available for this language.</p>
      </div>
    );
  }

  const currentLesson = lessons[currentIndex];
  const progressPercentage = (completedLessons / totalLessons) * 100;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900">Orthography: {language}</h1>
          <span className="text-sm text-gray-600">
            Lesson {currentIndex + 1} of {totalLessons}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-green-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <p className="mt-1 text-sm text-gray-600">
          {completedLessons} of {totalLessons} completed
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
        {/* Letter display */}
        <div className="text-center mb-8">
          <h2 className="text-8xl font-bold text-gray-900 mb-4">{currentLesson.letter}</h2>
          <p className="text-3xl text-gray-600 mb-2">[{currentLesson.ipa}]</p>
          <p className="text-lg text-gray-500">{currentLesson.soundDescription}</p>
        </div>

        {/* Examples */}
        {currentLesson.examples.length > 0 && (
          <div className="mt-8">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Examples:</h3>
            <div className="space-y-3">
              {currentLesson.examples.map((example, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <span className="text-xl font-medium text-gray-900">{example.word}</span>
                  {example.audioUrl && (
                    <button
                      onClick={() => playAudio(example.audioUrl)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      aria-label={`Play audio for ${example.word}`}
                    >
                      <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
                      </svg>
                      Play
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={handlePrevious}
          disabled={currentIndex === 0}
          className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          ← Previous
        </button>

        <div className="flex gap-4">
          {currentIndex < lessons.length - 1 && (
            <button
              onClick={handleNext}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Skip →
            </button>
          )}

          <button
            onClick={() => void handleComplete()}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
          >
            {currentIndex < lessons.length - 1 ? "I've got it!" : 'Finish & Practice'}
          </button>
        </div>
      </div>

      {currentLesson.completed && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800 text-center">✓ You've already completed this lesson</p>
        </div>
      )}
    </div>
  );
}
