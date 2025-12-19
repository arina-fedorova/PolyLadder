# F038: Grammar Practice Exercises

**Feature Code**: F038
**Created**: 2025-12-17
**Phase**: 11 - Grammar Learning
**Status**: Not Started

---

## Description

Implement comprehensive grammar practice exercise system featuring multiple exercise types: fill-in-the-blank (cloze), sentence transformation (e.g., singular→plural, present→past), multiple choice, sentence reordering, and error correction. Each exercise provides immediate feedback with explanations, tracks accuracy, and contributes to SRS scheduling. Exercises are dynamically generated from grammar rules and curated example sentences, ensuring varied practice opportunities. The system integrates with curriculum graph to unlock exercises progressively and marks grammar concepts as mastered upon achieving accuracy thresholds.

## Success Criteria

- [ ] Fill-in-the-blank exercises with context-aware hints
- [ ] Sentence transformation exercises (tense, number, case changes)
- [ ] Multiple choice grammar questions with distractor generation
- [ ] Sentence reordering (scrambled word order practice)
- [ ] Error correction exercises (identify and fix grammatical mistakes)
- [ ] Immediate feedback with detailed explanations
- [ ] Partial credit for close answers (fuzzy matching for accents, spacing)
- [ ] Exercise completion marks grammar concept as practiced (contributes to mastery)
- [ ] Adaptive difficulty (exercises get harder as user improves)
- [ ] Audio support for listening-based grammar exercises

---

## Tasks

### Task 1: Grammar Exercise Data Models and Service

**Implementation Plan**:

Create `packages/api/src/services/grammar/exercise.service.ts`:

