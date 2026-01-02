import { Pool } from 'pg';

/**
 * Quality rating for SM-2 algorithm (0-5 scale)
 * 0: Complete blackout
 * 1: Incorrect, but remembered upon seeing answer
 * 2: Incorrect, but seemed easy to recall
 * 3: Correct with serious difficulty
 * 4: Correct after hesitation
 * 5: Perfect recall
 */
export type QualityRating = 0 | 1 | 2 | 3 | 4 | 5;

export interface SRSItem {
  id: string;
  userId: string;
  meaningId: string;
  language: string;
  interval: number;
  repetitions: number;
  easeFactor: number;
  nextReviewAt: string;
  lastReviewedAt: string | null;
}

export interface DueWord {
  meaningId: string;
  word: string;
  cefrLevel: string;
  lastReviewedAt: string | null;
  nextReviewAt: string;
}

export interface ReviewResult {
  meaningId: string;
  quality: QualityRating;
  userAnswer: string;
  isCorrect: boolean;
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
 * RecallPracticeService implements SM-2 spaced repetition algorithm
 * for vocabulary recall practice.
 */
export class RecallPracticeService {
  private readonly MIN_EASE_FACTOR = 1.3;
  private readonly INITIAL_EASE_FACTOR = 2.5;

  constructor(private readonly pool: Pool) {}

  /**
   * Get words due for review
   */
  async getDueWords(userId: string, language: string, limit: number = 20): Promise<DueWord[]> {
    interface DueWordRow {
      meaning_id: string;
      word_text: string;
      level: string;
      last_reviewed_at: Date | null;
      next_review_at: Date;
    }

    const result = await this.pool.query<DueWordRow>(
      `SELECT DISTINCT ON (usi.meaning_id)
        usi.meaning_id,
        au.text as word_text,
        am.level,
        usi.last_reviewed_at,
        usi.next_review_at
       FROM user_srs_items usi
       JOIN approved_meanings am ON usi.meaning_id = am.id
       LEFT JOIN approved_utterances au ON au.meaning_id = am.id
       WHERE usi.user_id = $1
         AND usi.language = $2
         AND usi.next_review_at <= current_timestamp
       ORDER BY usi.meaning_id, usi.next_review_at ASC
       LIMIT $3`,
      [userId, language, limit]
    );

    return result.rows.map((row) => ({
      meaningId: row.meaning_id,
      word: row.word_text,
      cefrLevel: row.level,
      lastReviewedAt: row.last_reviewed_at?.toISOString() ?? null,
      nextReviewAt: row.next_review_at.toISOString(),
    }));
  }

  /**
   * Get words in learning state (unknown → learning from word state)
   * and add them to SRS system if not already present
   */
  async initializeLearningWords(userId: string, language: string): Promise<number> {
    // Get words marked as "learning" but not yet in SRS
    const result = await this.pool.query<{ meaning_id: string }>(
      `SELECT uws.meaning_id
       FROM user_word_state uws
       WHERE uws.user_id = $1
         AND uws.language = $2
         AND uws.state = 'learning'
         AND NOT EXISTS (
           SELECT 1 FROM user_srs_items usi
           WHERE usi.user_id = uws.user_id
             AND usi.meaning_id = uws.meaning_id
         )`,
      [userId, language]
    );

    if (result.rows.length === 0) {
      return 0;
    }

    // Bulk insert new SRS items
    const values = result.rows
      .map((_, idx) => {
        const baseIdx = idx * 3;
        return `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, 0, 0, ${this.INITIAL_EASE_FACTOR}, current_timestamp)`;
      })
      .join(', ');

    const params: string[] = [];
    result.rows.forEach((row) => {
      params.push(userId, row.meaning_id, language);
    });

    const insertResult = await this.pool.query(
      `INSERT INTO user_srs_items
       (user_id, meaning_id, language, interval, repetitions, ease_factor, next_review_at)
       VALUES ${values}
       ON CONFLICT (user_id, meaning_id) DO NOTHING
       RETURNING id`,
      params
    );

    return insertResult.rowCount || 0;
  }

