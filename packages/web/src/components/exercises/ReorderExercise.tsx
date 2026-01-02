import { useState, useMemo, useEffect } from 'react';

interface ReorderExerciseProps {
  exercise: {
    exerciseId: string;
    prompt: string;
    correctAnswer: string | string[];
  };
  onSubmit: (answer: string[]) => void;
  disabled: boolean;
}

export function ReorderExercise({ exercise, onSubmit, disabled }: ReorderExerciseProps) {
  const scrambledWords = useMemo(() => {
    const wordsArray = Array.isArray(exercise.correctAnswer)
      ? exercise.correctAnswer
      : exercise.correctAnswer.split(' ');
    return [...wordsArray].sort(() => Math.random() - 0.5);
  }, [exercise.correctAnswer]);

  const [words, setWords] = useState<string[]>(scrambledWords);

  useEffect(() => {
    setWords(scrambledWords);
  }, [exercise.exerciseId, scrambledWords]);

  const moveWord = (from: number, to: number): void => {
    const newWords = [...words];
    const [movedWord] = newWords.splice(from, 1);
    newWords.splice(to, 0, movedWord);
    setWords(newWords);
  };

  const handleSubmit = (): void => {
    onSubmit(words);
  };

  return (
    <div className="reorder-exercise">
      <p className="text-lg mb-4">{exercise.prompt}</p>

      <div className="mb-4 p-4 bg-gray-50 rounded">
        <p className="text-sm text-gray-600 mb-2">Click arrows to reorder words:</p>

        <div className="space-y-2">
          {words.map((word, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-3 bg-white border-2 border-gray-300 rounded"
            >
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (index > 0) moveWord(index, index - 1);
                  }}
                  disabled={index === 0 || disabled}
                  className="btn btn-xs btn-ghost"
                  aria-label="Move up"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (index < words.length - 1) moveWord(index, index + 1);
                  }}
                  disabled={index === words.length - 1 || disabled}
                  className="btn btn-xs btn-ghost"
                  aria-label="Move down"
                >
                  ▼
                </button>
              </div>
              <span className="text-lg flex-1">{word}</span>
            </div>
          ))}
        </div>
      </div>

      <button onClick={handleSubmit} className="btn btn-primary" disabled={disabled}>
        Check Answer
      </button>
    </div>
  );
}