```typescript
import { Pool } from 'pg';
import { Language } from '@polyladder/core';

type ExerciseType = 'fill_blank' | 'transformation' | 'multiple_choice' | 'reorder' | 'error_correction';

interface GrammarExercise {
  exerciseId: string;
  grammarRuleId: string;
  exerciseType: ExerciseType;
  difficulty: number; // 1-5
  prompt: string; // Question/instruction
  sentenceText: string; // Original sentence or sentence to modify
  correctAnswer: string | string[]; // Correct answer(s)
  distractors?: string[]; // For multiple choice
  explanation: string; // Why this is correct
  hint: string | null;
  audioUrl: string | null;
}

interface ExerciseSubmission {
  exerciseId: string;
  userAnswer: string | string[];
  isCorrect: boolean;
  feedback: string;
  partialCredit: number; // 0.0 to 1.0
}

export class GrammarExerciseService {
  constructor(private readonly pool: Pool) {}

  /**
   * Get exercises for a specific grammar rule
   */
  async getExercisesForRule(
    grammarRuleId: string,
    userId: string,
    limit: number = 10
  ): Promise<GrammarExercise[]> {
    // Get user's accuracy history for adaptive difficulty
    const userAccuracy = await this.getUserAccuracyForRule(userId, grammarRuleId);

    // Determine difficulty range based on accuracy
    const difficultyRange = this.calculateDifficultyRange(userAccuracy);

    const result = await this.pool.query<GrammarExercise>(
      `SELECT
        id as "exerciseId",
        grammar_rule_id as "grammarRuleId",
        exercise_type as "exerciseType",
        difficulty,
        prompt,
        sentence_text as "sentenceText",
        correct_answer as "correctAnswer",
        distractors,
        explanation,
        hint,
        audio_url as "audioUrl"
       FROM grammar_exercises
       WHERE grammar_rule_id = $1
         AND difficulty BETWEEN $2 AND $3
         AND id NOT IN (
           -- Exclude recently completed exercises (last 24 hours)
           SELECT exercise_id FROM user_exercise_history
           WHERE user_id = $4
             AND completed_at > NOW() - INTERVAL '24 hours'
         )
       ORDER BY RANDOM()
       LIMIT $5`,
      [grammarRuleId, difficultyRange.min, difficultyRange.max, userId, limit]
    );

    return result.rows;
  }

  /**
   * Get mixed exercises across all unlocked grammar rules
   */
  async getMixedExercises(
    userId: string,
    language: Language,
    limit: number = 20
  ): Promise<GrammarExercise[]> {
    const result = await this.pool.query<GrammarExercise>(
      `SELECT
        ge.id as "exerciseId",
        ge.grammar_rule_id as "grammarRuleId",
        ge.exercise_type as "exerciseType",
        ge.difficulty,
        ge.prompt,
        ge.sentence_text as "sentenceText",
        ge.correct_answer as "correctAnswer",
        ge.distractors,
        ge.explanation,
        ge.hint,
        ge.audio_url as "audioUrl"
       FROM grammar_exercises ge
       JOIN approved_grammar_rules agr ON ge.grammar_rule_id = agr.id
       JOIN curriculum_graph cg ON cg.concept_id = CONCAT('grammar_', agr.grammar_category)
       JOIN user_concept_progress ucp ON ucp.concept_id = cg.concept_id AND ucp.language = cg.language
       WHERE agr.language = $1
         AND ucp.user_id = $2
         AND ucp.status IN ('in_progress', 'completed')
       ORDER BY RANDOM()
       LIMIT $3`,
      [language, userId, limit]
    );

    return result.rows;
  }

  /**
   * Validate user's answer and generate feedback
   */
  async validateAnswer(
    exerciseId: string,
    userAnswer: string | string[],
    userId: string
  ): Promise<ExerciseSubmission> {
    // Fetch correct answer
    const exerciseResult = await this.pool.query<{
      correctAnswer: string | string[];
      exerciseType: ExerciseType;
      explanation: string;
      grammarRuleId: string;
    }>(
      `SELECT
        correct_answer as "correctAnswer",
        exercise_type as "exerciseType",
        explanation,
        grammar_rule_id as "grammarRuleId"
       FROM grammar_exercises
       WHERE id = $1`,
      [exerciseId]
    );

    if (exerciseResult.rows.length === 0) {
      throw new Error('Exercise not found');
    }

    const { correctAnswer, exerciseType, explanation, grammarRuleId } = exerciseResult.rows[0];

    // Validate based on exercise type
    const validation = this.performValidation(
      exerciseType,
      userAnswer,
      correctAnswer
    );

    // Record submission
    await this.recordSubmission(
      userId,
      exerciseId,
      grammarRuleId,
      userAnswer,
      validation.isCorrect,
      validation.partialCredit
    );

    return {
      exerciseId,
      userAnswer,
      isCorrect: validation.isCorrect,
      feedback: validation.isCorrect
        ? `✓ Correct! ${explanation}`
        : `✗ Incorrect. ${validation.feedback} Correct answer: ${this.formatAnswer(correctAnswer)}. ${explanation}`,
      partialCredit: validation.partialCredit,
    };
  }

  /**
   * Perform validation based on exercise type
   */
  private performValidation(
    exerciseType: ExerciseType,
    userAnswer: string | string[],
    correctAnswer: string | string[]
  ): { isCorrect: boolean; feedback: string; partialCredit: number } {
    switch (exerciseType) {
      case 'fill_blank':
      case 'transformation':
        return this.validateTextAnswer(userAnswer as string, correctAnswer as string);

      case 'multiple_choice':
        return {
          isCorrect: userAnswer === correctAnswer,
          feedback: userAnswer !== correctAnswer ? 'Try reviewing the grammar rule.' : '',
          partialCredit: userAnswer === correctAnswer ? 1.0 : 0.0,
        };

      case 'reorder':
        return this.validateArrayAnswer(userAnswer as string[], correctAnswer as string[]);

      case 'error_correction':
        return this.validateTextAnswer(userAnswer as string, correctAnswer as string);

      default:
        throw new Error(`Unknown exercise type: ${exerciseType}`);
    }
  }

  /**
   * Validate text answer with fuzzy matching
   */
  private validateTextAnswer(
    userAnswer: string,
    correctAnswer: string
  ): { isCorrect: boolean; feedback: string; partialCredit: number } {
    const normalize = (text: string) =>
      text
        .toLowerCase()
        .trim()
        .replace(/[áàäâ]/g, 'a')
        .replace(/[éèëê]/g, 'e')
        .replace(/[íìïî]/g, 'i')
        .replace(/[óòöô]/g, 'o')
        .replace(/[úùüû]/g, 'u')
        .replace(/\s+/g, ' ');

    const normalizedUser = normalize(userAnswer);
    const normalizedCorrect = normalize(correctAnswer);

    // Exact match
    if (normalizedUser === normalizedCorrect) {
      return { isCorrect: true, feedback: '', partialCredit: 1.0 };
    }

    // Check Levenshtein distance for close answers
    const distance = this.levenshteinDistance(normalizedUser, normalizedCorrect);
    const maxLength = Math.max(normalizedUser.length, normalizedCorrect.length);
    const similarity = 1 - distance / maxLength;

    if (similarity >= 0.9) {
      return {
        isCorrect: false,
        feedback: 'Very close! Check your spelling or accents.',
        partialCredit: 0.8,
      };
    } else if (similarity >= 0.7) {
      return {
        isCorrect: false,
        feedback: 'Partially correct, but there are some errors.',
        partialCredit: 0.5,
      };
    }

    return {
      isCorrect: false,
      feedback: 'Not quite right.',
      partialCredit: 0.0,
    };
  }

  /**
   * Validate array answer (for reordering exercises)
   */
  private validateArrayAnswer(
    userAnswer: string[],
    correctAnswer: string[]
  ): { isCorrect: boolean; feedback: string; partialCredit: number } {
    if (userAnswer.length !== correctAnswer.length) {
      return {
        isCorrect: false,
        feedback: 'Incorrect number of words.',
        partialCredit: 0.0,
      };
    }

    const exactMatch = userAnswer.every((word, idx) => word === correctAnswer[idx]);

    if (exactMatch) {
      return { isCorrect: true, feedback: '', partialCredit: 1.0 };
    }

    // Count correct positions
    const correctPositions = userAnswer.filter((word, idx) => word === correctAnswer[idx]).length;
    const partialCredit = correctPositions / correctAnswer.length;

    return {
      isCorrect: false,
      feedback: `${correctPositions} out of ${correctAnswer.length} words in correct position.`,
      partialCredit: partialCredit > 0.5 ? partialCredit : 0.0,
    };
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Record exercise submission
   */
  private async recordSubmission(
    userId: string,
    exerciseId: string,
    grammarRuleId: string,
    userAnswer: string | string[],
    isCorrect: boolean,
    partialCredit: number
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_exercise_history (user_id, exercise_id, grammar_rule_id, user_answer, is_correct, partial_credit, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [userId, exerciseId, grammarRuleId, JSON.stringify(userAnswer), isCorrect, partialCredit]
    );
  }

  /**
   * Get user accuracy for adaptive difficulty
   */
  private async getUserAccuracyForRule(userId: string, grammarRuleId: string): Promise<number> {
    const result = await this.pool.query<{ avgAccuracy: number }>(
      `SELECT COALESCE(AVG(CASE WHEN is_correct THEN 1.0 ELSE partial_credit END), 0.5) as "avgAccuracy"
       FROM user_exercise_history
       WHERE user_id = $1 AND grammar_rule_id = $2
         AND completed_at > NOW() - INTERVAL '7 days'`,
      [userId, grammarRuleId]
    );

    return result.rows[0]?.avgAccuracy || 0.5;
  }

  /**
   * Calculate difficulty range based on accuracy
   */
  private calculateDifficultyRange(accuracy: number): { min: number; max: number } {
    if (accuracy >= 0.9) {
      return { min: 4, max: 5 }; // Hard exercises
    } else if (accuracy >= 0.7) {
      return { min: 3, max: 4 }; // Medium-hard
    } else if (accuracy >= 0.5) {
      return { min: 2, max: 3 }; // Medium
    } else {
      return { min: 1, max: 2 }; // Easy exercises
    }
  }

  /**
   * Format answer for display
   */
  private formatAnswer(answer: string | string[]): string {
    if (Array.isArray(answer)) {
      return answer.join(' ');
    }
    return answer;
  }
}
```

