import { Pool } from 'pg';
import { DistractorGenerationService } from './distractor.service';

/**
 * Recognition question types
 */
export type RecognitionQuestionType = 'word_to_definition' | 'definition_to_word';

/**
 * A single recognition question for multiple choice practice
 */
export interface RecognitionQuestion {
  questionId: string;
  questionType: RecognitionQuestionType;
  meaningId: string;
  prompt: string;
  correctAnswer: string;
  options: string[];
  correctIndex: number;
  audioUrl: string | null;
  cefrLevel: string;
}

/**
 * Result of submitting a recognition answer
 */
export interface RecognitionResult {
  isCorrect: boolean;
  correctAnswer: string;
  explanation: string;
  nextReviewAt: string;
  interval: number;
}

class NotFoundError extends Error {
  statusCode: number;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

/**
 * RecognitionPracticeService generates multiple-choice questions
 * for vocabulary recognition practice using SRS scheduling.
 */
export class RecognitionPracticeService {
  private readonly distractorService: DistractorGenerationService;
  private readonly MIN_EASE_FACTOR = 1.3;

  constructor(private readonly pool: Pool) {
    this.distractorService = new DistractorGenerationService(pool);
  }

  /**
   * Get recognition questions from SRS items due for review
   */
  async getRecognitionQuestions(
    userId: string,
    language: string,
    limit: number = 10
  ): Promise<RecognitionQuestion[]> {
    interface DueItemRow {
      meaning_id: string;
      word_text: string;
      definition: string | null;
      audio_url: string | null;
      level: string;
    }

    // Get SRS items due for review with their utterances
    const dueItemsResult = await this.pool.query<DueItemRow>(
      `SELECT DISTINCT ON (usi.meaning_id)
         usi.meaning_id,
         au.text as word_text,
         au.usage_notes as definition,
         au.audio_url,
         am.level
       FROM user_srs_items usi
       JOIN approved_meanings am ON usi.meaning_id = am.id
       LEFT JOIN approved_utterances au ON au.meaning_id = am.id AND au.language = $2
       WHERE usi.user_id = $1
         AND usi.language = $2
         AND usi.next_review_at <= current_timestamp
         AND au.text IS NOT NULL
       ORDER BY usi.meaning_id, usi.next_review_at ASC
       LIMIT $3`,
      [userId, language, limit]
    );

    if (dueItemsResult.rows.length === 0) {
      return [];
    }

    const questions: RecognitionQuestion[] = [];

    for (const item of dueItemsResult.rows) {
      // Alternate between word_to_definition and definition_to_word
      const questionType: RecognitionQuestionType =
        Math.random() < 0.5 ? 'word_to_definition' : 'definition_to_word';

      const question = await this.generateQuestion(item, language, questionType);
      if (question) {
        questions.push(question);
      }
    }

    return questions;
  }

  /**
   * Generate a single recognition question
   */
  private async generateQuestion(
    item: {
      meaning_id: string;
      word_text: string;
      definition: string | null;
      audio_url: string | null;
      level: string;
    },
    language: string,
    questionType: RecognitionQuestionType
  ): Promise<RecognitionQuestion | null> {
    const definition = item.definition || `Meaning of: ${item.word_text}`;

    let prompt: string;
    let correctAnswer: string;
    let distractors: string[];

    if (questionType === 'word_to_definition') {
      // Show word, ask for definition
      prompt = `What is the meaning of "${item.word_text}"?`;
      correctAnswer = definition;
      distractors = await this.distractorService.generateDefinitionDistractors(
        item.meaning_id,
        language,
        3
      );
    } else {
      // Show definition, ask for word
      prompt = `Which word means: "${definition}"?`;
      correctAnswer = item.word_text;
      distractors = await this.distractorService.generateWordDistractors(
        item.meaning_id,
        language,
        3
      );
    }

    // Ensure we have enough distractors
    if (distractors.length < 3) {
      // Fill with placeholder distractors if needed
      while (distractors.length < 3) {
        distractors.push(`Option ${distractors.length + 2}`);
      }
    }

    // Create options array and shuffle
    const allOptions = [correctAnswer, ...distractors.slice(0, 3)];
    const shuffledOptions = this.shuffleArray(allOptions);
    const correctIndex = shuffledOptions.indexOf(correctAnswer);

    return {
      questionId: `rec_${item.meaning_id}_${Date.now()}`,
      questionType,
      meaningId: item.meaning_id,
      prompt,
      correctAnswer,
      options: shuffledOptions,
      correctIndex,
      audioUrl: item.audio_url,
      cefrLevel: item.level,
    };
  }

