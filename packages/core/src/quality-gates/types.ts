export interface QualityGateResult {
  passed: boolean;
  gateName: string;
  reason?: string;
  details?: Record<string, unknown>;
  executionTimeMs?: number;
}

export interface GateInput {
  text: string;
  language: string;
  contentType: string;
  metadata?: Record<string, unknown>;
}

export interface QualityGate {
  readonly name: string;
  readonly tier: GateTier;
  check(input: GateInput): Promise<QualityGateResult>;
}

export enum GateTier {
  FAST = 1,
  DATABASE = 2,
  EXTERNAL = 3,
}

export interface DuplicationRepository {
  findExactMatch(text: string, language: string, contentType: string): Promise<string | null>;
  findSimilar(
    text: string,
    language: string,
    contentType: string,
    threshold: number
  ): Promise<Array<{ id: string; text: string; similarity: number }>>;
}
