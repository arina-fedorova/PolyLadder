import { useState } from 'react';

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

interface ReadingComprehensionProps {
  passage: ReadingPassage;
  onSubmit: (
    answers: Array<{ questionId: string; answerIndex: number }>,
    timeSpentMs: number
  ) => void;
  result: ReadingResult | null;
  disabled: boolean;
}

export function ReadingComprehension({
  passage,
  onSubmit,
  result,
  disabled,
}: ReadingComprehensionProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Map<string, number>>(new Map());
  const [hoveredHint, setHoveredHint] = useState<string | null>(null);
  const [startTime] = useState(() => Date.now());

  const currentQuestion = passage.questions[currentQuestionIndex];
  const allAnswered = passage.questions.every((q) => userAnswers.has(q.id));

  const handleAnswerSelect = (questionId: string, answerIndex: number) => {
    if (disabled) return;
    setUserAnswers((prev) => new Map(prev).set(questionId, answerIndex));
  };

  const handleNext = () => {
    if (currentQuestionIndex < passage.questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    }
  };

  const handleSubmit = () => {
    const unanswered = passage.questions.filter((q) => !userAnswers.has(q.id));
    if (unanswered.length > 0) {
      const confirmSubmit = window.confirm(
        `You have ${unanswered.length} unanswered question(s). Submit anyway?`
      );
      if (!confirmSubmit) return;
    }

    const answers = passage.questions.map((q) => ({
      questionId: q.id,
      answerIndex: userAnswers.get(q.id) ?? -1,
    }));

    const timeSpentMs = Date.now() - startTime;
    onSubmit(answers, timeSpentMs);
  };

  const renderPassageWithHints = () => {
    const words = passage.text.split(/(\s+)/);

    return (
      <div className="text-lg leading-relaxed text-gray-800">
        {words.map((word, idx) => {
          const cleanWord = word.replace(/[.,!?;:'"]/g, '').toLowerCase();
          const hint = passage.vocabularyHints.find((h) => h.word.toLowerCase() === cleanWord);

          if (hint && word.trim()) {
            return (
              <span
                key={idx}
                className="relative inline cursor-help border-b-2 border-dotted border-blue-400 hover:bg-blue-50"
                onMouseEnter={() => setHoveredHint(hint.word)}
                onMouseLeave={() => setHoveredHint(null)}
              >
                {word}
                {hoveredHint === hint.word && (
                  <div className="absolute bottom-full left-0 mb-2 p-3 bg-gray-900 text-white text-sm rounded shadow-lg z-10 w-64">
                    <div className="font-semibold mb-1">{hint.word}</div>
                    <div>{hint.definition}</div>
                  </div>
                )}
              </span>
            );
          }

          return <span key={idx}>{word}</span>;
        })}
      </div>
    );
  };

  const getQuestionTypeLabel = (type: string) => {
    switch (type) {
      case 'factual':
        return 'Factual';
      case 'inferential':
        return 'Inference';
      case 'vocabulary':
        return 'Vocabulary';
      case 'main_idea':
        return 'Main Idea';
      default:
        return type;
    }
  };

  // Show results if submitted
  if (result) {
    return (
      <div className="reading-comprehension card p-8">
        {/* Results Header */}
        <div className="text-center mb-6">
          <h3 className="text-2xl font-bold mb-2">Reading Comprehension Results</h3>
          <div
            className="text-4xl font-bold mb-2"
            style={{
              color: result.score >= 0.8 ? '#10b981' : result.score >= 0.6 ? '#f59e0b' : '#ef4444',
            }}
          >
            {Math.round(result.score * 100)}%
          </div>
          <div className="text-gray-600">
            {result.correctAnswers} out of {result.totalQuestions} correct
          </div>
        </div>

        {/* Question-by-Question Feedback */}
        <div className="space-y-4 mb-6">
          {passage.questions.map((question, idx) => {
            const answerResult = result.answers.find((a) => a.questionId === question.id);
            if (!answerResult) return null;

            return (
              <div
                key={question.id}
                className={`p-4 rounded-lg border-2 ${
                  answerResult.isCorrect
                    ? 'bg-green-50 border-green-300'
                    : 'bg-red-50 border-red-300'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold mb-2">
                  <span className={answerResult.isCorrect ? 'text-green-600' : 'text-red-600'}>
                    {answerResult.isCorrect ? '✓' : '✗'}
                  </span>
                  <span className="text-xs bg-gray-200 px-2 py-0.5 rounded">
                    {getQuestionTypeLabel(question.questionType)}
                  </span>
                  <span>Question {idx + 1}</span>
                </div>
                <div className="mb-2">{question.questionText}</div>
                <div className="space-y-1 text-sm">
                  <div>
                    <span className="font-medium">Your answer:</span>{' '}
                    <span className={answerResult.isCorrect ? 'text-green-700' : 'text-red-700'}>
                      {answerResult.userAnswerIndex >= 0
                        ? question.options[answerResult.userAnswerIndex]
                        : '(No answer)'}
                    </span>
                  </div>
                  {!answerResult.isCorrect && (
                    <div>
                      <span className="font-medium">Correct answer:</span>{' '}
                      <span className="text-green-700">
                        {question.options[answerResult.correctAnswerIndex]}
                      </span>
                    </div>
                  )}
                  {answerResult.explanation && (
                    <div className="mt-2 p-2 bg-blue-50 rounded text-gray-700">
                      <span className="font-medium">Explanation:</span> {answerResult.explanation}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="reading-comprehension card p-8">
      {/* Passage Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-2xl font-bold text-gray-900">{passage.title}</h3>
          {passage.source && <div className="text-sm text-gray-500 mt-1">{passage.source}</div>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded">
            {passage.cefrLevel}
          </span>
          <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded">
            {passage.wordCount} words
          </span>
        </div>
      </div>

      {/* Audio Narration */}
      {passage.audioUrl && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <div className="text-sm font-semibold text-gray-700 mb-2">Listen to narration:</div>
          <audio src={passage.audioUrl} controls className="w-full" />
        </div>
      )}

      {/* Reading Passage */}
      <div className="mb-8 p-6 bg-gray-50 rounded-lg">{renderPassageWithHints()}</div>

      {/* Vocabulary Hint Legend */}
      {passage.vocabularyHints.length > 0 && (
        <div className="mb-6 p-3 bg-yellow-50 border-l-4 border-yellow-400 text-sm text-gray-700">
          <strong>Tip:</strong> Hover over underlined words for definitions
        </div>
      )}

      {/* Question Section */}
      <div className="border-t-2 border-gray-200 pt-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold">Comprehension Questions</h4>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
              {getQuestionTypeLabel(currentQuestion.questionType)}
            </span>
            <span className="text-sm text-gray-600">
              Question {currentQuestionIndex + 1} of {passage.questions.length}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-6 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
            style={{
              width: `${((currentQuestionIndex + 1) / passage.questions.length) * 100}%`,
            }}
          />
        </div>

        {/* Current Question */}
        <div className="space-y-4">
          <div className="text-lg font-medium text-gray-900">{currentQuestion.questionText}</div>

          {/* Answer Options */}
          <div className="space-y-2">
            {currentQuestion.options.map((option, idx) => {
              const isSelected = userAnswers.get(currentQuestion.id) === idx;
              return (
                <button
                  key={idx}
                  onClick={() => handleAnswerSelect(currentQuestion.id, idx)}
                  disabled={disabled}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50'
                  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                      }`}
                    >
                      {isSelected && <div className="w-3 h-3 bg-white rounded-full" />}
                    </div>
                    <span className="text-gray-900">{option}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between items-center pt-4">
            <button
              onClick={handlePrevious}
              disabled={currentQuestionIndex === 0 || disabled}
              className="btn btn-ghost disabled:opacity-50"
            >
              Previous
            </button>

            <div className="text-sm text-gray-600">
              {allAnswered ? (
                <span className="text-green-600">All questions answered</span>
              ) : (
                `${userAnswers.size}/${passage.questions.length} answered`
              )}
            </div>

            {currentQuestionIndex < passage.questions.length - 1 ? (
              <button onClick={handleNext} disabled={disabled} className="btn btn-primary">
                Next
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={disabled} className="btn btn-success">
                Submit Answers
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