**Files Created**:
- `packages/api/src/services/grammar/exercise.service.ts`

**Technical Features**:
- **Adaptive Difficulty**: Exercises adjust based on user's recent accuracy
- **Fuzzy Matching**: Accepts close answers with partial credit (spelling, accents)
- **Levenshtein Distance**: Measures answer similarity for intelligent feedback
- **Exercise Rotation**: Prevents same exercises from appearing within 24 hours

---

### Task 2: API Endpoints for Grammar Exercises

**Implementation Plan**:

Create `packages/api/src/routes/learning/grammar-exercises.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Language } from '@polyladder/core';
import { GrammarExerciseService } from '../../services/grammar/exercise.service';
import { authMiddleware } from '../../middleware/auth';

const ExerciseQuerySchema = z.object({
  grammarRuleId: z.string().uuid().optional(),
  language: z.nativeEnum(Language),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

const SubmitAnswerSchema = z.object({
  exerciseId: z.string().uuid(),
  userAnswer: z.union([z.string(), z.array(z.string())]),
});

export const grammarExerciseRoutes: FastifyPluginAsync = async (fastify) => {
  const exerciseService = new GrammarExerciseService(fastify.pg.pool);

  /**
   * GET /learning/grammar-exercises
   * Get grammar exercises (for specific rule or mixed)
   */
  fastify.get('/learning/grammar-exercises', {
    preHandler: authMiddleware,
    schema: {
      querystring: ExerciseQuerySchema,
    },
  }, async (request, reply) => {
    const { grammarRuleId, language, limit } = ExerciseQuerySchema.parse(request.query);
    const userId = request.user!.userId;

    let exercises;

    if (grammarRuleId) {
      exercises = await exerciseService.getExercisesForRule(grammarRuleId, userId, limit);
    } else {
      exercises = await exerciseService.getMixedExercises(userId, language, limit);
    }

    return reply.status(200).send({ exercises });
  });

  /**
   * POST /learning/grammar-exercises/submit
   * Submit answer and get feedback
   */
  fastify.post('/learning/grammar-exercises/submit', {
    preHandler: authMiddleware,
    schema: {
      body: SubmitAnswerSchema,
    },
  }, async (request, reply) => {
    const { exerciseId, userAnswer } = SubmitAnswerSchema.parse(request.body);
    const userId = request.user!.userId;

    const submission = await exerciseService.validateAnswer(exerciseId, userAnswer, userId);

    return reply.status(200).send({ submission });
  });

  /**
   * GET /learning/grammar-exercises/stats
   * Get user's exercise statistics
   */
  fastify.get('/learning/grammar-exercises/stats', {
    preHandler: authMiddleware,
    schema: {
      querystring: z.object({
        grammarRuleId: z.string().uuid().optional(),
      }),
    },
  }, async (request, reply) => {
    const { grammarRuleId } = request.query as { grammarRuleId?: string };
    const userId = request.user!.userId;

    let query = `
      SELECT
        COUNT(*) as total_exercises,
        SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct_count,
        AVG(CASE WHEN is_correct THEN 1.0 ELSE partial_credit END) as avg_accuracy
      FROM user_exercise_history
      WHERE user_id = $1
    `;

    const params: any[] = [userId];

    if (grammarRuleId) {
      query += ` AND grammar_rule_id = $2`;
      params.push(grammarRuleId);
    }

    const result = await fastify.pg.pool.query(query, params);

    return reply.status(200).send({ stats: result.rows[0] });
  });
};
```