  /**
   * Submit an answer and update SRS scheduling
   */
  async submitAnswer(
    userId: string,
    meaningId: string,
    selectedIndex: number,
    correctIndex: number,
    _timeToAnswerMs: number // Reserved for future adaptive difficulty
  ): Promise<RecognitionResult> {
    const isCorrect = selectedIndex === correctIndex;

    // Get current SRS item
    interface SRSItemRow {
      ease_factor: number;
      repetitions: number;
      interval: number;
    }

    const srsResult = await this.pool.query<SRSItemRow>(
      `SELECT ease_factor, repetitions, interval
       FROM user_srs_items
       WHERE user_id = $1 AND meaning_id = $2`,
      [userId, meaningId]
    );

    if (srsResult.rows.length === 0) {
      throw new NotFoundError('SRS item not found');
    }

    const currentItem = srsResult.rows[0];

    // Calculate quality rating based on correctness and time
    // Recognition is easier than recall, so we use a simpler quality mapping:
    // - Correct: quality 4 (good)
    // - Incorrect: quality 1 (again)
    const quality = isCorrect ? 4 : 1;

    // Apply SM-2 algorithm
    const { easeFactor, repetitions, interval } = this.calculateSM2(
      quality,
      currentItem.ease_factor,
      currentItem.repetitions,
      currentItem.interval
    );

    // Calculate next review date
    const nextReviewAt = new Date();
    nextReviewAt.setDate(nextReviewAt.getDate() + interval);

    // Update SRS item
    await this.pool.query(
      `UPDATE user_srs_items
       SET ease_factor = $1,
           repetitions = $2,
           interval = $3,
           next_review_at = $4,
           last_reviewed_at = current_timestamp
       WHERE user_id = $5 AND meaning_id = $6`,
      [easeFactor, repetitions, interval, nextReviewAt, userId, meaningId]
    );

    // Get correct answer for response
    interface UtteranceRow {
      text: string;
      usage_notes: string | null;
    }

    const utteranceResult = await this.pool.query<UtteranceRow>(
      `SELECT text, usage_notes FROM approved_utterances
       WHERE meaning_id = $1
       LIMIT 1`,
      [meaningId]
    );

    const correctAnswer = utteranceResult.rows[0]?.text || 'Unknown';
    const explanation = isCorrect
      ? 'Correct! Well done.'
      : `The correct answer was: ${correctAnswer}`;

    return {
      isCorrect,
      correctAnswer,
      explanation,
      nextReviewAt: nextReviewAt.toISOString(),
      interval,
    };
  }

  /**
   * Get recognition practice statistics
   */
  async getStats(userId: string, language: string) {
    interface StatsRow {
      total_items: string;
      due_now: string;
      mastered: string;
    }

    const result = await this.pool.query<StatsRow>(
      `SELECT
        COUNT(*) as total_items,
        COUNT(*) FILTER (WHERE next_review_at <= current_timestamp) as due_now,
        COUNT(*) FILTER (WHERE repetitions >= 5) as mastered
       FROM user_srs_items
       WHERE user_id = $1 AND language = $2`,
      [userId, language]
    );

    const row = result.rows[0];

    return {
      totalItems: parseInt(row.total_items, 10),
      dueNow: parseInt(row.due_now, 10),
      mastered: parseInt(row.mastered, 10),
    };
  }

  /**
   * SM-2 algorithm implementation (same as recall)
   */
  private calculateSM2(
    quality: number,
    easeFactor: number,
    repetitions: number,
    interval: number
  ): { easeFactor: number; repetitions: number; interval: number } {
    // Update ease factor based on quality
    let newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

    if (newEaseFactor < this.MIN_EASE_FACTOR) {
      newEaseFactor = this.MIN_EASE_FACTOR;
    }

    let newRepetitions: number;
    let newInterval: number;

    if (quality < 3) {
      // Failed review: reset
      newRepetitions = 0;
      newInterval = 1;
    } else {
      newRepetitions = repetitions + 1;

      if (newRepetitions === 1) {
        newInterval = 1;
      } else if (newRepetitions === 2) {
        newInterval = 6;
      } else {
        newInterval = Math.round(interval * newEaseFactor);
      }
    }

    return {
      easeFactor: newEaseFactor,
      repetitions: newRepetitions,
      interval: newInterval,
    };
  }

  /**
   * Fisher-Yates shuffle algorithm
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
