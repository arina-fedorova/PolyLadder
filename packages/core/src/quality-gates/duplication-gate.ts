import {
  QualityGate,
  QualityGateResult,
  GateInput,
  GateTier,
  DuplicationRepository,
} from './types';

const SIMILARITY_THRESHOLD = 0.85;

export class DuplicationGate implements QualityGate {
  readonly name = 'duplication-detection';
  readonly tier = GateTier.DATABASE;

  constructor(private readonly repository: DuplicationRepository) {}

  async check(input: GateInput): Promise<QualityGateResult> {
    const exactMatch = await this.repository.findExactMatch(
      input.text,
      input.language,
      input.contentType
    );

    if (exactMatch) {
      return {
        passed: false,
        gateName: this.name,
        reason: 'Exact duplicate found in approved content',
        details: { duplicateId: exactMatch },
      };
    }

    const similarMatches = await this.repository.findSimilar(
      input.text,
      input.language,
      input.contentType,
      SIMILARITY_THRESHOLD
    );

    if (similarMatches.length > 0) {
      const closest = similarMatches[0];
      return {
        passed: false,
        gateName: this.name,
        reason: `Similar content found (${Math.round(closest.similarity * 100)}% match)`,
        details: {
          similarTo: closest.id,
          similarity: closest.similarity,
          matchedText: closest.text,
        },
      };
    }

    return { passed: true, gateName: this.name };
  }
}

export function createDuplicationGate(repository: DuplicationRepository): DuplicationGate {
  return new DuplicationGate(repository);
}
