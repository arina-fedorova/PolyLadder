import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import { CEFRAssessmentService } from '../../../../src/services/analytics';

// Helper to create mock result
const mockResult = <T extends QueryResultRow>(rows: T[], rowCount?: number): QueryResult<T> =>
  ({
    rows,
    rowCount: rowCount ?? rows.length,
  }) as unknown as QueryResult<T>;

// Type for level data in mocks
interface LevelData {
  vocabTotal: number;
  vocabMastered: number;
  grammarTotal: number;
  grammarCompleted: number;
}

// Helper to create empty level data array
const emptyLevels = (count: number): LevelData[] =>
  Array.from({ length: count }, () => ({
    vocabTotal: 100,
    vocabMastered: 0,
    grammarTotal: 20,
    grammarCompleted: 0,
  }));

// Helper to create completed level data array
const completedLevels = (count: number): LevelData[] =>
  Array.from({ length: count }, () => ({
    vocabTotal: 100,
    vocabMastered: 90,
    grammarTotal: 20,
    grammarCompleted: 16,
  }));

// Helper to create zero total level data array
const zeroLevels = (count: number): LevelData[] =>
  Array.from({ length: count }, () => ({
    vocabTotal: 0,
    vocabMastered: 0,
    grammarTotal: 0,
    grammarCompleted: 0,
  }));

