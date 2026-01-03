import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { RecognitionPracticeService } from '../../../../src/services/practice/recognition.service';

describe('RecognitionPracticeService', () => {
  let service: RecognitionPracticeService;
  let mockPool: Pool;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    } as unknown as Pool;

    service = new RecognitionPracticeService(mockPool);
  });

  describe('getRecognitionQuestions', () => {
    it('should return recognition questions from due SRS items', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      // Mock due items query
      querySpy.mockResolvedValueOnce({
        rows: [
          {
            meaning_id: 'en-hello',
            word_text: 'hello',
            definition: 'A greeting',
            audio_url: 'https://audio.example.com/hello.mp3',
            level: 'A1',
          },
        ],
        rowCount: 1,
      } as never);

      // Mock distractor generation (for word/definition)
      // This will query for the meaning level first
      querySpy.mockResolvedValueOnce({
        rows: [{ level: 'A1' }],
        rowCount: 1,
      } as never);

      // Then query for distractors
      querySpy.mockResolvedValueOnce({
        rows: [
          { usage_notes: 'To say farewell' },
          { usage_notes: 'An exclamation' },
          { usage_notes: 'A question' },
        ],
        rowCount: 3,
      } as never);

      const result = await service.getRecognitionQuestions('user-123', 'EN', 10);

      expect(result).toHaveLength(1);
      expect(result[0].meaningId).toBe('en-hello');
      expect(result[0].options).toHaveLength(4);
      expect(result[0].cefrLevel).toBe('A1');
      expect(result[0].audioUrl).toBe('https://audio.example.com/hello.mp3');
    });

    it('should return empty array when no items are due', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');
      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

      const result = await service.getRecognitionQuestions('user-123', 'EN', 10);

      expect(result).toHaveLength(0);
    });

    it('should handle missing definitions gracefully', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            meaning_id: 'en-test',
            word_text: 'test',
            definition: null,
            audio_url: null,
            level: 'A2',
          },
        ],
        rowCount: 1,
      } as never);

      // Mock distractor generation queries
      querySpy.mockResolvedValueOnce({
        rows: [{ level: 'A2' }],
        rowCount: 1,
      } as never);

      querySpy.mockResolvedValueOnce({
        rows: [{ usage_notes: 'Definition 1' }, { usage_notes: 'Definition 2' }],
        rowCount: 2,
      } as never);

      const result = await service.getRecognitionQuestions('user-123', 'EN', 10);

      expect(result).toHaveLength(1);
      // Should use fallback definition
      expect(result[0].prompt).toContain('test');
    });
  });

  describe('submitAnswer', () => {
    it('should handle correct answer and update SRS', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      // Mock get SRS item
      querySpy.mockResolvedValueOnce({
        rows: [
          {
            ease_factor: 2.5,
            repetitions: 1,
            interval: 1,
          },
        ],
        rowCount: 1,
      } as never);

      // Mock update SRS item
      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      } as never);

      // Mock get utterance for correct answer
      querySpy.mockResolvedValueOnce({
        rows: [{ text: 'hello', usage_notes: 'A greeting' }],
        rowCount: 1,
      } as never);

      const result = await service.submitAnswer('user-123', 'en-hello', 2, 2, 1500);

      expect(result.isCorrect).toBe(true);
      expect(result.explanation).toBe('Correct! Well done.');
      expect(result.interval).toBeGreaterThan(0);
    });

    it('should handle incorrect answer and reset SRS progress', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      // Mock get SRS item with some progress
      querySpy.mockResolvedValueOnce({
        rows: [
          {
            ease_factor: 2.5,
            repetitions: 3,
            interval: 15,
          },
        ],
        rowCount: 1,
      } as never);

      // Mock update SRS item
      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      } as never);

      // Mock get utterance
      querySpy.mockResolvedValueOnce({
        rows: [{ text: 'hello', usage_notes: 'A greeting' }],
        rowCount: 1,
      } as never);

      const result = await service.submitAnswer('user-123', 'en-hello', 0, 2, 1500);

      expect(result.isCorrect).toBe(false);
      expect(result.explanation).toContain('The correct answer was');
      expect(result.correctAnswer).toBe('hello');
    });

    it('should throw NotFoundError for non-existent SRS item', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');
      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

      await expect(service.submitAnswer('user-123', 'en-nonexistent', 0, 2, 1500)).rejects.toThrow(
        'SRS item not found'
      );
    });
  });

  describe('getStats', () => {
    it('should return recognition practice statistics', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');
      querySpy.mockResolvedValueOnce({
        rows: [
          {
            total_items: '50',
            due_now: '10',
            mastered: '25',
          },
        ],
        rowCount: 1,
      } as never);

      const result = await service.getStats('user-123', 'EN');

      expect(result).toEqual({
        totalItems: 50,
        dueNow: 10,
        mastered: 25,
      });
    });

    it('should handle zero statistics', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');
      querySpy.mockResolvedValueOnce({
        rows: [
          {
            total_items: '0',
            due_now: '0',
            mastered: '0',
          },
        ],
        rowCount: 1,
      } as never);

      const result = await service.getStats('user-123', 'ES');

      expect(result).toEqual({
        totalItems: 0,
        dueNow: 0,
        mastered: 0,
      });
    });
  });

  describe('SM-2 Algorithm', () => {
    it('should increase interval on correct answer (quality 4)', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      // First successful review
      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 0, interval: 0 }],
        rowCount: 1,
      } as never);

      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({
        rows: [{ text: 'word', usage_notes: null }],
        rowCount: 1,
      } as never);

      const result = await service.submitAnswer('user-123', 'en-word', 1, 1, 1000);

      expect(result.isCorrect).toBe(true);
      expect(result.interval).toBe(1); // First successful = 1 day
    });

    it('should reset interval on incorrect answer (quality 1)', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      // Item with existing progress
      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 5, interval: 30 }],
        rowCount: 1,
      } as never);

      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({
        rows: [{ text: 'word', usage_notes: null }],
        rowCount: 1,
      } as never);

      const result = await service.submitAnswer('user-123', 'en-word', 0, 1, 1000);

      expect(result.isCorrect).toBe(false);
      expect(result.interval).toBe(1); // Reset to 1 day
    });

    it('should set interval to 6 days on second successful review', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      // After first successful review
      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 1, interval: 1 }],
        rowCount: 1,
      } as never);

      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({
        rows: [{ text: 'word', usage_notes: null }],
        rowCount: 1,
      } as never);

      const result = await service.submitAnswer('user-123', 'en-word', 2, 2, 1000);

      expect(result.isCorrect).toBe(true);
      expect(result.interval).toBe(6); // Second successful = 6 days
    });
  });
});
