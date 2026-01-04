import { describe, it, expect, beforeEach } from 'vitest';
import { SM2Calculator } from '../../../../src/services/srs/sm2-calculator';
import { SRSScheduleItem, PerformanceRating } from '../../../../src/services/srs/srs.interface';

describe('SM2Calculator', () => {
  let calculator: SM2Calculator;

  beforeEach(() => {
    calculator = new SM2Calculator();
  });

  describe('ratingToQuality', () => {
    it('should map "again" to quality 0', () => {
      expect(calculator.ratingToQuality('again')).toBe(0);
    });

    it('should map "hard" to quality 3', () => {
      expect(calculator.ratingToQuality('hard')).toBe(3);
    });

    it('should map "good" to quality 4', () => {
      expect(calculator.ratingToQuality('good')).toBe(4);
    });

    it('should map "easy" to quality 5', () => {
      expect(calculator.ratingToQuality('easy')).toBe(5);
    });
  });

  describe('calculateEaseFactor', () => {
    it('should increase ease factor for easy (quality 5)', () => {
      const result = calculator.calculateEaseFactor(2.5, 5);
      // EF' = 2.5 + (0.1 - (5-5) * (0.08 + (5-5) * 0.02)) = 2.5 + 0.1 = 2.6
      expect(result).toBeCloseTo(2.6, 2);
    });

    it('should slightly increase ease factor for good (quality 4)', () => {
      const result = calculator.calculateEaseFactor(2.5, 4);
      // EF' = 2.5 + (0.1 - (5-4) * (0.08 + (5-4) * 0.02)) = 2.5 + 0.1 - 0.1 = 2.5
      expect(result).toBeCloseTo(2.5, 2);
    });

    it('should maintain ease factor for hard (quality 3)', () => {
      const result = calculator.calculateEaseFactor(2.5, 3);
      // EF' = 2.5 + (0.1 - (5-3) * (0.08 + (5-3) * 0.02)) = 2.5 + 0.1 - 2*(0.08+0.04) = 2.5 - 0.14 = 2.36
      expect(result).toBeCloseTo(2.36, 2);
    });

    it('should decrease ease factor for again (quality 0)', () => {
      const result = calculator.calculateEaseFactor(2.5, 0);
      // EF' = 2.5 + (0.1 - (5-0) * (0.08 + (5-0) * 0.02)) = 2.5 + 0.1 - 5*(0.08+0.1) = 2.5 - 0.8 = 1.7
      expect(result).toBeCloseTo(1.7, 2);
    });

    it('should clamp ease factor to minimum 1.3', () => {
      // Start with low EF and get "again"
      const result = calculator.calculateEaseFactor(1.5, 0);
      expect(result).toBe(SM2Calculator.MIN_EASE_FACTOR);
    });

    it('should clamp ease factor to maximum 3.0', () => {
      // Start with high EF and get "easy" multiple times simulated
      const result = calculator.calculateEaseFactor(2.95, 5);
      expect(result).toBe(SM2Calculator.MAX_EASE_FACTOR);
    });
  });

  describe('calculateNext', () => {
    const createSchedule = (
      repetitions: number,
      interval: number,
      easeFactor: number = 2.5
    ): SRSScheduleItem => ({
      id: 'test-id',
      userId: 'user-123',
      itemType: 'vocabulary',
      itemId: 'item-456',
      language: 'EN',
      dueDate: new Date(),
      interval,
      repetitions,
      easeFactor,
      lastReviewedAt: null,
    });

    describe('first successful review', () => {
      it('should set interval to 1 day on first success', () => {
        const schedule = createSchedule(0, 0);
        const result = calculator.calculateNext(schedule, 'good');

        expect(result.newRepetitions).toBe(1);
        expect(result.newInterval).toBe(1);
      });

      it('should set interval to 1 day even with "easy" rating', () => {
        const schedule = createSchedule(0, 0);
        const result = calculator.calculateNext(schedule, 'easy');

        expect(result.newRepetitions).toBe(1);
        expect(result.newInterval).toBe(1);
      });
    });

    describe('second successful review', () => {
      it('should set interval to 6 days on second success', () => {
        const schedule = createSchedule(1, 1);
        const result = calculator.calculateNext(schedule, 'good');

        expect(result.newRepetitions).toBe(2);
        expect(result.newInterval).toBe(6);
      });
    });

    describe('subsequent reviews', () => {
      it('should multiply interval by ease factor for third review', () => {
        const schedule = createSchedule(2, 6, 2.5);
        const result = calculator.calculateNext(schedule, 'good');

        expect(result.newRepetitions).toBe(3);
        // 6 * 2.5 = 15
        expect(result.newInterval).toBe(15);
      });

      it('should continue multiplying interval for fourth review', () => {
        const schedule = createSchedule(3, 15, 2.5);
        const result = calculator.calculateNext(schedule, 'good');

        expect(result.newRepetitions).toBe(4);
        // 15 * 2.5 = 37.5 -> rounded to 38
        expect(result.newInterval).toBe(38);
      });

      it('should round interval to nearest integer', () => {
        const schedule = createSchedule(3, 10, 2.3);
        const result = calculator.calculateNext(schedule, 'hard');

        // 10 * calculated_ef (slightly less than 2.3) -> rounds
        expect(Number.isInteger(result.newInterval)).toBe(true);
      });
    });

    describe('failed reviews (quality < 3)', () => {
      it('should reset repetitions to 0 on "again"', () => {
        const schedule = createSchedule(5, 30, 2.5);
        const result = calculator.calculateNext(schedule, 'again');

        expect(result.newRepetitions).toBe(0);
        expect(result.newInterval).toBe(1);
      });

      it('should still update ease factor on failure', () => {
        const schedule = createSchedule(3, 15, 2.5);
        const result = calculator.calculateNext(schedule, 'again');

        // Ease factor should decrease
        expect(result.newEaseFactor).toBeLessThan(2.5);
      });
    });

    describe('next due date calculation', () => {
      it('should set due date to current date + interval days', () => {
        const schedule = createSchedule(1, 1);
        const beforeCall = new Date();
        const result = calculator.calculateNext(schedule, 'good');

        // Check that nextDueDate is approximately 6 days in the future
        const expectedDate = new Date(beforeCall);
        expectedDate.setDate(expectedDate.getDate() + 6);

        const diffDays = Math.round(
          (result.nextDueDate.getTime() - beforeCall.getTime()) / (1000 * 60 * 60 * 24)
        );
        expect(diffDays).toBe(6);
      });
    });

    describe('all rating types', () => {
      const ratings: PerformanceRating[] = ['again', 'hard', 'good', 'easy'];

      ratings.forEach((rating) => {
        it(`should handle "${rating}" rating correctly`, () => {
          const schedule = createSchedule(2, 6, 2.5);
          const result = calculator.calculateNext(schedule, rating);

          expect(result).toHaveProperty('nextDueDate');
          expect(result).toHaveProperty('newInterval');
          expect(result).toHaveProperty('newRepetitions');
          expect(result).toHaveProperty('newEaseFactor');

          expect(result.newInterval).toBeGreaterThanOrEqual(1);
          expect(result.newEaseFactor).toBeGreaterThanOrEqual(SM2Calculator.MIN_EASE_FACTOR);
          expect(result.newEaseFactor).toBeLessThanOrEqual(SM2Calculator.MAX_EASE_FACTOR);
        });
      });
    });
  });

  describe('getInitialSchedule', () => {
    it('should return default initial values', () => {
      const result = calculator.getInitialSchedule();

      expect(result.newInterval).toBe(0);
      expect(result.newRepetitions).toBe(0);
      expect(result.newEaseFactor).toBe(SM2Calculator.INITIAL_EASE_FACTOR);
    });

    it('should set next due date to current date', () => {
      const before = new Date();
      const result = calculator.getInitialSchedule();
      const after = new Date();

      expect(result.nextDueDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.nextDueDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('isPassing', () => {
    it('should return false for "again"', () => {
      expect(calculator.isPassing('again')).toBe(false);
    });

    it('should return true for "hard"', () => {
      expect(calculator.isPassing('hard')).toBe(true);
    });

    it('should return true for "good"', () => {
      expect(calculator.isPassing('good')).toBe(true);
    });

    it('should return true for "easy"', () => {
      expect(calculator.isPassing('easy')).toBe(true);
    });
  });

  describe('static constants', () => {
    it('should have correct initial ease factor', () => {
      expect(SM2Calculator.INITIAL_EASE_FACTOR).toBe(2.5);
    });

    it('should have correct minimum ease factor', () => {
      expect(SM2Calculator.MIN_EASE_FACTOR).toBe(1.3);
    });

    it('should have correct maximum ease factor', () => {
      expect(SM2Calculator.MAX_EASE_FACTOR).toBe(3.0);
    });
  });

  describe('SM-2 algorithm correctness', () => {
    it('should follow correct learning path for typical user', () => {
      // Simulate a typical learning path
      let schedule = createSchedule(0, 0);

      // First review - good
      let result = calculator.calculateNext(schedule, 'good');
      expect(result.newRepetitions).toBe(1);
      expect(result.newInterval).toBe(1);

      // Second review - good
      schedule = {
        ...schedule,
        repetitions: result.newRepetitions,
        interval: result.newInterval,
        easeFactor: result.newEaseFactor,
      };
      result = calculator.calculateNext(schedule, 'good');
      expect(result.newRepetitions).toBe(2);
      expect(result.newInterval).toBe(6);

      // Third review - good
      schedule = {
        ...schedule,
        repetitions: result.newRepetitions,
        interval: result.newInterval,
        easeFactor: result.newEaseFactor,
      };
      result = calculator.calculateNext(schedule, 'good');
      expect(result.newRepetitions).toBe(3);
      expect(result.newInterval).toBe(15); // 6 * 2.5 = 15

      // Fourth review - good
      schedule = {
        ...schedule,
        repetitions: result.newRepetitions,
        interval: result.newInterval,
        easeFactor: result.newEaseFactor,
      };
      result = calculator.calculateNext(schedule, 'good');
      expect(result.newRepetitions).toBe(4);
      expect(result.newInterval).toBe(38); // 15 * 2.5 = 37.5 -> 38
    });

    it('should handle failure and recovery', () => {
      // Start with an established item
      let schedule = createSchedule(3, 15, 2.5);

      // Fail the review
      let result = calculator.calculateNext(schedule, 'again');
      expect(result.newRepetitions).toBe(0);
      expect(result.newInterval).toBe(1);
      expect(result.newEaseFactor).toBeLessThan(2.5);

      // Recover with good reviews
      schedule = {
        ...schedule,
        repetitions: result.newRepetitions,
        interval: result.newInterval,
        easeFactor: result.newEaseFactor,
      };
      result = calculator.calculateNext(schedule, 'good');
      expect(result.newRepetitions).toBe(1);
      expect(result.newInterval).toBe(1);

      schedule = {
        ...schedule,
        repetitions: result.newRepetitions,
        interval: result.newInterval,
        easeFactor: result.newEaseFactor,
      };
      result = calculator.calculateNext(schedule, 'good');
      expect(result.newRepetitions).toBe(2);
      expect(result.newInterval).toBe(6);
    });

    function createSchedule(
      repetitions: number,
      interval: number,
      easeFactor: number = 2.5
    ): SRSScheduleItem {
      return {
        id: 'test-id',
        userId: 'user-123',
        itemType: 'vocabulary',
        itemId: 'item-456',
        language: 'EN',
        dueDate: new Date(),
        interval,
        repetitions,
        easeFactor,
        lastReviewedAt: null,
      };
    }
  });
});
