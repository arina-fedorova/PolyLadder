import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import {
  deprecateItem,
  getReplacementChain,
  getActiveReplacement,
  DeprecationError,
  DeprecationRepository,
  DeprecationRecord,
} from '../../src/lifecycle/deprecation';

describe('Deprecation Service', () => {
  let createDeprecation: Mock;
  let isDeprecated: Mock;
  let getDeprecation: Mock;
  let getReplacement: Mock;
  let mockRepo: DeprecationRepository;

  beforeEach(() => {
    createDeprecation = vi.fn();
    isDeprecated = vi.fn();
    getDeprecation = vi.fn();
    getReplacement = vi.fn();
    mockRepo = { createDeprecation, isDeprecated, getDeprecation, getReplacement };
  });

  describe('deprecateItem', () => {
    it('should deprecate item successfully', async () => {
      const params = {
        itemId: 'item-1',
        itemType: 'meaning',
        reason: 'Replaced with better version',
        replacementId: 'item-2',
        operatorId: 'operator-1',
      };

      const expectedRecord: DeprecationRecord = {
        id: 'deprecation-1',
        ...params,
        deprecatedAt: new Date(),
      };

      isDeprecated.mockResolvedValue(false);
      createDeprecation.mockResolvedValue(expectedRecord);

      const result = await deprecateItem(mockRepo, params);

      expect(isDeprecated).toHaveBeenCalledWith('item-1');
      expect(createDeprecation).toHaveBeenCalledWith(params);
      expect(result).toEqual(expectedRecord);
    });

    it('should throw if item already deprecated', async () => {
      isDeprecated.mockResolvedValue(true);

      await expect(
        deprecateItem(mockRepo, {
          itemId: 'item-1',
          itemType: 'meaning',
          reason: 'Test',
          operatorId: 'op-1',
        })
      ).rejects.toThrow(DeprecationError);
    });

    it('should throw DeprecationError with correct message', async () => {
      isDeprecated.mockResolvedValue(true);

      try {
        await deprecateItem(mockRepo, {
          itemId: 'item-123',
          itemType: 'meaning',
          reason: 'Test',
          operatorId: 'op-1',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(DeprecationError);
        expect((error as DeprecationError).message).toContain('item-123');
        expect((error as DeprecationError).message).toContain('already deprecated');
      }
    });
  });

  describe('getReplacementChain', () => {
    it('should return chain of replacements', async () => {
      getReplacement
        .mockResolvedValueOnce('item-2')
        .mockResolvedValueOnce('item-3')
        .mockResolvedValueOnce(null);

      const chain = await getReplacementChain(mockRepo, 'item-1');

      expect(chain).toEqual(['item-1', 'item-2', 'item-3']);
    });

    it('should return single item if no replacement', async () => {
      getReplacement.mockResolvedValue(null);

      const chain = await getReplacementChain(mockRepo, 'item-1');

      expect(chain).toEqual(['item-1']);
    });

    it('should stop at max depth', async () => {
      getReplacement.mockImplementation((id: string) => Promise.resolve(`${id}-next`));

      const chain = await getReplacementChain(mockRepo, 'item', 3);

      expect(chain.length).toBe(4);
    });

    it('should detect circular references', async () => {
      getReplacement.mockResolvedValueOnce('item-2').mockResolvedValueOnce('item-1');

      const chain = await getReplacementChain(mockRepo, 'item-1');

      expect(chain).toEqual(['item-1', 'item-2']);
    });
  });

  describe('getActiveReplacement', () => {
    it('should return last item in chain', async () => {
      getReplacement
        .mockResolvedValueOnce('item-2')
        .mockResolvedValueOnce('item-3')
        .mockResolvedValueOnce(null);

      const active = await getActiveReplacement(mockRepo, 'item-1');

      expect(active).toBe('item-3');
    });

    it('should return same item if not deprecated', async () => {
      getReplacement.mockResolvedValue(null);

      const active = await getActiveReplacement(mockRepo, 'item-1');

      expect(active).toBe('item-1');
    });
  });
});
