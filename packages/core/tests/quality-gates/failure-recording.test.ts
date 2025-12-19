/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FailureRecorderRepository,
  GateResultRecord,
  recordValidationRun,
  getValidationStatus,
  QualityGateResult,
  getDefaultRetryConfig,
  isRetryableFailure,
  validateWithRetry,
  manualRetry,
  MaxRetriesReachedError,
  QualityGate,
  GateInput,
  GateTier,
} from '../../src/quality-gates';
import { Language } from '../../src/domain/enums';

describe('Failure Recording', () => {
  let mockRepo: FailureRecorderRepository;

  beforeEach(() => {
    mockRepo = {
      recordResult: vi.fn().mockResolvedValue(undefined),
      getLatestAttemptNumber: vi.fn().mockResolvedValue(0),
      getFailureCount: vi.fn().mockResolvedValue(0),
      getEntityFailures: vi.fn().mockResolvedValue([]),
      hasFailedOnLatestAttempt: vi.fn().mockResolvedValue(false),
      clearOldResults: vi.fn().mockResolvedValue(0),
    };
  });

  describe('recordValidationRun', () => {
    it('should record all gate results', async () => {
      const results: QualityGateResult[] = [
        { passed: true, gateName: 'gate-1' },
        { passed: false, gateName: 'gate-2', reason: 'Failed check' },
      ];

      await recordValidationRun(mockRepo, 'meaning', 'entity-123', results, 1);

      expect(mockRepo.recordResult).toHaveBeenCalledTimes(2);
      expect(mockRepo.recordResult).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'meaning',
          entityId: 'entity-123',
          gateName: 'gate-1',
          status: 'passed',
          attemptNumber: 1,
        })
      );
      expect(mockRepo.recordResult).toHaveBeenCalledWith(
        expect.objectContaining({
          gateName: 'gate-2',
          status: 'failed',
          errorMessage: 'Failed check',
        })
      );
    });
  });

  describe('getValidationStatus', () => {
    it('should return not_validated when no attempts', async () => {
      mockRepo.getLatestAttemptNumber = vi.fn().mockResolvedValue(0);

      const status = await getValidationStatus(mockRepo, 'meaning', 'entity-123');

      expect(status.status).toBe('not_validated');
      expect(status.attemptNumber).toBe(0);
      expect(status.canRetry).toBe(false);
    });

    it('should return passed when latest attempt passed', async () => {
      mockRepo.getLatestAttemptNumber = vi.fn().mockResolvedValue(1);
      mockRepo.hasFailedOnLatestAttempt = vi.fn().mockResolvedValue(false);

      const status = await getValidationStatus(mockRepo, 'meaning', 'entity-123');

      expect(status.status).toBe('passed');
      expect(status.attemptNumber).toBe(1);
      expect(status.canRetry).toBe(false);
    });

    it('should return failed with canRetry when attempts < 3', async () => {
      mockRepo.getLatestAttemptNumber = vi.fn().mockResolvedValue(2);
      mockRepo.hasFailedOnLatestAttempt = vi.fn().mockResolvedValue(true);
      mockRepo.getEntityFailures = vi
        .fn()
        .mockResolvedValue([{ gateName: 'gate-1', status: 'failed' } as GateResultRecord]);

      const status = await getValidationStatus(mockRepo, 'meaning', 'entity-123');

      expect(status.status).toBe('failed');
      expect(status.attemptNumber).toBe(2);
      expect(status.canRetry).toBe(true);
      expect(status.failures).toHaveLength(1);
    });

    it('should return failed without canRetry when attempts >= 3', async () => {
      mockRepo.getLatestAttemptNumber = vi.fn().mockResolvedValue(3);
      mockRepo.hasFailedOnLatestAttempt = vi.fn().mockResolvedValue(true);

      const status = await getValidationStatus(mockRepo, 'meaning', 'entity-123');

      expect(status.status).toBe('failed');
      expect(status.canRetry).toBe(false);
    });
  });

  describe('getDefaultRetryConfig', () => {
    it('should return default config', () => {
      const config = getDefaultRetryConfig();

      expect(config.maxAttempts).toBe(3);
      expect(config.delaysMs).toEqual([0, 2000, 5000]);
      expect(config.nonRetryableGates.has('content-safety')).toBe(true);
      expect(config.nonRetryableGates.has('schema-validation')).toBe(true);
    });
  });

  describe('isRetryableFailure', () => {
    const config = getDefaultRetryConfig();

    it('should return true for retryable gates', () => {
      const results: QualityGateResult[] = [
        { passed: false, gateName: 'cefr-consistency', reason: 'Word too long' },
        { passed: false, gateName: 'prerequisite-validation', reason: 'Missing prereq' },
      ];

      expect(isRetryableFailure(results, config)).toBe(true);
    });

    it('should return false for non-retryable gates', () => {
      const results: QualityGateResult[] = [
        { passed: false, gateName: 'content-safety', reason: 'Profanity detected' },
      ];

      expect(isRetryableFailure(results, config)).toBe(false);
    });

    it('should return false if any gate is non-retryable', () => {
      const results: QualityGateResult[] = [
        { passed: false, gateName: 'cefr-consistency', reason: 'Word too long' },
        { passed: false, gateName: 'duplication-detection', reason: 'Duplicate found' },
      ];

      expect(isRetryableFailure(results, config)).toBe(false);
    });
  });
});

