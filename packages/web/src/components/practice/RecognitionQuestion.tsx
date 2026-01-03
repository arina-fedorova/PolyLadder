import { useState, useEffect } from 'react';

interface RecognitionQuestionProps {
  question: {
    questionId: string;
    questionType: 'word_to_definition' | 'definition_to_word';
    meaningId: string;
    prompt: string;
    options: string[];
    correctIndex: number;
    audioUrl?: string | null;
    cefrLevel: string;
  };
  onAnswer: (selectedIndex: number, isCorrect: boolean) => void;
  disabled: boolean;
}

export function RecognitionQuestion({ question, onAnswer, disabled }: RecognitionQuestionProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  // Reset state when question changes
  useEffect(() => {
    setSelectedIndex(null);
    setShowFeedback(false);
  }, [question.questionId]);

  // Keyboard shortcuts for options 1-4
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (disabled || showFeedback) return;

      const key = parseInt(e.key);
      if (key >= 1 && key <= 4) {
        handleSelect(key - 1);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [disabled, showFeedback, question.correctIndex]);

  const playAudio = async () => {
    if (question.audioUrl) {
      const audio = new Audio(question.audioUrl);
      await audio.play();
    }
  };

  const handleSelect = (index: number) => {
    if (disabled || showFeedback) return;

    setSelectedIndex(index);
    setShowFeedback(true);

    const isCorrect = index === question.correctIndex;

    // Wait briefly to show feedback, then notify parent
    setTimeout(() => {
      onAnswer(index, isCorrect);
    }, 1500);
  };

  const getOptionClass = (index: number): string => {
    const baseClass = 'btn w-full text-left justify-start h-auto py-4 px-6';

    if (!showFeedback) {
      return `${baseClass} btn-outline hover:btn-primary`;
    }

    // Show feedback
    if (index === question.correctIndex) {
      return `${baseClass} btn-success`;
    }

    if (index === selectedIndex && index !== question.correctIndex) {
      return `${baseClass} btn-error`;
    }

    return `${baseClass} btn-ghost opacity-50`;
  };

  const isCorrect = selectedIndex === question.correctIndex;

  return (
    <div className="recognition-question card p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <span className="badge badge-outline">{question.cefrLevel}</span>
        <span className="text-sm text-gray-500">
          {question.questionType === 'word_to_definition'
            ? 'Word → Definition'
            : 'Definition → Word'}
        </span>
      </div>

      {/* Question prompt */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-center">{question.prompt}</h3>

        {/* Audio button (for word_to_definition questions) */}
        {question.audioUrl && question.questionType === 'word_to_definition' && (
          <div className="text-center mt-4">
            <button
              onClick={() => void playAudio()}
              className="btn btn-circle btn-lg"
              disabled={disabled}
            >
              🔊
            </button>
          </div>
        )}
      </div>

      {/* Options */}
      <div className="space-y-3">
        {question.options.map((option, index) => (
          <button
            key={index}
            onClick={() => handleSelect(index)}
            className={getOptionClass(index)}
            disabled={disabled || showFeedback}
          >
            <span className="mr-3 font-bold text-gray-500">{index + 1}.</span>
            <span className="flex-1">{option}</span>
            {showFeedback && index === question.correctIndex && (
              <span className="ml-2 text-green-600">✓</span>
            )}
            {showFeedback && index === selectedIndex && index !== question.correctIndex && (
              <span className="ml-2 text-red-600">✗</span>
            )}
          </button>
        ))}
      </div>

      {/* Feedback */}
      {showFeedback && (
        <div className={`alert ${isCorrect ? 'alert-success' : 'alert-error'} mt-6`}>
          <div>
            <div className="font-semibold">{isCorrect ? '✓ Correct!' : '✗ Incorrect'}</div>
            {!isCorrect && (
              <div className="text-sm mt-1">
                The correct answer was: <strong>{question.options[question.correctIndex]}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Keyboard hint */}
      {!showFeedback && (
        <div className="text-center mt-6 text-sm text-gray-500">Press 1-4 to select an option</div>
      )}
    </div>
  );
}
