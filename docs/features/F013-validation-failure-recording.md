# F013: Validation Failure Recording & Reporting

**Feature Code**: F013
**Created**: 2025-12-17
**Phase**: 3 - Quality Assurance System
**Status**: ✅ Completed
**Completed**: 2025-12-19
**PR**: #16

---

## Description

When quality gates fail during content validation, the system must record detailed failure information for operator review and system improvement. This feature implements comprehensive failure tracking, retry mechanisms for transient errors, trend analysis to identify systematic issues, and operator dashboards showing failure patterns. All validation failures are logged with gate name, error message, stack traces, and metadata for debugging.

## Success Criteria

- [x] All validation failures stored in database with full context
- [x] Failures include gate name, error reason, timestamp, and retry count
- [x] Retry mechanism for transient failures (max 3 attempts with exponential backoff)
- [ ] Failure trends analysis showing patterns by gate type and content type (→ F027)
- [ ] Operator UI displays failures with filtering and search (→ F027)
- [x] Automatic retry stops after max attempts to prevent infinite loops
- [x] Failed items blocked from promotion to APPROVED state

---

## Tasks

### Task 1: Validation Failures Database Schema

**File**: `packages/db/migrations/013-quality-gate-results.sql`

Create table to store quality gate validation results.

**Implementation Plan**:

```sql
-- Table to store all quality gate validation results (both pass and fail)
CREATE TABLE quality_gate_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('vocabulary', 'grammar', 'orthography', 'curriculum')),
  entity_id UUID NOT NULL,
  gate_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('passed', 'failed')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  attempt_number INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Indexes
  CONSTRAINT valid_attempt_number CHECK (attempt_number >= 1 AND attempt_number <= 3)
);

-- Indexes for fast lookups
CREATE INDEX idx_quality_gate_results_entity
  ON quality_gate_results(entity_type, entity_id);

CREATE INDEX idx_quality_gate_results_gate
  ON quality_gate_results(gate_name);

CREATE INDEX idx_quality_gate_results_status
  ON quality_gate_results(status);

CREATE INDEX idx_quality_gate_results_created_at
  ON quality_gate_results(created_at DESC);

-- Composite index for operator failure queries
CREATE INDEX idx_quality_gate_results_status_gate_created
  ON quality_gate_results(status, gate_name, created_at DESC)
  WHERE status = 'failed';

-- Prevent duplicate results for same entity/gate/attempt
CREATE UNIQUE INDEX idx_quality_gate_unique_attempt
  ON quality_gate_results(entity_type, entity_id, gate_name, attempt_number);

-- View for easy failure querying
CREATE VIEW validation_failures AS
SELECT
  qgr.id,
  qgr.entity_type,
  qgr.entity_id,
  qgr.gate_name,
  qgr.error_message,
  qgr.metadata,
  qgr.attempt_number,
  qgr.created_at,
  CASE qgr.entity_type
    WHEN 'vocabulary' THEN cv.word_text
    WHEN 'grammar' THEN cg.topic
    WHEN 'orthography' THEN co.character
    WHEN 'curriculum' THEN cc.lesson_name
  END as item_name
FROM quality_gate_results qgr
LEFT JOIN candidate_vocabulary cv ON qgr.entity_type = 'vocabulary' AND qgr.entity_id = cv.id
LEFT JOIN candidate_grammar_lessons cg ON qgr.entity_type = 'grammar' AND qgr.entity_id = cg.id
LEFT JOIN candidate_orthography co ON qgr.entity_type = 'orthography' AND qgr.entity_id = co.id
LEFT JOIN candidate_curriculum_lessons cc ON qgr.entity_type = 'curriculum' AND qgr.entity_id = cc.id
WHERE qgr.status = 'failed';
```

**Dependencies**: PostgreSQL database (F001)

---

### Task 2: Failure Recording Service

**File**: `packages/api/src/services/quality-gates/failure-recorder.service.ts`

Create service to record validation results in database.

**Implementation Plan**:

