import { QualityGateResult } from './types';

export interface GateResultRecord {
  id: string;
  entityType: string;
  entityId: string;
  gateName: string;
  status: 'passed' | 'failed';
  errorMessage?: string;
  metadata: Record<string, unknown>;
  attemptNumber: number;
  executionTimeMs?: number;
  createdAt: Date;
}

export interface RecordResultParams {
  entityType: string;
  entityId: string;
  gateName: string;
  status: 'passed' | 'failed';
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  attemptNumber: number;
  executionTimeMs?: number;
}

export interface FailureRecorderRepository {
  recordResult(params: RecordResultParams): Promise<void>;
  getLatestAttemptNumber(entityType: string, entityId: string): Promise<number>;
  getFailureCount(entityType: string, entityId: string): Promise<number>;
  getEntityFailures(entityType: string, entityId: string): Promise<GateResultRecord[]>;
  hasFailedOnLatestAttempt(entityType: string, entityId: string): Promise<boolean>;
  clearOldResults(daysToKeep: number): Promise<number>;
}

export async function recordValidationRun(
  repository: FailureRecorderRepository,
  entityType: string,
  entityId: string,
  results: QualityGateResult[],
  attemptNumber: number
): Promise<void> {
  const recordPromises = results.map((result) =>
    repository.recordResult({
      entityType,
      entityId,
      gateName: result.gateName,
      status: result.passed ? 'passed' : 'failed',
      errorMessage: result.reason,
      metadata: result.details ?? {},
      attemptNumber,
      executionTimeMs: result.executionTimeMs,
    })
  );

  await Promise.all(recordPromises);
}

export async function getValidationStatus(
  repository: FailureRecorderRepository,
  entityType: string,
  entityId: string
): Promise<{
  status: 'not_validated' | 'passed' | 'failed';
  attemptNumber: number;
  canRetry: boolean;
  failures: GateResultRecord[];
}> {
  const attemptNumber = await repository.getLatestAttemptNumber(entityType, entityId);

  if (attemptNumber === 0) {
    return {
      status: 'not_validated',
      attemptNumber: 0,
      canRetry: false,
      failures: [],
    };
  }

  const hasFailed = await repository.hasFailedOnLatestAttempt(entityType, entityId);
  const failures = hasFailed ? await repository.getEntityFailures(entityType, entityId) : [];

  return {
    status: hasFailed ? 'failed' : 'passed',
    attemptNumber,
    canRetry: attemptNumber < 3 && hasFailed,
    failures,
  };
}

export class FailureRecordingError extends Error {
  constructor(
    message: string,
    public readonly entityType: string,
    public readonly entityId: string
  ) {
    super(message);
    this.name = 'FailureRecordingError';
  }
}
