import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { ReadingComprehension } from './ReadingComprehension';

interface VocabularyHint {
  word: string;
  definition: string;
  position: number;
}

interface ComprehensionQuestion {
  id: string;
  questionText: string;
  questionType: string;
  options: string[];
}

interface ReadingPassage {
  id: string;
  title: string;
  text: string;
  language: string;
  cefrLevel: string;
  wordCount: number;
  audioUrl: string | null;
  source: string | null;
  vocabularyHints: VocabularyHint[];
  questions: ComprehensionQuestion[];
  srsItemId: string | null;
}

interface ReadingPassagesResponse {
  passages: ReadingPassage[];
  count: number;
}

interface AnswerResult {
  questionId: string;
  userAnswerIndex: number;
  correctAnswerIndex: number;
  isCorrect: boolean;
  explanation: string | null;
}

interface ReadingResult {
  passageId: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  qualityRating: number;
  answers: AnswerResult[];
}

interface ReadingStats {
  totalPassagesRead: number;
  passagesWithGoodScore: number;
  averageScore: number | null;
}

interface ReadingPracticeSessionProps {
  language: string;
}

export function ReadingPracticeSession({ language }: ReadingPracticeSessionProps) {
  const queryClient = useQueryClient();
  const [currentPassageIndex, setCurrentPassageIndex] = useState(0);
  const [passagesCompleted, setPassagesCompleted] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [currentResult, setCurrentResult] = useState<ReadingResult | null>(null);
  const totalTimeRef = useRef<number>(0);
  const totalQuestionsRef = useRef<number>(0);
  const correctAnswersRef = useRef<number>(0);

  const { data: response, isLoading } = useQuery<ReadingPassagesResponse>({
    queryKey: ['reading-passages', language],
    queryFn: async () => {
      return api.get<ReadingPassagesResponse>(
        `/learning/reading/passages?language=${language}&limit=5`
      );
    },
  });

  const passages = response?.passages ?? [];

  // Reset currentResult when passage changes
  useEffect(() => {
    setCurrentResult(null);
  }, [currentPassageIndex]);

  const submitMutation = useMutation({
    mutationFn: async (payload: {
      passageId: string;
      answers: Array<{ questionId: string; answerIndex: number }>;
      timeSpentMs: number;
    }) => {
      return api.post<ReadingResult>('/learning/reading/submit', payload);
    },
    onSuccess: (result, variables) => {
      setCurrentResult(result);
      totalTimeRef.current += variables.timeSpentMs;
      totalQuestionsRef.current += result.totalQuestions;
      correctAnswersRef.current += result.correctAnswers;
      setPassagesCompleted((prev) => prev + 1);
      setTotalScore((prev) => prev + result.score);
    },
  });

  const { data: statsResponse } = useQuery<{ stats: ReadingStats }>({
    queryKey: ['reading-stats', language],
    queryFn: async () => {
      return api.get<{ stats: ReadingStats }>(`/learning/reading/stats?language=${language}`);
    },
    enabled: passagesCompleted > 0,
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

  if (isLoading) {
    return <div className="text-center py-8">Loading reading passages...</div>;
  }

  if (!passages || passages.length === 0) {
    return (
      <div className="card p-8 text-center max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-green-600 mb-4">No Passages Available</h3>
        <p className="text-gray-700 mb-4">
          No reading passages available for {getLanguageName(language)} right now.
        </p>
        <p className="text-sm text-gray-600">Check back later for new reading material.</p>
      </div>
    );
  }

  if (currentPassageIndex >= passages.length) {
    const avgScore = passagesCompleted > 0 ? Math.round((totalScore / passagesCompleted) * 100) : 0;
    const avgTime =
      passagesCompleted > 0 ? Math.round(totalTimeRef.current / passagesCompleted / 1000) : 0;
    const overallAccuracy =
      totalQuestionsRef.current > 0
        ? Math.round((correctAnswersRef.current / totalQuestionsRef.current) * 100)
        : 0;

    return (
      <div className="card p-8 text-center max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-green-600 mb-4">Session Complete!</h3>
        <p className="text-gray-600 mb-6">{getLanguageName(language)} Reading Practice</p>

        <div className="grid grid-cols-2 gap-4 my-6">
          <div className="stat">
            <div className="stat-value text-blue-600">{passagesCompleted}</div>
            <div className="stat-title">Passages Read</div>
          </div>
          <div className="stat">
            <div className="stat-value text-green-600">{avgScore}%</div>
            <div className="stat-title">Avg Score</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 my-6">
          <div className="stat">
            <div className="stat-value text-purple-600">{avgTime}s</div>
            <div className="stat-title">Avg Time/Passage</div>
          </div>
          <div className="stat">
            <div className="stat-value text-indigo-600">{overallAccuracy}%</div>
            <div className="stat-title">Questions Correct</div>
          </div>
        </div>

        <div className="my-6 text-sm text-gray-600">
          <div>
            Total: {correctAnswersRef.current}/{totalQuestionsRef.current} questions answered
            correctly
          </div>
        </div>

        {stats && (
          <div className="my-6 p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-2">Overall Stats (7 days)</div>
            <div className="text-lg font-semibold">
              {stats.averageScore !== null ? `${stats.averageScore}% average score` : 'No data'}
            </div>
            <div className="text-sm text-gray-500">
              {stats.totalPassagesRead} passages completed
            </div>
          </div>
        )}

        <button
          onClick={() => {
            setCurrentPassageIndex(0);
            setPassagesCompleted(0);
            setTotalScore(0);
            setCurrentResult(null);
            totalTimeRef.current = 0;
            totalQuestionsRef.current = 0;
            correctAnswersRef.current = 0;
            void queryClient.invalidateQueries({ queryKey: ['reading-passages'] });
          }}
          className="btn btn-primary"
        >
          Start New Session
        </button>
      </div>
    );
  }

  const currentPassage = passages[currentPassageIndex];

  const handleSubmit = (
    answers: Array<{ questionId: string; answerIndex: number }>,
    timeSpentMs: number
  ) => {
    submitMutation.mutate({
      passageId: currentPassage.id,
      answers,
      timeSpentMs,
    });
  };

  const handleNext = () => {
    setCurrentPassageIndex((prev) => prev + 1);
    setCurrentResult(null);
  };

  const progressPercent = ((currentPassageIndex + 1) / passages.length) * 100;

  return (
    <div className="reading-practice-session max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-4">
        <h2 className="text-xl font-semibold text-gray-700">Reading Comprehension</h2>
        <p className="text-sm text-gray-500">{getLanguageName(language)}</p>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>
            Passage {currentPassageIndex + 1} of {passages.length}
          </span>
          <span>
            {passagesCompleted} completed |{' '}
            {passagesCompleted > 0
              ? `${Math.round((totalScore / passagesCompleted) * 100)}% avg`
              : 'Start reading!'}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
      </div>

      {/* Current Passage */}
      <ReadingComprehension
        passage={currentPassage}
        onSubmit={handleSubmit}
        result={currentResult}
        disabled={submitMutation.isPending}
      />

      {/* Next button */}
      {currentResult && (
        <div className="text-center mt-6">
          <button onClick={handleNext} className="btn btn-primary">
            {currentPassageIndex < passages.length - 1 ? 'Next Passage' : 'See Results'}
          </button>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg text-sm text-gray-700">
        <strong>Instructions:</strong>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>Read the passage carefully (listen to audio if available)</li>
          <li>Hover over underlined words to see definitions</li>
          <li>Answer all comprehension questions</li>
          <li>Navigate between questions using Previous/Next buttons</li>
          <li>Submit your answers when ready to see results</li>
        </ul>
      </div>
    </div>
  );
}