**Files Created**:
- `packages/api/src/routes/learning/grammar-exercises.ts`

**API Summary**:
- `GET /learning/grammar-exercises` - Get exercises (filtered or mixed)
- `POST /learning/grammar-exercises/submit` - Submit answer for validation
- `GET /learning/grammar-exercises/stats` - Get accuracy statistics

---

### Task 3: React Exercise Components

**Implementation Plan**:

Create `packages/web/src/components/exercises/FillBlankExercise.tsx`:

```typescript
import React, { useState } from 'react';

interface FillBlankExerciseProps {
  exercise: {
    exerciseId: string;
    prompt: string;
    sentenceText: string; // Contains "_____" for blank
    hint: string | null;
  };
  onSubmit: (answer: string) => void;
  disabled: boolean;
}

export function FillBlankExercise({ exercise, onSubmit, disabled }: FillBlankExerciseProps) {
  const [answer, setAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
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
          <p className="text-xl font-medium mb-2">
            {exercise.sentenceText.replace('_____', '______')}
          </p>

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
```

Create `packages/web/src/components/exercises/MultipleChoiceExercise.tsx`:

```typescript
import React, { useState } from 'react';

interface MultipleChoiceExerciseProps {
  exercise: {
    exerciseId: string;
    prompt: string;
    sentenceText: string;
    correctAnswer: string;
    distractors: string[];
  };
  onSubmit: (answer: string) => void;
  disabled: boolean;
}

export function MultipleChoiceExercise({ exercise, onSubmit, disabled }: MultipleChoiceExerciseProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

  // Shuffle options
  const options = React.useMemo(() => {
    const allOptions = [exercise.correctAnswer, ...exercise.distractors];
    return allOptions.sort(() => Math.random() - 0.5);
  }, [exercise]);

  const handleSubmit = () => {
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
```