```typescript
import { Pool } from 'pg';
import { QualityGateResult } from './quality-gate.interface';

export interface RecordFailureOptions {
  entityType: string;
  entityId: string;
  gateName: string;
  status: 'passed' | 'failed';
  errorMessage?: string;
  metadata?: Record<string, any>;
  attemptNumber: number;
}

export class FailureRecorderService {
  constructor(private readonly pool: Pool) {}

  /**
   * Record a quality gate result (pass or fail) to database
   */
  async recordResult(options: RecordFailureOptions): Promise<void> {
    const { entityType, entityId, gateName, status, errorMessage, metadata, attemptNumber } =
      options;

    try {
      await this.pool.query(
        `INSERT INTO quality_gate_results
         (entity_type, entity_id, gate_name, status, error_message, metadata, attempt_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (entity_type, entity_id, gate_name, attempt_number)
         DO UPDATE SET
           status = EXCLUDED.status,
           error_message = EXCLUDED.error_message,
           metadata = EXCLUDED.metadata,
           created_at = NOW()`,
        [
          entityType,
          entityId,
          gateName,
          status,
          errorMessage || null,
          JSON.stringify(metadata || {}),
          attemptNumber,
        ]
      );
    } catch (error) {
      console.error('Failed to record quality gate result:', error);
      // Don't throw - failure recording shouldn't break validation pipeline
    }
  }

  /**
   * Record multiple gate results from a validation run
   */
  async recordValidationRun(
    entityType: string,
    entityId: string,
    results: QualityGateResult[],
    attemptNumber: number
  ): Promise<void> {
    const recordPromises = results.map((result) =>
      this.recordResult({
        entityType,
        entityId,
        gateName: result.gateName,
        status: result.passed ? 'passed' : 'failed',
        errorMessage: result.errorMessage,
        metadata: result.metadata,
        attemptNumber,
      })
    );

    await Promise.all(recordPromises);
  }

  /**
   * Get failure count for an entity
   */
  async getFailureCount(entityType: string, entityId: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count
       FROM quality_gate_results
       WHERE entity_type = $1
         AND entity_id = $2
         AND status = 'failed'`,
      [entityType, entityId]
    );

    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Get latest attempt number for an entity
   */
  async getLatestAttemptNumber(entityType: string, entityId: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COALESCE(MAX(attempt_number), 0) as max_attempt
       FROM quality_gate_results
       WHERE entity_type = $1 AND entity_id = $2`,
      [entityType, entityId]
    );

    return parseInt(result.rows[0].max_attempt, 10);
  }

  /**
   * Check if entity has failed validation (any gate failed on latest attempt)
   */
  async hasFailedValidation(entityType: string, entityId: string): Promise<boolean> {
    const latestAttempt = await this.getLatestAttemptNumber(entityType, entityId);

    if (latestAttempt === 0) {
      return false; // Never validated
    }

    const result = await this.pool.query(
      `SELECT COUNT(*) as failed_count
       FROM quality_gate_results
       WHERE entity_type = $1
         AND entity_id = $2
         AND attempt_number = $3
         AND status = 'failed'`,
      [entityType, entityId, latestAttempt]
    );

    return parseInt(result.rows[0].failed_count, 10) > 0;
  }

  /**
   * Get all failures for an entity (all attempts)
   */
  async getEntityFailures(entityType: string, entityId: string) {
    const result = await this.pool.query(
      `SELECT *
       FROM quality_gate_results
       WHERE entity_type = $1
         AND entity_id = $2
         AND status = 'failed'
       ORDER BY attempt_number DESC, created_at DESC`,
      [entityType, entityId]
    );

    return result.rows;
  }

  /**
   * Clear old failures (for cleanup/archiving)
   */
  async clearOldFailures(daysToKeep: number = 90): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM quality_gate_results
       WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
       RETURNING id`,
      []
    );

    return result.rowCount || 0;
  }
}
```

**Dependencies**: PostgreSQL pool, QualityGate interface (F010)

---

### Task 3: Retry Logic Service

**File**: `packages/api/src/services/quality-gates/retry-logic.service.ts`

Implement retry mechanism for failed validations.

**Implementation Plan**:

```typescript
import { Pool } from 'pg';
import { QualityGateRegistry } from './gate-registry';
import { FailureRecorderService } from './failure-recorder.service';

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = [0, 2000, 5000]; // 0ms, 2s, 5s

