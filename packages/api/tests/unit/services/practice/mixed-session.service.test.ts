import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool, QueryResult } from 'pg';
import { MixedSessionService } from '../../../../src/services/practice/mixed-session.service';

// Mock pg Pool
const mockQuery = vi.fn();
const mockPool = {
  query: mockQuery,
} as unknown as Pool;

describe('MixedSessionService', () => {
  let service: MixedSessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MixedSessionService(mockPool);
  });

  describe('createMixedSession', () => {
    it('should create a mixed session with items from multiple languages', async () => {
      // Mock active languages query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { language: 'EN', proficiency_score: 50 },
          { language: 'RU', proficiency_score: 30 },
        ],
        rowCount: 2,
      } as unknown as QueryResult);

      // Mock items for EN
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            meaning_id: 'en-hello',
            word_text: 'hello',
            definition: 'A greeting',
            audio_url: null,
            level: 'A1',
            ease_factor: 2.5,
          },
          {
            meaning_id: 'en-goodbye',
            word_text: 'goodbye',
            definition: 'A farewell',
            audio_url: null,
            level: 'A1',
            ease_factor: 2.3,
          },
        ],
        rowCount: 2,
      } as unknown as QueryResult);

      // Mock items for RU
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            meaning_id: 'ru-privet',
            word_text: 'привет',
            definition: 'A greeting',
            audio_url: null,
            level: 'A1',
            ease_factor: 2.5,
          },
          {
            meaning_id: 'ru-poka',
            word_text: 'пока',
            definition: 'Goodbye',
            audio_url: null,
            level: 'A1',
            ease_factor: 2.0,
          },
        ],
        rowCount: 2,
      } as unknown as QueryResult);

      // Mock session creation
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'session-123' }],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.createMixedSession({
        userId: 'user-123',
        practiceTypes: ['recall', 'recognition'],
        itemsPerLanguage: 10,
        mixingStrategy: 'equal',
        totalItems: 4,
      });

      expect(result.sessionId).toBe('session-123');
      expect(result.languages).toEqual(['EN', 'RU']);
      expect(result.mixingStrategy).toBe('equal');
      expect(result.items.length).toBeGreaterThan(0);
    });

    it('should throw error when user has fewer than 2 active languages', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ language: 'EN', proficiency_score: 50 }],
        rowCount: 1,
      } as unknown as QueryResult);

      await expect(
        service.createMixedSession({
          userId: 'user-123',
          practiceTypes: ['recall'],
          itemsPerLanguage: 10,
          mixingStrategy: 'equal',
          totalItems: 10,
        })
      ).rejects.toThrow('Mixed practice requires at least 2 active languages');
    });

    it('should throw error when no items are available', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { language: 'EN', proficiency_score: 50 },
          { language: 'RU', proficiency_score: 30 },
        ],
        rowCount: 2,
      } as unknown as QueryResult);

      // Mock empty items for EN
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      // Mock empty items for RU
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      await expect(
        service.createMixedSession({
          userId: 'user-123',
          practiceTypes: ['recall'],
          itemsPerLanguage: 10,
          mixingStrategy: 'equal',
          totalItems: 10,
        })
      ).rejects.toThrow('No items available for practice in any language');
    });

    it('should apply weighted distribution strategy', async () => {
      // Mock active languages
      mockQuery.mockResolvedValueOnce({
        rows: [
          { language: 'EN', proficiency_score: 80 },
          { language: 'RU', proficiency_score: 20 },
        ],
        rowCount: 2,
      } as unknown as QueryResult);

      // Mock items for EN
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            meaning_id: 'en-1',
            word_text: 'word1',
            definition: null,
            audio_url: null,
            level: 'A1',
            ease_factor: 2.5,
          },
          {
            meaning_id: 'en-2',
            word_text: 'word2',
            definition: null,
            audio_url: null,
            level: 'A1',
            ease_factor: 2.5,
          },
          {
            meaning_id: 'en-3',
            word_text: 'word3',
            definition: null,
            audio_url: null,
            level: 'A1',
            ease_factor: 2.5,
          },
        ],
        rowCount: 3,
      } as unknown as QueryResult);

      // Mock items for RU
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            meaning_id: 'ru-1',
            word_text: 'слово1',
            definition: null,
            audio_url: null,
            level: 'A1',
            ease_factor: 2.5,
          },
          {
            meaning_id: 'ru-2',
            word_text: 'слово2',
            definition: null,
            audio_url: null,
            level: 'A1',
            ease_factor: 2.5,
          },
          {
            meaning_id: 'ru-3',
            word_text: 'слово3',
            definition: null,
            audio_url: null,
            level: 'A1',
            ease_factor: 2.5,
          },
        ],
        rowCount: 3,
      } as unknown as QueryResult);

      // Mock proficiency query for weighted distribution
      mockQuery.mockResolvedValueOnce({
        rows: [
          { language: 'EN', proficiency_score: 80 },
          { language: 'RU', proficiency_score: 20 },
        ],
        rowCount: 2,
      } as unknown as QueryResult);

      // Mock session creation
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'session-weighted' }],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.createMixedSession({
        userId: 'user-123',
        practiceTypes: ['recall'],
        itemsPerLanguage: 10,
        mixingStrategy: 'weighted',
        totalItems: 4,
      });

      expect(result.sessionId).toBe('session-weighted');
      // Weighted should give more items from weaker language (RU with score 20)
      const ruItems = result.items.filter((i) => i.language === 'RU');
      const enItems = result.items.filter((i) => i.language === 'EN');
      // RU should have more or equal items due to lower proficiency
      expect(ruItems.length).toBeGreaterThanOrEqual(enItems.length);
    });
  });

  describe('recordMixedAttempt', () => {
    it('should record an attempt and track language switching', async () => {
      // Mock getting previous attempt
      mockQuery.mockResolvedValueOnce({
        rows: [{ language: 'EN' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock inserting attempt
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock updating completed items
      mockQuery.mockResolvedValueOnce({
        rows: [{ completed_items: 5 }],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.recordMixedAttempt(
        'session-123',
        'item-1',
        'recall',
        'RU',
        true,
        5
      );

      expect(result.success).toBe(true);
      expect(result.completedItems).toBe(5);

      // Verify the insert query was called with previous language
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO mixed_session_attempts'),
        ['session-123', 'item-1', 'recall', 'RU', 'EN', true, 5]
      );
    });

    it('should handle first attempt with no previous language', async () => {
      // Mock getting previous attempt - empty
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      // Mock inserting attempt
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock updating completed items
      mockQuery.mockResolvedValueOnce({
        rows: [{ completed_items: 1 }],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.recordMixedAttempt(
        'session-123',
        'item-1',
        'recall',
        'EN',
        true,
        3
      );

      expect(result.success).toBe(true);
      expect(result.completedItems).toBe(1);

      // Verify the insert query was called with null previous language
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO mixed_session_attempts'),
        ['session-123', 'item-1', 'recall', 'EN', null, true, 3]
      );
    });
  });

  describe('generateSessionSummary', () => {
    it('should generate summary with per-language breakdown', async () => {
      // Mock overall stats
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_items: '10', total_correct: '8', total_time: '120' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock per-language breakdown
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            language: 'EN',
            items_attempted: '5',
            correct_answers: '4',
            average_time: '10.5',
            accuracy: '0.8',
          },
          {
            language: 'RU',
            items_attempted: '5',
            correct_answers: '4',
            average_time: '14.0',
            accuracy: '0.8',
          },
        ],
        rowCount: 2,
      } as unknown as QueryResult);

      // Mock switching efficiency
      mockQuery.mockResolvedValueOnce({
        rows: [{ efficiency: '0.75' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock update session
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.generateSessionSummary('session-123');

      expect(result.sessionId).toBe('session-123');
      expect(result.totalItems).toBe(10);
      expect(result.totalCorrect).toBe(8);
      expect(result.totalTime).toBe(120);
      expect(result.languageBreakdown).toHaveLength(2);
      expect(result.languageBreakdown[0].language).toBe('EN');
      expect(result.languageBreakdown[0].accuracy).toBe(0.8);
      expect(result.switchingEfficiency).toBe(0.75);
    });

    it('should handle empty session summary', async () => {
      // Mock overall stats - empty
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_items: '0', total_correct: '0', total_time: '0' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock per-language breakdown - empty
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      // Mock switching efficiency - default to 1.0
      mockQuery.mockResolvedValueOnce({
        rows: [{ efficiency: '1.0' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock update session
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.generateSessionSummary('session-empty');

      expect(result.totalItems).toBe(0);
      expect(result.totalCorrect).toBe(0);
      expect(result.languageBreakdown).toHaveLength(0);
      expect(result.switchingEfficiency).toBe(1.0);
    });
  });

  describe('calculateSwitchingEfficiency', () => {
    it('should calculate efficiency based on accuracy after switches', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ efficiency: '0.6' }],
        rowCount: 1,
      } as unknown as QueryResult);

      const efficiency = await service.calculateSwitchingEfficiency('session-123');

      expect(efficiency).toBe(0.6);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('previous_language IS NOT NULL'),
        ['session-123']
      );
    });

    it('should return 1.0 when no switches occurred', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ efficiency: '1.0' }],
        rowCount: 1,
      } as unknown as QueryResult);

      const efficiency = await service.calculateSwitchingEfficiency('session-no-switch');

      expect(efficiency).toBe(1.0);
    });
  });

  describe('getUserMixedSessionHistory', () => {
    it('should return user session history', async () => {
      const createdAt = new Date('2024-01-15T10:00:00Z');
      const completedAt = new Date('2024-01-15T10:15:00Z');

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'session-1',
            languages: ['EN', 'RU'],
            total_items: 20,
            completed_items: 20,
            switching_efficiency: 0.85,
            created_at: createdAt,
            completed_at: completedAt,
          },
          {
            id: 'session-2',
            languages: ['EN', 'RU', 'DE'],
            total_items: 30,
            completed_items: 15,
            switching_efficiency: null,
            created_at: new Date('2024-01-14T10:00:00Z'),
            completed_at: null,
          },
        ],
        rowCount: 2,
      } as unknown as QueryResult);

      const result = await service.getUserMixedSessionHistory('user-123', 10);

      expect(result).toHaveLength(2);
      expect(result[0].sessionId).toBe('session-1');
      expect(result[0].languages).toEqual(['EN', 'RU']);
      expect(result[0].totalItems).toBe(20);
      expect(result[0].completedItems).toBe(20);
      expect(result[0].switchingEfficiency).toBe(0.85);
      expect(result[0].createdAt).toEqual(createdAt);
      expect(result[0].completedAt).toEqual(completedAt);

      expect(result[1].sessionId).toBe('session-2');
      expect(result[1].switchingEfficiency).toBeNull();
      expect(result[1].completedAt).toBeNull();
    });

    it('should return empty array when no history', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      const result = await service.getUserMixedSessionHistory('user-123');

      expect(result).toHaveLength(0);
    });

    it('should use default limit of 10', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      await service.getUserMixedSessionHistory('user-123');

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['user-123', 10]);
    });
  });
});
