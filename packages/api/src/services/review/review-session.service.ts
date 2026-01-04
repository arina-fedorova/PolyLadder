import { Pool } from 'pg';
import { SM2Calculator } from '../srs/sm2-calculator';
import {
  ReviewSessionStatus,
  SessionStats,
  StartSessionResult,
  ReviewSubmission,
  ReviewSubmitResult,
  ReviewQueueItem,
  ReviewQueueResponse,
} from './review.interface';

/**
 * Database row for review sessions
 */
interface SessionRow {
  id: string;
  user_id: string;
  language: string | null;
  items_reviewed: number;
  correct_count: number;
  total_response_time_ms: number;
  status: string;
  started_at: Date;
  completed_at: Date | null;
  last_activity_at: Date;
  duration_seconds?: string;
}

/**
 * Database row for SRS schedule items
 */
interface SRSScheduleRow {
  id: string;
  item_type: string;
  item_id: string;
  due_date: Date;
  interval_days: number;
  ease_factor: string;
  repetitions: number;
}

/**
 * Database row for vocabulary content
 */
interface VocabularyRow extends SRSScheduleRow {
  word_text: string | null;
  definition: string | null;
  audio_url: string | null;
  level: string | null;
}

/**
 * ReviewSessionService manages review sessions and integrates with SRS
 */
export class ReviewSessionService {
  private readonly calculator: SM2Calculator;

  constructor(private readonly pool: Pool) {
    this.calculator = new SM2Calculator();
  }

  /**
   * Start a new review session
   */
  async startSession(userId: string, language?: string): Promise<StartSessionResult> {
    // Count items due for review
    let countQuery = `
      SELECT COUNT(*) as count
      FROM user_srs_schedule
      WHERE user_id = $1 AND due_date <= CURRENT_TIMESTAMP
    `;
    const countParams: (string | undefined)[] = [userId];

    if (language) {
      countQuery = `
        SELECT COUNT(*) as count
        FROM user_srs_items
        WHERE user_id = $1 AND language = $2 AND next_review_at <= CURRENT_TIMESTAMP
      `;
      countParams.push(language);
    }

    const countResult = await this.pool.query<{ count: string }>(countQuery, countParams);
    const itemsInQueue = parseInt(countResult.rows[0]?.count ?? '0', 10);

    // Create session record
    const sessionResult = await this.pool.query<{ id: string; started_at: Date }>(
      `INSERT INTO user_review_sessions
       (user_id, language, items_reviewed, correct_count, total_response_time_ms, status, started_at, last_activity_at)
       VALUES ($1, $2, 0, 0, 0, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, started_at`,
      [userId, language ?? null]
    );

    const session = sessionResult.rows[0];

    return {
      sessionId: session.id,
      itemsInQueue,
      startedAt: session.started_at.toISOString(),
    };
  }

  /**
   * Get review queue for user
   */
  async getQueue(
    userId: string,
    language?: string,
    limit: number = 50
  ): Promise<ReviewQueueResponse> {
    let query: string;
    let params: (string | number)[];

    if (language) {
      // Use user_srs_items for vocabulary with language filter
      query = `
        SELECT
          usi.id,
          'vocabulary' as item_type,
          usi.meaning_id as item_id,
          usi.next_review_at as due_date,
          usi.interval as interval_days,
          usi.ease_factor,
          usi.repetitions,
          au.text as word_text,
          au.usage_notes as definition,
          au.audio_url,
          am.level
        FROM user_srs_items usi
        JOIN approved_meanings am ON usi.meaning_id = am.id
        LEFT JOIN approved_utterances au ON au.meaning_id = am.id AND au.language = $2
        WHERE usi.user_id = $1 AND usi.language = $2 AND usi.next_review_at <= CURRENT_TIMESTAMP
        ORDER BY usi.next_review_at ASC
        LIMIT $3
      `;
      params = [userId, language, limit];
    } else {
      // Use user_srs_schedule for general SRS items
      query = `
        SELECT
          id,
          item_type,
          item_id,
          due_date,
          interval_days,
          ease_factor,
          repetitions
        FROM user_srs_schedule
        WHERE user_id = $1 AND due_date <= CURRENT_TIMESTAMP
        ORDER BY due_date ASC
        LIMIT $2
      `;
      params = [userId, limit];
    }

    const result = await this.pool.query<VocabularyRow>(query, params);

    const items: ReviewQueueItem[] = result.rows.map((row) => ({
      id: row.id,
      itemType: row.item_type,
      itemId: row.item_id,
      dueDate: row.due_date,
      intervalDays: row.interval_days,
      easeFactor: parseFloat(row.ease_factor),
      repetitions: row.repetitions,
      content: {
        wordText: row.word_text ?? undefined,
        definition: row.definition ?? undefined,
        audioUrl: row.audio_url ?? undefined,
        level: row.level ?? undefined,
      },
    }));

    // Get next review time if no items due now
    let nextReviewAt: string | null = null;
    if (items.length === 0) {
      const nextQuery = language
        ? `SELECT MIN(next_review_at) as next_due FROM user_srs_items WHERE user_id = $1 AND language = $2 AND next_review_at > CURRENT_TIMESTAMP`
        : `SELECT MIN(due_date) as next_due FROM user_srs_schedule WHERE user_id = $1 AND due_date > CURRENT_TIMESTAMP`;

      const nextParams = language ? [userId, language] : [userId];
      const nextResult = await this.pool.query<{ next_due: Date | null }>(nextQuery, nextParams);

      if (nextResult.rows[0]?.next_due) {
        nextReviewAt = nextResult.rows[0].next_due.toISOString();
      }
    }

    return {
      total: items.length,
      items,
      nextReviewAt,
    };
  }