export class RetryLogicService {
  constructor(
    private readonly pool: Pool,
    private readonly gateRegistry: QualityGateRegistry,
    private readonly failureRecorder: FailureRecorderService
  ) {}

  /**
   * Validate entity with automatic retry logic
   */
  async validateWithRetry(
    entityType: string,
    entityId: string
  ): Promise<{
    success: boolean;
    attemptNumber: number;
    failedGates: string[];
  }> {
    let attemptNumber = await this.failureRecorder.getLatestAttemptNumber(entityType, entityId);

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      attemptNumber = attempt;

      // Exponential backoff delay
      if (attempt > 1) {
        const delay = RETRY_DELAY_MS[attempt - 1] || 5000;
        await this.sleep(delay);
      }

      // Run all quality gates
      const validation = await this.gateRegistry.validateAll(entityType, entityId);

      // Record all gate results
      const gateResults = validation.results.map((r) => ({
        gateName: r.gateName,
        passed: r.passed,
        errorMessage: r.errorMessage,
        metadata: {},
      }));

      await this.failureRecorder.recordValidationRun(
        entityType,
        entityId,
        gateResults,
        attemptNumber
      );

      // Check if all passed
      if (validation.passed) {
        return {
          success: true,
          attemptNumber,
          failedGates: [],
        };
      }

      // If max attempts reached, return failure
      if (attempt === MAX_RETRY_ATTEMPTS) {
        const failedGates = validation.results.filter((r) => !r.passed).map((r) => r.gateName);

        return {
          success: false,
          attemptNumber,
          failedGates,
        };
      }

      // Check if failures are retryable
      const isRetryable = await this.areFailuresRetryable(validation.results);

      if (!isRetryable) {
        // Non-retryable failure (e.g., schema validation, profanity)
        // Stop retrying
        const failedGates = validation.results.filter((r) => !r.passed).map((r) => r.gateName);

        return {
          success: false,
          attemptNumber,
          failedGates,
        };
      }

      // Continue to next retry attempt
    }

    // Should not reach here
    return { success: false, attemptNumber, failedGates: [] };
  }

  /**
   * Determine if failures are retryable or permanent
   */
  private async areFailuresRetryable(
    results: Array<{ gateName: string; passed: boolean; errorMessage?: string }>
  ): Promise<boolean> {
    const failedGates = results.filter((r) => !r.passed);

    // Gates that should NOT be retried (permanent failures)
    const nonRetryableGates = [
      'schema-validation', // Schema errors need manual fixing
      'content-safety', // Profanity won't magically disappear
      'duplication-check', // Duplicates need manual resolution
    ];

    // If any non-retryable gate failed, don't retry
    const hasNonRetryableFailure = failedGates.some((gate) =>
      nonRetryableGates.includes(gate.gateName)
    );

    if (hasNonRetryableFailure) {
      return false;
    }

    // Retryable failures (might be transient):
    // - CEFR level check (frequency data might update)
    // - Prerequisite validation (dependencies might get approved)
    // - Content completeness (related content might be added)

    return true;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Manually trigger retry for a failed item
   */
  async manualRetry(
    entityType: string,
    entityId: string
  ): Promise<{
    success: boolean;
    attemptNumber: number;
  }> {
    const latestAttempt = await this.failureRecorder.getLatestAttemptNumber(entityType, entityId);

    if (latestAttempt >= MAX_RETRY_ATTEMPTS) {
      throw new Error('Maximum retry attempts reached');
    }

    // Run validation
    const validation = await this.gateRegistry.validateAll(entityType, entityId);
    const nextAttempt = latestAttempt + 1;

    // Record results
    await this.failureRecorder.recordValidationRun(
      entityType,
      entityId,
      validation.results.map((r) => ({
        gateName: r.gateName,
        passed: r.passed,
        errorMessage: r.errorMessage,
        metadata: {},
      })),
      nextAttempt
    );

    return {
      success: validation.passed,
      attemptNumber: nextAttempt,
    };
  }
}
```

**Dependencies**: QualityGateRegistry, FailureRecorderService

---

### Task 4: Validation Orchestrator Service

**File**: `packages/api/src/services/quality-gates/validation-orchestrator.service.ts`

High-level service that orchestrates validation with retry logic and failure recording.

**Implementation Plan**:

```typescript
import { Pool } from 'pg';
import { QualityGateRegistry } from './gate-registry';
import { FailureRecorderService } from './failure-recorder.service';
import { RetryLogicService } from './retry-logic.service';

