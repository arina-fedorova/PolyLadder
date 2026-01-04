import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { ProductionService } from '../../../../src/services/practice/production.service';

describe('ProductionService', () => {
  let service: ProductionService;
  let mockPool: Pool;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    } as unknown as Pool;

    service = new ProductionService(mockPool);
  });

  describe('getProductionExercises', () => {
    it('should return exercises with audio', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            meaning_id: 'meaning-1',
            text: 'Привет',
            audio_url: 'https://example.com/privet.mp3',
            audio_length: 2,
            romanization: 'Privet',
            translation: 'Hello',
            level: 'A1',
          },
          {
            meaning_id: 'meaning-2',
            text: 'Спасибо',
            audio_url: 'https://example.com/spasibo.mp3',
            audio_length: 3,
            romanization: 'Spasibo',
            translation: 'Thank you',
            level: 'A1',
          },
        ],
        rowCount: 2,
      } as never);

      const result = await service.getProductionExercises('user-1', 'RU', 10);

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Привет');
      expect(result[0].audioUrl).toBe('https://example.com/privet.mp3');
      expect(result[0].audioLength).toBe(2);
      expect(result[0].romanization).toBe('Privet');
      expect(result[0].translation).toBe('Hello');
      expect(result[0].cefrLevel).toBe('A1');
      expect(result[0].language).toBe('RU');
    });

    it('should return empty array when no exercises available', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

      const result = await service.getProductionExercises('user-1', 'RU', 10);

      expect(result).toEqual([]);
    });

    it('should use default audio length when null', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            meaning_id: 'meaning-1',
            text: 'Test',
            audio_url: 'https://example.com/test.mp3',
            audio_length: null,
            romanization: null,
            translation: null,
            level: 'A1',
          },
        ],
        rowCount: 1,
      } as never);

      const result = await service.getProductionExercises('user-1', 'RU', 10);

      expect(result[0].audioLength).toBe(5); // Default value
      expect(result[0].romanization).toBeNull();
      expect(result[0].translation).toBeNull();
    });
  });

  describe('submitAssessment', () => {
    it('should submit "easy" rating with quality 5', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      // Get SRS item
      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);

      // Update SRS
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      // Record attempt
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.submitAssessment('user-1', {
        meaningId: 'meaning-1',
        selfRating: 'easy',
        recordingDuration: 2.5,
        attemptNumber: 1,
        timeSpentMs: 5000,
      });

      expect(result.success).toBe(true);
      expect(result.qualityRating).toBe(5);
    });

    it('should submit "good" rating with quality 4', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.submitAssessment('user-1', {
        meaningId: 'meaning-1',
        selfRating: 'good',
        recordingDuration: 3.0,
        attemptNumber: 1,
        timeSpentMs: 6000,
      });

      expect(result.success).toBe(true);
      expect(result.qualityRating).toBe(4);
    });

    it('should submit "hard" rating with quality 3', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.submitAssessment('user-1', {
        meaningId: 'meaning-1',
        selfRating: 'hard',
        recordingDuration: 4.0,
        attemptNumber: 2,
        timeSpentMs: 8000,
      });

      expect(result.success).toBe(true);
      expect(result.qualityRating).toBe(3);
    });

    it('should submit "again" rating with quality 0', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.submitAssessment('user-1', {
        meaningId: 'meaning-1',
        selfRating: 'again',
        recordingDuration: 1.0,
        attemptNumber: 3,
        timeSpentMs: 10000,
      });

      expect(result.success).toBe(true);
      expect(result.qualityRating).toBe(0);
    });

    it('should handle missing SRS item gracefully', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      // No SRS item found
      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

      // Record attempt
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.submitAssessment('user-1', {
        meaningId: 'meaning-1',
        selfRating: 'good',
        recordingDuration: 2.0,
        attemptNumber: 1,
        timeSpentMs: 5000,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return practice statistics', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            total_exercises: '25',
            correct_count: '20',
            avg_quality: '0.8',
          },
        ],
        rowCount: 1,
      } as never);

      const stats = await service.getStats('user-1', 'RU');

      expect(stats.totalExercises).toBe(25);
      expect(stats.correctCount).toBe(20);
      expect(stats.accuracy).toBe(80);
      expect(stats.avgQuality).toBe(80);
    });

    it('should handle zero exercises', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            total_exercises: '0',
            correct_count: '0',
            avg_quality: null,
          },
        ],
        rowCount: 1,
      } as never);

      const stats = await service.getStats('user-1', 'RU');

      expect(stats.totalExercises).toBe(0);
      expect(stats.correctCount).toBe(0);
      expect(stats.accuracy).toBe(0);
      expect(stats.avgQuality).toBeNull();
    });
  });

  describe('selfRatingToQuality', () => {
    it('should convert "again" to 0', () => {
      expect(service.selfRatingToQuality('again')).toBe(0);
    });

    it('should convert "hard" to 3', () => {
      expect(service.selfRatingToQuality('hard')).toBe(3);
    });

    it('should convert "good" to 4', () => {
      expect(service.selfRatingToQuality('good')).toBe(4);
    });

    it('should convert "easy" to 5', () => {
      expect(service.selfRatingToQuality('easy')).toBe(5);
    });
  });

  describe('SRS integration', () => {
    it('should reset repetitions on "again" rating', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 5, interval: 30 }],
        rowCount: 1,
      } as never);

      // Update SRS
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      // Record attempt
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      await service.submitAssessment('user-1', {
        meaningId: 'meaning-1',
        selfRating: 'again',
        recordingDuration: 1.0,
        attemptNumber: 1,
        timeSpentMs: 5000,
      });

      // Verify SRS update was called with reset values
      const updateCall = querySpy.mock.calls[1];
      const params = updateCall[1] as unknown[];
      expect(params[1]).toBe(0); // newRepetitions reset to 0
      expect(params[2]).toBe(1); // newInterval reset to 1
    });

    it('should increase interval on successful rating', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 3, interval: 10 }],
        rowCount: 1,
      } as never);

      // Update SRS
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      // Record attempt
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      await service.submitAssessment('user-1', {
        meaningId: 'meaning-1',
        selfRating: 'easy',
        recordingDuration: 2.0,
        attemptNumber: 1,
        timeSpentMs: 5000,
      });

      // Verify SRS update was called with increased values
      const updateCall = querySpy.mock.calls[1];
      const params = updateCall[1] as unknown[];
      expect(params[1]).toBe(4); // newRepetitions = 3 + 1
      expect(params[2]).toBeGreaterThan(10); // newInterval should increase
    });
  });
});