  /**
   * Submit a review and update SRS schedule
   */
  async submitReview(userId: string, submission: ReviewSubmission): Promise<ReviewSubmitResult> {
    const { itemId, itemType, rating, responseTimeMs, wasCorrect, sessionId } = submission;

    // Get current SRS data
    const scheduleQuery =
      itemType === 'vocabulary'
        ? `SELECT id, interval as interval_days, ease_factor, repetitions
           FROM user_srs_items WHERE user_id = $1 AND meaning_id = $2`
        : `SELECT id, interval_days, ease_factor, repetitions
           FROM user_srs_schedule WHERE user_id = $1 AND item_id = $2`;

    const scheduleResult = await this.pool.query<{
      id: string;
      interval_days: number;
      ease_factor: string;
      repetitions: number;
    }>(scheduleQuery, [userId, itemId]);

    if (scheduleResult.rows.length === 0) {
      throw new NotFoundError(`SRS item not found for user ${userId} and item ${itemId}`);
    }

    const current = scheduleResult.rows[0];

    // Calculate new schedule using SM-2
    const scheduleItem = {
      id: current.id,
      userId,
      itemType: itemType as 'vocabulary' | 'grammar' | 'orthography' | 'reading',
      itemId,
      language: 'EN', // Will be overridden by actual item data
      dueDate: new Date(),
      interval: current.interval_days,
      repetitions: current.repetitions,
      easeFactor: parseFloat(current.ease_factor),
      lastReviewedAt: null,
    };

    const update = this.calculator.calculateNext(scheduleItem, rating);

    // Update SRS schedule
    const updateQuery =
      itemType === 'vocabulary'
        ? `UPDATE user_srs_items
           SET interval = $1, repetitions = $2, ease_factor = $3, next_review_at = $4, last_reviewed_at = CURRENT_TIMESTAMP
           WHERE user_id = $5 AND meaning_id = $6`
        : `UPDATE user_srs_schedule
           SET interval_days = $1, repetitions = $2, ease_factor = $3, due_date = $4, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $5 AND item_id = $6`;

    await this.pool.query(updateQuery, [
      update.newInterval,
      update.newRepetitions,
      update.newEaseFactor,
      update.nextDueDate,
      userId,
      itemId,
    ]);

    // Update session if provided
    if (sessionId) {
      await this.updateSessionProgress(sessionId, userId, wasCorrect, responseTimeMs);
    }

    // Record in review history
    await this.recordReviewHistory(userId, itemId, itemType, rating, responseTimeMs, wasCorrect);

    return {
      success: true,
      nextReview: {
        dueDate: update.nextDueDate.toISOString(),
        interval: update.newInterval,
        repetitions: update.newRepetitions,
        easeFactor: Math.round(update.newEaseFactor * 100) / 100,
      },
    };
  }