  /**
   * Submit review results and update SRS scheduling using SM-2 algorithm
   */
  async submitReview(userId: string, meaningId: string, quality: QualityRating): Promise<SRSItem> {
    // Get current SRS item
    const currentResult = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM user_srs_items
       WHERE user_id = $1 AND meaning_id = $2`,
      [userId, meaningId]
    );

    if (currentResult.rows.length === 0) {
      throw new NotFoundError('SRS item not found');
    }

    const current = currentResult.rows[0];
    const currentEaseFactor = current.ease_factor as number;
    const currentRepetitions = current.repetitions as number;
    const currentInterval = current.interval as number;

    // Apply SM-2 algorithm
    const { easeFactor, repetitions, interval } = this.calculateSM2(
      quality,
      currentEaseFactor,
      currentRepetitions,
      currentInterval
    );

    // Calculate next review date
    const nextReviewAt = this.calculateNextReviewDate(interval);

    // Update SRS item
    const updateResult = await this.pool.query<Record<string, unknown>>(
      `UPDATE user_srs_items
       SET ease_factor = $1,
           repetitions = $2,
           interval = $3,
           next_review_at = $4,
           last_reviewed_at = current_timestamp
       WHERE user_id = $5 AND meaning_id = $6
       RETURNING *`,
      [easeFactor, repetitions, interval, nextReviewAt, userId, meaningId]
    );

    return this.mapRowToSRSItem(updateResult.rows[0]);
  }

  /**
   * Get SRS statistics for a user and language
   */
  async getStats(userId: string, language: string) {
    interface StatsRow {
      total_items: string;
      due_now: string;
      due_today: string;
      learned: string;
    }

    const result = await this.pool.query<StatsRow>(
      `SELECT
        COUNT(*) as total_items,
        COUNT(*) FILTER (WHERE next_review_at <= current_timestamp) as due_now,
        COUNT(*) FILTER (WHERE next_review_at <= current_timestamp + interval '1 day') as due_today,
        COUNT(*) FILTER (WHERE repetitions >= 1) as learned
       FROM user_srs_items
       WHERE user_id = $1 AND language = $2`,
      [userId, language]
    );

    const row = result.rows[0];

    return {
      totalItems: parseInt(row.total_items, 10),
      dueNow: parseInt(row.due_now, 10),
      dueToday: parseInt(row.due_today, 10),
      learned: parseInt(row.learned, 10),
    };
  }

  /**
   * SM-2 algorithm implementation
   * Based on SuperMemo 2 algorithm
   */
  private calculateSM2(
    quality: QualityRating,
    easeFactor: number,
    repetitions: number,
    interval: number
  ): { easeFactor: number; repetitions: number; interval: number } {
    // Update ease factor based on quality
    let newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

    // Ensure ease factor doesn't go below minimum
    if (newEaseFactor < this.MIN_EASE_FACTOR) {
      newEaseFactor = this.MIN_EASE_FACTOR;
    }

    let newRepetitions: number;
    let newInterval: number;

    // If quality < 3, reset repetitions and interval
    if (quality < 3) {
      newRepetitions = 0;
      newInterval = 1; // Review again in 1 day
    } else {
      newRepetitions = repetitions + 1;

      // Calculate new interval based on repetition number
      if (newRepetitions === 1) {
        newInterval = 1; // First successful review: 1 day
      } else if (newRepetitions === 2) {
        newInterval = 6; // Second successful review: 6 days
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
   * Calculate next review date based on interval (in days)
   */
  private calculateNextReviewDate(intervalDays: number): Date {
    const now = new Date();
    now.setDate(now.getDate() + intervalDays);
    return now;
  }

  /**
   * Map database row to SRSItem
   */
  private mapRowToSRSItem(row: Record<string, unknown>): SRSItem {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      meaningId: row.meaning_id as string,
      language: row.language as string,
      interval: row.interval as number,
      repetitions: row.repetitions as number,
      easeFactor: row.ease_factor as number,
      nextReviewAt: (row.next_review_at as Date).toISOString(),
      lastReviewedAt: (row.last_reviewed_at as Date | null)?.toISOString() ?? null,
    };
  }
}
