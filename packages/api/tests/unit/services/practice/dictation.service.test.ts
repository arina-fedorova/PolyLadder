import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { DictationService } from '../../../../src/services/practice/dictation.service';

describe('DictationService', () => {
  let service: DictationService;
  let mockPool: Pool;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    } as unknown as Pool;

    service = new DictationService(mockPool);
  });

  describe('getDictationExercises', () => {
    it('should return exercises with audio', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            meaning_id: 'en-hello',
            text: 'Hello, how are you?',
            audio_url: 'https://example.com/hello.mp3',
            level: 'A1',
          },
          {
            meaning_id: 'en-goodbye',
            text: 'Goodbye, see you later.',
            audio_url: 'https://example.com/goodbye.mp3',
            level: 'A1',
          },
        ],
        rowCount: 2,
      } as never);

      const result = await service.getDictationExercises('user-1', 'EN', 10);

      expect(result).toHaveLength(2);
      expect(result[0].audioUrl).toBe('https://example.com/hello.mp3');
      expect(result[0].correctTranscript).toBe('Hello, how are you?');
      expect(result[0].wordCount).toBe(4);
      expect(result[0].cefrLevel).toBe('A1');
    });

    it('should return empty array when no exercises available', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

      const result = await service.getDictationExercises('user-1', 'EN', 10);

      expect(result).toEqual([]);
    });
  });

  describe('validateDictation', () => {
    it('should validate exact match as correct', async () => {
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

      const result = await service.validateDictation(
        'user-1',
        'en-hello',
        'Hello, how are you?',
        'Hello, how are you?',
        5000
      );

      expect(result.isCorrect).toBe(true);
      expect(result.characterAccuracy).toBe(1.0);
      expect(result.wordAccuracy).toBe(1.0);
      expect(result.qualityRating).toBe(5);
    });

    it('should handle case-insensitive matching', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.validateDictation(
        'user-1',
        'en-hello',
        'HELLO, HOW ARE YOU?',
        'Hello, how are you?',
        5000
      );

      expect(result.isCorrect).toBe(true);
      expect(result.characterAccuracy).toBe(1.0);
    });

    it('should calculate partial credit for minor errors', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      // One character typo: "yuo" vs "you" - distance 2 in 19 chars = ~0.89 accuracy
      const result = await service.validateDictation(
        'user-1',
        'en-hello',
        'Hello, how are yuo?',
        'Hello, how are you?',
        5000
      );

      // Typo drops accuracy below 90%
      expect(result.characterAccuracy).toBeGreaterThan(0.85);
      expect(result.characterAccuracy).toBeLessThan(0.95);
      expect(result.wordAccuracy).toBe(0.75); // 3/4 words correct
    });

    it('should mark as incorrect when accuracy below 90%', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.validateDictation(
        'user-1',
        'en-hello',
        'Hi there',
        'Hello, how are you?',
        5000
      );

      expect(result.isCorrect).toBe(false);
      expect(result.characterAccuracy).toBeLessThan(0.9);
    });

    it('should generate correct word diff', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.validateDictation(
        'user-1',
        'en-test',
        'the cat sat on mat',
        'the cat sat on the mat',
        5000
      );

      // Should detect missing "the" before "mat"
      const deletions = result.diff.filter((d) => d.type === 'deletion');
      expect(deletions.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect insertions in user text', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.validateDictation(
        'user-1',
        'en-test',
        'the big cat sat',
        'the cat sat',
        5000
      );

      const insertions = result.diff.filter((d) => d.type === 'insertion');
      expect(insertions.length).toBe(1);
      expect(insertions[0].actual).toBe('big');
    });

    it('should detect substitutions', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.validateDictation(
        'user-1',
        'en-test',
        'the dog sat',
        'the cat sat',
        5000
      );

      const substitutions = result.diff.filter((d) => d.type === 'substitution');
      expect(substitutions.length).toBe(1);
      expect(substitutions[0].expected).toBe('cat');
      expect(substitutions[0].actual).toBe('dog');
    });
  });

  describe('getStats', () => {
    it('should return practice statistics', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            total_exercises: '20',
            correct_count: '15',
            avg_accuracy: '0.85',
          },
        ],
        rowCount: 1,
      } as never);

      const stats = await service.getStats('user-1', 'EN');

      expect(stats.totalExercises).toBe(20);
      expect(stats.correctCount).toBe(15);
      expect(stats.accuracy).toBe(75);
      expect(stats.avgCharacterAccuracy).toBe(85);
    });

    it('should handle zero exercises', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            total_exercises: '0',
            correct_count: '0',
            avg_accuracy: null,
          },
        ],
        rowCount: 1,
      } as never);

      const stats = await service.getStats('user-1', 'EN');

      expect(stats.totalExercises).toBe(0);
      expect(stats.accuracy).toBe(0);
      expect(stats.avgCharacterAccuracy).toBeNull();
    });
  });

  describe('accuracy to quality rating', () => {
    it('should assign quality 5 for 95%+ accuracy', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.validateDictation(
        'user-1',
        'en-test',
        'hello world',
        'hello world',
        1000
      );

      expect(result.qualityRating).toBe(5);
    });

    it('should assign quality 4 for 85-95% accuracy', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      // ~90% accuracy (1 char wrong in 10)
      const result = await service.validateDictation(
        'user-1',
        'en-test',
        'hello worldd',
        'hello world!',
        1000
      );

      expect(result.qualityRating).toBeGreaterThanOrEqual(4);
    });

    it('should assign quality 0 for <50% accuracy', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.validateDictation(
        'user-1',
        'en-test',
        'completely different text here',
        'hello world',
        1000
      );

      expect(result.qualityRating).toBe(0);
    });
  });

  describe('text normalization', () => {
    it('should normalize whitespace', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.validateDictation(
        'user-1',
        'en-test',
        'hello   world',
        'hello world',
        1000
      );

      expect(result.characterAccuracy).toBe(1.0);
    });

    it('should handle smart quotes', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.validateDictation(
        'user-1',
        'en-test',
        "it's fine",
        "it's fine",
        1000
      );

      expect(result.characterAccuracy).toBe(1.0);
    });
  });
});
