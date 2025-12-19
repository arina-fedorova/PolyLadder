import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LanguageStandardGate,
  OrthographyGate,
  DuplicationGate,
  runGates,
  runGatesByTier,
  GateInput,
  DuplicationRepository,
  GateTier,
} from '../../src/quality-gates';
import { Language } from '../../src/domain/enums';

describe('Quality Gates', () => {
  describe('LanguageStandardGate', () => {
    const gate = new LanguageStandardGate();

    it('should pass valid US English text', async () => {
      const input: GateInput = {
        text: 'The color of the car is gray.',
        language: Language.EN,
        contentType: 'utterance',
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(true);
      expect(result.gateName).toBe('language-standard');
    });

    it('should fail British spellings in English', async () => {
      const input: GateInput = {
        text: 'The colour of the car is grey.',
        language: Language.EN,
        contentType: 'utterance',
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('violations');
      expect(result.details?.violations).toContain('British spelling');
    });

    it('should fail Brazilian Portuguese indicators', async () => {
      const input: GateInput = {
        text: 'Vc está bem?',
        language: Language.PT,
        contentType: 'utterance',
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(false);
      expect(result.details?.violations).toContain('Brazilian abbreviation');
    });

    it('should pass valid European Portuguese', async () => {
      const input: GateInput = {
        text: 'Você está bem?',
        language: Language.PT,
        contentType: 'utterance',
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(true);
    });

    it('should pass unknown languages', async () => {
      const input: GateInput = {
        text: 'Some text',
        language: 'XX' as Language,
        contentType: 'utterance',
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(true);
    });
  });

  describe('OrthographyGate', () => {
    const gate = new OrthographyGate();

    it('should pass valid English text', async () => {
      const input: GateInput = {
        text: 'Hello, world! How are you?',
        language: Language.EN,
        contentType: 'utterance',
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(true);
    });

    it('should fail English text with Spanish characters', async () => {
      const input: GateInput = {
        text: 'Hello señor!',
        language: Language.EN,
        contentType: 'utterance',
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Orthography');
    });

    it('should pass valid Spanish text with accents', async () => {
      const input: GateInput = {
        text: '¡Hola! ¿Cómo estás?',
        language: Language.ES,
        contentType: 'utterance',
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(true);
    });

    it('should pass valid Italian text', async () => {
      const input: GateInput = {
        text: 'Ciao, come stai? È bello vederti.',
        language: Language.IT,
        contentType: 'utterance',
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(true);
    });

    it('should pass valid Slovenian text', async () => {
      const input: GateInput = {
        text: 'Živijo! Kako si? Čudovito!',
        language: Language.SL,
        contentType: 'utterance',
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(true);
    });

    it('should fail Slovenian with wrong diacritics', async () => {
      const input: GateInput = {
        text: 'Hola señor',
        language: Language.SL,
        contentType: 'utterance',
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(false);
    });
  });

  describe('DuplicationGate', () => {
    let mockRepo: DuplicationRepository;
    let gate: DuplicationGate;

    beforeEach(() => {
      mockRepo = {
        findExactMatch: vi.fn().mockResolvedValue(null),
        findSimilar: vi.fn().mockResolvedValue([]),
      };
      gate = new DuplicationGate(mockRepo);
    });

    it('should pass when no duplicates found', async () => {
      const input: GateInput = {
        text: 'Unique text here',
        language: Language.EN,
        contentType: 'utterance',
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(true);
    });

    it('should fail on exact duplicate', async () => {
      mockRepo.findExactMatch = vi.fn().mockResolvedValue('existing-id-123');

      const input: GateInput = {
        text: 'Duplicate text',
        language: Language.EN,
        contentType: 'utterance',
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Exact duplicate');
      expect(result.details?.duplicateId).toBe('existing-id-123');
    });

    it('should fail on similar content', async () => {
      mockRepo.findSimilar = vi
        .fn()
        .mockResolvedValue([{ id: 'similar-id', text: 'Very similar text', similarity: 0.92 }]);

      const input: GateInput = {
        text: 'Very similiar text',
        language: Language.EN,
        contentType: 'utterance',
      };

      const result = await gate.check(input);

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('92%');
      expect(result.details?.similarTo).toBe('similar-id');
    });
  });

  describe('Gate Runner', () => {
    it('should run all gates and pass when all pass', async () => {
      const gate1 = new LanguageStandardGate();
      const gate2 = new OrthographyGate();

      const input: GateInput = {
        text: 'Hello world',
        language: Language.EN,
        contentType: 'utterance',
      };

      const result = await runGates([gate1, gate2], input);

      expect(result.allPassed).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should fail fast on first failure', async () => {
      const gate1 = new LanguageStandardGate();
      const gate2 = new OrthographyGate();

      const input: GateInput = {
        text: 'The colour is grey',
        language: Language.EN,
        contentType: 'utterance',
      };

      const result = await runGates([gate1, gate2], input);

      expect(result.allPassed).toBe(false);
      expect(result.failedAt).toBe('language-standard');
      expect(result.results).toHaveLength(1);
    });

    it('should run gates by tier', async () => {
      const gate1 = new LanguageStandardGate();
      const gate2 = new OrthographyGate();

      expect(gate1.tier).toBe(GateTier.FAST);
      expect(gate2.tier).toBe(GateTier.FAST);

      const input: GateInput = {
        text: 'Hello world',
        language: Language.EN,
        contentType: 'utterance',
      };

      const result = await runGatesByTier([gate1, gate2], input);

      expect(result.allPassed).toBe(true);
      expect(result.results).toHaveLength(2);
    });
  });
});
