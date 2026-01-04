import { PerformanceRating, SRSScheduleItem, SRSUpdateResult } from './srs.interface';

/**
 * SM-2 (SuperMemo 2) Algorithm Implementation
 *
 * Based on: https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method
 *
 * Key concepts:
 * - Quality Score (q): 0-5, where 3+ is passing
 * - Ease Factor (EF): Multiplier for interval growth, range [1.3, 3.0], default 2.5
 * - Interval: Days until next review
 * - Repetitions: Count of consecutive successful reviews
 *
 * Formula for ease factor:
 * EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
 *
 * Interval rules:
 * - Quality < 3: Reset to 1 day (failed)
 * - Rep 1: 1 day
 * - Rep 2: 6 days
 * - Rep 3+: previous_interval * EF
 */
export class SM2Calculator {
  /**
   * Default starting ease factor per SM-2 specification
   */
  public static readonly INITIAL_EASE_FACTOR = 2.5;

  /**
   * Minimum ease factor (clamp)
   */
  public static readonly MIN_EASE_FACTOR = 1.3;

  /**
   * Maximum ease factor (clamp)
   */
  public static readonly MAX_EASE_FACTOR = 3.0;

  /**
   * Performance rating to SM-2 quality score mapping
   */
  private static readonly QUALITY_SCORES: Record<PerformanceRating, number> = {
    again: 0, // Complete blackout, wrong response
    hard: 3, // Correct response with serious difficulty
    good: 4, // Correct response with hesitation
    easy: 5, // Perfect response
  };

  /**
   * Convert performance rating to SM-2 quality score (0-5)
   */
  public ratingToQuality(rating: PerformanceRating): number {
    return SM2Calculator.QUALITY_SCORES[rating];
  }

  /**
   * Calculate next review schedule using SM-2 algorithm
   *
   * @param schedule Current schedule item
   * @param rating Performance rating
   * @returns Updated schedule parameters
   */
  public calculateNext(schedule: SRSScheduleItem, rating: PerformanceRating): SRSUpdateResult {
    const quality = this.ratingToQuality(rating);

    // Calculate new ease factor
    const newEaseFactor = this.calculateEaseFactor(schedule.easeFactor, quality);

    let newRepetitions: number;
    let newInterval: number;

    if (quality >= 3) {
      // Correct response: increase interval
      newRepetitions = schedule.repetitions + 1;

      if (newRepetitions === 1) {
        // First successful review: 1 day
        newInterval = 1;
      } else if (newRepetitions === 2) {
        // Second successful review: 6 days
        newInterval = 6;
      } else {
        // Subsequent reviews: multiply previous interval by ease factor
        newInterval = Math.round(schedule.interval * newEaseFactor);
      }
    } else {
      // Incorrect response: reset to day 1
      newRepetitions = 0;
      newInterval = 1;
      // Note: ease factor still changes to make future reviews easier/harder
    }

    // Calculate next due date
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + newInterval);

    return {
      nextDueDate,
      newInterval,
      newRepetitions,
      newEaseFactor,
    };
  }

  /**
   * Calculate new ease factor using SM-2 formula
   * EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
   *
   * Clamped to [1.3, 3.0]
   *
   * @param currentEF Current ease factor
   * @param quality Quality score (0-5)
   * @returns New ease factor
   */
  public calculateEaseFactor(currentEF: number, quality: number): number {
    const newEF = currentEF + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

    // Clamp ease factor between min and max
    return Math.max(SM2Calculator.MIN_EASE_FACTOR, Math.min(SM2Calculator.MAX_EASE_FACTOR, newEF));
  }

  /**
   * Create initial schedule parameters for a new item
   *
   * @returns Initial schedule values
   */
  public getInitialSchedule(): Pick<
    SRSUpdateResult,
    'newEaseFactor' | 'newInterval' | 'newRepetitions'
  > & { nextDueDate: Date } {
    const nextDueDate = new Date();
    // First review is immediate (same day)
    return {
      nextDueDate,
      newInterval: 0,
      newRepetitions: 0,
      newEaseFactor: SM2Calculator.INITIAL_EASE_FACTOR,
    };
  }

  /**
   * Determine if a rating represents a passing score
   *
   * @param rating Performance rating
   * @returns True if the rating is passing (quality >= 3)
   */
  public isPassing(rating: PerformanceRating): boolean {
    return this.ratingToQuality(rating) >= 3;
  }
}