Create `packages/web/src/components/exercises/ReorderExercise.tsx`:

```typescript
import React, { useState } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableWordProps {
  word: string;
  id: string;
}

function SortableWord({ word, id }: SortableWordProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="p-3 bg-white border-2 border-gray-300 rounded cursor-move hover:border-blue-400 transition-colors"
    >
      <span className="text-lg">{word}</span>
    </div>
  );
}

interface ReorderExerciseProps {
  exercise: {
    exerciseId: string;
    prompt: string;
    correctAnswer: string[]; // Words in scrambled order initially
  };
  onSubmit: (answer: string[]) => void;
  disabled: boolean;
}

export function ReorderExercise({ exercise, onSubmit, disabled }: ReorderExerciseProps) {
  // Scramble words initially
  const [words, setWords] = useState(() => {
    const scrambled = [...exercise.correctAnswer];
    return scrambled.sort(() => Math.random() - 0.5);
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setWords((items) => {
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleSubmit = () => {
    onSubmit(words);
  };

  return (
    <div className="reorder-exercise">
      <p className="text-lg mb-4">{exercise.prompt}</p>

      <div className="mb-4 p-4 bg-gray-50 rounded">
        <p className="text-sm text-gray-600 mb-2">Drag words to reorder them:</p>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={words} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {words.map((word) => (
                <SortableWord key={word} id={word} word={word} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <button onClick={handleSubmit} className="btn btn-primary" disabled={disabled}>
        Check Answer
      </button>
    </div>
  );
}
```

Create `packages/web/src/components/exercises/GrammarExerciseContainer.tsx`:

