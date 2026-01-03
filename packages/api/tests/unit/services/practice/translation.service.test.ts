import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { TranslationService } from '../../../../src/services/practice/translation.service';

describe('TranslationService', () => {
  let service: TranslationService;
  let mockPool: Pool;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    } as unknown as Pool;

    service = new TranslationService(mockPool);
  });

  describe('getTranslationExercises', () => {
    it('should return exercises for valid language pair', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            meaning_id: 'meaning-1',
            source_text: 'Hello',
            level: 'A1',
            target_texts: ['Привет', 'Здравствуйте'],
          },
          {
            meaning_id: 'meaning-2',
            source_text: 'Goodbye',
            level: 'A1',
            target_texts: ['До свидания'],
          },
        ],
        rowCount: 2,
      } as never);

      const result = await service.getTranslationExercises('user-1', 'EN', 'RU', 10);

      expect(result).toHaveLength(2);
      expect(result[0].sourceText).toBe('Hello');
      expect(result[0].sourceLanguage).toBe('EN');
      expect(result[0].targetLanguage).toBe('RU');
      expect(result[0].acceptableTranslations).toEqual(['Привет', 'Здравствуйте']);
      expect(result[0].hint.firstWord).toBe('Привет');
      expect(result[0].hint.wordCount).toBe(1);
    });

    it('should throw error when source and target are same', async () => {
      await expect(service.getTranslationExercises('user-1', 'EN', 'EN', 10)).rejects.toThrow(
        'Source and target languages must be different'
      );
    });

    it('should return empty array when no exercises available', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

      const result = await service.getTranslationExercises('user-1', 'EN', 'RU', 10);

      expect(result).toEqual([]);
    });

    it('should filter out items with no target translations', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            meaning_id: 'meaning-1',
            source_text: 'Hello',
            level: 'A1',
            target_texts: ['Привет'],
          },
          {
            meaning_id: 'meaning-2',
            source_text: 'World',
            level: 'A1',
            target_texts: [], // Empty
          },
          {
            meaning_id: 'meaning-3',
            source_text: 'Test',
            level: 'A1',
            target_texts: null, // Null
          },
        ],
        rowCount: 3,
      } as never);

      const result = await service.getTranslationExercises('user-1', 'EN', 'RU', 10);

      expect(result).toHaveLength(1);
      expect(result[0].sourceText).toBe('Hello');
    });
  });

  describe('validateTranslation', () => {
    it('should validate exact match as correct', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      // SRS query
      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);

      // Update SRS
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      // Record attempt
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.validateTranslation(
        'user-1',
        'meaning-1',
        'Привет',
        ['Привет', 'Здравствуйте'],
        5000
      );

      expect(result.isCorrect).toBe(true);
      expect(result.similarity).toBeGreaterThanOrEqual(0.99);
      expect(result.matchedTranslation).toBe('Привет');
      expect(result.feedback).toContain('Perfect');
    });

    it('should accept case-insensitive match', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.validateTranslation(
        'user-1',
        'meaning-1',
        'HELLO WORLD',
        ['Hello world', 'hello world'],
        5000
      );

      expect(result.isCorrect).toBe(true);
      expect(result.similarity).toBeGreaterThanOrEqual(0.99);
    });

    it('should match alternative translations', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.validateTranslation(
        'user-1',
        'meaning-1',
        'Здравствуйте',
        ['Привет', 'Здравствуйте'],
        5000
      );

      expect(result.isCorrect).toBe(true);
      expect(result.matchedTranslation).toBe('Здравствуйте');
    });

    it('should accept fuzzy match above 85% threshold', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      // Minor typo - one letter different in long word
      const result = await service.validateTranslation(
        'user-1',
        'meaning-1',
        'Здравствуйтее', // Extra 'е' at end
        ['Здравствуйте'],
        5000
      );

      expect(result.similarity).toBeGreaterThan(0.85);
      expect(result.isCorrect).toBe(true);
    });

    it('should reject translation below 85% similarity', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.validateTranslation(
        'user-1',
        'meaning-1',
        'Wrong answer completely',
        ['Правильный ответ'],
        5000
      );

      expect(result.isCorrect).toBe(false);
      expect(result.similarity).toBeLessThan(0.85);
    });

    it('should include all acceptable translations in result', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const acceptableTranslations = ['Option 1', 'Option 2', 'Option 3'];

      const result = await service.validateTranslation(
        'user-1',
        'meaning-1',
        'Option 1',
        acceptableTranslations,
        5000
      );

      expect(result.alternativeTranslations).toEqual(acceptableTranslations);
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
            avg_similarity: '0.88',
          },
        ],
        rowCount: 1,
      } as never);

      const stats = await service.getStats('user-1', 'EN', 'RU');

      expect(stats.totalExercises).toBe(20);
      expect(stats.correctCount).toBe(15);
      expect(stats.accuracy).toBe(75);
      expect(stats.avgSimilarity).toBe(88);
    });

    it('should handle zero exercises', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            total_exercises: '0',
            correct_count: '0',
            avg_similarity: null,
          },
        ],
        rowCount: 1,
      } as never);

      const stats = await service.getStats('user-1', 'EN', 'RU');

      expect(stats.totalExercises).toBe(0);
      expect(stats.accuracy).toBe(0);
      expect(stats.avgSimilarity).toBeNull();
    });
  });

  describe('generateHint', () => {
    it('should generate hint level 1 - first word', () => {
      const hint = service.generateHint(['The quick brown fox', 'A fast brown fox'], 1);
      expect(hint).toBe('First word: "The"');
    });

    it('should generate hint level 2 - word count', () => {
      const hint = service.generateHint(['The quick brown fox'], 2);
      expect(hint).toBe('Word count: 4 words');
    });

    it('should generate hint level 3 - partial translation', () => {
      const hint = service.generateHint(['The quick brown fox'], 3);
      expect(hint).toBe('Beginning: "The quick..."');
    });

    it('should handle empty translations', () => {
      const hint = service.generateHint([], 1);
      expect(hint).toBe('No hint available');
    });

    it('should handle single word translation', () => {
      const hint = service.generateHint(['Hello'], 3);
      expect(hint).toBe('Beginning: "Hello..."');
    });
  });

  describe('similarity to quality rating', () => {
    it('should assign quality 5 for 95%+ similarity', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.validateTranslation(
        'user-1',
        'meaning-1',
        'Exact match',
        ['Exact match'],
        1000
      );

      expect(result.qualityRating).toBe(5);
    });

    it('should assign quality 0 for <50% similarity', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.validateTranslation(
        'user-1',
        'meaning-1',
        'Completely wrong answer here',
        ['Совсем другой текст'],
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

      const result = await service.validateTranslation(
        'user-1',
        'meaning-1',
        'hello   world',
        ['hello world'],
        1000
      );

      expect(result.similarity).toBeGreaterThanOrEqual(0.99);
    });

    it('should ignore punctuation', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.validateTranslation(
        'user-1',
        'meaning-1',
        'Hello, world!',
        ['Hello world'],
        1000
      );

      expect(result.similarity).toBeGreaterThanOrEqual(0.99);
    });

    it('should ignore quotes', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.validateTranslation(
        'user-1',
        'meaning-1',
        '"Hello" world',
        ['Hello world'],
        1000
      );

      expect(result.similarity).toBeGreaterThanOrEqual(0.99);
    });
  });
});
