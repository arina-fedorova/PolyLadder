import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CEFRConsistencyGate,
  CEFRValidationInput,
  getCEFRRank,
  isLevelHigherThan,
  PrerequisiteValidationGate,
  PrerequisiteValidationInput,
  PrerequisiteRepository,
  ContentSafetyGate,
  ContentSafetyInput,
  GateTier,
} from '../../src/quality-gates';
import { CEFRLevel, Language } from '../../src/domain/enums';

describe('Quality Gates Part 2', () => {
  describe('CEFRConsistencyGate', () => {
    const gate = new CEFRConsistencyGate();

    it('should have correct tier', () => {
      expect(gate.tier).toBe(GateTier.FAST);
    });

    it('should pass valid A1 word', async () => {
      const input: CEFRValidationInput = {
        text: 'hello',
        language: Language.EN,
        contentType: 'vocabulary',
        level: CEFRLevel.A1,
        wordLength: 5,
        frequencyRank: 50,
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(true);
    });

    it('should fail word too long for A1', async () => {
      const input: CEFRValidationInput = {
        text: 'internationalization',
        language: Language.EN,
        contentType: 'vocabulary',
        level: CEFRLevel.A1,
        wordLength: 20,
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('CEFR');
      const issues = result.details?.issues as string[];
      expect(issues.some((i) => i.includes('too long'))).toBe(true);
    });

    it('should fail word too rare for A1', async () => {
      const input: CEFRValidationInput = {
        text: 'sesquipedalian',
        language: Language.EN,
        contentType: 'vocabulary',
        level: CEFRLevel.A1,
        wordLength: 14,
        frequencyRank: 50000,
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(false);
      const issues = result.details?.issues as string[];
      expect(issues.some((i) => i.includes('too rare'))).toBe(true);
    });

    it('should fail advanced grammar at A1 level', async () => {
      const input: CEFRValidationInput = {
        text: 'Subjunctive mood in Spanish',
        language: Language.ES,
        contentType: 'grammar',
        level: CEFRLevel.A1,
        grammarTopic: 'Subjunctive mood usage',
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(false);
      const issues = result.details?.issues as string[];
      expect(issues.some((i) => i.includes('subjunctive'))).toBe(true);
    });

    it('should pass advanced grammar at C1 level', async () => {
      const input: CEFRValidationInput = {
        text: 'Subjunctive mood in Spanish',
        language: Language.ES,
        contentType: 'grammar',
        level: CEFRLevel.C1,
        grammarTopic: 'Subjunctive mood usage',
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(true);
    });

    it('should fail explanation too long for A1', async () => {
      const longExplanation =
        'This is a very long explanation. ' +
        'It has many sentences. '.repeat(10) +
        'This should fail the CEFR check.';

      const input: CEFRValidationInput = {
        text: 'test',
        language: Language.EN,
        contentType: 'grammar',
        level: CEFRLevel.A1,
        explanationText: longExplanation,
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(false);
      const issues = result.details?.issues as string[];
      expect(issues.some((i) => i.includes('Explanation'))).toBe(true);
    });

    it('should fail invalid CEFR level', async () => {
      const input: CEFRValidationInput = {
        text: 'test',
        language: Language.EN,
        contentType: 'vocabulary',
        level: 'Z9' as CEFRLevel,
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Invalid CEFR level');
    });
  });

  describe('getCEFRRank', () => {
    it('should return correct ranks', () => {
      expect(getCEFRRank(CEFRLevel.A0)).toBe(0);
      expect(getCEFRRank(CEFRLevel.A1)).toBe(1);
      expect(getCEFRRank(CEFRLevel.B2)).toBe(4);
      expect(getCEFRRank(CEFRLevel.C2)).toBe(6);
    });
  });

  describe('isLevelHigherThan', () => {
    it('should compare levels correctly', () => {
      expect(isLevelHigherThan(CEFRLevel.B1, CEFRLevel.A1)).toBe(true);
      expect(isLevelHigherThan(CEFRLevel.A1, CEFRLevel.B1)).toBe(false);
      expect(isLevelHigherThan(CEFRLevel.A1, CEFRLevel.A1)).toBe(false);
    });
  });

  describe('PrerequisiteValidationGate', () => {
    let mockRepo: PrerequisiteRepository;
    let gate: PrerequisiteValidationGate;

    beforeEach(() => {
      mockRepo = {
        findPrerequisites: vi.fn().mockResolvedValue([]),
        getPrerequisitesOf: vi.fn().mockResolvedValue([]),
      };
      gate = new PrerequisiteValidationGate(mockRepo);
    });

    it('should have correct tier', () => {
      expect(gate.tier).toBe(GateTier.DATABASE);
    });

    it('should pass when no prerequisites', async () => {
      const input: PrerequisiteValidationInput = {
        text: 'lesson',
        language: Language.EN,
        contentType: 'curriculum',
        itemId: 'lesson-1',
        level: CEFRLevel.A1,
        prerequisites: [],
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(true);
    });

    it('should fail self-reference', async () => {
      const input: PrerequisiteValidationInput = {
        text: 'lesson',
        language: Language.EN,
        contentType: 'curriculum',
        itemId: 'lesson-1',
        level: CEFRLevel.A1,
        prerequisites: ['lesson-1'],
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(false);
      expect(result.details?.issues).toContain('Item cannot be its own prerequisite');
    });

    it('should fail missing prerequisites', async () => {
      mockRepo.findPrerequisites = vi.fn().mockResolvedValue([]);

      const input: PrerequisiteValidationInput = {
        text: 'lesson',
        language: Language.EN,
        contentType: 'curriculum',
        itemId: 'lesson-2',
        level: CEFRLevel.A2,
        prerequisites: ['lesson-1', 'lesson-missing'],
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(false);
      const issues = result.details?.issues as string[];
      expect(issues.some((i) => i.includes('Missing prerequisites'))).toBe(true);
    });

    it('should fail prerequisite with higher level', async () => {
      mockRepo.findPrerequisites = vi
        .fn()
        .mockResolvedValue([{ id: 'lesson-advanced', level: CEFRLevel.B2, language: Language.EN }]);

      const input: PrerequisiteValidationInput = {
        text: 'lesson',
        language: Language.EN,
        contentType: 'curriculum',
        itemId: 'lesson-basic',
        level: CEFRLevel.A1,
        prerequisites: ['lesson-advanced'],
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(false);
      const issues = result.details?.issues as string[];
      expect(issues.some((i) => i.includes('higher level'))).toBe(true);
    });

    it('should fail prerequisite with different language', async () => {
      mockRepo.findPrerequisites = vi
        .fn()
        .mockResolvedValue([{ id: 'spanish-lesson', level: CEFRLevel.A1, language: Language.ES }]);

      const input: PrerequisiteValidationInput = {
        text: 'lesson',
        language: Language.EN,
        contentType: 'curriculum',
        itemId: 'english-lesson',
        level: CEFRLevel.A1,
        prerequisites: ['spanish-lesson'],
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(false);
      const issues = result.details?.issues as string[];
      expect(issues.some((i) => i.includes('different language'))).toBe(true);
    });

    it('should detect circular dependency', async () => {
      // Create a cycle: lesson-new → lesson-a → lesson-new
      mockRepo.findPrerequisites = vi
        .fn()
        .mockResolvedValue([{ id: 'lesson-a', level: CEFRLevel.A1, language: Language.EN }]);

      mockRepo.getPrerequisitesOf = vi.fn().mockImplementation((id: string) => {
        // lesson-a depends on lesson-new (the item we're validating)
        if (id === 'lesson-a') return Promise.resolve(['lesson-new']);
        return Promise.resolve([]);
      });

      const input: PrerequisiteValidationInput = {
        text: 'lesson',
        language: Language.EN,
        contentType: 'curriculum',
        itemId: 'lesson-new',
        level: CEFRLevel.A1,
        prerequisites: ['lesson-a'],
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(false);
      const issues = result.details?.issues as string[];
      expect(issues.some((i) => i.includes('Circular dependency'))).toBe(true);
    });

    it('should pass valid prerequisites', async () => {
      mockRepo.findPrerequisites = vi
        .fn()
        .mockResolvedValue([{ id: 'lesson-1', level: CEFRLevel.A1, language: Language.EN }]);
      mockRepo.getPrerequisitesOf = vi.fn().mockResolvedValue([]);

      const input: PrerequisiteValidationInput = {
        text: 'lesson',
        language: Language.EN,
        contentType: 'curriculum',
        itemId: 'lesson-2',
        level: CEFRLevel.A2,
        prerequisites: ['lesson-1'],
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(true);
    });
  });

  describe('ContentSafetyGate', () => {
    const gate = new ContentSafetyGate();

    it('should have correct tier', () => {
      expect(gate.tier).toBe(GateTier.FAST);
    });

    it('should pass clean text', async () => {
      const input: ContentSafetyInput = {
        text: 'Hello, how are you today?',
        language: Language.EN,
        contentType: 'utterance',
        textsToCheck: ['Hello, how are you today?'],
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(true);
    });

    it('should fail text with profanity', async () => {
      const input: ContentSafetyInput = {
        text: 'This is a fuck test',
        language: Language.EN,
        contentType: 'utterance',
        textsToCheck: ['This is a fuck test'],
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('profanity');
    });

    it('should fail text with violence', async () => {
      const input: ContentSafetyInput = {
        text: 'I want to kill someone',
        language: Language.EN,
        contentType: 'utterance',
        textsToCheck: ['I want to kill someone'],
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('violence');
    });

    it('should pass whitelisted words like "class"', async () => {
      const input: ContentSafetyInput = {
        text: 'I have a class today',
        language: Language.EN,
        contentType: 'utterance',
        textsToCheck: ['I have a class today'],
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(true);
    });

    it('should pass whitelisted words like "passion"', async () => {
      const input: ContentSafetyInput = {
        text: 'She has a passion for music',
        language: Language.EN,
        contentType: 'utterance',
        textsToCheck: ['She has a passion for music'],
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(true);
    });

    it('should check multiple texts', async () => {
      const input: ContentSafetyInput = {
        text: '',
        language: Language.EN,
        contentType: 'vocabulary',
        textsToCheck: ['word', 'translation', 'example with fuck'],
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(false);
    });
  });
});
