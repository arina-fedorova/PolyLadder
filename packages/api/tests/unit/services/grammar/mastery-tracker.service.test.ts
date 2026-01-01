import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { GrammarMasteryTrackerService } from '../../../../src/services/grammar/mastery-tracker.service';

describe('GrammarMasteryTrackerService', () => {
  let service: GrammarMasteryTrackerService;
  let mockPool: Pool;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    } as unknown as Pool;

    service = new GrammarMasteryTrackerService(mockPool);
  });

  describe('checkMastery', () => {
    it('should return true when user has mastered grammar rule', async () => {
      const userId = 'user-123';
      const grammarRuleId = 'en-present-tense';

      vi.spyOn(mockPool, 'query').mockResolvedValueOnce({
        rows: [
          {
            total_exercises: 10,
            avg_accuracy: 0.85,
          },
        ],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await service.checkMastery(userId, grammarRuleId);

      expect(result).toBe(true);
    });

    it('should return false when user has not completed enough exercises', async () => {
      const userId = 'user-123';
      const grammarRuleId = 'en-present-tense';

      vi.spyOn(mockPool, 'query').mockResolvedValueOnce({
        rows: [
          {
            total_exercises: 3,
            avg_accuracy: 0.9,
          },
        ],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await service.checkMastery(userId, grammarRuleId);

      expect(result).toBe(false);
    });

    it('should return false when user accuracy is below threshold', async () => {
      const userId = 'user-123';
      const grammarRuleId = 'en-present-tense';

      vi.spyOn(mockPool, 'query').mockResolvedValueOnce({
        rows: [
          {
            total_exercises: 10,
            avg_accuracy: 0.75,
          },
        ],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await service.checkMastery(userId, grammarRuleId);

      expect(result).toBe(false);
    });

    it('should return false when user has no exercise history', async () => {
      const userId = 'user-123';
      const grammarRuleId = 'en-present-tense';

      vi.spyOn(mockPool, 'query').mockResolvedValueOnce({
        rows: [
          {
            total_exercises: 0,
            avg_accuracy: null,
          },
        ],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await service.checkMastery(userId, grammarRuleId);

      expect(result).toBe(false);
    });

    it('should return true at exactly mastery threshold', async () => {
      const userId = 'user-123';
      const grammarRuleId = 'en-present-tense';

      vi.spyOn(mockPool, 'query').mockResolvedValueOnce({
        rows: [
          {
            total_exercises: 5,
            avg_accuracy: 0.8,
          },
        ],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await service.checkMastery(userId, grammarRuleId);

      expect(result).toBe(true);
    });
  });

  describe('updateCurriculumProgress', () => {
    it('should update progress when user has mastered rule', async () => {
      const userId = 'user-123';
      const grammarRuleId = 'en-present-tense';
      const language = 'EN';

      const querySpy = vi
        .spyOn(mockPool, 'query')
        // checkMastery query
        .mockResolvedValueOnce({
          rows: [
            {
              total_exercises: 10,
              avg_accuracy: 0.85,
            },
          ],
          command: '',
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        // category query
        .mockResolvedValueOnce({
          rows: [
            {
              category: 'present_tense',
            },
          ],
          command: '',
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        // update query
        .mockResolvedValueOnce({
          rows: [],
          command: '',
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      await service.updateCurriculumProgress(userId, grammarRuleId, language);

      expect(querySpy).toHaveBeenCalledTimes(3);
      expect(querySpy).toHaveBeenLastCalledWith(
        expect.stringContaining('UPDATE user_concept_progress'),
        [userId, 'grammar_present_tense', language]
      );
    });

    it('should not update progress when user has not mastered rule', async () => {
      const userId = 'user-123';
      const grammarRuleId = 'en-present-tense';
      const language = 'EN';

      const querySpy = vi.spyOn(mockPool, 'query').mockResolvedValueOnce({
        rows: [
          {
            total_exercises: 2,
            avg_accuracy: 0.6,
          },
        ],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await service.updateCurriculumProgress(userId, grammarRuleId, language);

      expect(querySpy).toHaveBeenCalledTimes(1);
    });

    it('should handle non-existent grammar rule', async () => {
      const userId = 'user-123';
      const grammarRuleId = 'non-existent';
      const language = 'EN';

      vi.spyOn(mockPool, 'query')
        // checkMastery query
        .mockResolvedValueOnce({
          rows: [
            {
              total_exercises: 10,
              avg_accuracy: 0.85,
            },
          ],
          command: '',
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        // category query returns empty
        .mockResolvedValueOnce({
          rows: [],
          command: '',
          rowCount: 0,
          oid: 0,
          fields: [],
        });

      await expect(
        service.updateCurriculumProgress(userId, grammarRuleId, language)
      ).resolves.not.toThrow();
    });
  });

  describe('getMasteryStatus', () => {
    it('should return mastery status for all attempted grammar rules', async () => {
      const userId = 'user-123';
      const language = 'EN';

      vi.spyOn(mockPool, 'query').mockResolvedValueOnce({
        rows: [
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
        ],
        command: '',
        rowCount: 2,
        oid: 0,
        fields: [],
      });

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

      vi.spyOn(mockPool, 'query').mockResolvedValueOnce({
        rows: [],
        command: '',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await service.getMasteryStatus(userId, language);

      expect(result).toEqual([]);
    });
  });
});
