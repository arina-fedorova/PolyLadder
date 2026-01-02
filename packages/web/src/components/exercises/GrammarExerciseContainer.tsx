import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { FillBlankExercise } from './FillBlankExercise';
import { MultipleChoiceExercise } from './MultipleChoiceExercise';
import { ReorderExercise } from './ReorderExercise';

interface GrammarExercise {
  exerciseId: string;
  grammarRuleId: string;
  exerciseType:
    | 'fill_blank'
    | 'transformation'
    | 'multiple_choice'
    | 'reorder'
    | 'error_correction';
  difficulty: number;
  prompt: string;
  sentenceText: string;
  correctAnswer: string | string[];
  distractors?: string[];
  explanation: string;
  hint: string | null;
  audioUrl: string | null;
}

interface ExercisesData {
  exercises: GrammarExercise[];
}

interface ExerciseSubmission {
  exerciseId: string;
  userAnswer: string | string[];
  isCorrect: boolean;
  feedback: string;
  partialCredit: number;
}

interface GrammarExerciseContainerProps {
  grammarRuleId?: string;
  language: string;
}

export function GrammarExerciseContainer({
  grammarRuleId,
  language,
}: GrammarExerciseContainerProps) {
  const queryClient = useQueryClient();
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const { data, isLoading } = useQuery<ExercisesData>({
    queryKey: ['grammar-exercises', grammarRuleId, language],
    queryFn: async () => {
      const url = grammarRuleId
        ? `/learning/grammar/${grammarRuleId}/exercises`
        : `/learning/grammar/exercises/mixed?language=${language}`;
      return api.get<ExercisesData>(url);
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (payload: { exerciseId: string; answer: string | string[] }) => {
      return api.post<ExerciseSubmission>(
        `/learning/grammar/exercises/${payload.exerciseId}/validate`,
        { answer: payload.answer }
      );
    },
    onSuccess: (submission) => {
      setFeedback(submission.feedback);
      setIsCorrect(submission.isCorrect || submission.partialCredit > 0.5);

      setTimeout(() => {
        setCurrentExerciseIndex((prev) => prev + 1);
        setFeedback(null);
        setIsCorrect(null);
      }, 3000);
    },
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading exercises...</div>;
  }

  if (!data || data.exercises.length === 0) {
    return (
      <div className="card p-8 text-center">
        <h3 className="text-xl font-bold text-gray-600">No Exercises Available</h3>
        <p className="text-gray-500 mt-2">Complete more grammar lessons to unlock exercises.</p>
      </div>
    );
  }

  if (currentExerciseIndex >= data.exercises.length) {
    return (
      <div className="card p-8 text-center">
        <h3 className="text-xl font-bold text-green-600">🎉 All Exercises Complete!</h3>
        <p className="text-gray-700 mt-2">Great work! You've completed all available exercises.</p>
        <button
          onClick={() => {
            setCurrentExerciseIndex(0);
            void queryClient.invalidateQueries({ queryKey: ['grammar-exercises'] });
          }}
          className="btn btn-primary mt-4"
        >
          Practice Again
        </button>
      </div>
    );
  }

  const currentExercise = data.exercises[currentExerciseIndex];

  const handleSubmit = (answer: string | string[]): void => {
    submitMutation.mutate({
      exerciseId: currentExercise.exerciseId,
      answer,
    });
  };

  const renderExercise = (): JSX.Element => {
    const commonProps = {
      exercise: currentExercise,
      onSubmit: (answer: string | string[]) => handleSubmit(answer),
      disabled: submitMutation.isPending || feedback !== null,
    };

    switch (currentExercise.exerciseType) {
      case 'fill_blank':
      case 'transformation':
      case 'error_correction':
        return (
          <FillBlankExercise {...commonProps} onSubmit={(answer: string) => handleSubmit(answer)} />
        );

      case 'multiple_choice':
        return (
          <MultipleChoiceExercise
            {...commonProps}
            onSubmit={(answer: string) => handleSubmit(answer)}
          />
        );

      case 'reorder':
        return (
          <ReorderExercise {...commonProps} onSubmit={(answer: string[]) => handleSubmit(answer)} />
        );

      default:
        return <div>Unknown exercise type</div>;
    }
  };

  return (
    <div className="grammar-exercise-container max-w-3xl mx-auto p-6">
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>
            Exercise {currentExerciseIndex + 1} of {data.exercises.length}
          </span>
          <span>Type: {currentExercise.exerciseType.replace('_', ' ')}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${((currentExerciseIndex + 1) / data.exercises.length) * 100}%` }}
          ></div>
        </div>
      </div>

      <div className="card p-6 mb-4">{renderExercise()}</div>

      {feedback && (
        <div className={`alert ${isCorrect ? 'alert-success' : 'alert-error'} mb-4`}>
          <span>{feedback}</span>
        </div>
      )}
    </div>
  );
}
