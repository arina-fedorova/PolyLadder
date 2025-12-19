import { QualityGate, QualityGateResult, GateInput, GateTier } from './types';

type SafetyCategory = 'profanity' | 'violence' | 'inappropriate' | 'hate';

interface SafetyPattern {
  pattern: RegExp;
  category: SafetyCategory;
  description: string;
}

const SAFETY_PATTERNS: SafetyPattern[] = [
  // Profanity patterns (English)
  { pattern: /\bf+u+c+k+/i, category: 'profanity', description: 'Profane language' },
  { pattern: /\bs+h+i+t+\b/i, category: 'profanity', description: 'Profane language' },
  { pattern: /\bb+i+t+c+h+/i, category: 'profanity', description: 'Profane language' },
  { pattern: /\ba+s+s+h+o+l+e+/i, category: 'profanity', description: 'Profane language' },
  { pattern: /\bc+u+n+t+\b/i, category: 'profanity', description: 'Profane language' },

  // Violence patterns
  {
    pattern: /\b(kill|murder|stab|shoot)\s+(someone|people|person|him|her|them)\b/i,
    category: 'violence',
    description: 'Violent content',
  },
  {
    pattern: /\b(torture|mutilate|dismember)\b/i,
    category: 'violence',
    description: 'Graphic violence',
  },
  { pattern: /\b(rape|assault)\b/i, category: 'violence', description: 'Violent content' },

  // Inappropriate content
  {
    pattern: /\b(pornographic|explicit\s+sexual)\b/i,
    category: 'inappropriate',
    description: 'Adult content',
  },
  {
    pattern: /\b(drug\s+abuse|substance\s+abuse)\b/i,
    category: 'inappropriate',
    description: 'Drug content',
  },

  // Hate speech
  { pattern: /\b(racial\s+slur|hate\s+speech)\b/i, category: 'hate', description: 'Hate speech' },
  { pattern: /\b(nazi|white\s+supremac)/i, category: 'hate', description: 'Extremist content' },
];

const WHITELIST_WORDS = new Set([
  'assassinate',
  'assassin',
  'bass',
  'class',
  'grass',
  'pass',
  'mass',
  'assume',
  'assist',
  'asset',
  'passion',
  'compass',
  'embarrass',
  'harassment',
  'scunthorpe',
]);

export interface ContentSafetyInput extends GateInput {
  textsToCheck: string[];
}

interface SafetyViolation {
  category: SafetyCategory;
  description: string;
  matchedText: string;
}

export class ContentSafetyGate implements QualityGate {
  readonly name = 'content-safety';
  readonly tier = GateTier.FAST;

  check(input: GateInput): Promise<QualityGateResult> {
    const safetyInput = input as ContentSafetyInput;
    const textsToCheck = safetyInput.textsToCheck ?? [safetyInput.text];

    const allText = textsToCheck.filter(Boolean).join(' ');
    const violations = this.checkTextSafety(allText);

    if (violations.length > 0) {
      return Promise.resolve({
        passed: false,
        gateName: this.name,
        reason: `Content safety violations: ${violations.map((v) => v.category).join(', ')}`,
        details: {
          violations: violations.map((v) => ({
            category: v.category,
            description: v.description,
          })),
        },
      });
    }

    return Promise.resolve({ passed: true, gateName: this.name });
  }

  private checkTextSafety(text: string): SafetyViolation[] {
    const violations: SafetyViolation[] = [];
    const words = text.toLowerCase().split(/\s+/);

    const hasWhitelistedWord = words.some((word) => WHITELIST_WORDS.has(word));

    for (const { pattern, category, description } of SAFETY_PATTERNS) {
      const match = pattern.exec(text);
      if (match) {
        const matchedText = match[0].toLowerCase();

        if (hasWhitelistedWord && this.isPartOfWhitelistedWord(matchedText, text.toLowerCase())) {
          continue;
        }

        violations.push({ category, description, matchedText });
      }
    }

    return violations;
  }

  private isPartOfWhitelistedWord(matched: string, fullText: string): boolean {
    for (const word of WHITELIST_WORDS) {
      if (word.includes(matched) && fullText.includes(word)) {
        return true;
      }
    }
    return false;
  }
}

export function createContentSafetyGate(): ContentSafetyGate {
  return new ContentSafetyGate();
}
