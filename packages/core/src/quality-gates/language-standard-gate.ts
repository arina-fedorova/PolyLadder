import { QualityGate, QualityGateResult, GateInput, GateTier } from './types';
import { Language } from '../domain/enums';

interface LanguageStandard {
  variant: string;
  patterns: Array<{
    regex: RegExp;
    violation: string;
  }>;
}

const LANGUAGE_STANDARDS: Partial<Record<Language, LanguageStandard>> = {
  [Language.EN]: {
    variant: 'US English',
    patterns: [
      { regex: /\b(colour|favour|honour|behaviour|neighbour)\b/i, violation: 'British spelling' },
      { regex: /\b(realise|organise|recognise)\b/i, violation: 'British -ise spelling' },
      { regex: /\b(centre|theatre|metre)\b/i, violation: 'British -re spelling' },
      { regex: /\b(grey)\b/i, violation: 'British spelling (use "gray")' },
    ],
  },
  [Language.PT]: {
    variant: 'European Portuguese',
    patterns: [
      { regex: /\bvc\b/i, violation: 'Brazilian abbreviation' },
      { regex: /\btá\b/i, violation: 'Brazilian informal' },
      { regex: /\bpra\b/i, violation: 'Brazilian contraction (use "para")' },
      { regex: /\bônibus\b/i, violation: 'Brazilian spelling (use "autocarro")' },
    ],
  },
  [Language.ES]: {
    variant: 'Castilian Spanish',
    patterns: [{ regex: /\bustedes\b.*\b(tienen|hacen|van)\b/i, violation: 'Latin American form' }],
  },
  [Language.IT]: {
    variant: 'Standard Italian',
    patterns: [],
  },
  [Language.SL]: {
    variant: 'Standard Slovenian',
    patterns: [],
  },
};

export class LanguageStandardGate implements QualityGate {
  readonly name = 'language-standard';
  readonly tier = GateTier.FAST;

  check(input: GateInput): Promise<QualityGateResult> {
    const standard = LANGUAGE_STANDARDS[input.language as Language];

    if (!standard) {
      return Promise.resolve({
        passed: true,
        gateName: this.name,
        details: { note: `No standard defined for language: ${input.language}` },
      });
    }

    const violations: string[] = [];

    for (const pattern of standard.patterns) {
      if (pattern.regex.test(input.text)) {
        violations.push(pattern.violation);
      }
    }

    if (violations.length > 0) {
      return Promise.resolve({
        passed: false,
        gateName: this.name,
        reason: `${standard.variant} violations detected`,
        details: { violations, expectedVariant: standard.variant },
      });
    }

    return Promise.resolve({ passed: true, gateName: this.name });
  }
}

export function createLanguageStandardGate(): LanguageStandardGate {
  return new LanguageStandardGate();
}
