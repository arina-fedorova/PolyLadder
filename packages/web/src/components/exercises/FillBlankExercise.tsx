import { useState } from 'react';

interface FillBlankExerciseProps {
  exercise: {
    exerciseId: string;
    prompt: string;
    sentenceText: string;
    hint: string | null;
  };
  onSubmit: (answer: string) => void;
  disabled: boolean;
}

export function FillBlankExercise({ exercise, onSubmit, disabled }: FillBlankExerciseProps) {
  const [answer, setAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (answer.trim()) {
      onSubmit(answer.trim());
    }
  };

  return (
    <div className="fill-blank-exercise">
      <p className="text-lg mb-4">{exercise.prompt}</p>

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <p className="text-xl font-medium mb-2">{exercise.sentenceText}</p>

          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            className="input input-bordered w-full max-w-xs"
            placeholder="Type your answer here"
            disabled={disabled}
            autoFocus
          />
        </div>

        {exercise.hint && (
          <div className="mb-4">
            {showHint ? (
              <div className="alert alert-info">
                <span>💡 Hint: {exercise.hint}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowHint(true)}
                className="btn btn-sm btn-ghost"
              >
                Show Hint
              </button>
            )}
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={disabled || !answer.trim()}>
          Check Answer
        </button>
      </form>
    </div>
  );
}
