import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool, QueryResult } from 'pg';
import { VocabularyAnalyticsService } from '../../../../src/services/analytics';

const mockQuery = vi.fn();
const mockPool = {
  query: mockQuery,
} as unknown as Pool;

describe('VocabularyAnalyticsService', () => {
  let service: VocabularyAnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new VocabularyAnalyticsService(mockPool);
  });

  describe('getVocabularyStats', () => {
    it('should return vocabulary statistics', async () => {
      // Mock state counts
      mockQuery.mockResolvedValueOnce({
        rows: [
          { state: 'unknown', count: '50' },
          { state: 'learning', count: '30' },
          { state: 'known', count: '20' },
        ],
        rowCount: 3,
      } as unknown as QueryResult);

      // Mock language breakdown
      mockQuery.mockResolvedValueOnce({
        rows: [
          { language: 'ES', total_words: '60', unknown: '30', learning: '20', known: '10' },
          { language: 'IT', total_words: '40', unknown: '20', learning: '10', known: '10' },
        ],
        rowCount: 2,
      } as unknown as QueryResult);

      // Mock CEFR distribution
      mockQuery.mockResolvedValueOnce({
        rows: [
          { level: 'A1', count: '40' },
          { level: 'A2', count: '35' },
          { level: 'B1', count: '25' },
        ],
        rowCount: 3,
      } as unknown as QueryResult);

      // Mock recently learned
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            meaning_id: 'meaning-1',
            text: 'hola',
            language: 'ES',
            learned_at: new Date('2024-01-15'),
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.getVocabularyStats('user-123');

      expect(result.totalWords).toBe(100);
      expect(result.byState.unknown).toBe(50);
      expect(result.byState.learning).toBe(30);
      expect(result.byState.known).toBe(20);
      expect(result.byLanguage).toHaveLength(2);
      expect(result.byLanguage[0].language).toBe('ES');
      expect(result.byCEFR).toHaveLength(3);
      expect(result.recentlyLearned).toHaveLength(1);
      expect(result.recentlyLearned[0].text).toBe('hola');
    });

    it('should filter by language when provided', async () => {
      // Mock state counts
      mockQuery.mockResolvedValueOnce({
        rows: [{ state: 'known', count: '15' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock language breakdown
      mockQuery.mockResolvedValueOnce({
        rows: [{ language: 'ES', total_words: '15', unknown: '0', learning: '0', known: '15' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock CEFR distribution
      mockQuery.mockResolvedValueOnce({
        rows: [{ level: 'A1', count: '15' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock recently learned
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      const result = await service.getVocabularyStats('user-123', 'ES');

      expect(result.totalWords).toBe(15);
      expect(result.byLanguage).toHaveLength(1);
      expect(result.byLanguage[0].language).toBe('ES');
      expect(mockQuery).toHaveBeenCalledTimes(4);
    });

    it('should handle empty vocabulary', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as unknown as QueryResult);
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as unknown as QueryResult);
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as unknown as QueryResult);
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as unknown as QueryResult);

      const result = await service.getVocabularyStats('user-123');

      expect(result.totalWords).toBe(0);
      expect(result.byState).toEqual({ unknown: 0, learning: 0, known: 0 });
      expect(result.byLanguage).toHaveLength(0);
      expect(result.byCEFR).toHaveLength(0);
      expect(result.recentlyLearned).toHaveLength(0);
    });
  });

  describe('getVocabularyTrends', () => {
    it('should return vocabulary trends over time', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { date: '2024-01-01', learning_count: '5', known_count: '2' },
          { date: '2024-01-02', learning_count: '8', known_count: '4' },
          { date: '2024-01-03', learning_count: '12', known_count: '7' },
        ],
        rowCount: 3,
      } as unknown as QueryResult);

      const result = await service.getVocabularyTrends('user-123', undefined, 7);

      expect(result).toHaveLength(3);
      expect(result[0].date).toBe('2024-01-01');
      expect(result[0].learning).toBe(5);
      expect(result[0].known).toBe(2);
      expect(result[0].totalWords).toBe(7);
    });

    it('should filter by language', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ date: '2024-01-01', learning_count: '3', known_count: '1' }],
        rowCount: 1,
      } as unknown as QueryResult);

      await service.getVocabularyTrends('user-123', 'ES', 30);

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['user-123', 30, 'ES']);
    });

    it('should handle no trends data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as unknown as QueryResult);

      const result = await service.getVocabularyTrends('user-123');

      expect(result).toHaveLength(0);
    });
  });

  describe('getWordDetails', () => {
    it('should return word details', async () => {
      const now = new Date();
      const nextReview = new Date(now.getTime() + 86400000);

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            meaning_id: 'meaning-1',
            text: 'casa',
            language: 'ES',
            state: 'learning',
            level: 'A1',
            total_reviews: '5',
            successful_reviews: '3',
            last_reviewed_at: now,
            next_review_at: nextReview,
            ease_factor: '2.3',
            interval: '3',
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.getWordDetails('user-123', 'meaning-1');

      expect(result).not.toBeNull();
      expect(result!.meaningId).toBe('meaning-1');
      expect(result!.text).toBe('casa');
      expect(result!.state).toBe('learning');
      expect(result!.cefrLevel).toBe('A1');
      expect(result!.totalReviews).toBe(5);
      expect(result!.successfulReviews).toBe(3);
      expect(result!.easeFactor).toBe(2.3);
      expect(result!.interval).toBe(3);
    });

    it('should return null for non-existent word', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as unknown as QueryResult);

      const result = await service.getWordDetails('user-123', 'non-existent');

      expect(result).toBeNull();
    });

    it('should handle missing SRS data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            meaning_id: 'meaning-1',
            text: 'nuevo',
            language: 'ES',
            state: 'unknown',
            level: 'A2',
            total_reviews: '0',
            successful_reviews: '0',
            last_reviewed_at: null,
            next_review_at: null,
            ease_factor: null,
            interval: null,
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.getWordDetails('user-123', 'meaning-1');

      expect(result).not.toBeNull();
      expect(result!.lastReviewedAt).toBeNull();
      expect(result!.nextReviewAt).toBeNull();
      expect(result!.easeFactor).toBe(2.5); // default
      expect(result!.interval).toBe(0); // default
    });
  });

  describe('getLearningVelocity', () => {
    it('should calculate learning velocity', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            this_week: '10',
            last_week: '8',
            total_words: '50',
            days_learning: '30',
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.getLearningVelocity('user-123');

      expect(result.wordsThisWeek).toBe(10);
      expect(result.wordsLastWeek).toBe(8);
      expect(result.wordsPerDay).toBeCloseTo(1.7, 1);
      expect(result.wordsPerWeek).toBe(12);
      expect(result.trend).toBe('increasing'); // 10 > 8 * 1.1 = 8.8
    });

    it('should detect decreasing trend', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            this_week: '5',
            last_week: '10',
            total_words: '50',
            days_learning: '30',
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.getLearningVelocity('user-123');

      expect(result.trend).toBe('decreasing'); // 5 < 10 * 0.9 = 9
    });

    it('should detect stable trend', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            this_week: '9',
            last_week: '10',
            total_words: '50',
            days_learning: '30',
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.getLearningVelocity('user-123');

      expect(result.trend).toBe('stable'); // 9 is between 9 and 11
    });

    it('should handle no learning history', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            this_week: '0',
            last_week: '0',
            total_words: '0',
            days_learning: null,
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.getLearningVelocity('user-123');

      expect(result.wordsPerDay).toBe(0);
      expect(result.wordsPerWeek).toBe(0);
      expect(result.wordsThisWeek).toBe(0);
      expect(result.wordsLastWeek).toBe(0);
      expect(result.trend).toBe('stable');
    });

    it('should handle first week of learning', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            this_week: '5',
            last_week: '0',
            total_words: '5',
            days_learning: '3',
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.getLearningVelocity('user-123');

      expect(result.trend).toBe('increasing');
    });
  });

  describe('getWordsByState', () => {
    it('should return paginated words by state', async () => {
      // Mock count
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '25' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock words
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            meaning_id: 'meaning-1',
            text: 'palabra1',
            language: 'ES',
            state: 'learning',
            level: 'A1',
            total_reviews: '3',
            successful_reviews: '2',
            last_reviewed_at: new Date(),
            next_review_at: new Date(),
            ease_factor: '2.5',
            interval: '1',
          },
          {
            meaning_id: 'meaning-2',
            text: 'palabra2',
            language: 'ES',
            state: 'learning',
            level: 'A2',
            total_reviews: '1',
            successful_reviews: '1',
            last_reviewed_at: new Date(),
            next_review_at: new Date(),
            ease_factor: '2.5',
            interval: '1',
          },
        ],
        rowCount: 2,
      } as unknown as QueryResult);

      const result = await service.getWordsByState('user-123', 'learning', undefined, 0, 10);

      expect(result.total).toBe(25);
      expect(result.words).toHaveLength(2);
      expect(result.words[0].meaningId).toBe('meaning-1');
      expect(result.words[0].state).toBe('learning');
    });

    it('should filter by language', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '10' }],
        rowCount: 1,
      } as unknown as QueryResult);

      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      const result = await service.getWordsByState('user-123', 'known', 'ES', 0, 50);

      expect(result.total).toBe(10);
      expect(result.words).toHaveLength(0);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should handle pagination', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '100' }],
        rowCount: 1,
      } as unknown as QueryResult);

      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      const result = await service.getWordsByState('user-123', 'unknown', undefined, 20, 10);

      expect(result.total).toBe(100);
      expect(result.words).toHaveLength(0);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should handle empty results', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '0' }],
        rowCount: 1,
      } as unknown as QueryResult);

      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      const result = await service.getWordsByState('user-123', 'known');

      expect(result.total).toBe(0);
      expect(result.words).toHaveLength(0);
    });
  });
});
