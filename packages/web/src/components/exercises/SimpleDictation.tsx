import { useState } from 'react';

interface SimpleDictationProps {
  audioUrl: string | null;
  correctAnswer: string;
  onAnswer: (correct: boolean) => void;
}

export function SimpleDictation({ audioUrl, correctAnswer, onAnswer }: SimpleDictationProps) {
  const [input, setInput] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

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

  const handleSubmit = (): void => {
    if (!input.trim()) return;

    const normalized = input.trim().toLowerCase();
    const correct = normalized === correctAnswer.toLowerCase();

    setIsCorrect(correct);
    setShowFeedback(true);
    onAnswer(correct);

    setTimeout(() => {
      setShowFeedback(false);
      setInput('');
      setIsCorrect(false);
    }, 1500);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !showFeedback && input.trim()) {
      handleSubmit();
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h3 className="text-2xl font-semibold text-gray-900 mb-6 text-center">
        Listen and type what you hear:
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
          Play
        </button>
      </div>

      <div className="mb-6">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
          }}
          onKeyPress={handleKeyPress}
          disabled={showFeedback}
          placeholder="Type here..."
          autoFocus
          className="w-full px-4 py-3 text-2xl text-center border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 disabled:bg-gray-100"
        />
      </div>

      <div className="flex justify-center mb-6">
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || showFeedback}
          className="px-8 py-3 bg-green-600 text-white text-lg rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          Submit
        </button>
      </div>

      {showFeedback && (
        <div
          className={`text-center text-xl font-semibold p-4 rounded-lg ${
            isCorrect ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {isCorrect ? (
            <span>✅ Correct!</span>
          ) : (
            <span>❌ Incorrect. The answer is &quot;{correctAnswer}&quot;</span>
          )}
        </div>
      )}
    </div>
  );
}
