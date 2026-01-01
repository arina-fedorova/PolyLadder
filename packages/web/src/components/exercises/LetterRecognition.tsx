import { useState } from 'react';

interface LetterRecognitionProps {
  audioUrl: string | null;
  options: string[];
  correctAnswer: string;
  onAnswer: (correct: boolean) => void;
}

export function LetterRecognition({
  audioUrl,
  options,
  correctAnswer,
  onAnswer,
}: LetterRecognitionProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const playAudio = (): void => {
    if (!audioUrl) {
      console.warn('No audio URL provided');
      return;
    }

    try {
      const audio = new Audio(audioUrl);
      void audio.play();
    } catch (err) {
      console.error('Failed to play audio:', err);
    }
  };

  const handleSelect = (option: string): void => {
    if (showFeedback) return;

    setSelected(option);
    setShowFeedback(true);

    const isCorrect = option === correctAnswer;
    onAnswer(isCorrect);

    // Auto-advance after 1.5 seconds
    setTimeout(() => {
      setShowFeedback(false);
      setSelected(null);
    }, 1500);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h3 className="text-2xl font-semibold text-gray-900 mb-6 text-center">
        Listen and select the letter:
      </h3>

      <div className="flex justify-center mb-8">
        <button
          onClick={playAudio}
          className="px-8 py-4 bg-blue-600 text-white text-lg rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-3"
        >
          <svg
            className="w-6 h-6"
            fill="currentColor"
            viewBox="0 0 20 20"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
          </svg>
          Play Sound
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {options.map((option) => {
          let buttonClass =
            'p-6 text-4xl font-bold border-2 rounded-lg transition-all hover:scale-105';

          if (showFeedback && option === selected) {
            buttonClass +=
              option === correctAnswer
                ? ' bg-green-100 border-green-500 text-green-900'
                : ' bg-red-100 border-red-500 text-red-900';
          } else {
            buttonClass += ' bg-white border-gray-300 text-gray-900 hover:border-blue-500';
          }

          return (
            <button
              key={option}
              onClick={() => {
                handleSelect(option);
              }}
              disabled={showFeedback}
              className={buttonClass}
            >
              {option}
            </button>
          );
        })}
      </div>

      {showFeedback && (
        <div
          className={`text-center text-xl font-semibold p-4 rounded-lg ${
            selected === correctAnswer ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {selected === correctAnswer ? (
            <span>✅ Correct!</span>
          ) : (
            <span>❌ Incorrect. The answer is &quot;{correctAnswer}&quot;</span>
          )}
        </div>
      )}
    </div>
  );
}