describe('Retry Logic', () => {
  let mockRepo: FailureRecorderRepository;
  let passingGate: QualityGate;
  let failingGate: QualityGate;
  let nonRetryableFailingGate: QualityGate;

  beforeEach(() => {
    mockRepo = {
      recordResult: vi.fn().mockResolvedValue(undefined),
      getLatestAttemptNumber: vi.fn().mockResolvedValue(0),
      getFailureCount: vi.fn().mockResolvedValue(0),
      getEntityFailures: vi.fn().mockResolvedValue([]),
      hasFailedOnLatestAttempt: vi.fn().mockResolvedValue(false),
      clearOldResults: vi.fn().mockResolvedValue(0),
    };

    passingGate = {
      name: 'passing-gate',
      tier: GateTier.FAST,
      check: vi.fn().mockResolvedValue({ passed: true, gateName: 'passing-gate' }),
    };

    failingGate = {
      name: 'failing-gate',
      tier: GateTier.FAST,
      check: vi.fn().mockResolvedValue({
        passed: false,
        gateName: 'failing-gate',
        reason: 'Test failure',
      }),
    };

    nonRetryableFailingGate = {
      name: 'content-safety',
      tier: GateTier.FAST,
      check: vi.fn().mockResolvedValue({
        passed: false,
        gateName: 'content-safety',
        reason: 'Profanity',
      }),
    };
  });

  const input: GateInput = {
    text: 'test',
    language: Language.EN,
    contentType: 'meaning',
  };

  describe('validateWithRetry', () => {
    it('should pass on first attempt when all gates pass', async () => {
      const result = await validateWithRetry(
        [passingGate],
        input,
        'meaning',
        'entity-123',
        mockRepo,
        { maxAttempts: 3, delaysMs: [0, 0, 0], nonRetryableGates: new Set() }
      );

      expect(result.success).toBe(true);
      expect(result.attemptNumber).toBe(1);
      expect(result.failedGates).toHaveLength(0);
      expect(mockRepo.recordResult).toHaveBeenCalledTimes(1);
    });

    it('should stop retrying on non-retryable failure', async () => {
      const result = await validateWithRetry(
        [nonRetryableFailingGate],
        input,
        'meaning',
        'entity-123',
        mockRepo,
        getDefaultRetryConfig()
      );

      expect(result.success).toBe(false);
      expect(result.attemptNumber).toBe(1);
      expect(result.failedGates).toContain('content-safety');
      expect(result.canRetry).toBe(false);
      expect(mockRepo.recordResult).toHaveBeenCalledTimes(1);
    });

    it('should retry up to max attempts for retryable failures', async () => {
      const result = await validateWithRetry(
        [failingGate],
        input,
        'meaning',
        'entity-123',
        mockRepo,
        { maxAttempts: 3, delaysMs: [0, 0, 0], nonRetryableGates: new Set() }
      );

      expect(result.success).toBe(false);
      expect(result.attemptNumber).toBe(3);
      expect(result.canRetry).toBe(false);
      expect(mockRepo.recordResult).toHaveBeenCalledTimes(3);
    });
  });

  describe('manualRetry', () => {
    it('should throw when max retries reached', async () => {
      mockRepo.getLatestAttemptNumber = vi.fn().mockResolvedValue(3);

      await expect(
        manualRetry([passingGate], input, 'meaning', 'entity-123', mockRepo)
      ).rejects.toThrow(MaxRetriesReachedError);
    });

    it('should run validation and record results', async () => {
      mockRepo.getLatestAttemptNumber = vi.fn().mockResolvedValue(1);

      const result = await manualRetry([passingGate], input, 'meaning', 'entity-123', mockRepo);

      expect(result.success).toBe(true);
      expect(result.attemptNumber).toBe(2);
      expect(mockRepo.recordResult).toHaveBeenCalled();
    });

    it('should indicate canRetry when failed and attempts remain', async () => {
      mockRepo.getLatestAttemptNumber = vi.fn().mockResolvedValue(1);

      const result = await manualRetry([failingGate], input, 'meaning', 'entity-123', mockRepo);

      expect(result.success).toBe(false);
      expect(result.attemptNumber).toBe(2);
      expect(result.canRetry).toBe(true);
    });
  });
});
