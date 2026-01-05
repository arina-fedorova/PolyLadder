import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import { GrammarMasteryTrackerService } from '../../../../src/services/grammar/mastery-tracker.service';

// Helper to create mock query result
const mockQueryResult = <T extends QueryResultRow>(
  rows: T[],
  rowCount?: number
): QueryResult<T> => ({
  rows,
  command: '',
  rowCount: rowCount ?? rows.length,
  oid: 0,
  fields: [],
});

describe('GrammarMasteryTrackerService', () => {
  let service: GrammarMasteryTrackerService;
  let mockPool: { query: Mock };

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    };

    service = new GrammarMasteryTrackerService(mockPool as unknown as Pool);
  });

  describe('checkMastery', () => {
    it('should return true when user has mastered grammar rule', async () => {
      const userId = 'user-123';
      const grammarRuleId = 'en-present-tense';

      mockPool.query.mockResolvedValueOnce(
        mockQueryResult([
          {
            total_exercises: 10,
            avg_accuracy: 0.85,
          },
        ])
      );

      const result = await service.checkMastery(userId, grammarRuleId);

      expect(result).toBe(true);
    });

    it('should return false when user has not completed enough exercises', async () => {
      const userId = 'user-123';
      const grammarRuleId = 'en-present-tense';

      mockPool.query.mockResolvedValueOnce(
        mockQueryResult([
          {
            total_exercises: 3,
            avg_accuracy: 0.9,
          },
        ])
      );

      const result = await service.checkMastery(userId, grammarRuleId);

      expect(result).toBe(false);
    });

    it('should return false when user accuracy is below threshold', async () => {
      const userId = 'user-123';
      const grammarRuleId = 'en-present-tense';

      mockPool.query.mockResolvedValueOnce(
        mockQueryResult([
          {
            total_exercises: 10,
            avg_accuracy: 0.75,
          },
        ])
      );

      const result = await service.checkMastery(userId, grammarRuleId);

      expect(result).toBe(false);
    });

    it('should return false when user has no exercise history', async () => {
      const userId = 'user-123';
      const grammarRuleId = 'en-present-tense';

      mockPool.query.mockResolvedValueOnce(
        mockQueryResult([
          {
            total_exercises: 0,
            avg_accuracy: null,
          },
        ])
      );

      const result = await service.checkMastery(userId, grammarRuleId);

      expect(result).toBe(false);
    });

    it('should return true at exactly mastery threshold', async () => {
      const userId = 'user-123';
      const grammarRuleId = 'en-present-tense';

      mockPool.query.mockResolvedValueOnce(
        mockQueryResult([
          {
            total_exercises: 5,
            avg_accuracy: 0.8,
          },
        ])
      );

      const result = await service.checkMastery(userId, grammarRuleId);

      expect(result).toBe(true);
    });
  });

  describe('updateCurriculumProgress', () => {
    it('should update progress when user has mastered rule', async () => {
      const userId = 'user-123';
      const grammarRuleId = 'en-present-tense';
      const language = 'EN';

      mockPool.query
        // checkMastery query
        .mockResolvedValueOnce(
          mockQueryResult([
            {
              total_exercises: 10,
              avg_accuracy: 0.85,
            },
          ])
        )
        // category query
        .mockResolvedValueOnce(
          mockQueryResult([
            {
              category: 'present_tense',
            },
          ])
        )
        // update query
        .mockResolvedValueOnce(mockQueryResult([], 1));

      await service.updateCurriculumProgress(userId, grammarRuleId, language);

      expect(mockPool.query).toHaveBeenCalledTimes(3);
      expect(mockPool.query).toHaveBeenLastCalledWith(
        expect.stringContaining('UPDATE user_concept_progress'),
        [userId, 'grammar_present_tense', language]
      );
    });

    it('should not update progress when user has not mastered rule', async () => {
      const userId = 'user-123';
      const grammarRuleId = 'en-present-tense';
      const language = 'EN';

      mockPool.query.mockResolvedValueOnce(
        mockQueryResult([
          {
            total_exercises: 2,
            avg_accuracy: 0.6,
          },
        ])
      );

      await service.updateCurriculumProgress(userId, grammarRuleId, language);

      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('should handle non-existent grammar rule', async () => {
      const userId = 'user-123';
      const grammarRuleId = 'non-existent';
      const language = 'EN';

      mockPool.query
        // checkMastery query
        .mockResolvedValueOnce(
          mockQueryResult([
            {
              total_exercises: 10,
              avg_accuracy: 0.85,
            },
          ])
        )
        // category query returns empty
        .mockResolvedValueOnce(mockQueryResult([], 0));

      await expect(
        service.updateCurriculumProgress(userId, grammarRuleId, language)
      ).resolves.not.toThrow();
    });
  });

  describe('getMasteryStatus', () => {
    it('should return mastery status for all attempted grammar rules', async () => {
      const userId = 'user-123';
      const language = 'EN';

      mockPool.query.mockResolvedValueOnce(
        mockQueryResult([
          {
            grammar_rule_id: 'en-present-tense',
            title: 'Present Tense',
            category: 'present_tense',
            total_exercises: 10,
            avg_accuracy: 0.85,
          },
          {
            grammar_rule_id: 'en-past-tense',
            title: 'Past Tense',
            category: 'past_tense',
            total_exercises: 3,
            avg_accuracy: 0.7,
          },
        ])
      );

      const result = await service.getMasteryStatus(userId, language);

      expect(result).toHaveLength(2);
      expect(result[0].grammarRuleId).toBe('en-present-tense');
      expect(result[0].hasMastery).toBe(true);
      expect(result[0].totalExercises).toBe(10);
      expect(result[0].avgAccuracy).toBe(0.85);

      expect(result[1].grammarRuleId).toBe('en-past-tense');
      expect(result[1].hasMastery).toBe(false);
      expect(result[1].totalExercises).toBe(3);
    });

    it('should return empty array when user has no exercise history', async () => {
      const userId = 'user-123';
      const language = 'EN';

      mockPool.query.mockResolvedValueOnce(mockQueryResult([], 0));

      const result = await service.getMasteryStatus(userId, language);

      expect(result).toEqual([]);
    });
  });
});
