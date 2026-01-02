import { useState, useMemo, useEffect, useRef } from 'react';

interface MultipleChoiceExerciseProps {
  exercise: {
    exerciseId: string;
    prompt: string;
    sentenceText: string;
    correctAnswer: string | string[];
    distractors?: string[];
  };
  onSubmit: (answer: string) => void;
  disabled: boolean;
}

export function MultipleChoiceExercise({
  exercise,
  onSubmit,
  disabled,
}: MultipleChoiceExerciseProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const previousExerciseIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (previousExerciseIdRef.current !== exercise.exerciseId) {
      setSelectedAnswer(null);
      previousExerciseIdRef.current = exercise.exerciseId;
    }
  }, [exercise.exerciseId]);

  const options = useMemo(() => {
    const correct =
      typeof exercise.correctAnswer === 'string'
        ? exercise.correctAnswer
        : exercise.correctAnswer[0];
    const allOptions = [correct, ...(exercise.distractors || [])];
    return allOptions.sort(() => Math.random() - 0.5);
  }, [exercise]);

  const handleSubmit = (): void => {
    if (selectedAnswer) {
      onSubmit(selectedAnswer);
    }
  };

  return (
    <div className="multiple-choice-exercise">
      <p className="text-lg mb-4">{exercise.prompt}</p>

      <p className="text-xl font-medium mb-4">{exercise.sentenceText}</p>

      <div className="space-y-2 mb-4">
        {options.map((option, idx) => (
          <label
            key={idx}
            className={`block p-4 border-2 rounded cursor-pointer transition-colors ${
              selectedAnswer === option
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input
              type="radio"
              name="answer"
              value={option}
              checked={selectedAnswer === option}
              onChange={(e) => setSelectedAnswer(e.target.value)}
              disabled={disabled}
              className="mr-3"
            />
            <span className="text-lg">{option}</span>
          </label>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        className="btn btn-primary"
        disabled={disabled || !selectedAnswer}
      >
        Check Answer
      </button>
    </div>
  );
}
