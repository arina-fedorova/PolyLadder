import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool, QueryResult } from 'pg';
import { InterferenceDetectionService } from '../../../../src/services/interference/interference-detection.service';

// Mock pg Pool
const mockQuery = vi.fn();
const mockPool = {
  query: mockQuery,
} as unknown as Pool;

describe('InterferenceDetectionService', () => {
  let service: InterferenceDetectionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new InterferenceDetectionService(mockPool);
  });

  describe('analyzeForInterference', () => {
    it('should detect interference when similar word found in other language', async () => {
      // Mock other languages query
      mockQuery.mockResolvedValueOnce({
        rows: [{ language: 'RU' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock vocabulary search in RU - find similar word
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            meaning_id: 'ru-word-1',
            text: 'библиотека',
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock checking for existing pattern - none
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      // Mock inserting new pattern
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'pattern-123',
            user_id: 'user-123',
            target_language: 'EN',
            source_language: 'RU',
            target_item_id: 'en-word-1',
            target_text: 'library',
            interfering_item_id: 'ru-word-1',
            interfering_text: 'библиотека',
            interference_type: 'vocabulary',
            confidence_score: 0.85,
            occurrence_count: 1,
            last_occurrence: new Date().toISOString(),
            remediation_completed: false,
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.analyzeForInterference(
        'user-123',
        'EN',
        'library',
        'библиотека',
        'en-word-1',
        'vocabulary'
      );

      expect(result.isInterference).toBe(true);
      expect(result.pattern).not.toBeNull();
      expect(result.pattern?.sourceLanguage).toBe('RU');
      expect(result.explanation).toContain('Russian');
      expect(result.explanation).toContain('English');
    });

    it('should return no interference when user studies only one language', async () => {
      // Mock other languages query - empty
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      const result = await service.analyzeForInterference(
        'user-123',
        'EN',
        'hello',
        'hallo',
        'en-word-1',
        'vocabulary'
      );

      expect(result.isInterference).toBe(false);
      expect(result.pattern).toBeNull();
      expect(result.explanation).toBe('User is not studying other languages');
    });

    it('should return no interference when similarity below threshold', async () => {
      // Mock other languages query
      mockQuery.mockResolvedValueOnce({
        rows: [{ language: 'DE' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock vocabulary search - words not similar enough
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            meaning_id: 'de-word-1',
            text: 'haus',
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.analyzeForInterference(
        'user-123',
        'EN',
        'house',
        'apartment',
        'en-word-1',
        'vocabulary'
      );

      expect(result.isInterference).toBe(false);
      expect(result.pattern).toBeNull();
      expect(result.explanation).toBe('No strong interference pattern detected');
    });

    it('should update existing pattern when found', async () => {
      // Mock other languages query
      mockQuery.mockResolvedValueOnce({
        rows: [{ language: 'RU' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock vocabulary search - find similar word
      mockQuery.mockResolvedValueOnce({
        rows: [{ meaning_id: 'ru-word-1', text: 'библиотека' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock checking for existing pattern - found
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'pattern-existing' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock updating existing pattern
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'pattern-existing',
            user_id: 'user-123',
            target_language: 'EN',
            source_language: 'RU',
            target_item_id: 'en-word-1',
            target_text: 'library',
            interfering_item_id: 'ru-word-1',
            interfering_text: 'библиотека',
            interference_type: 'vocabulary',
            confidence_score: 0.85,
            occurrence_count: 3,
            last_occurrence: new Date().toISOString(),
            remediation_completed: false,
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.analyzeForInterference(
        'user-123',
        'EN',
        'library',
        'библиотека',
        'en-word-1',
        'vocabulary'
      );

      expect(result.isInterference).toBe(true);
      expect(result.pattern?.occurrenceCount).toBe(3);
      expect(mockQuery).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining('UPDATE interference_patterns'),
        ['pattern-existing']
      );
    });

    it('should search grammar rules for grammar interference type', async () => {
      // Mock other languages query
      mockQuery.mockResolvedValueOnce({
        rows: [{ language: 'FR' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock grammar rules search - no match
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'fr-rule-1', title: 'passé composé' }],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.analyzeForInterference(
        'user-123',
        'EN',
        'past simple',
        'different answer',
        'en-rule-1',
        'grammar'
      );

      // Should have queried approved_grammar_rules
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('approved_grammar_rules'),
        ['FR']
      );
      expect(result.isInterference).toBe(false);
    });
  });

  describe('getUserInterferencePatterns', () => {
    it('should return active patterns only by default', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'pattern-1',
            user_id: 'user-123',
            target_language: 'EN',
            source_language: 'RU',
            target_item_id: 'en-1',
            target_text: 'library',
            interfering_item_id: 'ru-1',
            interfering_text: 'библиотека',
            interference_type: 'vocabulary',
            confidence_score: 0.9,
            occurrence_count: 5,
            last_occurrence: new Date().toISOString(),
            remediation_completed: false,
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.getUserInterferencePatterns('user-123');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('pattern-1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('remediation_completed = false'),
        ['user-123']
      );
    });

    it('should include remediated patterns when requested', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'pattern-1',
            user_id: 'user-123',
            target_language: 'EN',
            source_language: 'RU',
            target_item_id: 'en-1',
            target_text: 'library',
            interfering_item_id: 'ru-1',
            interfering_text: 'библиотека',
            interference_type: 'vocabulary',
            confidence_score: 0.9,
            occurrence_count: 5,
            last_occurrence: new Date().toISOString(),
            remediation_completed: true,
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.getUserInterferencePatterns('user-123', true);

      expect(result).toHaveLength(1);
      expect(result[0].remediationCompleted).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.not.stringContaining('remediation_completed = false'),
        ['user-123']
      );
    });
  });

  describe('generateRemediationExercises', () => {
    it('should generate 4 remediation exercises for a pattern', async () => {
      // Mock getting pattern
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'pattern-123',
            user_id: 'user-123',
            target_language: 'EN',
            source_language: 'RU',
            target_item_id: 'en-1',
            target_text: 'library',
            interfering_item_id: 'ru-1',
            interfering_text: 'библиотека',
            interference_type: 'vocabulary',
            confidence_score: 0.9,
            occurrence_count: 5,
            last_occurrence: new Date().toISOString(),
            remediation_completed: false,
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock inserting each exercise (4 times)
      for (let i = 0; i < 4; i++) {
        mockQuery.mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        } as unknown as QueryResult);
      }

      const exercises = await service.generateRemediationExercises('pattern-123');

      expect(exercises).toHaveLength(4);
      expect(exercises[0].exerciseType).toBe('contrast');
      expect(exercises[1].exerciseType).toBe('multiple_choice');
      expect(exercises[2].exerciseType).toBe('multiple_choice');
      expect(exercises[3].exerciseType).toBe('fill_blank');

      // Verify correct answer is the target language word in contrast exercise
      expect(exercises[0].correctAnswer).toBe('library');
      expect(exercises[0].prompt).toContain('English');
    });

    it('should throw error when pattern not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      await expect(service.generateRemediationExercises('nonexistent')).rejects.toThrow(
        'Pattern not found'
      );
    });
  });

  describe('recordRemediationAttempt', () => {
    it('should record attempt and not mark remediated when less than 3 correct', async () => {
      // Mock inserting attempt
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock stats query - 2 correct
      mockQuery.mockResolvedValueOnce({
        rows: [{ pattern_id: 'pattern-123', correct_count: '2' }],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.recordRemediationAttempt(
        'exercise-1',
        'user-123',
        'library',
        true,
        5000
      );

      expect(result.success).toBe(true);
      expect(result.shouldMarkRemediated).toBe(false);
    });

    it('should mark pattern as remediated when 3 or more correct attempts', async () => {
      // Mock inserting attempt
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock stats query - 3 correct
      mockQuery.mockResolvedValueOnce({
        rows: [{ pattern_id: 'pattern-123', correct_count: '3' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock updating pattern to remediated
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.recordRemediationAttempt(
        'exercise-1',
        'user-123',
        'library',
        true,
        3000
      );

      expect(result.success).toBe(true);
      expect(result.shouldMarkRemediated).toBe(true);
      expect(mockQuery).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('UPDATE interference_patterns'),
        ['pattern-123']
      );
    });
  });

  describe('getInterferenceSummary', () => {
    it('should return comprehensive summary statistics', async () => {
      // Mock total patterns
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '10' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock active patterns
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '7' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock remediated patterns
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '3' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock top pairs
      mockQuery.mockResolvedValueOnce({
        rows: [
          { target_language: 'EN', source_language: 'RU', count: '5' },
          { target_language: 'DE', source_language: 'EN', count: '3' },
        ],
        rowCount: 2,
      } as unknown as QueryResult);

      // Mock recent patterns
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'pattern-recent',
            user_id: 'user-123',
            target_language: 'EN',
            source_language: 'RU',
            target_item_id: 'en-1',
            target_text: 'library',
            interfering_item_id: 'ru-1',
            interfering_text: 'библиотека',
            interference_type: 'vocabulary',
            confidence_score: 0.9,
            occurrence_count: 2,
            last_occurrence: new Date().toISOString(),
            remediation_completed: false,
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const summary = await service.getInterferenceSummary('user-123');

      expect(summary.totalPatterns).toBe(10);
      expect(summary.activePatterns).toBe(7);
      expect(summary.remediatedPatterns).toBe(3);
      expect(summary.topInterferenceLanguagePairs).toHaveLength(2);
      expect(summary.topInterferenceLanguagePairs[0].targetLanguage).toBe('EN');
      expect(summary.topInterferenceLanguagePairs[0].sourceLanguage).toBe('RU');
      expect(summary.topInterferenceLanguagePairs[0].count).toBe(5);
      expect(summary.recentPatterns).toHaveLength(1);
    });
  });

  describe('calculateInterferenceReduction', () => {
    it('should detect improving trend when occurrences decreasing', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ first_count: '10', last_count: '5' }],
        rowCount: 1,
      } as unknown as QueryResult);

      const reduction = await service.calculateInterferenceReduction('user-123', 'pattern-1', 30);

      expect(reduction.trend).toBe('improving');
      expect(reduction.rate).toBeGreaterThan(0);
    });

    it('should detect worsening trend when occurrences increasing', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ first_count: '5', last_count: '10' }],
        rowCount: 1,
      } as unknown as QueryResult);

      const reduction = await service.calculateInterferenceReduction('user-123', 'pattern-1', 30);

      expect(reduction.trend).toBe('worsening');
      expect(reduction.rate).toBeLessThan(0);
    });

    it('should detect stable trend when little change', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ first_count: '5', last_count: '5' }],
        rowCount: 1,
      } as unknown as QueryResult);

      const reduction = await service.calculateInterferenceReduction('user-123', 'pattern-1', 30);

      expect(reduction.trend).toBe('stable');
    });
  });

  describe('markRemediationCompleted', () => {
    it('should update pattern remediation_completed to true', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      } as unknown as QueryResult);

      await service.markRemediationCompleted('pattern-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('remediation_completed = true'),
        ['pattern-123']
      );
    });
  });

  describe('getExerciseDetails', () => {
    it('should return exercise details when found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            correct_answer: 'library',
            pattern_id: 'pattern-123',
            target_text: 'library',
            interfering_text: 'библиотека',
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const details = await service.getExerciseDetails('exercise-1');

      expect(details).not.toBeNull();
      expect(details?.correctAnswer).toBe('library');
      expect(details?.patternId).toBe('pattern-123');
      expect(details?.targetText).toBe('library');
      expect(details?.interferingText).toBe('библиотека');
    });

    it('should return null when exercise not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      const details = await service.getExerciseDetails('nonexistent');

      expect(details).toBeNull();
    });
  });
});
