import { Pool } from 'pg';
import { SM2Calculator } from './sm2-calculator';
import {
  ISRSService,
  SRSScheduleItem,
  SRSItemType,
  PerformanceRating,
  SRSUpdateResult,
} from './srs.interface';

/**
 * Database row structure for user_srs_items table
 */
interface SRSItemRow {
  id: string;
  user_id: string;
  meaning_id: string;
  language: string;
  interval: number;
  repetitions: number;
  ease_factor: number;
  next_review_at: Date;
  last_reviewed_at: Date | null;
}

/**
 * SRS Service implementing spaced repetition scheduling
 *
 * Uses SM-2 algorithm for calculating review intervals.
 * Currently supports vocabulary items via meaning_id.
 */
export class SRSService implements ISRSService {
  private readonly calculator: SM2Calculator;

  constructor(private readonly pool: Pool) {
    this.calculator = new SM2Calculator();
  }

  /**
   * Calculate next review schedule using SM-2 algorithm
   */
  calculateNextReview(
    currentSchedule: SRSScheduleItem,
    rating: PerformanceRating
  ): SRSUpdateResult {
    return this.calculator.calculateNext(currentSchedule, rating);
  }

  /**
   * Add new item to SRS schedule
   *
   * @param userId User ID
   * @param itemType Type of item (currently only 'vocabulary' is fully supported)
   * @param itemId Item ID (meaning_id for vocabulary)
   * @param language Language code
   * @returns Created schedule item ID
   */
  async addToSchedule(
    userId: string,
    itemType: SRSItemType,
    itemId: string,
    language: string
  ): Promise<string> {
    if (itemType !== 'vocabulary') {
      throw new Error(
        `Item type '${itemType}' is not yet supported. Only 'vocabulary' is available.`
      );
    }

    const initial = this.calculator.getInitialSchedule();

    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO user_srs_items (
        user_id,
        meaning_id,
        language,
        interval,
        repetitions,
        ease_factor,
        next_review_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id, meaning_id) DO NOTHING
      RETURNING id`,
      [
        userId,
        itemId,
        language,
        initial.newInterval,
        initial.newRepetitions,
        initial.newEaseFactor,
        initial.nextDueDate,
      ]
    );

    if (result.rows.length === 0) {
      // Item already exists, fetch existing ID
      const existing = await this.pool.query<{ id: string }>(
        `SELECT id FROM user_srs_items WHERE user_id = $1 AND meaning_id = $2`,
        [userId, itemId]
      );
      return existing.rows[0]?.id ?? '';
    }

    return result.rows[0].id;
  }

  /**
   * Get all items due for review
   *
   * @param userId User ID
   * @param language Optional language filter
   * @param limit Maximum number of items to return (default 20)
   * @returns Due items ordered by due_date ASC
   */
  async getDueItems(
    userId: string,
    language?: string,
    limit: number = 20
  ): Promise<SRSScheduleItem[]> {
    let query = `
      SELECT
        id,
        user_id,
        meaning_id,
        language,
        interval,
        repetitions,
        ease_factor,
        next_review_at,
        last_reviewed_at
      FROM user_srs_items
      WHERE user_id = $1
        AND next_review_at <= current_timestamp
    `;

    const params: (string | number)[] = [userId];

    if (language) {
      query += ` AND language = $2`;
      params.push(language);
    }

    query += ` ORDER BY next_review_at ASC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await this.pool.query<SRSItemRow>(query, params);

    return result.rows.map((row) => this.mapRowToScheduleItem(row));
  }

  /**
   * Record a review and update schedule
   *
   * @param userId User ID
   * @param itemId Item ID (meaning_id for vocabulary)
   * @param rating Performance rating
   * @returns Updated schedule parameters
   */
  async recordReview(
    userId: string,
    itemId: string,
    rating: PerformanceRating
  ): Promise<SRSUpdateResult> {
    // Get current schedule
    const current = await this.getScheduleItem(userId, itemId);

    if (!current) {
      throw new NotFoundError(`SRS item not found for user ${userId} and item ${itemId}`);
    }

    // Calculate new schedule
    const update = this.calculator.calculateNext(current, rating);

    // Update database
    await this.pool.query(
      `UPDATE user_srs_items
       SET
         interval = $1,
         repetitions = $2,
         ease_factor = $3,
         next_review_at = $4,
         last_reviewed_at = current_timestamp
       WHERE user_id = $5 AND meaning_id = $6`,
      [
        update.newInterval,
        update.newRepetitions,
        update.newEaseFactor,
        update.nextDueDate,
        userId,
        itemId,
      ]
    );

    // Record review in history
    await this.recordReviewHistory(userId, itemId, rating, current, update);

    return update;
  }

