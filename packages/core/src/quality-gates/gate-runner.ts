import { QualityGate, QualityGateResult, GateInput, GateTier } from './types';

export interface GateRunnerResult {
  allPassed: boolean;
  results: QualityGateResult[];
  failedAt?: string;
  executionTimeMs: number;
}

export async function runGates(gates: QualityGate[], input: GateInput): Promise<GateRunnerResult> {
  const startTime = Date.now();
  const results: QualityGateResult[] = [];

  for (const gate of gates) {
    const result = await gate.check(input);
    results.push(result);

    if (!result.passed) {
      return {
        allPassed: false,
        results,
        failedAt: gate.name,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  return {
    allPassed: true,
    results,
    executionTimeMs: Date.now() - startTime,
  };
}

export async function runGatesByTier(
  gates: QualityGate[],
  input: GateInput
): Promise<GateRunnerResult> {
  const startTime = Date.now();
  const allResults: QualityGateResult[] = [];

  const tiers = groupByTier(gates);
  const sortedTiers = Array.from(tiers.keys()).sort((a, b) => a - b);

  for (const tier of sortedTiers) {
    const tierGates = tiers.get(tier) ?? [];

    const tierResults = await Promise.all(tierGates.map((gate) => gate.check(input)));

    allResults.push(...tierResults);

    const failedResults = tierResults.filter((r) => !r.passed);
    if (failedResults.length > 0) {
      return {
        allPassed: false,
        results: allResults,
        failedAt: failedResults[0].gateName,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  return {
    allPassed: true,
    results: allResults,
    executionTimeMs: Date.now() - startTime,
  };
}

function groupByTier(gates: QualityGate[]): Map<GateTier, QualityGate[]> {
  const map = new Map<GateTier, QualityGate[]>();

  for (const gate of gates) {
    const tier = gate.tier;
    const existing = map.get(tier) ?? [];
    existing.push(gate);
    map.set(tier, existing);
  }

  return map;
}

export function getFailedGates(results: QualityGateResult[]): QualityGateResult[] {
  return results.filter((r) => !r.passed);
}

export function getPassedGates(results: QualityGateResult[]): QualityGateResult[] {
  return results.filter((r) => r.passed);
}
