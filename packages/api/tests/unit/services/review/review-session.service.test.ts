import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool, QueryResult } from 'pg';
import { ReviewSessionService } from '../../../../src/services/review/review-session.service';

// Mock pg Pool
const mockQuery = vi.fn();
const mockPool = {
  query: mockQuery,
} as unknown as Pool;

describe('ReviewSessionService', () => {
  let service: ReviewSessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ReviewSessionService(mockPool);
  });

  describe('startSession', () => {
    it('should create a new session and return queue count', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ count: '15' }],
          rowCount: 1,
        } as QueryResult)
        .mockResolvedValueOnce({
          rows: [{ id: 'session-123', started_at: new Date('2024-01-01T10:00:00Z') }],
          rowCount: 1,
        } as QueryResult);

      const result = await service.startSession('user-123');

      expect(result.sessionId).toBe('session-123');
      expect(result.itemsInQueue).toBe(15);
      expect(result.startedAt).toBe('2024-01-01T10:00:00.000Z');
    });

    it('should handle language filter', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ count: '10' }],
          rowCount: 1,
        } as QueryResult)
        .mockResolvedValueOnce({
          rows: [{ id: 'session-456', started_at: new Date('2024-01-01T10:00:00Z') }],
          rowCount: 1,
        } as QueryResult);

      const result = await service.startSession('user-123', 'EN');

      expect(result.sessionId).toBe('session-456');
      expect(result.itemsInQueue).toBe(10);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should return 0 items when queue is empty', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ count: '0' }],
          rowCount: 1,
        } as QueryResult)
        .mockResolvedValueOnce({
          rows: [{ id: 'session-789', started_at: new Date() }],
          rowCount: 1,
        } as QueryResult);

      const result = await service.startSession('user-123');

      expect(result.itemsInQueue).toBe(0);
    });
  });

  describe('getQueue', () => {
    it('should return items from user_srs_schedule when no language filter', async () => {
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'item-1',
            item_type: 'vocabulary',
            item_id: 'vocab-1',
            due_date: now,
            interval_days: 1,
            ease_factor: '2.5',
            repetitions: 1,
          },
        ],
        rowCount: 1,
      } as QueryResult);

      const result = await service.getQueue('user-123');

      expect(result.total).toBe(1);
      expect(result.items[0].itemType).toBe('vocabulary');
      expect(result.items[0].easeFactor).toBe(2.5);
    });

    it('should return vocabulary items with content when language filter provided', async () => {
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'item-1',
            item_type: 'vocabulary',
            item_id: 'meaning-1',
            due_date: now,
            interval_days: 6,
            ease_factor: '2.6',
            repetitions: 2,
            word_text: 'Hello',
            definition: 'A greeting',
            audio_url: 'http://audio.mp3',
            level: 'A1',
          },
        ],
        rowCount: 1,
      } as QueryResult);

      const result = await service.getQueue('user-123', 'EN', 20);

      expect(result.total).toBe(1);
      expect(result.items[0].content.wordText).toBe('Hello');
      expect(result.items[0].content.definition).toBe('A greeting');
      expect(result.items[0].content.audioUrl).toBe('http://audio.mp3');
      expect(result.items[0].content.level).toBe('A1');
    });

    it('should return next review time when queue is empty', async () => {
      const nextDue = new Date('2024-01-02T10:00:00Z');
      mockQuery
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        } as unknown as QueryResult)
        .mockResolvedValueOnce({
          rows: [{ next_due: nextDue }],
          rowCount: 1,
        } as QueryResult);

      const result = await service.getQueue('user-123');

      expect(result.total).toBe(0);
      expect(result.items).toHaveLength(0);
      expect(result.nextReviewAt).toBe('2024-01-02T10:00:00.000Z');
    });
  });

  describe('submitReview', () => {
    it('should update SRS schedule with new values', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'srs-1', interval_days: 1, ease_factor: '2.5', repetitions: 1 }],
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

      const result = await service.submitReview('user-123', {
        itemId: 'vocab-1',
        itemType: 'vocabulary',
        rating: 'good',
        responseTimeMs: 2500,
        wasCorrect: true,
      });

      expect(result.success).toBe(true);
      expect(result.nextReview.interval).toBe(6);
      expect(result.nextReview.repetitions).toBe(2);
    });

    it('should reset on "again" rating', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'srs-1', interval_days: 15, ease_factor: '2.5', repetitions: 3 }],
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

      const result = await service.submitReview('user-123', {
        itemId: 'vocab-1',
        itemType: 'vocabulary',
        rating: 'again',
        responseTimeMs: 5000,
        wasCorrect: false,
      });

      expect(result.success).toBe(true);
      expect(result.nextReview.interval).toBe(1);
      expect(result.nextReview.repetitions).toBe(0);
    });

    it('should throw NotFoundError when item not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      await expect(
        service.submitReview('user-123', {
          itemId: 'nonexistent',
          itemType: 'vocabulary',
          rating: 'good',
          responseTimeMs: 1000,
          wasCorrect: true,
        })
      ).rejects.toThrow('SRS item not found');
    });

    it('should update session progress when sessionId provided', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'srs-1', interval_days: 1, ease_factor: '2.5', repetitions: 1 }],
          rowCount: 1,
        } as QueryResult)
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
        } as unknown as QueryResult)
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
        } as unknown as QueryResult)
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
        } as unknown as QueryResult);

      await service.submitReview('user-123', {
        itemId: 'vocab-1',
        itemType: 'vocabulary',
        rating: 'good',
        responseTimeMs: 2000,
        wasCorrect: true,
        sessionId: 'session-123',
      });

      // Verify session update was called
      expect(mockQuery).toHaveBeenCalledTimes(4);
    });
  });

  describe('getSession', () => {
    it('should return session stats when found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'session-123',
            user_id: 'user-123',
            language: 'EN',
            items_reviewed: 10,
            correct_count: 8,
            total_response_time_ms: 25000,
            status: 'active',
            started_at: new Date('2024-01-01T10:00:00Z'),
            completed_at: null,
            last_activity_at: new Date('2024-01-01T10:10:00Z'),
            duration_seconds: '600',
          },
        ],
        rowCount: 1,
      } as QueryResult);

      const result = await service.getSession('session-123', 'user-123');

      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe('session-123');
      expect(result!.itemsReviewed).toBe(10);
      expect(result!.correctCount).toBe(8);
      expect(result!.accuracyPct).toBe(80);
      expect(result!.durationSeconds).toBe(600);
      expect(result!.avgResponseTimeMs).toBe(2500);
      expect(result!.status).toBe('active');
    });

    it('should return null when session not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      const result = await service.getSession('nonexistent', 'user-123');

      expect(result).toBeNull();
    });
  });

  describe('completeSession', () => {
    it('should complete session and return final stats', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'session-123',
            user_id: 'user-123',
            language: 'EN',
            items_reviewed: 20,
            correct_count: 18,
            total_response_time_ms: 50000,
            status: 'completed',
            started_at: new Date('2024-01-01T10:00:00Z'),
            completed_at: new Date('2024-01-01T10:30:00Z'),
            last_activity_at: new Date('2024-01-01T10:30:00Z'),
            duration_seconds: '1800',
          },
        ],
        rowCount: 1,
      } as QueryResult);

      const result = await service.completeSession('session-123', 'user-123');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
      expect(result!.itemsReviewed).toBe(20);
      expect(result!.accuracyPct).toBe(90);
      expect(result!.durationSeconds).toBe(1800);
    });

    it('should return null when session not found or already completed', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      const result = await service.completeSession('nonexistent', 'user-123');

      expect(result).toBeNull();
    });
  });

  describe('getActiveSession', () => {
    it('should return active session when exists', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'session-active',
            user_id: 'user-123',
            language: null,
            items_reviewed: 5,
            correct_count: 4,
            total_response_time_ms: 12000,
            status: 'active',
            started_at: new Date('2024-01-01T10:00:00Z'),
            completed_at: null,
            last_activity_at: new Date('2024-01-01T10:05:00Z'),
            duration_seconds: '300',
          },
        ],
        rowCount: 1,
      } as QueryResult);

      const result = await service.getActiveSession('user-123');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('active');
    });

    it('should return null when no active session', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      const result = await service.getActiveSession('user-123');

      expect(result).toBeNull();
    });
  });

  describe('getSessionHistory', () => {
    it('should return list of completed sessions', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'session-1',
            user_id: 'user-123',
            language: 'EN',
            items_reviewed: 15,
            correct_count: 12,
            total_response_time_ms: 30000,
            status: 'completed',
            started_at: new Date('2024-01-02T10:00:00Z'),
            completed_at: new Date('2024-01-02T10:20:00Z'),
            last_activity_at: new Date('2024-01-02T10:20:00Z'),
            duration_seconds: '1200',
          },
          {
            id: 'session-2',
            user_id: 'user-123',
            language: 'EN',
            items_reviewed: 10,
            correct_count: 10,
            total_response_time_ms: 20000,
            status: 'completed',
            started_at: new Date('2024-01-01T10:00:00Z'),
            completed_at: new Date('2024-01-01T10:15:00Z'),
            last_activity_at: new Date('2024-01-01T10:15:00Z'),
            duration_seconds: '900',
          },
        ],
        rowCount: 2,
      } as QueryResult);

      const result = await service.getSessionHistory('user-123', 5);

      expect(result).toHaveLength(2);
      expect(result[0].sessionId).toBe('session-1');
      expect(result[0].accuracyPct).toBe(80);
      expect(result[1].sessionId).toBe('session-2');
      expect(result[1].accuracyPct).toBe(100);
    });
  });

  describe('accuracy calculation', () => {
    it('should handle 0 items reviewed', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'session-empty',
            user_id: 'user-123',
            language: null,
            items_reviewed: 0,
            correct_count: 0,
            total_response_time_ms: 0,
            status: 'active',
            started_at: new Date(),
            completed_at: null,
            last_activity_at: new Date(),
            duration_seconds: '60',
          },
        ],
        rowCount: 1,
      } as QueryResult);

      const result = await service.getSession('session-empty', 'user-123');

      expect(result!.accuracyPct).toBe(0);
      expect(result!.avgResponseTimeMs).toBe(0);
    });
  });
});