```typescript
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { Language } from '@polyladder/core';
import { FillBlankExercise } from './FillBlankExercise';
import { MultipleChoiceExercise } from './MultipleChoiceExercise';
import { ReorderExercise } from './ReorderExercise';

interface GrammarExerciseContainerProps {
  grammarRuleId?: string;
  language: Language;
}

export function GrammarExerciseContainer({ grammarRuleId, language }: GrammarExerciseContainerProps) {
  const queryClient = useQueryClient();
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['grammar-exercises', grammarRuleId, language],
    queryFn: async () => {
      const url = grammarRuleId
        ? `/learning/grammar-exercises?grammarRuleId=${grammarRuleId}&language=${language}`
        : `/learning/grammar-exercises?language=${language}`;
      const response = await apiClient.get(url);
      return response.data.exercises;
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (payload: { exerciseId: string; userAnswer: string | string[] }) => {
      const response = await apiClient.post('/learning/grammar-exercises/submit', payload);
      return response.data.submission;
    },
    onSuccess: (submission) => {
      setFeedback(submission.feedback);
      setIsCorrect(submission.isCorrect || submission.partialCredit > 0.5);

      // Move to next exercise after delay
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

  if (!data || data.length === 0) {
    return (
      <div className="card p-8 text-center">
        <h3 className="text-xl font-bold text-gray-600">No Exercises Available</h3>
        <p className="text-gray-500 mt-2">Complete more grammar lessons to unlock exercises.</p>
      </div>
    );
  }

  if (currentExerciseIndex >= data.length) {
    return (
      <div className="card p-8 text-center">
        <h3 className="text-xl font-bold text-green-600">🎉 All Exercises Complete!</h3>
        <p className="text-gray-700 mt-2">Great work! You've completed all available exercises.</p>
        <button
          onClick={() => {
            setCurrentExerciseIndex(0);
            queryClient.invalidateQueries({ queryKey: ['grammar-exercises'] });
          }}
          className="btn btn-primary mt-4"
        >
          Practice Again
        </button>
      </div>
    );
  }

  const currentExercise = data[currentExerciseIndex];

  const handleSubmit = (answer: string | string[]) => {
    submitMutation.mutate({
      exerciseId: currentExercise.exerciseId,
      userAnswer: answer,
    });
  };

  const renderExercise = () => {
    switch (currentExercise.exerciseType) {
      case 'fill_blank':
        return (
          <FillBlankExercise
            exercise={currentExercise}
            onSubmit={handleSubmit}
            disabled={submitMutation.isPending || feedback !== null}
          />
        );

      case 'multiple_choice':
        return (
          <MultipleChoiceExercise
            exercise={currentExercise}
            onSubmit={handleSubmit}
            disabled={submitMutation.isPending || feedback !== null}
          />
        );

      case 'reorder':
        return (
          <ReorderExercise
            exercise={currentExercise}
            onSubmit={handleSubmit}
            disabled={submitMutation.isPending || feedback !== null}
          />
        );

      default:
        return <div>Unknown exercise type</div>;
    }
  };

  return (
    <div className="grammar-exercise-container max-w-3xl mx-auto p-6">
      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Exercise {currentExerciseIndex + 1} of {data.length}</span>
          <span>Type: {currentExercise.exerciseType.replace('_', ' ')}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${((currentExerciseIndex + 1) / data.length) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Exercise */}
      <div className="card p-6 mb-4">{renderExercise()}</div>

      {/* Feedback */}
      {feedback && (
        <div className={`alert ${isCorrect ? 'alert-success' : 'alert-error'} mb-4`}>
          <span>{feedback}</span>
        </div>
      )}
    </div>
  );
}
```

**Files Created**:
- `packages/web/src/components/exercises/FillBlankExercise.tsx`
- `packages/web/src/components/exercises/MultipleChoiceExercise.tsx`
- `packages/web/src/components/exercises/ReorderExercise.tsx`
- `packages/web/src/components/exercises/GrammarExerciseContainer.tsx`

**UI Features**:
- Drag-and-drop reordering with `@dnd-kit`
- Progress bar showing completion
- Immediate feedback with color-coded alerts
- Auto-advance after 3 seconds
- Hint system for difficult exercises

---

### Task 4: Database Migration for Exercise Tables

**Implementation Plan**:

Create `packages/db/migrations/019-grammar-exercises.sql`:

```sql
-- Grammar exercises
CREATE TABLE grammar_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grammar_rule_id UUID NOT NULL REFERENCES approved_grammar_rules(id) ON DELETE CASCADE,
  exercise_type VARCHAR(50) NOT NULL CHECK (exercise_type IN ('fill_blank', 'transformation', 'multiple_choice', 'reorder', 'error_correction')),
  difficulty INT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  prompt TEXT NOT NULL, -- Exercise instruction
  sentence_text TEXT NOT NULL, -- Sentence with blank or to transform
  correct_answer JSONB NOT NULL, -- String or array of strings
  distractors JSONB DEFAULT '[]'::jsonb, -- For multiple choice
  explanation TEXT NOT NULL, -- Why this answer is correct
  hint TEXT,
  audio_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_grammar_exercises_rule ON grammar_exercises(grammar_rule_id);
CREATE INDEX idx_grammar_exercises_type ON grammar_exercises(exercise_type);
CREATE INDEX idx_grammar_exercises_difficulty ON grammar_exercises(difficulty);

-- User exercise history
CREATE TABLE user_exercise_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES grammar_exercises(id) ON DELETE CASCADE,
  grammar_rule_id UUID NOT NULL REFERENCES approved_grammar_rules(id) ON DELETE CASCADE,
  user_answer JSONB NOT NULL,
  is_correct BOOLEAN NOT NULL,
  partial_credit DECIMAL(3, 2) NOT NULL CHECK (partial_credit BETWEEN 0 AND 1),
  completed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_exercise_history_user ON user_exercise_history(user_id);
CREATE INDEX idx_user_exercise_history_rule ON user_exercise_history(grammar_rule_id);
CREATE INDEX idx_user_exercise_history_completed ON user_exercise_history(completed_at);

-- View: Recent exercise performance
CREATE VIEW user_exercise_performance AS
SELECT
  user_id,
  grammar_rule_id,
  COUNT(*) as total_attempts,
  SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct_attempts,
  AVG(CASE WHEN is_correct THEN 1.0 ELSE partial_credit END) as avg_accuracy,
  MAX(completed_at) as last_attempt_at
FROM user_exercise_history
WHERE completed_at > NOW() - INTERVAL '30 days'
GROUP BY user_id, grammar_rule_id;
```

