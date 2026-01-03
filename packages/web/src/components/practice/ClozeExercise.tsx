import { useState, useEffect, useRef } from 'react';

interface ClozeExerciseProps {
  exercise: {
    exerciseId: string;
    sentenceWithBlank: string;
    correctAnswer: string;
    alternativeAnswers: string[];
    hint: {
      firstLetter: string;
      wordLength: number;
      partOfSpeech: string | null;
    };
    context: string | null;
    audioUrl: string | null;
    explanation: string;
    cefrLevel: string;
    meaningId: string | null;
  };
  onSubmit: (userAnswer: string, timeSpentMs: number) => void;
  feedback: {
    isCorrect: boolean;
    similarity: number;
    feedback: string;
    correctAnswer: string;
    partialCredit: number;
  } | null;
  disabled: boolean;
  attemptCount: number;
}

export function ClozeExercise({
  exercise,
  onSubmit,
  feedback,
  disabled,
  attemptCount,
}: ClozeExerciseProps) {
  const [userAnswer, setUserAnswer] = useState('');
  const [hintLevel, setHintLevel] = useState(0);
  const startTimeRef = useRef<number>(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when exercise changes
  useEffect(() => {
    setUserAnswer('');
    setHintLevel(0);
    startTimeRef.current = Date.now();
    inputRef.current?.focus();
  }, [exercise.exerciseId]);

  const playAudio = async () => {
    if (exercise.audioUrl) {
      const audio = new Audio(exercise.audioUrl);
      await audio.play();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAnswer.trim() || disabled) return;

    const timeSpent = Date.now() - startTimeRef.current;
    onSubmit(userAnswer.trim(), timeSpent);
  };

  const handleShowHint = () => {
    setHintLevel((prev) => Math.min(prev + 1, 3));
  };

  const renderHints = () => {
    if (hintLevel === 0) return null;

    const hints: string[] = [];
    if (hintLevel >= 1) {
      hints.push(`First letter: "${exercise.hint.firstLetter}"`);
    }
    if (hintLevel >= 2) {
      hints.push(`Length: ${exercise.hint.wordLength} letters`);
    }
    if (hintLevel >= 3 && exercise.hint.partOfSpeech) {
      hints.push(`Part of speech: ${exercise.hint.partOfSpeech}`);
    }

    return (
      <div className="alert alert-info mt-4">
        <div>
          <div className="font-semibold">Hints:</div>
          <ul className="list-disc list-inside text-sm mt-1">
            {hints.map((hint, idx) => (
              <li key={idx}>{hint}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  // Render sentence with visual blank
  const renderSentence = () => {
    const parts = exercise.sentenceWithBlank.split('_____');

    return (
      <p className="text-2xl leading-relaxed">
        {parts.map((part, idx) => (
          <span key={idx}>
            {part}
            {idx < parts.length - 1 && (
              <span className="inline-block min-w-[100px] border-b-4 border-blue-500 mx-1 px-2 pb-1">
                {feedback ? (
                  <span
                    className={`font-bold ${feedback.isCorrect ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {feedback.isCorrect ? userAnswer : `${userAnswer}`}
                  </span>
                ) : (
                  <span className="text-gray-400 text-base">?</span>
                )}
              </span>
            )}
          </span>
        ))}
      </p>
    );
  };

  return (
    <div className="cloze-exercise card p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <span className="badge badge-outline">{exercise.cefrLevel}</span>
        <div className="flex items-center gap-2">
          {exercise.audioUrl && (
            <button
              onClick={() => void playAudio()}
              className="btn btn-circle btn-sm"
              disabled={disabled}
            >
              🔊
            </button>
          )}
        </div>
      </div>

      {/* Sentence with blank */}
      <div className="bg-gray-50 p-6 rounded-lg mb-6">{renderSentence()}</div>

      {/* Context/Translation */}
      {exercise.context && (
        <p className="text-sm text-gray-600 italic mb-4">Context: {exercise.context}</p>
      )}

      {/* Input form */}
      {!feedback && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              ref={inputRef}
              type="text"
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              className="input input-bordered w-full text-lg"
              placeholder="Type your answer..."
              disabled={disabled}
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              className="btn btn-primary flex-1"
              disabled={!userAnswer.trim() || disabled}
            >
              Check Answer
            </button>

            {attemptCount >= 2 && hintLevel < 3 && (
              <button type="button" onClick={handleShowHint} className="btn btn-secondary">
                Show Hint
              </button>
            )}
          </div>

          {renderHints()}
        </form>
      )}

      {/* Feedback */}
      {feedback && (
        <div className={`alert ${feedback.isCorrect ? 'alert-success' : 'alert-error'} mt-4`}>
          <div>
            <div className="font-semibold">
              {feedback.isCorrect ? '✓ ' : '✗ '}
              {feedback.feedback}
            </div>
            {!feedback.isCorrect && (
              <div className="text-sm mt-1">
                Correct answer: <strong>{feedback.correctAnswer}</strong>
              </div>
            )}
            {exercise.explanation && (
              <div className="text-sm mt-2 opacity-80">{exercise.explanation}</div>
            )}
          </div>
        </div>
      )}

      {/* Tip */}
      {!feedback && (
        <div className="text-center mt-6 text-sm text-gray-500">
          Tip: Minor typos will be accepted. Focus on getting the word right.
        </div>
      )}
    </div>
  );
}
