import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api/client';
import { LetterRecognition } from './LetterRecognition';
import { SimpleDictation } from './SimpleDictation';

interface Exercise {
  id: string;
  type: string;
  language: string;
  level: string;
  prompt: string;
  options: string[] | null;
  metadata?: {
    audioUrl?: string;
    category?: string;
  };
}

interface OrthographyExerciseSessionProps {
  language: string;
}

export function OrthographyExerciseSession({ language }: OrthographyExerciseSessionProps) {
  const navigate = useNavigate();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);

  useEffect(() => {
    void loadExercises();
  }, [language]);

  const loadExercises = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      // Fetch orthography exercises
      const data: { exercises: Exercise[]; total: number } = await api.get(
        `/learning/exercises?language=${language}&type=multiple_choice&count=20`
      );

      if (data.exercises.length === 0) {
        setError('No orthography exercises available for this language.');
        return;
      }

      setExercises(data.exercises);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load exercises');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (correct: boolean): void => {
    const currentExercise = exercises[currentIndex];

    // Update score
    setScore((prev) => ({
      correct: prev.correct + (correct ? 1 : 0),
      total: prev.total + 1,
    }));

    // Submit answer to backend
    api
      .post<{ correct: boolean; correctAnswer: string; explanation: string | null }>(
        '/learning/exercises/submit',
        {
          exerciseId: currentExercise.id,
          answer: correct ? currentExercise.prompt : 'wrong',
          timeSpentMs: 5000,
        }
      )
      .catch((err) => {
        console.error('Failed to submit answer:', err);
      });

    // Move to next exercise or complete session
    setTimeout(() => {
      if (currentIndex < exercises.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        completeSession();
      }
    }, 2000);
  };

  const completeSession = (): void => {
    setSessionComplete(true);

    const newTotal = score.total + 1;
    const accuracy = ((score.correct + 1) / newTotal) * 100;

    if (accuracy >= 80) {
      handleSessionSuccess(accuracy).catch((err) => {
        console.error('Failed to complete session:', err);
      });
    }
  };

  const handleSessionSuccess = async (accuracy: number): Promise<void> => {
    try {
      await api.post<{ success: boolean; gateCompleted: boolean }>(
        '/learning/orthography/complete',
        {
          language,
          accuracy,
        }
      );
    } catch (err) {
      console.error('Failed to mark orthography as completed:', err);
    }
  };

  const handleRetry = (): void => {
    setCurrentIndex(0);
    setScore({ correct: 0, total: 0 });
    setSessionComplete(false);
    void loadExercises();
  };

  const handleExit = (): void => {
    void navigate('/dashboard');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
          <p className="mt-4 text-gray-600">Loading exercises...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
          <button
            onClick={() => {
              void loadExercises();
            }}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (sessionComplete) {
    const finalTotal = score.total;
    const accuracy = finalTotal > 0 ? (score.correct / finalTotal) * 100 : 0;
    const passed = accuracy >= 80;

    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            {passed ? '🎉 Congratulations!' : '📚 Keep Practicing'}
          </h2>

          <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
            <div className="text-6xl font-bold mb-4">{accuracy.toFixed(1)}%</div>
            <p className="text-xl text-gray-600 mb-2">
              You got {score.correct} out of {finalTotal} correct
            </p>
            <p className="text-gray-500">
              {passed ? 'You passed! (80% required)' : 'You need 80% to pass'}
            </p>
          </div>

          <div className="flex gap-4 justify-center">
            {!passed && (
              <button
                onClick={handleRetry}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
            )}
            <button
              onClick={handleExit}
              className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              {passed ? 'Continue Learning' : 'Exit'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (exercises.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">No exercises available for this language.</p>
        </div>
      </div>
    );
  }

  const currentExercise = exercises[currentIndex];
  const progress = ((currentIndex + 1) / exercises.length) * 100;
  const currentAccuracy = score.total > 0 ? ((score.correct / score.total) * 100).toFixed(0) : '0';

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Orthography Practice: {language}</h2>
            <div className="text-right">
              <div className="text-sm text-gray-600">
                Exercise {currentIndex + 1} / {exercises.length}
              </div>
              <div className="text-lg font-semibold text-gray-900">
                Score: {score.correct} / {score.total} ({currentAccuracy}%)
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Exercise */}
        <div className="bg-white rounded-lg shadow-lg">
          {currentExercise.type === 'multiple_choice' && currentExercise.options && (
            <LetterRecognition
              audioUrl={currentExercise.metadata?.audioUrl || null}
              options={currentExercise.options}
              correctAnswer={currentExercise.prompt}
              onAnswer={handleAnswer}
            />
          )}

          {currentExercise.type === 'dictation' && (
            <SimpleDictation
              audioUrl={currentExercise.metadata?.audioUrl || null}
              correctAnswer={currentExercise.prompt}
              onAnswer={handleAnswer}
            />
          )}

          {currentExercise.type !== 'multiple_choice' && currentExercise.type !== 'dictation' && (
            <div className="p-6 text-center text-gray-600">
              Unsupported exercise type: {currentExercise.type}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