**Files Created**:
- `packages/db/migrations/019-grammar-exercises.sql`

**Database Schema**:
- `grammar_exercises` - Exercise definitions
- `user_exercise_history` - All submissions with partial credit tracking
- `user_exercise_performance` - Aggregated statistics view

---

### Task 5: Integration with SRS and Curriculum Progress

**Implementation Plan**:

Create `packages/api/src/services/grammar/mastery-tracker.service.ts`:

```typescript
import { Pool } from 'pg';
import { Language } from '@polyladder/core';

const MASTERY_THRESHOLD = 0.8; // 80% accuracy required
const MIN_EXERCISES = 5; // Minimum exercises to complete

export class GrammarMasteryTrackerService {
  constructor(private readonly pool: Pool) {}

  /**
   * Check if user has mastered a grammar rule
   * Mastery = 80%+ accuracy on 5+ exercises in last 7 days
   */
  async checkMastery(userId: string, grammarRuleId: string): Promise<boolean> {
    const result = await this.pool.query<{
      totalExercises: number;
      avgAccuracy: number;
    }>(
      `SELECT
        COUNT(*) as "totalExercises",
        AVG(CASE WHEN is_correct THEN 1.0 ELSE partial_credit END) as "avgAccuracy"
       FROM user_exercise_history
       WHERE user_id = $1
         AND grammar_rule_id = $2
         AND completed_at > NOW() - INTERVAL '7 days'`,
      [userId, grammarRuleId]
    );

    const { totalExercises, avgAccuracy } = result.rows[0];

    return totalExercises >= MIN_EXERCISES && avgAccuracy >= MASTERY_THRESHOLD;
  }

  /**
   * Update curriculum progress if grammar rule mastered
   */
  async updateCurriculumProgress(
    userId: string,
    grammarRuleId: string,
    language: Language
  ): Promise<void> {
    const hasMastery = await this.checkMastery(userId, grammarRuleId);

    if (hasMastery) {
      // Get grammar category for curriculum concept
      const categoryResult = await this.pool.query<{ grammarCategory: string }>(
        `SELECT grammar_category as "grammarCategory"
         FROM approved_grammar_rules
         WHERE id = $1`,
        [grammarRuleId]
      );

      if (categoryResult.rows.length === 0) return;

      const conceptId = `grammar_${categoryResult.rows[0].grammarCategory}`;

      // Mark concept as completed
      await this.pool.query(
        `UPDATE user_concept_progress
         SET status = 'completed',
             completed_at = NOW(),
             progress_percentage = 100
         WHERE user_id = $1 AND concept_id = $2 AND language = $3`,
        [userId, conceptId, language]
      );
    }
  }
}
```

**Files Created**:
- `packages/api/src/services/grammar/mastery-tracker.service.ts`

**Mastery Logic**:
- Requires 5+ exercises completed with 80%+ average accuracy
- Automatically updates curriculum graph when mastered
- Unlocks dependent grammar concepts

---

## Dependencies

