import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool, QueryResult } from 'pg';
import { SRSService } from '../../../../src/services/srs/srs.service';
import { SRSScheduleItem, PerformanceRating } from '../../../../src/services/srs/srs.interface';

// Mock pg Pool
const mockQuery = vi.fn();
const mockPool = {
  query: mockQuery,
} as unknown as Pool;

describe('SRSService', () => {
  let service: SRSService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SRSService(mockPool);
  });

  describe('calculateNextReview', () => {
    it('should calculate next review using SM-2 algorithm', () => {
      const schedule: SRSScheduleItem = {
        id: 'test-id',
        userId: 'user-123',
        itemType: 'vocabulary',
        itemId: 'item-456',
        language: 'EN',
        dueDate: new Date(),
        interval: 1,
        repetitions: 1,
        easeFactor: 2.5,
        lastReviewedAt: null,
      };

      const result = service.calculateNextReview(schedule, 'good');

      expect(result.newRepetitions).toBe(2);
      expect(result.newInterval).toBe(6);
      expect(result.newEaseFactor).toBeCloseTo(2.5, 1);
    });
  });

  describe('addToSchedule', () => {
    it('should add new vocabulary item to schedule', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'new-srs-id' }],
        rowCount: 1,
      } as QueryResult);

      const result = await service.addToSchedule('user-123', 'vocabulary', 'meaning-456', 'EN');

      expect(result).toBe('new-srs-id');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_srs_items'),
        expect.arrayContaining(['user-123', 'meaning-456', 'EN'])
      );
    });

    it('should return existing ID if item already exists', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        } as unknown as QueryResult)
        .mockResolvedValueOnce({
          rows: [{ id: 'existing-id' }],
          rowCount: 1,
        } as QueryResult);

      const result = await service.addToSchedule('user-123', 'vocabulary', 'meaning-456', 'EN');

      expect(result).toBe('existing-id');
    });

    it('should throw error for unsupported item types', async () => {
      await expect(
        service.addToSchedule('user-123', 'grammar', 'grammar-456', 'EN')
      ).rejects.toThrow("Item type 'grammar' is not yet supported");
    });
  });

  describe('getDueItems', () => {
    it('should return due items ordered by due date', async () => {
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'item-1',
            user_id: 'user-123',
            meaning_id: 'meaning-1',
            language: 'EN',
            interval: 1,
            repetitions: 1,
            ease_factor: 2.5,
            next_review_at: now,
            last_reviewed_at: null,
          },
          {
            id: 'item-2',
            user_id: 'user-123',
            meaning_id: 'meaning-2',
            language: 'EN',
            interval: 6,
            repetitions: 2,
            ease_factor: 2.6,
            next_review_at: now,
            last_reviewed_at: now,
          },
        ],
        rowCount: 2,
      } as QueryResult);

      const result = await service.getDueItems('user-123', 'EN', 10);

      expect(result).toHaveLength(2);
      expect(result[0].itemId).toBe('meaning-1');
      expect(result[1].itemId).toBe('meaning-2');
      expect(result[0].itemType).toBe('vocabulary');
    });

    it('should filter by language when provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      await service.getDueItems('user-123', 'RU', 20);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND language = $2'),
        expect.arrayContaining(['user-123', 'RU', 20])
      );
    });

    it('should not filter by language when not provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      await service.getDueItems('user-123');

      const call = mockQuery.mock.calls[0];
      expect(call[0]).not.toContain('AND language = $2');
    });
  });

  describe('recordReview', () => {
    it('should update schedule after successful review', async () => {
      const now = new Date();

      // Mock getScheduleItem
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'srs-id',
              user_id: 'user-123',
              meaning_id: 'meaning-456',
              language: 'EN',
              interval: 1,
              repetitions: 1,
              ease_factor: 2.5,
              next_review_at: now,
              last_reviewed_at: null,
            },
          ],
          rowCount: 1,
        } as QueryResult)
        // Mock update
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
        } as unknown as QueryResult)
        // Mock history insert
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
        } as unknown as QueryResult);

      const result = await service.recordReview('user-123', 'meaning-456', 'good');

      expect(result.newRepetitions).toBe(2);
      expect(result.newInterval).toBe(6);
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('should throw NotFoundError when item does not exist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      await expect(service.recordReview('user-123', 'nonexistent', 'good')).rejects.toThrow(
        'SRS item not found'
      );
    });

    it('should reset on "again" rating', async () => {
      const now = new Date();

      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'srs-id',
              user_id: 'user-123',
              meaning_id: 'meaning-456',
              language: 'EN',
              interval: 15,
              repetitions: 3,
              ease_factor: 2.5,
              next_review_at: now,
              last_reviewed_at: now,
            },
          ],
          rowCount: 1,
        } as QueryResult)
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
        } as unknown as QueryResult)
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
        } as unknown as QueryResult);

      const result = await service.recordReview('user-123', 'meaning-456', 'again');

      expect(result.newRepetitions).toBe(0);
      expect(result.newInterval).toBe(1);
    });
  });

  describe('getScheduleItem', () => {
    it('should return schedule item when found', async () => {
      const now = new Date();

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'srs-id',
            user_id: 'user-123',
            meaning_id: 'meaning-456',
            language: 'EN',
            interval: 6,
            repetitions: 2,
            ease_factor: 2.5,
            next_review_at: now,
            last_reviewed_at: now,
          },
        ],
        rowCount: 1,
      } as QueryResult);

      const result = await service.getScheduleItem('user-123', 'meaning-456');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('srs-id');
      expect(result?.itemId).toBe('meaning-456');
      expect(result?.interval).toBe(6);
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      const result = await service.getScheduleItem('user-123', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('bulkAddToSchedule', () => {
    it('should bulk insert multiple items', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 3,
      } as unknown as QueryResult);

      const items = [
        { itemId: 'meaning-1', language: 'EN' },
        { itemId: 'meaning-2', language: 'EN' },
        { itemId: 'meaning-3', language: 'EN' },
      ];

      const result = await service.bulkAddToSchedule('user-123', items);

      expect(result).toBe(3);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('VALUES'), expect.any(Array));
    });

    it('should return 0 for empty items array', async () => {
      const result = await service.bulkAddToSchedule('user-123', []);

      expect(result).toBe(0);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return SRS statistics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            total_items: '50',
            due_now: '10',
            learned: '25',
            avg_ease_factor: '2.45',
          },
        ],
        rowCount: 1,
      } as QueryResult);

      const result = await service.getStats('user-123', 'EN');

      expect(result.totalItems).toBe(50);
      expect(result.dueNow).toBe(10);
      expect(result.learned).toBe(25);
      expect(result.averageEaseFactor).toBeCloseTo(2.45, 2);
    });

    it('should return null for average when no items', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            total_items: '0',
            due_now: '0',
            learned: '0',
            avg_ease_factor: null,
          },
        ],
        rowCount: 1,
      } as QueryResult);

      const result = await service.getStats('user-123');

      expect(result.totalItems).toBe(0);
      expect(result.averageEaseFactor).toBeNull();
    });
  });

  describe('rating types', () => {
    const ratings: PerformanceRating[] = ['again', 'hard', 'good', 'easy'];

    ratings.forEach((rating) => {
      it(`should handle "${rating}" rating correctly`, () => {
        const schedule: SRSScheduleItem = {
          id: 'test-id',
          userId: 'user-123',
          itemType: 'vocabulary',
          itemId: 'item-456',
          language: 'EN',
          dueDate: new Date(),
          interval: 6,
          repetitions: 2,
          easeFactor: 2.5,
          lastReviewedAt: null,
        };

        const result = service.calculateNextReview(schedule, rating);

        expect(result).toHaveProperty('nextDueDate');
        expect(result).toHaveProperty('newInterval');
        expect(result).toHaveProperty('newRepetitions');
        expect(result).toHaveProperty('newEaseFactor');
      });
    });
  });
});
