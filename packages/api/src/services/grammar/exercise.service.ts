import { Pool } from 'pg';

class NotFoundError extends Error {
  statusCode: number;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

export type ExerciseType =
  | 'fill_blank'
  | 'transformation'
  | 'multiple_choice'
  | 'reorder'
  | 'error_correction';

export interface GrammarExercise {
  exerciseId: string;
  grammarRuleId: string;
  exerciseType: ExerciseType;
  difficulty: number; // 1-5
  prompt: string;
  sentenceText: string;
  correctAnswer: string | string[];
  distractors?: string[];
  explanation: string;
  hint: string | null;
  audioUrl: string | null;
}

export interface ExerciseSubmission {
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

    interface ExerciseRow {
      exercise_id: string;
      grammar_rule_id: string;
      exercise_type: ExerciseType;
      difficulty: number;
      prompt: string;
      sentence_text: string;
      correct_answer: string | string[];
      distractors: string[] | null;
      explanation: string;
      hint: string | null;
      audio_url: string | null;
    }

    const result = await this.pool.query<ExerciseRow>(
      `SELECT
        id as exercise_id,
        grammar_rule_id,
        exercise_type,
        difficulty,
        prompt,
        sentence_text,
        correct_answer,
        distractors,
        explanation,
        hint,
        audio_url
       FROM grammar_exercises
       WHERE grammar_rule_id = $1
         AND difficulty BETWEEN $2 AND $3
         AND id NOT IN (
           -- Exclude recently completed exercises (last 24 hours)
           SELECT exercise_id FROM user_exercise_results
           WHERE user_id = $4
             AND submitted_at > NOW() - INTERVAL '24 hours'
             AND exercise_id IN (SELECT id FROM grammar_exercises WHERE grammar_rule_id = $1)
         )
       ORDER BY RANDOM()
       LIMIT $5`,
      [grammarRuleId, difficultyRange.min, difficultyRange.max, userId, limit]
    );

    return result.rows.map((row) => ({
      exerciseId: row.exercise_id,
      grammarRuleId: row.grammar_rule_id,
      exerciseType: row.exercise_type,
      difficulty: row.difficulty,
      prompt: row.prompt,
      sentenceText: row.sentence_text,
      correctAnswer: row.correct_answer,
      distractors: row.distractors || undefined,
      explanation: row.explanation,
      hint: row.hint,
      audioUrl: row.audio_url,
    }));
  }

  /**
   * Get mixed exercises across all unlocked grammar rules
   */
  async getMixedExercises(
    userId: string,
    language: string,
    limit: number = 20
  ): Promise<GrammarExercise[]> {
    interface ExerciseRow {
      exercise_id: string;
      grammar_rule_id: string;
      exercise_type: ExerciseType;
      difficulty: number;
      prompt: string;
      sentence_text: string;
      correct_answer: string | string[];
      distractors: string[] | null;
      explanation: string;
      hint: string | null;
      audio_url: string | null;
    }

    const result = await this.pool.query<ExerciseRow>(
      `SELECT
        ge.id as exercise_id,
        ge.grammar_rule_id,
        ge.exercise_type,
        ge.difficulty,
        ge.prompt,
        ge.sentence_text,
        ge.correct_answer,
        ge.distractors,
        ge.explanation,
        ge.hint,
        ge.audio_url
       FROM grammar_exercises ge
       JOIN approved_rules ar ON ge.grammar_rule_id = ar.id
       JOIN curriculum_graph cg ON cg.concept_id = CONCAT('grammar_', ar.category) AND cg.language = ar.language
       JOIN user_concept_progress ucp ON ucp.concept_id = cg.concept_id AND ucp.language = cg.language
       WHERE ar.language = $1
         AND ucp.user_id = $2
         AND ucp.status IN ('in_progress', 'completed')
       ORDER BY RANDOM()
       LIMIT $3`,
      [language, userId, limit]
    );

    return result.rows.map((row) => ({
      exerciseId: row.exercise_id,
      grammarRuleId: row.grammar_rule_id,
      exerciseType: row.exercise_type,
      difficulty: row.difficulty,
      prompt: row.prompt,
      sentenceText: row.sentence_text,
      correctAnswer: row.correct_answer,
      distractors: row.distractors || undefined,
      explanation: row.explanation,
      hint: row.hint,
      audioUrl: row.audio_url,
    }));
  }

