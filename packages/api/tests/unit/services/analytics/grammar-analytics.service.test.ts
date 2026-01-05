import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool, QueryResult } from 'pg';
import { GrammarAnalyticsService } from '../../../../src/services/analytics';

const mockQuery = vi.fn();
const mockPool = {
  query: mockQuery,
} as unknown as Pool;

describe('GrammarAnalyticsService', () => {
  let service: GrammarAnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GrammarAnalyticsService(mockPool);
  });

  describe('getGrammarCoverage', () => {
    it('should return grammar coverage statistics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            title: 'Present Tense',
            description: 'How to form present tense',
            cefr_level: 'A1',
            language: 'ES',
            category: 'Verbs',
            completed: true,
            mastery_level: '80',
            last_practiced: new Date('2024-01-15'),
            practice_count: '5',
          },
          {
            id: 'rule-2',
            title: 'Past Tense',
            description: 'How to form past tense',
            cefr_level: 'A2',
            language: 'ES',
            category: 'Verbs',
            completed: false,
            mastery_level: '30',
            last_practiced: null,
            practice_count: '2',
          },
          {
            id: 'rule-3',
            title: 'Articles',
            description: 'Definite and indefinite articles',
            cefr_level: 'A1',
            language: 'ES',
            category: 'Nouns',
            completed: true,
            mastery_level: '90',
            last_practiced: new Date('2024-01-10'),
            practice_count: '8',
          },
        ],
        rowCount: 3,
      } as unknown as QueryResult);

      const result = await service.getGrammarCoverage('user-123');

      expect(result.totalConcepts).toBe(3);
      expect(result.completedConcepts).toBe(2);
      expect(result.coveragePercentage).toBe(67);
      expect(result.byCEFR).toHaveLength(2);
      expect(result.byCEFR[0].level).toBe('A1');
      expect(result.byCEFR[0].completed).toBe(2);
      expect(result.byCEFR[0].total).toBe(2);
      expect(result.byCategory).toHaveLength(2);
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].id).toBe('rule-2');
    });

    it('should filter by language when provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            title: 'Present Tense',
            description: 'How to form present tense',
            cefr_level: 'A1',
            language: 'ES',
            category: 'Verbs',
            completed: true,
            mastery_level: '80',
            last_practiced: new Date(),
            practice_count: '5',
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.getGrammarCoverage('user-123', 'ES');

      expect(result.totalConcepts).toBe(1);
      expect(result.byLanguage).toHaveLength(0); // No language breakdown when filtered
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['user-123', 'ES']);
    });

    it('should handle empty grammar rules', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as unknown as QueryResult);

      const result = await service.getGrammarCoverage('user-123');

      expect(result.totalConcepts).toBe(0);
      expect(result.completedConcepts).toBe(0);
      expect(result.coveragePercentage).toBe(0);
      expect(result.byCEFR).toHaveLength(0);
      expect(result.byCategory).toHaveLength(0);
      expect(result.byLanguage).toHaveLength(0);
      expect(result.gaps).toHaveLength(0);
      expect(result.recentlyCompleted).toHaveLength(0);
    });

    it('should include recently completed concepts from last 30 days', async () => {
      const recentDate = new Date();
      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            title: 'Recent Rule',
            description: 'Completed recently',
            cefr_level: 'A1',
            language: 'ES',
            category: 'Verbs',
            completed: true,
            mastery_level: '80',
            last_practiced: recentDate,
            practice_count: '5',
          },
          {
            id: 'rule-2',
            title: 'Old Rule',
            description: 'Completed long ago',
            cefr_level: 'A1',
            language: 'ES',
            category: 'Verbs',
            completed: true,
            mastery_level: '90',
            last_practiced: oldDate,
            practice_count: '10',
          },
        ],
        rowCount: 2,
      } as unknown as QueryResult);

      const result = await service.getGrammarCoverage('user-123');

      expect(result.recentlyCompleted).toHaveLength(1);
      expect(result.recentlyCompleted[0].id).toBe('rule-1');
    });

    it('should group by language when no filter applied', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            title: 'Spanish Rule',
            description: 'Spanish grammar',
            cefr_level: 'A1',
            language: 'ES',
            category: 'Verbs',
            completed: true,
            mastery_level: '80',
            last_practiced: new Date(),
            practice_count: '5',
          },
          {
            id: 'rule-2',
            title: 'Italian Rule',
            description: 'Italian grammar',
            cefr_level: 'A1',
            language: 'IT',
            category: 'Verbs',
            completed: false,
            mastery_level: '0',
            last_practiced: null,
            practice_count: '0',
          },
        ],
        rowCount: 2,
      } as unknown as QueryResult);

      const result = await service.getGrammarCoverage('user-123');

      expect(result.byLanguage).toHaveLength(2);
      expect(result.byLanguage[0].language).toBe('ES'); // Sorted by percentage (100% > 0%)
      expect(result.byLanguage[0].completedConcepts).toBe(1);
      expect(result.byLanguage[1].language).toBe('IT');
      expect(result.byLanguage[1].completedConcepts).toBe(0);
    });
  });

  describe('getGrammarRecommendations', () => {
    it('should return personalized recommendations', async () => {
      // Mock user level query
      mockQuery.mockResolvedValueOnce({
        rows: [{ cefr_level: 'A1' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock recommendations query
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            concept_id: 'rule-1',
            title: 'Present Tense',
            cefr_level: 'A1',
            category: 'Verbs',
            practice_count: '0',
            mastery_level: '0',
          },
          {
            concept_id: 'rule-2',
            title: 'Articles',
            cefr_level: 'A1',
            category: 'Nouns',
            practice_count: '2',
            mastery_level: '30',
          },
          {
            concept_id: 'rule-3',
            title: 'Past Tense',
            cefr_level: 'A2',
            category: 'Verbs',
            practice_count: '0',
            mastery_level: '0',
          },
        ],
        rowCount: 3,
      } as unknown as QueryResult);

      const result = await service.getGrammarRecommendations('user-123', 'ES', 5);

      expect(result).toHaveLength(3);
      expect(result[0].conceptId).toBe('rule-1');
      expect(result[0].priority).toBe('high'); // Not practiced, current level
      expect(result[0].reason).toBe('Not yet practiced');

      expect(result[1].conceptId).toBe('rule-2');
      expect(result[1].priority).toBe('high'); // Low mastery
      expect(result[1].reason).toBe('Low mastery - needs more practice');

      expect(result[2].conceptId).toBe('rule-3');
      expect(result[2].priority).toBe('low'); // Next level
      expect(result[2].reason).toContain('next level');
    });

    it('should use default A1 when user has no level set', async () => {
      // Mock user level query returning no rows
      mockQuery.mockResolvedValueOnce({
        rows: [{ cefr_level: 'A1' }],
        rowCount: 1,
      } as unknown as QueryResult);

      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      const result = await service.getGrammarRecommendations('user-123', 'ES');

      expect(result).toHaveLength(0);
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['user-123', 'ES', 'A1', 'A2', 5]);
    });

    it('should handle ready to complete concepts', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ cefr_level: 'A1' }],
        rowCount: 1,
      } as unknown as QueryResult);

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            concept_id: 'rule-1',
            title: 'Almost Done',
            cefr_level: 'A1',
            category: 'Verbs',
            practice_count: '5',
            mastery_level: '65',
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.getGrammarRecommendations('user-123', 'ES');

      expect(result[0].reason).toBe('Ready to complete');
      expect(result[0].priority).toBe('medium');
    });
  });

  describe('getGrammarMasteryTrends', () => {
    it('should return mastery trends over time', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { date: '2024-01-01', concepts_completed: '2', average_mastery: '75.5' },
          { date: '2024-01-02', concepts_completed: '3', average_mastery: '80.0' },
          { date: '2024-01-03', concepts_completed: '5', average_mastery: '82.5' },
        ],
        rowCount: 3,
      } as unknown as QueryResult);

      const result = await service.getGrammarMasteryTrends('user-123', undefined, 7);

      expect(result).toHaveLength(3);
      expect(result[0].date).toBe('2024-01-01');
      expect(result[0].conceptsCompleted).toBe(2);
      expect(result[0].averageMastery).toBe(75.5);
    });

    it('should filter by language', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ date: '2024-01-01', concepts_completed: '1', average_mastery: '90' }],
        rowCount: 1,
      } as unknown as QueryResult);

      await service.getGrammarMasteryTrends('user-123', 'ES', 30);

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['user-123', 30, 'ES']);
    });

    it('should handle no trends data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as unknown as QueryResult);

      const result = await service.getGrammarMasteryTrends('user-123');

      expect(result).toHaveLength(0);
    });

    it('should round average mastery to 1 decimal', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ date: '2024-01-01', concepts_completed: '1', average_mastery: '75.666666' }],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.getGrammarMasteryTrends('user-123');

      expect(result[0].averageMastery).toBe(75.7);
    });
  });

  describe('getConceptDetails', () => {
    it('should return concept details', async () => {
      const now = new Date();

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            title: 'Present Tense',
            description: 'How to form present tense verbs',
            cefr_level: 'A1',
            language: 'ES',
            category: 'Verbs',
            completed: true,
            mastery_level: '85',
            last_practiced: now,
            practice_count: '10',
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.getConceptDetails('user-123', 'rule-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('rule-1');
      expect(result!.title).toBe('Present Tense');
      expect(result!.description).toBe('How to form present tense verbs');
      expect(result!.cefrLevel).toBe('A1');
      expect(result!.language).toBe('ES');
      expect(result!.category).toBe('Verbs');
      expect(result!.completed).toBe(true);
      expect(result!.masteryLevel).toBe(85);
      expect(result!.practiceCount).toBe(10);
    });

    it('should return null for non-existent concept', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as unknown as QueryResult);

      const result = await service.getConceptDetails('user-123', 'non-existent');

      expect(result).toBeNull();
    });

    it('should handle missing progress data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            title: 'New Rule',
            description: 'Not started yet',
            cefr_level: 'A1',
            language: 'ES',
            category: 'Verbs',
            completed: false,
            mastery_level: '0',
            last_practiced: null,
            practice_count: '0',
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.getConceptDetails('user-123', 'rule-1');

      expect(result).not.toBeNull();
      expect(result!.completed).toBe(false);
      expect(result!.masteryLevel).toBe(0);
      expect(result!.lastPracticed).toBeNull();
      expect(result!.practiceCount).toBe(0);
    });
  });
});
