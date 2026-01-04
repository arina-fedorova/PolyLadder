import { Pool } from 'pg';

/**
 * Self-assessment rating for pronunciation
 */
export type SelfRating = 'again' | 'hard' | 'good' | 'easy';

/**
 * A single production exercise
 */
export interface ProductionExercise {
  exerciseId: string;
  text: string;
  audioUrl: string;
  audioLength: number;
  romanization: string | null;
  translation: string | null;
  meaningId: string;
  cefrLevel: string;
  language: string;
}

/**
 * Self-assessment submission data
 */
export interface ProductionAssessment {
  meaningId: string;
  selfRating: SelfRating;
  recordingDuration: number;
  attemptNumber: number;
  timeSpentMs: number;
}

/**
 * ProductionService handles audio recording exercises
 * for pronunciation practice with self-assessment.
 */
export class ProductionService {
  private readonly MIN_EASE_FACTOR = 1.3;

  constructor(private readonly pool: Pool) {}

  /**
   * Get production exercises from SRS items that have native audio
   */
  async getProductionExercises(
    userId: string,
    language: string,
    limit: number = 10
  ): Promise<ProductionExercise[]> {
    interface ProductionRow {
      meaning_id: string;
      text: string;
      audio_url: string;
      audio_length: number | null;
      romanization: string | null;
      translation: string | null;
      level: string;
    }

    const result = await this.pool.query<ProductionRow>(
      `SELECT DISTINCT ON (usi.meaning_id)
         usi.meaning_id,
         au.text,
         au.audio_url,
         au.audio_length,
         au.romanization,
         am.definition AS translation,
         am.level
       FROM user_srs_items usi
       JOIN approved_meanings am ON usi.meaning_id = am.id
       JOIN approved_utterances au ON au.meaning_id = am.id AND au.language = $2
       WHERE usi.user_id = $1
         AND usi.language = $2
         AND usi.next_review_at <= current_timestamp
         AND au.audio_url IS NOT NULL
         AND au.text IS NOT NULL
         AND LENGTH(au.text) >= 2
       ORDER BY usi.meaning_id, usi.next_review_at ASC
       LIMIT $3`,
      [userId, language, limit]
    );

    return result.rows.map((row) => ({
      exerciseId: `production_${row.meaning_id}_${Date.now()}`,
      text: row.text,
      audioUrl: row.audio_url,
      audioLength: row.audio_length || 5,
      romanization: row.romanization,
      translation: row.translation,
      meaningId: row.meaning_id,
      cefrLevel: row.level,
      language,
    }));
  }

  /**
   * Submit self-assessment for production practice
   */
  async submitAssessment(
    userId: string,
    assessment: ProductionAssessment
  ): Promise<{ success: boolean; qualityRating: number }> {
    const { meaningId, selfRating, recordingDuration, attemptNumber, timeSpentMs } = assessment;

    // Convert self-rating to SRS quality (0-5)
    const qualityRating = this.selfRatingToQuality(selfRating);

    // Update SRS scheduling
    await this.updateSRS(userId, meaningId, qualityRating);

    // Record attempt
    await this.recordAttempt(
      userId,
      meaningId,
      selfRating,
      qualityRating >= 3,
      qualityRating / 5,
      recordingDuration,
      attemptNumber,
      timeSpentMs
    );

    return { success: true, qualityRating };
  }

  /**
   * Get production practice statistics for a language
   */
  async getStats(userId: string, language: string) {
    interface StatsRow {
      total_exercises: string;
      correct_count: string;
      avg_quality: string | null;
    }

    const result = await this.pool.query<StatsRow>(
      `SELECT
        COUNT(*) as total_exercises,
        COUNT(*) FILTER (WHERE correct = true) as correct_count,
        AVG((user_answer::jsonb->>'qualityRating')::decimal) as avg_quality
       FROM user_exercise_results
       WHERE user_id = $1
         AND language = $2
         AND exercise_type = 'production'
         AND submitted_at > current_timestamp - interval '7 days'`,
      [userId, language]
    );

    const row = result.rows[0];
    const total = parseInt(row.total_exercises, 10);
    const correct = parseInt(row.correct_count, 10);

    return {
      totalExercises: total,
      correctCount: correct,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
      avgQuality: row.avg_quality ? Math.round(parseFloat(row.avg_quality) * 100) : null,
    };
  }

  /**
   * Convert self-assessment rating to SRS quality (0-5)
   * - again (0): Couldn't pronounce, complete failure
   * - hard (3): Pronounced with difficulty, noticeable errors
   * - good (4): Pronounced correctly with minor hesitation
   * - easy (5): Perfect pronunciation, confident
   */
  selfRatingToQuality(rating: SelfRating): number {
    switch (rating) {
      case 'again':
        return 0;
      case 'hard':
        return 3;
      case 'good':
        return 4;
      case 'easy':
        return 5;
    }
  }

  /**
   * Update SRS scheduling based on quality
   */
  private async updateSRS(userId: string, meaningId: string, quality: number): Promise<void> {
    interface SRSRow {
      ease_factor: number;
      repetitions: number;
      interval: number;
    }

    const srsResult = await this.pool.query<SRSRow>(
      `SELECT ease_factor, repetitions, interval
       FROM user_srs_items
       WHERE user_id = $1 AND meaning_id = $2`,
      [userId, meaningId]
    );

    if (srsResult.rows.length === 0) {
      return;
    }

    const current = srsResult.rows[0];

    // SM-2 algorithm
    let newEaseFactor = current.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

    if (newEaseFactor < this.MIN_EASE_FACTOR) {
      newEaseFactor = this.MIN_EASE_FACTOR;
    }

    let newRepetitions: number;
    let newInterval: number;

    if (quality < 3) {
      newRepetitions = 0;
      newInterval = 1;
    } else {
      newRepetitions = current.repetitions + 1;

      if (newRepetitions === 1) {
        newInterval = 1;
      } else if (newRepetitions === 2) {
        newInterval = 6;
      } else {
        newInterval = Math.round(current.interval * newEaseFactor);
      }
    }

    const nextReviewAt = new Date();
    nextReviewAt.setDate(nextReviewAt.getDate() + newInterval);

    await this.pool.query(
      `UPDATE user_srs_items
       SET ease_factor = $1,
           repetitions = $2,
           interval = $3,
           next_review_at = $4,
           last_reviewed_at = current_timestamp
       WHERE user_id = $5 AND meaning_id = $6`,
      [newEaseFactor, newRepetitions, newInterval, nextReviewAt, userId, meaningId]
    );
  }

  /**
   * Record practice attempt
   */
  private async recordAttempt(
    userId: string,
    meaningId: string,
    selfRating: SelfRating,
    isCorrect: boolean,
    accuracy: number,
    recordingDuration: number,
    attemptNumber: number,
    timeSpentMs: number
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_exercise_results
       (user_id, exercise_id, language, exercise_type, correct, time_spent_ms, user_answer, submitted_at)
       VALUES ($1, $2::uuid, 'XX', 'production', $3, $4, $5, NOW())
       ON CONFLICT DO NOTHING`,
      [
        userId,
        '00000000-0000-0000-0000-000000000000',
        isCorrect,
        timeSpentMs,
        JSON.stringify({
          selfRating,
          qualityRating: this.selfRatingToQuality(selfRating),
          recordingDuration,
          attemptNumber,
          meaningId,
        }),
      ]
    );
  }
}