- **Blocks**: F039-F045 (other practice modes use similar patterns)
- **Depends on**:
  - F001 (Database Schema)
  - F018 (API Infrastructure)
  - F022 (React Application Setup)
  - F032 (Curriculum Graph)
  - F037 (Grammar Lesson Structure)

---

## Open Questions

### Question 1: Automatic Distractor Generation

**Context**: For multiple choice exercises, should distractors be manually curated or auto-generated?

**Options**:
1. **Manual Curation** (Content operators write distractors)
   - Pros: High quality, pedagogically sound
   - Cons: Labor-intensive, limited scale
2. **Auto-Generated** (Algorithm creates distractors from common errors)
   - Pros: Scalable, unlimited exercises
   - Cons: May generate nonsensical options
3. **Hybrid** (Auto-generate, then human review)
   - Pros: Balances quality and scale
   - Cons: Still requires human effort
4. **Community-Driven** (Learners submit distractors)
   - Pros: Crowd-sourced, reflects real mistakes
   - Cons: Quality control challenges

**Current Decision**: Option 1 (manual curation) for MVP. Explore Option 3 (hybrid) post-launch.

**Impact**: Medium - affects exercise variety but not core functionality.

---

### Question 2: Partial Credit Thresholds

**Context**: What similarity thresholds should grant partial credit for text answers?

**Options**:
1. **Strict** (90%+ similarity = 0.8 credit, 70%+ = 0.5 credit)
   - Pros: Encourages precision
   - Cons: Frustrating for accents/spelling errors
2. **Lenient** (80%+ similarity = 0.8 credit, 60%+ = 0.5 credit)
   - Pros: Forgiving, motivating
   - Cons: May accept incorrect grammar
3. **Language-Specific** (Different thresholds per language)
   - Pros: Accounts for language complexity
   - Cons: Complex configuration
4. **Adaptive** (Learn from user corrections)
   - Pros: Improves over time
   - Cons: Requires ML, complex

**Current Decision**: Option 1 (strict) for MVP. Can adjust based on user feedback.

**Impact**: Low - affects user satisfaction but can be tuned post-launch.

---

### Question 3: Exercise Difficulty Progression Speed

**Context**: How quickly should exercises increase in difficulty as user improves?

**Options**:
1. **Immediate** (Jump to harder exercises after 3 correct)
   - Pros: Fast-paced, efficient
   - Cons: May overwhelm learners
2. **Gradual** (Increase difficulty every 10 exercises)
   - Pros: Smooth progression
   - Cons: May bore advanced learners
3. **Accuracy-Based** (90%+ accuracy = harder, <70% = easier)
   - Pros: Adaptive to individual pace
   - Cons: May oscillate difficulty too much
4. **User-Controlled** (Learner chooses difficulty)
   - Pros: Maximum autonomy
   - Cons: Learners may choose too easy/hard

**Current Decision**: Option 3 (accuracy-based adaptive) as implemented. Provides personalized pacing.

**Impact**: Medium - affects learning effectiveness. Current implementation is flexible.

---

## Notes

- **Exercise Types**: 5 types implemented (fill_blank, transformation, multiple_choice, reorder, error_correction)
- **Fuzzy Matching**: Levenshtein distance algorithm accepts close answers with partial credit
- **Adaptive Difficulty**: Exercises adjust based on 7-day rolling accuracy window
- **Exercise Rotation**: Prevents same exercise from repeating within 24 hours
- **Mastery Tracking**: 5+ exercises with 80%+ accuracy triggers curriculum completion
- **Partial Credit**: Ranges from 0.0 to 1.0, affects SRS scheduling
- **Audio Support**: Optional audio URLs for listening comprehension exercises
- **Hint System**: Progressive hints available (can reveal hints without penalty)
- **Drag-and-Drop**: Uses `@dnd-kit` library for reordering exercises
- **Progress Visualization**: Progress bar shows completion percentage
- **Immediate Feedback**: Feedback displayed instantly after submission
- **Future Enhancement**: Add timed exercises (speed practice mode)
- **Future Enhancement**: Add collaborative exercises (peer correction)
- **Future Enhancement**: Add AI-generated distractors using GPT-4