  /**
   * Get schedule item for a specific user and item
   *
   * @param userId User ID
   * @param itemId Item ID (meaning_id for vocabulary)
   * @returns Schedule item or null if not found
   */
  async getScheduleItem(userId: string, itemId: string): Promise<SRSScheduleItem | null> {
    const result = await this.pool.query<SRSItemRow>(
      `SELECT
        id,
        user_id,
        meaning_id,
        language,
        interval,
        repetitions,
        ease_factor,
        next_review_at,
        last_reviewed_at
      FROM user_srs_items
      WHERE user_id = $1 AND meaning_id = $2`,
      [userId, itemId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToScheduleItem(result.rows[0]);
  }

  /**
   * Bulk add items to SRS schedule
   *
   * @param userId User ID
   * @param items Array of items to add
   * @returns Number of items added
   */
  async bulkAddToSchedule(
    userId: string,
    items: Array<{ itemId: string; language: string }>
  ): Promise<number> {
    if (items.length === 0) {
      return 0;
    }

    const initial = this.calculator.getInitialSchedule();

    // Build VALUES clause
    const values: (string | number | Date)[] = [];
    const placeholders: string[] = [];

    items.forEach((item, idx) => {
      const base = idx * 7;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`
      );
      values.push(
        userId,
        item.itemId,
        item.language,
        initial.newInterval,
        initial.newRepetitions,
        initial.newEaseFactor,
        initial.nextDueDate
      );
    });

    const result = await this.pool.query(
      `INSERT INTO user_srs_items (
        user_id,
        meaning_id,
        language,
        interval,
        repetitions,
        ease_factor,
        next_review_at
      )
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (user_id, meaning_id) DO NOTHING`,
      values
    );

    return result.rowCount ?? 0;
  }

  /**
   * Get SRS statistics for a user
   */
  async getStats(
    userId: string,
    language?: string
  ): Promise<{
    totalItems: number;
    dueNow: number;
    learned: number;
    averageEaseFactor: number | null;
  }> {
    let query = `
      SELECT
        COUNT(*) as total_items,
        COUNT(*) FILTER (WHERE next_review_at <= current_timestamp) as due_now,
        COUNT(*) FILTER (WHERE repetitions >= 3) as learned,
        AVG(ease_factor) as avg_ease_factor
      FROM user_srs_items
      WHERE user_id = $1
    `;

    const params: string[] = [userId];

    if (language) {
      query += ` AND language = $2`;
      params.push(language);
    }

    const result = await this.pool.query<{
      total_items: string;
      due_now: string;
      learned: string;
      avg_ease_factor: string | null;
    }>(query, params);

    const row = result.rows[0];

    return {
      totalItems: parseInt(row.total_items, 10),
      dueNow: parseInt(row.due_now, 10),
      learned: parseInt(row.learned, 10),
      averageEaseFactor: row.avg_ease_factor ? parseFloat(row.avg_ease_factor) : null,
    };
  }

  /**
   * Record review in history table for analytics
   */
  private async recordReviewHistory(
    userId: string,
    itemId: string,
    rating: PerformanceRating,
    previousSchedule: SRSScheduleItem,
    newUpdate: SRSUpdateResult
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO srs_review_history (
          user_id,
          item_id,
          item_type,
          language,
          rating,
          previous_interval,
          new_interval,
          previous_ease_factor,
          new_ease_factor,
          previous_repetitions,
          new_repetitions
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          userId,
          itemId,
          previousSchedule.itemType,
          previousSchedule.language,
          rating,
          previousSchedule.interval,
          newUpdate.newInterval,
          previousSchedule.easeFactor,
          newUpdate.newEaseFactor,
          previousSchedule.repetitions,
          newUpdate.newRepetitions,
        ]
      );
    } catch {
      // Silently fail if history table doesn't exist yet
      // This allows the service to work before migration is applied
    }
  }

  /**
   * Map database row to SRSScheduleItem
   */
  private mapRowToScheduleItem(row: SRSItemRow): SRSScheduleItem {
    return {
      id: row.id,
      userId: row.user_id,
      itemType: 'vocabulary', // Currently only vocabulary is supported
      itemId: row.meaning_id,
      language: row.language,
      dueDate: row.next_review_at,
      interval: row.interval,
      repetitions: row.repetitions,
      easeFactor: row.ease_factor,
      lastReviewedAt: row.last_reviewed_at,
    };
  }
}

/**
 * Not Found Error for SRS items
 */
class NotFoundError extends Error {
  statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}
