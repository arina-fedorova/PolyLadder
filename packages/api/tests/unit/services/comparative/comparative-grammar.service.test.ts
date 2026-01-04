import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool, QueryResult } from 'pg';
import { ComparativeGrammarService } from '../../../../src/services/comparative/comparative-grammar.service';

// Mock pg Pool
const mockQuery = vi.fn();
const mockPool = {
  query: mockQuery,
} as unknown as Pool;

describe('ComparativeGrammarService', () => {
  let service: ComparativeGrammarService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ComparativeGrammarService(mockPool);
  });

  describe('getAvailableConcepts', () => {
    it('should return concepts available in multiple languages', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { category: 'past_tense', language_count: '3' },
          { category: 'plural_formation', language_count: '2' },
        ],
        rowCount: 2,
      } as QueryResult);

      const result = await service.getAvailableConcepts('user-123', ['EN', 'RU', 'DE']);

      expect(result).toHaveLength(2);
      expect(result[0].conceptKey).toBe('past_tense');
      expect(result[0].conceptName).toBe('Past Tense');
      expect(result[0].languageCount).toBe(3);
      expect(result[1].conceptKey).toBe('plural_formation');
      expect(result[1].conceptName).toBe('Plural Formation');
      expect(result[1].languageCount).toBe(2);
    });

    it('should return empty array when no common concepts', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as QueryResult);

      const result = await service.getAvailableConcepts('user-123', ['EN', 'ZH']);

      expect(result).toHaveLength(0);
    });

    it('should pass languages to query', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as QueryResult);

      await service.getAvailableConcepts('user-123', ['EN', 'FR']);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE language = ANY($1::varchar[])'),
        [['EN', 'FR']]
      );
    });
  });

  describe('getGrammarComparison', () => {
    it('should return comparison with language data', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'rule-en-1',
              language: 'EN',
              level: 'A2',
              category: 'past_tense',
              title: 'Simple Past Tense',
              explanation: 'Used for completed actions',
              examples: [{ sentence: 'I walked', translation: 'Я шёл' }],
            },
            {
              id: 'rule-ru-1',
              language: 'RU',
              level: 'A2',
              category: 'past_tense',
              title: 'Прошедшее время',
              explanation: 'Для законченных действий',
              examples: [{ sentence: 'Я шёл', translation: 'I walked' }],
            },
          ],
          rowCount: 2,
        } as QueryResult)
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        } as QueryResult); // For recording view

      const result = await service.getGrammarComparison('user-123', 'past_tense', ['EN', 'RU']);

      expect(result.conceptKey).toBe('past_tense');
      expect(result.conceptName).toBe('Past Tense');
      expect(result.languages).toHaveLength(2);
      expect(result.languages[0].language).toBe('EN');
      expect(result.languages[0].ruleName).toBe('Simple Past Tense');
      expect(result.languages[1].language).toBe('RU');
      expect(result.languages[1].ruleName).toBe('Прошедшее время');
    });

    it('should identify level differences', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'rule-en-1',
              language: 'EN',
              level: 'A1',
              category: 'pronouns',
              title: 'Personal Pronouns',
              explanation: 'I, you, he...',
              examples: [],
            },
            {
              id: 'rule-zh-1',
              language: 'ZH',
              level: 'B1',
              category: 'pronouns',
              title: '人称代词',
              explanation: '我，你，他...',
              examples: [],
            },
          ],
          rowCount: 2,
        } as QueryResult)
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        } as QueryResult);

      const result = await service.getGrammarComparison('user-123', 'pronouns', ['EN', 'ZH']);

      expect(result.differences.length).toBeGreaterThan(0);
      const levelDiff = result.differences.find((d) => d.aspect === 'Difficulty Level');
      expect(levelDiff).toBeDefined();
      expect(levelDiff!.descriptions).toHaveLength(2);
    });

    it('should identify similarities when levels match', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'rule-en-1',
              language: 'EN',
              level: 'B1',
              category: 'conditionals',
              title: 'First Conditional',
              explanation: 'If + present, will + verb',
              examples: [
                {
                  sentence: 'If it rains, I will stay home',
                  translation: 'Если будет дождь, я останусь дома',
                },
              ],
            },
            {
              id: 'rule-de-1',
              language: 'DE',
              level: 'B1',
              category: 'conditionals',
              title: 'Konditionalsätze',
              explanation: 'Wenn + Präsens, werden + Verb',
              examples: [
                {
                  sentence: 'Wenn es regnet, bleibe ich zu Hause',
                  translation: 'If it rains, I will stay home',
                },
              ],
            },
          ],
          rowCount: 2,
        } as QueryResult)
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        } as QueryResult);

      const result = await service.getGrammarComparison('user-123', 'conditionals', ['EN', 'DE']);

      expect(result.similarities.length).toBeGreaterThan(0);
      expect(result.similarities.some((s) => s.includes('B1'))).toBe(true);
    });

    it('should throw error when concept not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as QueryResult);

      await expect(
        service.getGrammarComparison('user-123', 'nonexistent', ['EN', 'RU'])
      ).rejects.toThrow('No grammar rules found for concept: nonexistent');
    });

    it('should record comparison view', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'rule-1',
              language: 'EN',
              level: 'A1',
              category: 'test',
              title: 'Test',
              explanation: 'Test',
              examples: [],
            },
            {
              id: 'rule-2',
              language: 'RU',
              level: 'A1',
              category: 'test',
              title: 'Тест',
              explanation: 'Тест',
              examples: [],
            },
          ],
          rowCount: 2,
        } as QueryResult)
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        } as QueryResult);

      await service.getGrammarComparison('user-123', 'test', ['RU', 'EN']);

      // Should insert with sorted languages
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO user_grammar_comparisons_viewed'),
        ['user-123', 'test', ['EN', 'RU']] // Languages should be sorted
      );
    });

    it('should generate cross-linguistic insights', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'rule-en-1',
              language: 'EN',
              level: 'A1',
              category: 'articles',
              title: 'Articles',
              explanation: 'A, an, the',
              examples: [],
            },
            {
              id: 'rule-de-1',
              language: 'DE',
              level: 'B2',
              category: 'articles',
              title: 'Artikel',
              explanation: 'Der, die, das, ein, eine',
              examples: [],
            },
          ],
          rowCount: 2,
        } as QueryResult)
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        } as QueryResult);

      const result = await service.getGrammarComparison('user-123', 'articles', ['EN', 'DE']);

      expect(result.crossLinguisticInsights.length).toBeGreaterThan(0);
      expect(result.crossLinguisticInsights.some((i) => i.includes('Learning Order'))).toBe(true);
    });
  });

  describe('getUserComparisonHistory', () => {
    it('should return user comparison history', async () => {
      const viewedAt = new Date('2024-01-15T10:00:00Z');
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            concept_key: 'past_tense',
            languages: ['EN', 'RU'],
            viewed_at: viewedAt,
          },
          {
            concept_key: 'plural_formation',
            languages: ['EN', 'DE', 'FR'],
            viewed_at: new Date('2024-01-14T10:00:00Z'),
          },
        ],
        rowCount: 2,
      } as QueryResult);

      const result = await service.getUserComparisonHistory('user-123', 10);

      expect(result).toHaveLength(2);
      expect(result[0].conceptKey).toBe('past_tense');
      expect(result[0].conceptName).toBe('Past Tense');
      expect(result[0].languages).toEqual(['EN', 'RU']);
      expect(result[0].viewedAt).toEqual(viewedAt);
    });

    it('should return empty array when no history', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as QueryResult);

      const result = await service.getUserComparisonHistory('user-123');

      expect(result).toHaveLength(0);
    });

    it('should pass limit to query', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as QueryResult);

      await service.getUserComparisonHistory('user-123', 5);

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('LIMIT $2'), ['user-123', 5]);
    });

    it('should use default limit of 10', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as QueryResult);

      await service.getUserComparisonHistory('user-123');

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['user-123', 10]);
    });
  });

  describe('formatConceptName', () => {
    it('should format concept keys correctly via getAvailableConcepts', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { category: 'past_simple', language_count: '2' },
          { category: 'future_perfect_continuous', language_count: '2' },
        ],
        rowCount: 2,
      } as QueryResult);

      const result = await service.getAvailableConcepts('user-123', ['EN', 'RU']);

      expect(result[0].conceptName).toBe('Past Simple');
      expect(result[1].conceptName).toBe('Future Perfect Continuous');
    });
  });

  describe('parseExamples', () => {
    it('should handle examples with text field instead of sentence', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'rule-1',
              language: 'EN',
              level: 'A1',
              category: 'test',
              title: 'Test',
              explanation: 'Test',
              examples: [{ text: 'Hello world', translation: 'Привет мир' }],
            },
            {
              id: 'rule-2',
              language: 'RU',
              level: 'A1',
              category: 'test',
              title: 'Тест',
              explanation: 'Тест',
              examples: [{ sentence: 'Привет', translation: 'Hi' }],
            },
          ],
          rowCount: 2,
        } as QueryResult)
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        } as QueryResult);

      const result = await service.getGrammarComparison('user-123', 'test', ['EN', 'RU']);

      expect(result.languages[0].examples[0].sentence).toBe('Hello world');
      expect(result.languages[1].examples[0].sentence).toBe('Привет');
    });

    it('should handle null examples', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'rule-1',
              language: 'EN',
              level: 'A1',
              category: 'test',
              title: 'Test',
              explanation: 'Test',
              examples: null,
            },
            {
              id: 'rule-2',
              language: 'RU',
              level: 'A1',
              category: 'test',
              title: 'Тест',
              explanation: 'Тест',
              examples: null,
            },
          ],
          rowCount: 2,
        } as QueryResult)
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        } as QueryResult);

      const result = await service.getGrammarComparison('user-123', 'test', ['EN', 'RU']);

      expect(result.languages[0].examples).toEqual([]);
      expect(result.languages[1].examples).toEqual([]);
    });
  });
});
