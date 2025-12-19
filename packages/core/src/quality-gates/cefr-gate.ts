import { QualityGate, QualityGateResult, GateInput, GateTier } from './types';
import { CEFRLevel } from '../domain/enums';

interface CEFRCriteria {
  maxWordLength: number;
  maxFrequencyRank: number;
  maxExplanationWords: number;
  maxExplanationSentences: number;
}

const CEFR_CRITERIA: Record<CEFRLevel, CEFRCriteria> = {
  [CEFRLevel.A0]: {
    maxWordLength: 8,
    maxFrequencyRank: 100,
    maxExplanationWords: 30,
    maxExplanationSentences: 2,
  },
  [CEFRLevel.A1]: {
    maxWordLength: 10,
    maxFrequencyRank: 1000,
    maxExplanationWords: 50,
    maxExplanationSentences: 3,
  },
  [CEFRLevel.A2]: {
    maxWordLength: 12,
    maxFrequencyRank: 3000,
    maxExplanationWords: 100,
    maxExplanationSentences: 5,
  },
  [CEFRLevel.B1]: {
    maxWordLength: 15,
    maxFrequencyRank: 5000,
    maxExplanationWords: 150,
    maxExplanationSentences: 8,
  },
  [CEFRLevel.B2]: {
    maxWordLength: 18,
    maxFrequencyRank: 8000,
    maxExplanationWords: 250,
    maxExplanationSentences: 12,
  },
  [CEFRLevel.C1]: {
    maxWordLength: 25,
    maxFrequencyRank: 15000,
    maxExplanationWords: 400,
    maxExplanationSentences: 20,
  },
  [CEFRLevel.C2]: {
    maxWordLength: 50,
    maxFrequencyRank: 50000,
    maxExplanationWords: 600,
    maxExplanationSentences: 30,
  },
};

const ADVANCED_GRAMMAR_CONCEPTS = [
  'subjunctive',
  'conditional perfect',
  'passive infinitive',
  'cleft sentence',
  'inversion',
];

const BASIC_LEVELS: CEFRLevel[] = [CEFRLevel.A0, CEFRLevel.A1, CEFRLevel.A2, CEFRLevel.B1];

export interface CEFRValidationInput extends GateInput {
  level: CEFRLevel;
  wordLength?: number;
  frequencyRank?: number;
  explanationText?: string;
  grammarTopic?: string;
}

export class CEFRConsistencyGate implements QualityGate {
  readonly name = 'cefr-consistency';
  readonly tier = GateTier.FAST;

  check(input: GateInput): Promise<QualityGateResult> {
    const cefrInput = input as CEFRValidationInput;
    const criteria = CEFR_CRITERIA[cefrInput.level];

    if (!criteria) {
      return Promise.resolve({
        passed: false,
        gateName: this.name,
        reason: `Invalid CEFR level: ${cefrInput.level}`,
      });
    }

    const issues: string[] = [];

    if (cefrInput.wordLength !== undefined) {
      if (cefrInput.wordLength > criteria.maxWordLength) {
        issues.push(
          `Word too long for ${cefrInput.level}: ${cefrInput.wordLength} chars (max ${criteria.maxWordLength})`
        );
      }
    }

    if (cefrInput.frequencyRank !== undefined) {
      if (cefrInput.frequencyRank > criteria.maxFrequencyRank) {
        issues.push(
          `Word too rare for ${cefrInput.level}: rank ${cefrInput.frequencyRank} (max ${criteria.maxFrequencyRank})`
        );
      }
    }

    if (cefrInput.explanationText) {
      const wordCount = cefrInput.explanationText.split(/\s+/).length;
      const sentenceCount = cefrInput.explanationText
        .split(/[.!?]+/)
        .filter((s) => s.trim().length > 0).length;

      if (wordCount > criteria.maxExplanationWords) {
        issues.push(
          `Explanation too long for ${cefrInput.level}: ${wordCount} words (max ${criteria.maxExplanationWords})`
        );
      }

      if (sentenceCount > criteria.maxExplanationSentences) {
        issues.push(
          `Explanation too complex for ${cefrInput.level}: ${sentenceCount} sentences (max ${criteria.maxExplanationSentences})`
        );
      }
    }

    if (cefrInput.grammarTopic && BASIC_LEVELS.includes(cefrInput.level)) {
      const topicLower = cefrInput.grammarTopic.toLowerCase();
      for (const concept of ADVANCED_GRAMMAR_CONCEPTS) {
        if (topicLower.includes(concept)) {
          issues.push(`Advanced grammar concept "${concept}" not suitable for ${cefrInput.level}`);
        }
      }
    }

    if (issues.length > 0) {
      return Promise.resolve({
        passed: false,
        gateName: this.name,
        reason: 'CEFR level consistency issues',
        details: { issues, level: cefrInput.level, criteria },
      });
    }

    return Promise.resolve({ passed: true, gateName: this.name });
  }
}

export function createCEFRConsistencyGate(): CEFRConsistencyGate {
  return new CEFRConsistencyGate();
}

export function getCEFRRank(level: CEFRLevel): number {
  const ranks: Record<CEFRLevel, number> = {
    [CEFRLevel.A0]: 0,
    [CEFRLevel.A1]: 1,
    [CEFRLevel.A2]: 2,
    [CEFRLevel.B1]: 3,
    [CEFRLevel.B2]: 4,
    [CEFRLevel.C1]: 5,
    [CEFRLevel.C2]: 6,
  };
  return ranks[level] ?? 999;
}

export function isLevelHigherThan(level: CEFRLevel, than: CEFRLevel): boolean {
  return getCEFRRank(level) > getCEFRRank(than);
}
