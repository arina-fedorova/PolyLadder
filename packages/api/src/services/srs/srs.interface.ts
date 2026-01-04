/**
 * Performance rating for SRS review
 * Maps to SM-2 quality scores:
 * - again: 0 (complete blackout, wrong response)
 * - hard: 3 (correct response with serious difficulty)
 * - good: 4 (correct response with hesitation)
 * - easy: 5 (perfect response)
 */
export type PerformanceRating = 'again' | 'hard' | 'good' | 'easy';

/**
 * Item types that can be tracked by SRS
 */
export type SRSItemType = 'vocabulary' | 'grammar' | 'orthography' | 'reading';

/**
 * SRS schedule item representing a user's learning progress for an item
 */
export interface SRSScheduleItem {
  id: string;
  userId: string;
  itemType: SRSItemType;
  itemId: string;
  language: string;
  dueDate: Date;
  interval: number; // Days until next review
  repetitions: number; // Number of successful reviews
  easeFactor: number; // SM-2 ease factor (1.3 - 3.0)
  lastReviewedAt: Date | null;
}

/**
 * Result of a single review
 */
export interface SRSReviewResult {
  itemId: string;
  rating: PerformanceRating;
  responseTimeMs: number;
  wasCorrect: boolean;
}

/**
 * Result of SM-2 calculation for next review
 */
export interface SRSUpdateResult {
  nextDueDate: Date;
  newInterval: number;
  newRepetitions: number;
  newEaseFactor: number;
}

/**
 * SRS Service interface for spaced repetition scheduling
 */
export interface ISRSService {
  /**
   * Calculate next review schedule using SM-2 algorithm
   * @param currentSchedule Current SRS schedule item
   * @param rating User performance rating
   * @returns Updated schedule parameters
   */
  calculateNextReview(currentSchedule: SRSScheduleItem, rating: PerformanceRating): SRSUpdateResult;

  /**
   * Add new item to SRS schedule (first review)
   * @param userId User ID
   * @param itemType Type of item (vocabulary, grammar, etc.)
   * @param itemId ID of the item
   * @param language Language code
   * @returns Created schedule item ID
   */
  addToSchedule(
    userId: string,
    itemType: SRSItemType,
    itemId: string,
    language: string
  ): Promise<string>;

  /**
   * Get all items due for review for a user
   * @param userId User ID
   * @param language Language code (optional)
   * @param limit Maximum number of items to return
   * @returns Due items ordered by due_date ASC
   */
  getDueItems(userId: string, language?: string, limit?: number): Promise<SRSScheduleItem[]>;

  /**
   * Update schedule after review
   * @param userId User ID
   * @param itemId Item ID
   * @param rating Performance rating
   * @returns Updated schedule
   */
  recordReview(userId: string, itemId: string, rating: PerformanceRating): Promise<SRSUpdateResult>;

  /**
   * Get schedule item for a specific user and item
   * @param userId User ID
   * @param itemId Item ID
   * @returns Schedule item or null if not found
   */
  getScheduleItem(userId: string, itemId: string): Promise<SRSScheduleItem | null>;
}
