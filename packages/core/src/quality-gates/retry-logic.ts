import { QualityGate, QualityGateResult, GateInput } from './types';
import { FailureRecorderRepository, recordValidationRun } from './failure-recorder';
import { runGates } from './gate-runner';

const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [0, 2000, 5000];

const NON_RETRYABLE_GATES = new Set([
  'schema-validation',
  'content-safety',
  'duplication-detection',
  'orthography-consistency',
]);

export interface RetryConfig {
  maxAttempts: number;
  delaysMs: number[];
  nonRetryableGates: Set<string>;
}

export interface ValidationWithRetryResult {
  success: boolean;
  attemptNumber: number;
  failedGates: string[];
  results: QualityGateResult[];
  canRetry: boolean;
}

export function getDefaultRetryConfig(): RetryConfig {
  return {
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    delaysMs: [...RETRY_DELAYS_MS],
    nonRetryableGates: new Set(NON_RETRYABLE_GATES),
  };
}

export function isRetryableFailure(results: QualityGateResult[], config: RetryConfig): boolean {
  const failedGates = results.filter((r) => !r.passed);

  const hasNonRetryable = failedGates.some((gate) => config.nonRetryableGates.has(gate.gateName));

  return !hasNonRetryable;
}

export async function validateWithRetry(
  gates: QualityGate[],
  input: GateInput,
  entityType: string,
  entityId: string,
  repository: FailureRecorderRepository,
  config: RetryConfig = getDefaultRetryConfig()
): Promise<ValidationWithRetryResult> {
  let currentAttempt = await repository.getLatestAttemptNumber(entityType, entityId);

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    currentAttempt = attempt;

    if (attempt > 1) {
      const delay = config.delaysMs[attempt - 1] ?? config.delaysMs[config.delaysMs.length - 1];
      await sleep(delay);
    }

    const { allPassed, results } = await runGates(gates, input);

    await recordValidationRun(repository, entityType, entityId, results, attempt);

    if (allPassed) {
      return {
        success: true,
        attemptNumber: attempt,
        failedGates: [],
        results,
        canRetry: false,
      };
    }

    if (attempt === config.maxAttempts) {
      const failedGates = results.filter((r) => !r.passed).map((r) => r.gateName);
      return {
        success: false,
        attemptNumber: attempt,
        failedGates,
        results,
        canRetry: false,
      };
    }

    if (!isRetryableFailure(results, config)) {
      const failedGates = results.filter((r) => !r.passed).map((r) => r.gateName);
      return {
        success: false,
        attemptNumber: attempt,
        failedGates,
        results,
        canRetry: false,
      };
    }
  }

  return {
    success: false,
    attemptNumber: currentAttempt,
    failedGates: [],
    results: [],
    canRetry: false,
  };
}

export async function manualRetry(
  gates: QualityGate[],
  input: GateInput,
  entityType: string,
  entityId: string,
  repository: FailureRecorderRepository,
  config: RetryConfig = getDefaultRetryConfig()
): Promise<ValidationWithRetryResult> {
  const latestAttempt = await repository.getLatestAttemptNumber(entityType, entityId);

  if (latestAttempt >= config.maxAttempts) {
    throw new MaxRetriesReachedError(entityType, entityId, config.maxAttempts);
  }

  const nextAttempt = latestAttempt + 1;
  const { allPassed, results } = await runGates(gates, input);

  await recordValidationRun(repository, entityType, entityId, results, nextAttempt);

  const failedGates = results.filter((r) => !r.passed).map((r) => r.gateName);

  return {
    success: allPassed,
    attemptNumber: nextAttempt,
    failedGates: allPassed ? [] : failedGates,
    results,
    canRetry: nextAttempt < config.maxAttempts && !allPassed,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MaxRetriesReachedError extends Error {
  constructor(
    public readonly entityType: string,
    public readonly entityId: string,
    public readonly maxAttempts: number
  ) {
    super(`Maximum retry attempts (${maxAttempts}) reached for ${entityType}:${entityId}`);
    this.name = 'MaxRetriesReachedError';
  }
}
