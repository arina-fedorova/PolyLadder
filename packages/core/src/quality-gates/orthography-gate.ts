import { QualityGate, QualityGateResult, GateInput, GateTier } from './types';
import { Language } from '../domain/enums';

const VALID_ALPHABETS: Partial<Record<Language, RegExp>> = {
  [Language.EN]: /^[A-Za-z0-9\s.,!?;:'"()\-–—…]+$/,
  [Language.ES]: /^[A-Za-zÁÉÍÓÚÑáéíóúñ¿¡0-9\s.,!?;:'"()\-–—…]+$/,
  [Language.IT]: /^[A-Za-zÀÈÉÌÒÙàèéìòù0-9\s.,!?;:'"()\-–—…]+$/,
  [Language.PT]: /^[A-Za-zÁÂÃÀÇÉÊÍÓÔÕÚáâãàçéêíóôõú0-9\s.,!?;:'"()\-–—…]+$/,
  [Language.SL]: /^[A-Za-zČŠŽčšž0-9\s.,!?;:'"()\-–—…]+$/,
};

const INVALID_CHAR_PATTERNS: Partial<Record<Language, Array<{ regex: RegExp; issue: string }>>> = {
  [Language.EN]: [
    { regex: /[áéíóúñ]/i, issue: 'Spanish/Portuguese characters in English text' },
    { regex: /[àèìòù]/i, issue: 'Italian characters in English text' },
    { regex: /[äöü]/i, issue: 'German characters in English text' },
    { regex: /[ç]/i, issue: 'French/Portuguese ç in English text' },
  ],
  [Language.ES]: [
    { regex: /[àèìòù]/i, issue: 'Italian characters in Spanish text (use á é í ó ú)' },
  ],
  [Language.IT]: [{ regex: /[áíóúñ]/i, issue: 'Spanish characters in Italian text' }],
  [Language.PT]: [{ regex: /[ñ]/i, issue: 'Spanish ñ in Portuguese text (use nh)' }],
  [Language.SL]: [{ regex: /[áéíóúñàèìòùç]/i, issue: 'Non-Slovenian diacritics (use č š ž)' }],
};

export class OrthographyGate implements QualityGate {
  readonly name = 'orthography-consistency';
  readonly tier = GateTier.FAST;

  check(input: GateInput): Promise<QualityGateResult> {
    const validPattern = VALID_ALPHABETS[input.language as Language];
    const invalidPatterns = INVALID_CHAR_PATTERNS[input.language as Language];

    if (!validPattern) {
      return Promise.resolve({
        passed: true,
        gateName: this.name,
        details: { note: `No orthography rules defined for language: ${input.language}` },
      });
    }

    const issues: string[] = [];

    if (!validPattern.test(input.text)) {
      const invalidChars = this.findInvalidCharacters(input.text, validPattern);
      issues.push(`Invalid characters: ${invalidChars.join(', ')}`);
    }

    if (invalidPatterns) {
      for (const pattern of invalidPatterns) {
        if (pattern.regex.test(input.text)) {
          issues.push(pattern.issue);
        }
      }
    }

    if (issues.length > 0) {
      return Promise.resolve({
        passed: false,
        gateName: this.name,
        reason: 'Orthography consistency issues detected',
        details: { issues, language: input.language },
      });
    }

    return Promise.resolve({ passed: true, gateName: this.name });
  }

  private findInvalidCharacters(text: string, validPattern: RegExp): string[] {
    const invalid: Set<string> = new Set();

    for (const char of text) {
      if (!validPattern.test(char) && char.trim() !== '') {
        invalid.add(char);
      }
    }

    return Array.from(invalid);
  }
}

export function createOrthographyGate(): OrthographyGate {
  return new OrthographyGate();
}