describe('CEFRAssessmentService', () => {
  let service: CEFRAssessmentService;
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery = vi.fn();
    const mockPool = { query: mockQuery } as unknown as Pool;
    service = new CEFRAssessmentService(mockPool);
  });

  // Helper to setup mocks for calculateAllLevelData (7 levels x 2 queries = 14 queries)
  const setupLevelDataMocks = (levelData: LevelData[]) => {
    for (let i = 0; i < 7; i++) {
      const data = levelData[i] || {
        vocabTotal: 0,
        vocabMastered: 0,
        grammarTotal: 0,
        grammarCompleted: 0,
      };
      mockQuery.mockResolvedValueOnce(
        mockResult([{ total: String(data.vocabTotal), mastered: String(data.vocabMastered) }])
      );
      mockQuery.mockResolvedValueOnce(
        mockResult([{ total: String(data.grammarTotal), completed: String(data.grammarCompleted) }])
      );
    }
  };

  describe('assessCEFRLevel', () => {
    it('should assess user at A0 level with no progress', async () => {
      // 7 levels of empty progress
      setupLevelDataMocks(emptyLevels(7));

      // Velocity query
      mockQuery.mockResolvedValueOnce(mockResult([{ avg_words_per_day: '0' }]));
      // Record assessment
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await service.assessCEFRLevel('user-123', 'ES');

      expect(result.userId).toBe('user-123');
      expect(result.language).toBe('ES');
      expect(result.currentLevel).toBe('A0');
      expect(result.status).toBe('progressing');
      expect(result.nextLevel).toBe('A1');
      expect(result.levelDetails).toHaveLength(7);
    });

    it('should mark level as completed when thresholds are met', async () => {
      // A0: 85% vocab, 75% grammar = completed
      const levelData: LevelData[] = [
        { vocabTotal: 100, vocabMastered: 85, grammarTotal: 20, grammarCompleted: 15 },
        ...emptyLevels(6),
      ];
      setupLevelDataMocks(levelData);

      mockQuery.mockResolvedValueOnce(mockResult([{ avg_words_per_day: '0' }]));
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await service.assessCEFRLevel('user-123', 'ES');

      expect(result.currentLevel).toBe('A0');
      expect(result.levelDetails[0].isCompleted).toBe(true);
      expect(result.levelDetails[0].vocabularyPercentage).toBe(85);
      expect(result.levelDetails[0].grammarPercentage).toBe(75);
    });

    it('should not mark level as completed when vocab below threshold', async () => {
      // A0: 75% vocab, 80% grammar = NOT completed (vocab < 80%)
      const levelData: LevelData[] = [
        { vocabTotal: 100, vocabMastered: 75, grammarTotal: 20, grammarCompleted: 16 },
        ...emptyLevels(6),
      ];
      setupLevelDataMocks(levelData);

      mockQuery.mockResolvedValueOnce(mockResult([{ avg_words_per_day: '0' }]));
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await service.assessCEFRLevel('user-123', 'ES');

      expect(result.levelDetails[0].isCompleted).toBe(false);
    });

    it('should mark status as completed at C2 level', async () => {
      // All 7 levels completed
      setupLevelDataMocks(completedLevels(7));

      mockQuery.mockResolvedValueOnce(mockResult([{ avg_words_per_day: '0' }]));
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await service.assessCEFRLevel('user-123', 'ES');

      expect(result.currentLevel).toBe('C2');
      expect(result.nextLevel).toBeNull();
      expect(result.status).toBe('completed');
    });

    it('should mark status as ready when over 95% overall', async () => {
      // A0: 98% vocab, 95% grammar = 96.8% overall > 95% = ready
      const levelData: LevelData[] = [
        { vocabTotal: 100, vocabMastered: 98, grammarTotal: 20, grammarCompleted: 19 },
        ...emptyLevels(6),
      ];
      setupLevelDataMocks(levelData);

      mockQuery.mockResolvedValueOnce(mockResult([{ avg_words_per_day: '0' }]));
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await service.assessCEFRLevel('user-123', 'ES');

      // 98 * 0.6 + 95 * 0.4 = 58.8 + 38 = 96.8%
      expect(result.status).toBe('ready');
    });

    it('should calculate overall percentage with 60/40 weighting', async () => {
      // A0: 100% vocab, 50% grammar = 60% + 20% = 80% overall
      const levelData: LevelData[] = [
        { vocabTotal: 100, vocabMastered: 100, grammarTotal: 20, grammarCompleted: 10 },
        ...emptyLevels(6),
      ];
      setupLevelDataMocks(levelData);

      mockQuery.mockResolvedValueOnce(mockResult([{ avg_words_per_day: '0' }]));
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await service.assessCEFRLevel('user-123', 'ES');

      // 100 * 0.6 + 50 * 0.4 = 60 + 20 = 80
      expect(result.levelDetails[0].overallPercentage).toBe(80);
    });

    it('should handle zero totals gracefully', async () => {
      // Empty content
      setupLevelDataMocks(zeroLevels(7));

      mockQuery.mockResolvedValueOnce(mockResult([{ avg_words_per_day: '0' }]));
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await service.assessCEFRLevel('user-123', 'ES');

      expect(result.levelDetails[0].vocabularyPercentage).toBe(0);
      expect(result.levelDetails[0].grammarPercentage).toBe(0);
      expect(result.levelDetails[0].overallPercentage).toBe(0);
    });
  });

  describe('getLevelProgression', () => {
    it('should return progression history', async () => {
      mockQuery.mockResolvedValueOnce(
        mockResult([
          {
            date: new Date('2024-01-14'),
            level: 'A0',
            vocabulary_percentage: '50',
            grammar_percentage: '40',
            overall_percentage: '46',
          },
          {
            date: new Date('2024-01-15'),
            level: 'A0',
            vocabulary_percentage: '55',
            grammar_percentage: '45',
            overall_percentage: '51',
          },
        ])
      );

      const result = await service.getLevelProgression('user-123', 'ES', 30);

      expect(result).toHaveLength(2);
      expect(result[0].level).toBe('A0');
      expect(result[0].vocabularyPercentage).toBe(50);
      expect(result[1].overallPercentage).toBe(51);
    });

    it('should return empty array when no history exists', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await service.getLevelProgression('user-123', 'ES');

      expect(result).toHaveLength(0);
    });

    it('should pass days parameter to query', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([]));

      await service.getLevelProgression('user-123', 'ES', 7);

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['user-123', 'ES', 7]);
    });
  });

  describe('getLevelRequirements', () => {
    it('should return requirements for specified target level', async () => {
      // Vocab gap
      mockQuery.mockResolvedValueOnce(
        mockResult([
          { id: 'word-1', text: 'hola' },
          { id: 'word-2', text: 'gracias' },
        ])
      );
      // Vocab count
      mockQuery.mockResolvedValueOnce(mockResult([{ count: '50' }]));
      // Grammar gap
      mockQuery.mockResolvedValueOnce(mockResult([{ id: 'rule-1', title: 'Present Tense' }]));
      // Grammar count
      mockQuery.mockResolvedValueOnce(mockResult([{ count: '10' }]));

      const result = await service.getLevelRequirements('user-123', 'ES', 'A1');

      expect(result).not.toBeNull();
      expect(result!.level).toBe('A1');
      expect(result!.vocabularyNeeded).toBe(50);
      expect(result!.grammarNeeded).toBe(10);
      expect(result!.vocabularyGap).toContain('hola');
      expect(result!.grammarGap).toContain('Present Tense');
      // 50/10 + 10/5 = 5 + 2 = 7
      expect(result!.estimatedPracticeHours).toBe(7);
    });

    it('should return null when at max level', async () => {
      // First: assessCEFRLevel (all levels complete)
      setupLevelDataMocks(completedLevels(7));
      mockQuery.mockResolvedValueOnce(mockResult([{ avg_words_per_day: '0' }]));
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await service.getLevelRequirements('user-123', 'ES');

      expect(result).toBeNull();
    });
  });

  describe('getAllLanguagesOverview', () => {
    it('should return empty array when user has no languages', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await service.getAllLanguagesOverview('user-123');

      expect(result).toHaveLength(0);
    });

    it('should return overview for languages with history', async () => {
      // Languages query
      mockQuery.mockResolvedValueOnce(mockResult([{ language: 'ES' }]));

      // History query for ES
      mockQuery.mockResolvedValueOnce(
        mockResult([
          {
            cefr_level: 'A1',
            overall_percentage: '75',
            assessed_at: new Date('2024-01-15'),
          },
        ])
      );

      // calculateAllLevelData for status
      const levelData: LevelData[] = [
        { vocabTotal: 100, vocabMastered: 90, grammarTotal: 20, grammarCompleted: 16 },
        { vocabTotal: 100, vocabMastered: 50, grammarTotal: 20, grammarCompleted: 10 },
        ...emptyLevels(5),
      ];
      setupLevelDataMocks(levelData);

      const result = await service.getAllLanguagesOverview('user-123');

      expect(result).toHaveLength(1);
      expect(result[0].language).toBe('ES');
      expect(result[0].currentLevel).toBe('A1');
    });
  });

  describe('level completion thresholds', () => {
    it('should require 80% vocabulary for completion', async () => {
      // A0: 79% vocab, 90% grammar = NOT completed
      const levelData: LevelData[] = [
        { vocabTotal: 100, vocabMastered: 79, grammarTotal: 20, grammarCompleted: 18 },
        ...emptyLevels(6),
      ];
      setupLevelDataMocks(levelData);
      mockQuery.mockResolvedValueOnce(mockResult([{ avg_words_per_day: '0' }]));
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await service.assessCEFRLevel('user-123', 'ES');

      expect(result.levelDetails[0].isCompleted).toBe(false);
    });

    it('should require 70% grammar for completion', async () => {
      // A0: 90% vocab, 69% grammar = NOT completed
      const levelData: LevelData[] = [
        { vocabTotal: 100, vocabMastered: 90, grammarTotal: 100, grammarCompleted: 69 },
        ...emptyLevels(6),
      ];
      setupLevelDataMocks(levelData);
      mockQuery.mockResolvedValueOnce(mockResult([{ avg_words_per_day: '0' }]));
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await service.assessCEFRLevel('user-123', 'ES');

      expect(result.levelDetails[0].isCompleted).toBe(false);
    });

    it('should complete level at exactly 80% vocab and 70% grammar', async () => {
      // A0: 80% vocab, 70% grammar = completed
      const levelData: LevelData[] = [
        { vocabTotal: 100, vocabMastered: 80, grammarTotal: 20, grammarCompleted: 14 },
        ...emptyLevels(6),
      ];
      setupLevelDataMocks(levelData);
      mockQuery.mockResolvedValueOnce(mockResult([{ avg_words_per_day: '0' }]));
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await service.assessCEFRLevel('user-123', 'ES');

      expect(result.levelDetails[0].isCompleted).toBe(true);
    });
  });
});