  /**
   * Update session progress after a review
   */
  private async updateSessionProgress(
    sessionId: string,
    userId: string,
    wasCorrect: boolean,
    responseTimeMs: number
  ): Promise<void> {
    await this.pool.query(
      `UPDATE user_review_sessions
       SET items_reviewed = items_reviewed + 1,
           correct_count = correct_count + CASE WHEN $3 THEN 1 ELSE 0 END,
           total_response_time_ms = total_response_time_ms + $4,
           last_activity_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2`,
      [sessionId, userId, wasCorrect, responseTimeMs]
    );
  }

  /**
   * Record review in history table
   */
  private async recordReviewHistory(
    userId: string,
    itemId: string,
    itemType: string,
    rating: string,
    responseTimeMs: number,
    _wasCorrect: boolean
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO srs_review_history
         (user_id, item_id, item_type, language, rating, previous_interval, new_interval,
          previous_ease_factor, new_ease_factor, previous_repetitions, new_repetitions, response_time_ms)
         VALUES ($1, $2, $3, 'EN', $4, 0, 0, 2.5, 2.5, 0, 0, $5)`,
        [userId, itemId, itemType, rating, responseTimeMs]
      );
    } catch {
      // Silently fail if history table has issues
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string, userId: string): Promise<SessionStats | null> {
    const result = await this.pool.query<SessionRow>(
      `SELECT
         id,
         user_id,
         language,
         items_reviewed,
         correct_count,
         total_response_time_ms,
         status,
         started_at,
         completed_at,
         last_activity_at,
         EXTRACT(EPOCH FROM (COALESCE(completed_at, CURRENT_TIMESTAMP) - started_at)) as duration_seconds
       FROM user_review_sessions
       WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToStats(result.rows[0]);
  }

  /**
   * Complete a session
   */
  async completeSession(sessionId: string, userId: string): Promise<SessionStats | null> {
    const result = await this.pool.query<SessionRow>(
      `UPDATE user_review_sessions
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND status = 'active'
       RETURNING
         id,
         user_id,
         language,
         items_reviewed,
         correct_count,
         total_response_time_ms,
         status,
         started_at,
         completed_at,
         last_activity_at,
         EXTRACT(EPOCH FROM (completed_at - started_at)) as duration_seconds`,
      [sessionId, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToStats(result.rows[0]);
  }

  /**
   * Get user's active session (if any)
   */
  async getActiveSession(userId: string): Promise<SessionStats | null> {
    const result = await this.pool.query<SessionRow>(
      `SELECT
         id,
         user_id,
         language,
         items_reviewed,
         correct_count,
         total_response_time_ms,
         status,
         started_at,
         completed_at,
         last_activity_at,
         EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) as duration_seconds
       FROM user_review_sessions
       WHERE user_id = $1 AND status = 'active'
       ORDER BY started_at DESC
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToStats(result.rows[0]);
  }

  /**
   * Get user's session history
   */
  async getSessionHistory(userId: string, limit: number = 10): Promise<SessionStats[]> {
    const result = await this.pool.query<SessionRow>(
      `SELECT
         id,
         user_id,
         language,
         items_reviewed,
         correct_count,
         total_response_time_ms,
         status,
         started_at,
         completed_at,
         last_activity_at,
         EXTRACT(EPOCH FROM (COALESCE(completed_at, last_activity_at) - started_at)) as duration_seconds
       FROM user_review_sessions
       WHERE user_id = $1 AND status IN ('completed', 'abandoned')
       ORDER BY started_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map((row) => this.mapRowToStats(row));
  }

  /**
   * Map database row to SessionStats
   */
  private mapRowToStats(row: SessionRow): SessionStats {
    const itemsReviewed = row.items_reviewed;
    const correctCount = row.correct_count;
    const durationSeconds = Math.round(parseFloat(row.duration_seconds ?? '0'));

    return {
      sessionId: row.id,
      itemsReviewed,
      correctCount,
      accuracyPct: itemsReviewed > 0 ? Math.round((correctCount / itemsReviewed) * 100) : 0,
      durationSeconds,
      avgResponseTimeMs:
        itemsReviewed > 0 ? Math.round(row.total_response_time_ms / itemsReviewed) : 0,
      status: row.status as ReviewSessionStatus,
      startedAt: row.started_at.toISOString(),
      completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    };
  }
}

/**
 * Not Found Error
 */
class NotFoundError extends Error {
  statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}
