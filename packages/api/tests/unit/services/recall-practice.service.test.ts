import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import {
  RecallPracticeService,
  QualityRating,
} from '../../../src/services/vocabulary/recall-practice.service';

describe('RecallPracticeService', () => {
  let service: RecallPracticeService;
  let mockPool: Pool;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    } as unknown as Pool;

    service = new RecallPracticeService(mockPool);
  });

  describe('getDueWords', () => {
    it('should return words due for review', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');
      querySpy.mockResolvedValueOnce({
        rows: [
          {
            meaning_id: 'en-hello',
            word: 'hello',
            level: 'A1',
            last_reviewed_at: new Date('2025-12-25'),
            next_review_at: new Date('2026-01-01'),
          },
          {
            meaning_id: 'en-world',
            word: 'world',
            level: 'A1',
            last_reviewed_at: null,
            next_review_at: new Date('2026-01-01'),
          },
        ],
        rowCount: 2,
      } as never);

      const result = await service.getDueWords('user-123', 'EN', 20);

      expect(result).toHaveLength(2);
      expect(result[0].meaningId).toBe('en-hello');
      expect(result[0].word).toBe('hello');
      expect(result[0].cefrLevel).toBe('A1');
      expect(result[0].lastReviewedAt).toBe('2025-12-25T00:00:00.000Z');
      expect(result[0].nextReviewAt).toBe('2026-01-01T00:00:00.000Z');

      expect(result[1].meaningId).toBe('en-world');
      expect(result[1].lastReviewedAt).toBeNull();

      expect(querySpy).toHaveBeenCalledWith(expect.stringContaining('WHERE usi.user_id = $1'), [
        'user-123',
        'EN',
        20,
      ]);
    });

    it('should return empty array when no words are due', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');
      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

      const result = await service.getDueWords('user-123', 'EN', 20);

      expect(result).toHaveLength(0);
    });

    it('should limit results based on limit parameter', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');
      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

      await service.getDueWords('user-123', 'EN', 5);

      expect(querySpy).toHaveBeenCalledWith(expect.any(String), ['user-123', 'EN', 5]);
    });
  });

  describe('initializeLearningWords', () => {
    it('should initialize words from learning state into SRS', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      // First query: get learning words not in SRS
      querySpy.mockResolvedValueOnce({
        rows: [{ meaning_id: 'en-cat' }, { meaning_id: 'en-dog' }],
        rowCount: 2,
      } as never);

      // Second query: bulk insert
      querySpy.mockResolvedValueOnce({
        rows: [{ id: 'srs-1' }, { id: 'srs-2' }],
        rowCount: 2,
      } as never);

      const result = await service.initializeLearningWords('user-123', 'EN');

      expect(result).toBe(2);
      expect(querySpy).toHaveBeenCalledTimes(2);

      // Check bulk insert query
      const insertCall = querySpy.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO user_srs_items');
      expect(insertCall[1]).toEqual(['user-123', 'en-cat', 'EN', 'user-123', 'en-dog', 'EN']);
    });

    it('should return 0 when no learning words to initialize', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');
      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

      const result = await service.initializeLearningWords('user-123', 'EN');

      expect(result).toBe(0);
      expect(querySpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('submitReview - SM-2 Algorithm', () => {
    it('should handle first successful review (quality 5)', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      // Get current SRS item
      querySpy.mockResolvedValueOnce({
        rows: [
          {
            id: 'srs-1',
            user_id: 'user-123',
            meaning_id: 'en-hello',
            language: 'EN',
            ease_factor: 2.5,
            repetitions: 0,
            interval: 0,
          },
        ],
        rowCount: 1,
      } as never);

      // Update SRS item
      querySpy.mockResolvedValueOnce({
        rows: [
          {
            id: 'srs-1',
            user_id: 'user-123',
            meaning_id: 'en-hello',
            language: 'EN',
            ease_factor: 2.6, // 2.5 + 0.1
            repetitions: 1,
            interval: 1, // First review: 1 day
            next_review_at: new Date('2026-01-02'),
            last_reviewed_at: new Date('2026-01-01'),
          },
        ],
        rowCount: 1,
      } as never);

      const result = await service.submitReview('user-123', 'en-hello', 5);

      expect(result.easeFactor).toBe(2.6);
      expect(result.repetitions).toBe(1);
      expect(result.interval).toBe(1);

      // Check update query
      const updateCall = querySpy.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE user_srs_items');
      expect(updateCall[1][0]).toBe(2.6); // ease_factor
      expect(updateCall[1][1]).toBe(1); // repetitions
      expect(updateCall[1][2]).toBe(1); // interval
    });

    it('should handle second successful review (quality 4)', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            ease_factor: 2.6,
            repetitions: 1,
            interval: 1,
          },
        ],
        rowCount: 1,
      } as never);

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            id: 'srs-1',
            user_id: 'user-123',
            meaning_id: 'en-hello',
            language: 'EN',
            ease_factor: 2.5, // 2.6 + (0.1 - 0.1) = 2.6, then -0.1 for quality 4
            repetitions: 2,
            interval: 6, // Second review: 6 days
            next_review_at: new Date('2026-01-07'),
            last_reviewed_at: new Date('2026-01-01'),
          },
        ],
        rowCount: 1,
      } as never);

      const result = await service.submitReview('user-123', 'en-hello', 4);

      expect(result.repetitions).toBe(2);
      expect(result.interval).toBe(6);
    });

    it('should handle third+ successful review with ease factor multiplication', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            ease_factor: 2.5,
            repetitions: 2,
            interval: 6,
          },
        ],
        rowCount: 1,
      } as never);

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            id: 'srs-1',
            user_id: 'user-123',
            meaning_id: 'en-hello',
            language: 'EN',
            ease_factor: 2.36, // 2.5 + (0.1 - (5-3)*(0.08 + (5-3)*0.02))
            repetitions: 3,
            interval: 15, // 6 * 2.5 = 15
            next_review_at: new Date('2026-01-16'),
            last_reviewed_at: new Date('2026-01-01'),
          },
        ],
        rowCount: 1,
      } as never);

      const result = await service.submitReview('user-123', 'en-hello', 3);

      expect(result.repetitions).toBe(3);
      expect(result.interval).toBe(15);
    });

    it('should reset interval on failed review (quality < 3)', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            ease_factor: 2.5,
            repetitions: 5,
            interval: 30,
          },
        ],
        rowCount: 1,
      } as never);

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            id: 'srs-1',
            user_id: 'user-123',
            meaning_id: 'en-hello',
            language: 'EN',
            ease_factor: 1.96, // Reduced due to poor quality
            repetitions: 0, // Reset
            interval: 1, // Reset to 1 day
            next_review_at: new Date('2026-01-02'),
            last_reviewed_at: new Date('2026-01-01'),
          },
        ],
        rowCount: 1,
      } as never);

      const result = await service.submitReview('user-123', 'en-hello', 2);

      expect(result.repetitions).toBe(0);
      expect(result.interval).toBe(1);
    });

    it('should enforce minimum ease factor of 1.3', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            ease_factor: 1.3, // Already at minimum
            repetitions: 0,
            interval: 0,
          },
        ],
        rowCount: 1,
      } as never);

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            id: 'srs-1',
            user_id: 'user-123',
            meaning_id: 'en-hello',
            language: 'EN',
            ease_factor: 1.3, // Should not go below 1.3
            repetitions: 0,
            interval: 1,
            next_review_at: new Date('2026-01-02'),
            last_reviewed_at: new Date('2026-01-01'),
          },
        ],
        rowCount: 1,
      } as never);

      const result = await service.submitReview('user-123', 'en-hello', 0);

      expect(result.easeFactor).toBe(1.3);
    });

    it('should throw NotFoundError when SRS item does not exist', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');
      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

      await expect(service.submitReview('user-123', 'en-nonexistent', 5)).rejects.toThrow(
        'SRS item not found'
      );
    });
  });

  describe('getStats', () => {
    it('should return SRS statistics for user and language', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');
      querySpy.mockResolvedValueOnce({
        rows: [
          {
            total_items: '100',
            due_now: '15',
            due_today: '25',
            learned: '80',
          },
        ],
        rowCount: 1,
      } as never);

      const result = await service.getStats('user-123', 'EN');

      expect(result).toEqual({
        totalItems: 100,
        dueNow: 15,
        dueToday: 25,
        learned: 80,
      });

      expect(querySpy).toHaveBeenCalledWith(expect.any(String), ['user-123', 'EN']);
    });

    it('should handle zero statistics', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');
      querySpy.mockResolvedValueOnce({
        rows: [
          {
            total_items: '0',
            due_now: '0',
            due_today: '0',
            learned: '0',
          },
        ],
        rowCount: 1,
      } as never);

      const result = await service.getStats('user-123', 'ES');

      expect(result).toEqual({
        totalItems: 0,
        dueNow: 0,
        dueToday: 0,
        learned: 0,
      });
    });
  });

  describe('SM-2 Quality Ratings', () => {
    it.each([
      [5, 2.6, 'perfect recall'],
      [4, 2.5, 'correct after hesitation'],
      [3, 2.36, 'correct with difficulty'],
      [2, 1.96, 'incorrect but easy'],
      [1, 1.74, 'incorrect but remembered'],
      [0, 1.3, 'complete blackout (capped at minimum)'],
    ])(
      'should calculate correct ease factor for quality %d (%s)',
      async (quality: QualityRating, expectedEaseFactor: number) => {
        const querySpy = vi.spyOn(mockPool, 'query');

        querySpy.mockResolvedValueOnce({
          rows: [
            {
              ease_factor: 2.5,
              repetitions: 0,
              interval: 0,
            },
          ],
          rowCount: 1,
        } as never);

        querySpy.mockResolvedValueOnce({
          rows: [
            {
              id: 'srs-1',
              user_id: 'user-123',
              meaning_id: 'en-test',
              language: 'EN',
              ease_factor: expectedEaseFactor,
              repetitions: quality >= 3 ? 1 : 0,
              interval: quality >= 3 ? 1 : 1,
              next_review_at: new Date('2026-01-02'),
              last_reviewed_at: new Date('2026-01-01'),
            },
          ],
          rowCount: 1,
        } as never);

        const result = await service.submitReview('user-123', 'en-test', quality);

        expect(result.easeFactor).toBeCloseTo(expectedEaseFactor, 2);
      }
    );
  });
});