export class ValidationOrchestrator {
  private gateRegistry: QualityGateRegistry;
  private failureRecorder: FailureRecorderService;
  private retryLogic: RetryLogicService;

  constructor(pool: Pool) {
    this.gateRegistry = new QualityGateRegistry(pool);
    this.failureRecorder = new FailureRecorderService(pool);
    this.retryLogic = new RetryLogicService(pool, this.gateRegistry, this.failureRecorder);
  }

  /**
   * Validate an entity through all quality gates
   * Returns validation result with retry information
   */
  async validate(
    entityType: string,
    entityId: string
  ): Promise<{
    passed: boolean;
    attemptNumber: number;
    failedGates: string[];
    canRetry: boolean;
  }> {
    const result = await this.retryLogic.validateWithRetry(entityType, entityId);

    return {
      passed: result.success,
      attemptNumber: result.attemptNumber,
      failedGates: result.failedGates,
      canRetry: result.attemptNumber < 3 && !result.success,
    };
  }

  /**
   * Get validation status for an entity
   */
  async getValidationStatus(entityType: string, entityId: string) {
    const latestAttempt = await this.failureRecorder.getLatestAttemptNumber(entityType, entityId);

    if (latestAttempt === 0) {
      return {
        status: 'not_validated',
        attemptNumber: 0,
        failures: [],
      };
    }

    const hasFailed = await this.failureRecorder.hasFailedValidation(entityType, entityId);
    const failures = await this.failureRecorder.getEntityFailures(entityType, entityId);

    return {
      status: hasFailed ? 'failed' : 'passed',
      attemptNumber: latestAttempt,
      failures,
      canRetry: latestAttempt < 3 && hasFailed,
    };
  }

  /**
   * Trigger manual retry
   */
  async retry(entityType: string, entityId: string) {
    return await this.retryLogic.manualRetry(entityType, entityId);
  }
}
```

**Dependencies**: All previous services

---

### Task 5: Integration with Lifecycle State Transitions

**File**: `packages/api/src/services/lifecycle/state-machine.service.ts` (modification)

Update lifecycle state machine to use validation orchestrator.

**Implementation Plan**:

```typescript
// Add to existing StateMachine service

import { ValidationOrchestrator } from '../quality-gates/validation-orchestrator.service';

export class StateMachine {
  private validationOrchestrator: ValidationOrchestrator;

  constructor(pool: Pool) {
    // ... existing code
    this.validationOrchestrator = new ValidationOrchestrator(pool);
  }

  /**
   * Transition from CANDIDATE → VALIDATED
   * Runs all quality gates with retry logic
   */
  async promoteToValidated(
    entityType: string,
    entityId: string
  ): Promise<{
    success: boolean;
    newState: string;
    errorMessage?: string;
  }> {
    // Verify current state is CANDIDATE
    const currentState = await this.getCurrentState(entityType, entityId);

    if (currentState !== 'CANDIDATE') {
      return {
        success: false,
        newState: currentState,
        errorMessage: `Cannot validate from state ${currentState}. Must be CANDIDATE.`,
      };
    }

    // Run validation with retry logic
    const validation = await this.validationOrchestrator.validate(entityType, entityId);

    if (!validation.passed) {
      return {
        success: false,
        newState: 'CANDIDATE',
        errorMessage: `Validation failed at gates: ${validation.failedGates.join(', ')}. Attempt ${validation.attemptNumber}/3. ${validation.canRetry ? 'Will retry automatically.' : 'Max retries reached.'}`,
      };
    }

    // Update state to VALIDATED
    await this.updateState(entityType, entityId, 'VALIDATED');

    return {
      success: true,
      newState: 'VALIDATED',
    };
  }

