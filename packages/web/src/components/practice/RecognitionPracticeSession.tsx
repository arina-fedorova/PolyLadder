import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { RecognitionQuestion } from './RecognitionQuestion';

interface RecognitionQuestionData {
  questionId: string;
  questionType: 'word_to_definition' | 'definition_to_word';
  meaningId: string;
  prompt: string;
  correctAnswer: string;
  options: string[];
  correctIndex: number;
  audioUrl: string | null;
  cefrLevel: string;
}

interface RecognitionQuestionsResponse {
  questions: RecognitionQuestionData[];
  count: number;
}

interface RecognitionStats {
  totalItems: number;
  dueNow: number;
  mastered: number;
}

interface RecognitionPracticeSessionProps {
  language: string;
}

export function RecognitionPracticeSession({ language }: RecognitionPracticeSessionProps) {
  const queryClient = useQueryClient();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const startTimeRef = useRef<number>(Date.now());

  const { data: response, isLoading } = useQuery<RecognitionQuestionsResponse>({
    queryKey: ['recognition-questions', language],
    queryFn: async () => {
      return api.get<RecognitionQuestionsResponse>(
        `/learning/recognition/questions?language=${language}&limit=10`
      );
    },
  });

  const questions = response?.questions ?? [];

  const submitMutation = useMutation({
    mutationFn: async (payload: {
      meaningId: string;
      selectedIndex: number;
      correctIndex: number;
      timeToAnswerMs: number;
    }) => {
      return api.post('/learning/recognition/submit', payload);
    },
    onSuccess: () => {
      // Move to next question
      setCurrentQuestionIndex((prev) => prev + 1);
      startTimeRef.current = Date.now();
    },
  });

  const { data: statsResponse } = useQuery<{ stats: RecognitionStats }>({
    queryKey: ['recognition-stats', language],
    queryFn: async () => {
      return api.get<{ stats: RecognitionStats }>(
        `/learning/recognition/stats?language=${language}`
      );
    },
    enabled: currentQuestionIndex > 0,
    refetchInterval: 5000,
  });

  const stats = statsResponse?.stats;

  if (isLoading) {
    return <div className="text-center py-8">Loading questions...</div>;
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="card p-8 text-center max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-green-600 mb-4">🎉 All Done!</h3>
        <p className="text-gray-700 mb-4">No recognition questions available right now.</p>
        <p className="text-sm text-gray-600">
          Add more words to your learning queue or wait for items to become due.
        </p>
      </div>
    );
  }

  if (currentQuestionIndex >= questions.length) {
    const totalAnswered = correctCount + incorrectCount;
    const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;

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

        {stats && (
          <div className="grid grid-cols-2 gap-4 my-6">
            <div className="stat">
              <div className="stat-value text-purple-600">{stats.dueNow}</div>
              <div className="stat-title">Still Due</div>
            </div>
            <div className="stat">
              <div className="stat-value text-green-600">{stats.mastered}</div>
              <div className="stat-title">Mastered</div>
            </div>
          </div>
        )}

        <button
          onClick={() => {
            setCurrentQuestionIndex(0);
            setCorrectCount(0);
            setIncorrectCount(0);
            startTimeRef.current = Date.now();
            void queryClient.invalidateQueries({ queryKey: ['recognition-questions'] });
          }}
          className="btn btn-primary"
        >
          Start New Session
        </button>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];

  const handleAnswer = (selectedIndex: number, isCorrect: boolean) => {
    const timeToAnswer = Date.now() - startTimeRef.current;

    if (isCorrect) {
      setCorrectCount((prev) => prev + 1);
    } else {
      setIncorrectCount((prev) => prev + 1);
    }

    submitMutation.mutate({
      meaningId: currentQuestion.meaningId,
      selectedIndex,
      correctIndex: currentQuestion.correctIndex,
      timeToAnswerMs: timeToAnswer,
    });
  };

  const progressPercent = ((currentQuestionIndex + 1) / questions.length) * 100;

  return (
    <div className="recognition-practice-session max-w-3xl mx-auto p-6">
      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>
            Question {currentQuestionIndex + 1} of {questions.length}
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

      {/* Question */}
      <RecognitionQuestion
        question={currentQuestion}
        onAnswer={handleAnswer}
        disabled={submitMutation.isPending}
      />

      {/* Keyboard Hints */}
      <div className="text-center mt-4 text-sm text-gray-500">
        <p>Keyboard shortcuts: Press 1-4 to select an option</p>
      </div>
    </div>
  );
}
