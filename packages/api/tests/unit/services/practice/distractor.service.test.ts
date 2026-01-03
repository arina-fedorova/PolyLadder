import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { DistractorGenerationService } from '../../../../src/services/practice/distractor.service';

describe('DistractorGenerationService', () => {
  let service: DistractorGenerationService;
  let mockPool: Pool;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    } as unknown as Pool;

    service = new DistractorGenerationService(mockPool);
  });

  describe('generateWordDistractors', () => {
    it('should return word distractors from same CEFR level', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      // First query: get meaning's level
      querySpy.mockResolvedValueOnce({
        rows: [{ level: 'A1' }],
        rowCount: 1,
      } as never);

      // Second query: get distractors
      querySpy.mockResolvedValueOnce({
        rows: [{ text: 'world' }, { text: 'cat' }, { text: 'dog' }],
        rowCount: 3,
      } as never);

      const result = await service.generateWordDistractors('en-hello', 'EN', 3);

      expect(result).toHaveLength(3);
      expect(result).toEqual(['world', 'cat', 'dog']);
      expect(querySpy).toHaveBeenCalledTimes(2);

      // Check the second query filters by level and excludes the meaning
      const secondCall = querySpy.mock.calls[1];
      expect(secondCall[1]).toContain('A1'); // level
      expect(secondCall[1]).toContain('EN'); // language
      expect(secondCall[1]).toContain('en-hello'); // excluded meaning
    });

    it('should return empty array if meaning not found', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');
      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

      const result = await service.generateWordDistractors('en-nonexistent', 'EN', 3);

      expect(result).toEqual([]);
      expect(querySpy).toHaveBeenCalledTimes(1);
    });

    it('should limit results to requested count', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ level: 'B1' }],
        rowCount: 1,
      } as never);

      querySpy.mockResolvedValueOnce({
        rows: [{ text: 'apple' }, { text: 'banana' }],
        rowCount: 2,
      } as never);

      const result = await service.generateWordDistractors('en-fruit', 'EN', 2);

      expect(result).toHaveLength(2);

      // Verify limit parameter was passed
      const limitCall = querySpy.mock.calls[1];
      expect(limitCall[1][3]).toBe(2);
    });
  });

  describe('generateDefinitionDistractors', () => {
    it('should return definition distractors from same CEFR level', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ level: 'A2' }],
        rowCount: 1,
      } as never);

      querySpy.mockResolvedValueOnce({
        rows: [
          { usage_notes: 'A large furry animal' },
          { usage_notes: 'A small rodent' },
          { usage_notes: 'A common pet' },
        ],
        rowCount: 3,
      } as never);

      const result = await service.generateDefinitionDistractors('en-cat', 'EN', 3);

      expect(result).toHaveLength(3);
      expect(result[0]).toBe('A large furry animal');
    });

    it('should return empty array if meaning not found', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');
      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

      const result = await service.generateDefinitionDistractors('en-nonexistent', 'EN', 3);

      expect(result).toEqual([]);
    });

    it('should filter out null and empty definitions', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ level: 'A1' }],
        rowCount: 1,
      } as never);

      querySpy.mockResolvedValueOnce({
        rows: [{ usage_notes: 'Valid definition' }],
        rowCount: 1,
      } as never);

      const result = await service.generateDefinitionDistractors('en-word', 'EN', 3);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe('Valid definition');
    });
  });

  describe('generateGrammarTitleDistractors', () => {
    it('should return grammar rule title distractors from same category and level', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ level: 'A1', category: 'verbs', language: 'EN' }],
        rowCount: 1,
      } as never);

      querySpy.mockResolvedValueOnce({
        rows: [
          { title: 'Present Continuous' },
          { title: 'Past Simple' },
          { title: 'Future Simple' },
        ],
        rowCount: 3,
      } as never);

      const result = await service.generateGrammarTitleDistractors('rule-present-simple', 3);

      expect(result).toHaveLength(3);
      expect(result).toContain('Present Continuous');
    });

    it('should fallback to same level when not enough in category', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ level: 'A1', category: 'rare-category', language: 'EN' }],
        rowCount: 1,
      } as never);

      // First attempt: same category (returns empty)
      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

      // Fallback: same level, any category
      querySpy.mockResolvedValueOnce({
        rows: [{ title: 'Present Simple' }, { title: 'Articles' }],
        rowCount: 2,
      } as never);

      const result = await service.generateGrammarTitleDistractors('rule-rare', 3);

      expect(result).toHaveLength(2);
      expect(querySpy).toHaveBeenCalledTimes(3);
    });

    it('should return empty array if rule not found', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');
      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

      const result = await service.generateGrammarTitleDistractors('nonexistent-rule', 3);

      expect(result).toEqual([]);
    });
  });

  describe('generateGrammarExampleDistractors', () => {
    it('should return example sentences from other rules', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ level: 'A1', category: 'verbs', language: 'EN' }],
        rowCount: 1,
      } as never);

      querySpy.mockResolvedValueOnce({
        rows: [
          { example: { sentence: 'I am eating.' } },
          { example: { sentence: 'She was running.' } },
          { example: { sentence: 'They will go.' } },
        ],
        rowCount: 3,
      } as never);

      const result = await service.generateGrammarExampleDistractors('rule-present', 3);

      expect(result).toHaveLength(3);
      expect(result).toContain('I am eating.');
    });

    it('should filter out invalid examples', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ level: 'A1', category: 'verbs', language: 'EN' }],
        rowCount: 1,
      } as never);

      querySpy.mockResolvedValueOnce({
        rows: [
          { example: { sentence: 'Valid sentence.' } },
          { example: { sentence: '' } },
          { example: null },
          { example: { translation: 'No sentence field' } },
        ],
        rowCount: 4,
      } as never);

      const result = await service.generateGrammarExampleDistractors('rule-x', 3);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe('Valid sentence.');
    });

    it('should deduplicate example sentences', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ level: 'A1', category: 'verbs', language: 'EN' }],
        rowCount: 1,
      } as never);

      querySpy.mockResolvedValueOnce({
        rows: [
          { example: { sentence: 'Same sentence.' } },
          { example: { sentence: 'Same sentence.' } },
          { example: { sentence: 'Different sentence.' } },
        ],
        rowCount: 3,
      } as never);

      const result = await service.generateGrammarExampleDistractors('rule-y', 3);

      expect(result).toHaveLength(2);
      expect(result).toContain('Same sentence.');
      expect(result).toContain('Different sentence.');
    });
  });

  describe('generateFillBlankDistractors', () => {
    it('should return words with similar length', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ text: 'walks' }, { text: 'talks' }, { text: 'jumps' }],
        rowCount: 3,
      } as never);

      const result = await service.generateFillBlankDistractors('runs', 'EN', 'A1', 3);

      expect(result).toHaveLength(3);
      expect(result).toContain('walks');
    });

    it('should calculate appropriate length bounds', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ text: 'test' }],
        rowCount: 1,
      } as never);

      // Word "hello" has length 5, so min=2, max=8
      await service.generateFillBlankDistractors('hello', 'EN', 'A1', 3);

      const queryCall = querySpy.mock.calls[0];
      expect(queryCall[1]).toContain(2); // min length
      expect(queryCall[1]).toContain(8); // max length
    });

    it('should exclude the correct answer', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ text: 'alternative' }],
        rowCount: 1,
      } as never);

      await service.generateFillBlankDistractors('answer', 'EN', 'B1', 3);

      const queryCall = querySpy.mock.calls[0];
      expect(queryCall[1]).toContain('answer'); // excluded word
    });

    it('should handle minimum length edge case', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [{ text: 'I' }, { text: 'a' }],
        rowCount: 2,
      } as never);

      // Word "a" has length 1, so min should be 1 (not negative)
      await service.generateFillBlankDistractors('a', 'EN', 'A0', 3);

      const queryCall = querySpy.mock.calls[0];
      expect(queryCall[1][3]).toBeGreaterThanOrEqual(1); // min length >= 1
    });
  });
});