  // ... rest of existing methods
}
```

**Dependencies**: ValidationOrchestrator, StateM achine (F007)

---

## Open Questions

### Question 1: Failure Data Retention

**Context**: Quality gate results accumulate over time. How long should we keep them?

**Options**:

1. **Keep all failures indefinitely**
   - Pros: Complete historical record, useful for analysis
   - Cons: Database growth, storage costs
2. **Archive failures after 90 days** (move to cold storage)
   - Pros: Balance between retention and performance
   - Cons: Requires archival system
3. **Delete failures after 90 days**
   - Pros: Clean database, no storage overhead
   - Cons: Loss of historical data

**Decision Needed**: Define retention policy for quality gate results.

**Temporary Plan**: Keep all results for MVP (Option 1). Add automated cleanup in Phase 2 if storage becomes an issue.

---

### Question 2: Retry Strategy for Different Gates

**Context**: Some gates should retry (transient errors), others shouldn't (permanent errors).

**Options**:

1. **Fixed retry list** (current approach)
   - Pros: Simple, predictable
   - Cons: Inflexible, may retry unnecessarily
2. **Gate-specific retry configuration**
   - Pros: Each gate declares if retryable
   - Cons: More complex, requires gate metadata
3. **Error-code based retry** (HTTP 5xx retry, 4xx don't)
   - Pros: Industry standard pattern
   - Cons: Requires error categorization

**Decision Needed**: Choose retry strategy per gate type.

**Temporary Plan**: Use fixed non-retryable list (Option 1) for MVP. Can add gate-specific config in Phase 2.

---

### Question 3: Notification on Max Retries Reached

**Context**: When an item fails 3 times, should operators be notified immediately?

**Options**:

1. **No automatic notification** (current approach)
   - Pros: Simple, operators check dashboard
   - Cons: May miss critical failures
2. **Email notification** to operators
   - Pros: Immediate awareness
   - Cons: Email fatigue, requires email service
3. **Slack/Discord webhook** notification
   - Pros: Real-time alerts in team chat
   - Cons: Requires webhook configuration

**Decision Needed**: Choose notification strategy for persistent failures.

**Temporary Plan**: No automatic notifications for MVP (Option 1). Operators monitor F027 failures dashboard.

---

## Dependencies

**Blocks**:

- F020: Operational Endpoints (failure query API)
- F027: Failure Investigation Tools (operator UI for failures)

**Depends on**:

- F007: Lifecycle State Machine (state transitions trigger validation)
- F010: Schema Validation Engine (QualityGate interface)
- F011: Quality Gates Part 1 (first set of gates)
- F012: Quality Gates Part 2 (second set of gates)
- F001: Database Schema (tables for failure recording)

**Optional**:

- Email service for notifications
- Slack/Discord webhooks for alerts
- Data archival system for old failures

---

## Notes

### Implementation Priority

1. Create database schema (Task 1)
2. Implement failure recorder service (Task 2)
3. Implement retry logic service (Task 3)
4. Create validation orchestrator (Task 4)
5. Integrate with lifecycle state machine (Task 5)

### Retry Logic

- **Max Attempts**: 3 retries per item
- **Exponential Backoff**: 0ms (attempt 1), 2s (attempt 2), 5s (attempt 3)
- **Non-Retryable Gates**: schema-validation, content-safety, duplication-check
- **Retryable Gates**: cefr-level-check, prerequisite-validation, content-completeness

### Failure Recording

- **All Results Recorded**: Both pass and fail stored for audit trail
- **Metadata Included**: Full error context (stack trace, validation context)
- **Unique Constraint**: One result per entity/gate/attempt combination
- **View Created**: `validation_failures` view for easy operator queries

### Performance Considerations

- Failure recording is asynchronous (doesn't block validation)
- Indexes on entity_id, gate_name, status for fast queries
- Composite index for operator failure dashboard queries
- Consider partitioning by created_at for very large datasets

### Security Considerations

- Failure metadata may contain sensitive error details (sanitize for display)
- Only operators can view failure details (auth middleware)
- Rate limit retry API to prevent abuse
- Log all manual retry attempts for audit trail