  /**
   * Validate user's answer and generate feedback
   */
  async validateAnswer(
    exerciseId: string,
    userAnswer: string | string[],
    userId: string
  ): Promise<ExerciseSubmission> {
    interface ExerciseDataRow {
      correct_answer: string | string[];
      exercise_type: ExerciseType;
      explanation: string;
      grammar_rule_id: string;
    }

    // Fetch correct answer
    const exerciseResult = await this.pool.query<ExerciseDataRow>(
      `SELECT
        correct_answer,
        exercise_type,
        explanation,
        grammar_rule_id
       FROM grammar_exercises
       WHERE id = $1`,
      [exerciseId]
    );

    if (exerciseResult.rows.length === 0) {
      throw new NotFoundError('Exercise not found');
    }

    const { correct_answer, exercise_type, explanation, grammar_rule_id } = exerciseResult.rows[0];

    // Validate based on exercise type
    const validation = this.performValidation(exercise_type, userAnswer, correct_answer);

    // Record submission
    await this.recordSubmission(
      userId,
      exerciseId,
      grammar_rule_id,
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
        : `✗ Incorrect. ${validation.feedback} Correct answer: ${this.formatAnswer(correct_answer)}. ${explanation}`,
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
      case 'error_correction':
        return this.validateTextAnswer(userAnswer as string, correctAnswer as string);

      case 'multiple_choice':
        return {
          isCorrect: userAnswer === correctAnswer,
          feedback: userAnswer !== correctAnswer ? 'Try reviewing the grammar rule.' : '',
          partialCredit: userAnswer === correctAnswer ? 1.0 : 0.0,
        };

      case 'reorder':
        return this.validateArrayAnswer(userAnswer as string[], correctAnswer as string[]);

      default: {
        const exhaustiveCheck: never = exerciseType;
        throw new Error(`Unknown exercise type: ${String(exhaustiveCheck)}`);
      }
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
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
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
    // Store in user_exercise_results with metadata
    await this.pool.query(
      `INSERT INTO user_exercise_results (user_id, exercise_id, language, exercise_type, correct, user_answer, submitted_at)
       VALUES ($1, $2, (SELECT language FROM approved_rules WHERE id = $3), 'grammar', $4, $5, NOW())`,
      [
        userId,
        exerciseId,
        grammarRuleId,
        isCorrect,
        JSON.stringify({ answer: userAnswer, partialCredit }),
      ]
    );
  }

  /**
   * Get user accuracy for adaptive difficulty
   */
  private async getUserAccuracyForRule(userId: string, grammarRuleId: string): Promise<number> {
    interface AccuracyRow {
      avg_accuracy: number | null;
    }

    const result = await this.pool.query<AccuracyRow>(
      `SELECT
        COALESCE(AVG(CASE
          WHEN uer.correct THEN 1.0
          ELSE COALESCE((uer.user_answer::jsonb->>'partialCredit')::decimal, 0.0)
        END), 0.5) as avg_accuracy
       FROM user_exercise_results uer
       JOIN grammar_exercises ge ON uer.exercise_id = ge.id
       WHERE uer.user_id = $1
         AND ge.grammar_rule_id = $2
         AND uer.submitted_at > NOW() - INTERVAL '7 days'
         AND uer.exercise_type = 'grammar'`,
      [userId, grammarRuleId]
    );

    return result.rows[0]?.avg_accuracy || 0.5;
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
