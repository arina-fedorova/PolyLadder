# F007: Lifecycle State Machine Implementation

**Feature Code**: F007
**Created**: 2025-12-17
**Phase**: 2 - Data Governance Core
**Status**: Not Started

---

## Description

Implement the core lifecycle state machine that governs data progression through DRAFT → CANDIDATE → VALIDATED → APPROVED states. This enforces quality gates and prevents invalid state transitions.

## Success Criteria

- [ ] State transition logic implemented (only forward transitions)
- [ ] Atomic state changes with database transactions
- [ ] State change events recorded in audit log
- [ ] Invalid transitions rejected with clear errors
- [ ] All content types use same state machine
- [ ] State validation before any transition

---

## Tasks

### Task 1: Define Lifecycle State Types

**Description**: Create TypeScript types for lifecycle states and transitions.

**Implementation Plan**:

Create `packages/core/src/lifecycle/states.ts`:
```typescript
/**
 * Lifecycle states for content refinement
 */
export enum LifecycleState {
  DRAFT = 'DRAFT',
  CANDIDATE = 'CANDIDATE',
  VALIDATED = 'VALIDATED',
  APPROVED = 'APPROVED',
}

/**
 * Valid state transitions
 */
export const VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  [LifecycleState.DRAFT]: [LifecycleState.CANDIDATE],
  [LifecycleState.CANDIDATE]: [LifecycleState.VALIDATED],
  [LifecycleState.VALIDATED]: [LifecycleState.APPROVED],
  [LifecycleState.APPROVED]: [], // Terminal state
};

/**
 * State transition event
 */
export interface StateTransition {
  id: string;
  itemId: string;
  fromState: LifecycleState;
  toState: LifecycleState;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class InvalidTransitionError extends Error {
  constructor(from: LifecycleState, to: LifecycleState) {
    super(`Invalid transition from ${from} to ${to}`);
    this.name = 'InvalidTransitionError';
  }
}
```

**Files Created**:
- `packages/core/src/lifecycle/states.ts`

---

### Task 2: Implement State Transition Validator

**Description**: Create validation logic for state transitions.

**Implementation Plan**:

Create `packages/core/src/lifecycle/validator.ts`:
```typescript
import { LifecycleState, VALID_TRANSITIONS, InvalidTransitionError } from './states';

/**
 * Check if transition is valid
 */
export function isValidTransition(from: LifecycleState, to: LifecycleState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * Assert transition is valid, throw error if not
 */
export function assertValidTransition(from: LifecycleState, to: LifecycleState): void {
  if (!isValidTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/**
 * Get next valid states for current state
 */
export function getNextValidStates(current: LifecycleState): LifecycleState[] {
  return VALID_TRANSITIONS[current];
}

/**
 * Check if state is terminal
 */
export function isTerminalState(state: LifecycleState): boolean {
  return VALID_TRANSITIONS[state].length === 0;
}
```

**Files Created**:
- `packages/core/src/lifecycle/validator.ts`

---

### Task 3: Create State Transition Service

**Description**: Implement service for executing state transitions with database persistence.

**Implementation Plan**:

Create `packages/core/src/lifecycle/transition-service.ts`:
```typescript
import { Pool } from 'pg';
import { LifecycleState, StateTransition } from './states';
import { assertValidTransition } from './validator';

export interface TransitionParams {
  itemId: string;
  itemType: string;
  fromState: LifecycleState;
  toState: LifecycleState;
  metadata?: Record<string, any>;
}

/**
 * Execute state transition with database transaction
 */
export async function executeTransition(
  pool: Pool,
  params: TransitionParams
): Promise<StateTransition> {
  const { itemId, itemType, fromState, toState, metadata } = params;

  // Validate transition
  assertValidTransition(fromState, toState);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Record transition event
    const eventResult = await client.query(
      `INSERT INTO state_transition_events (item_id, item_type, from_state, to_state, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, item_id as "itemId", from_state as "fromState",
                 to_state as "toState", created_at as "timestamp", metadata`,
      [itemId, itemType, fromState, toState, JSON.stringify(metadata || {})]
    );

    const event = eventResult.rows[0];

    // Move item to new table based on state
    await moveItemToStateTable(client, itemId, itemType, fromState, toState);

    await client.query('COMMIT');

    return event;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function moveItemToStateTable(
  client: any,
  itemId: string,
  itemType: string,
  fromState: LifecycleState,
  toState: LifecycleState
): Promise<void> {
  const fromTable = getTableForState(itemType, fromState);
  const toTable = getTableForState(itemType, toState);

  // Copy data
  await client.query(
    `INSERT INTO ${toTable} SELECT * FROM ${fromTable} WHERE id = $1`,
    [itemId]
  );

  // Delete from old table
  await client.query(`DELETE FROM ${fromTable} WHERE id = $1`, [itemId]);
}

function getTableForState(itemType: string, state: LifecycleState): string {
  const stateTableMap = {
    [LifecycleState.DRAFT]: 'drafts',
    [LifecycleState.CANDIDATE]: 'candidates',
    [LifecycleState.VALIDATED]: 'validated',
    [LifecycleState.APPROVED]: `approved_${itemType.toLowerCase()}s`,
  };
  return stateTableMap[state];
}
```

**Files Created**:
- `packages/core/src/lifecycle/transition-service.ts`

---

### Task 4: Create Database Schema for State Tracking

**Description**: Add tables for tracking state transitions.

**Implementation Plan**:

Create `packages/db/migrations/003-lifecycle-state-tracking.sql`:
```sql
-- State transition events
CREATE TABLE state_transition_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL,
  item_type VARCHAR(50) NOT NULL,
  from_state VARCHAR(20) NOT NULL,
  to_state VARCHAR(20) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transition_events_item ON state_transition_events(item_id);
CREATE INDEX idx_transition_events_type ON state_transition_events(item_type);
CREATE INDEX idx_transition_events_to_state ON state_transition_events(to_state);
```

**Files Created**:
- `packages/db/migrations/003-lifecycle-state-tracking.sql`

---

### Task 5: Create Unit Tests

**Description**: Test state transition validation and execution.

**Implementation Plan**:

Create `packages/core/tests/lifecycle/validator.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { LifecycleState } from '../../src/lifecycle/states';
import {
  isValidTransition,
  assertValidTransition,
  getNextValidStates,
  isTerminalState,
} from '../../src/lifecycle/validator';

describe('Lifecycle Validator', () => {
  it('should allow DRAFT → CANDIDATE', () => {
    expect(isValidTransition(LifecycleState.DRAFT, LifecycleState.CANDIDATE)).toBe(true);
  });

  it('should deny DRAFT → APPROVED', () => {
    expect(isValidTransition(LifecycleState.DRAFT, LifecycleState.APPROVED)).toBe(false);
  });

  it('should identify terminal state', () => {
    expect(isTerminalState(LifecycleState.APPROVED)).toBe(true);
    expect(isTerminalState(LifecycleState.DRAFT)).toBe(false);
  });
});
```

**Files Created**:
- `packages/core/tests/lifecycle/validator.test.ts`

---

## Dependencies

- **Blocks**: F008, F009, F017
- **Depends on**: F001, F002

---

## Notes

- No backward transitions allowed (immutability principle)
- APPROVED is terminal state
- All transitions are atomic (database transactions)
- State changes auditable via state_transition_events table

---

## Open Questions

### 1. Concurrent State Transition Handling

**Question**: How should the system handle concurrent attempts to transition the same item (e.g., two workers both try to promote same candidate)?

**Current Approach**: Database transactions with BEGIN/COMMIT, but no explicit locking. Race condition possible: both workers read current state, both validate transition, both attempt INSERT to new table - second fails with unique constraint violation.

**Alternatives**:
1. **Advisory locks**: Use PostgreSQL advisory locks (`pg_advisory_xact_lock(item_id)`) to ensure only one transition at a time per item. Blocks concurrent attempts.
2. **Optimistic locking**: Add `version` column, increment on each transition, require version match. Failed transactions retry with exponential backoff.
3. **SELECT FOR UPDATE**: Lock row during state read (`SELECT ... FOR UPDATE`). Prevents concurrent reads.
4. **Idempotent transitions**: Allow duplicate transitions, last one wins. Simplest but loses strict ordering guarantees.

**Recommendation**: Use **advisory locks** (Option 1). Add to `executeTransition`:
```typescript
await client.query('SELECT pg_advisory_xact_lock($1)', [hashItemId(itemId)]);
```
This prevents race conditions without adding schema complexity. Lock automatically released on transaction commit/rollback. For distributed systems (multiple API servers), this ensures only one server processes a transition at a time.

---

### 2. Invalid State Recovery and Rollback

**Question**: If approved content is discovered to be incorrect/harmful, should we support state rollback (APPROVED → VALIDATED) or only deprecation (mark as inactive)?

**Current Approach**: No backward transitions allowed ("immutability principle"). APPROVED is terminal state. Implies deprecation is only option - set `status='deprecated'` flag but item stays in `approved_*` table.

**Alternatives**:
1. **Strict immutability** (current): No rollbacks ever. Bad content must be deprecated + new correct version created. Audit trail perfect but can't fix mistakes in-place.
2. **Deprecation with replacement**: Add `superseded_by` foreign key pointing to new correct version. Old version deprecated, new version linked.
3. **Admin rollback**: Allow APPROVED → CANDIDATE transition only for admin users with logged reason. Breaks immutability but enables corrections.
4. **Soft deletion**: Mark item as deleted but keep in table. Query filters exclude deleted items. Preserves data for audit.

**Recommendation**: Use **deprecation with replacement** (Option 2). Maintain immutability of state machine (no backward transitions) but add deprecation workflow:
- Add `approved_meanings.deprecated_at`, `superseded_by_id` columns
- When approving new version, link old → new
- Queries filter `WHERE deprecated_at IS NULL`
- Keep full history in `approved_*` tables and `state_transition_events`

This preserves audit trail while allowing corrections. For truly harmful content (offensive/illegal), add hard delete capability with admin authorization + permanent audit log entry.

---

### 3. Data Storage Strategy: Separate Tables vs Single Table

**Question**: Should items in different lifecycle states live in separate tables (current: `drafts`, `candidates`, `validated`, `approved_meanings`) or single table with `state` column?

**Current Approach**: Separate tables per state. Item physically moves between tables on state transition (copy to new table, delete from old). Clean separation but complex migrations.

**Alternatives**:
1. **Separate tables** (current): Each state has own table. Enforces separation, simple queries per state, but complex transitions (move data) and schema changes require modifying 4 tables.
2. **Single table with state column**: One `content_items` table with `state` enum column. Simpler transitions (UPDATE), easier schema evolution, but mixes concerns and requires filtered queries.
3. **Partitioned single table**: One logical table partitioned by `state`. Best of both - logical unity with physical separation. PostgreSQL handles routing automatically.
4. **Hybrid**: User-generated content in separate tables, approved content in single versioned table. Different guarantees for different states.

**Recommendation**: Keep **separate tables** (Option 1) for MVP simplicity, but design for future migration to **partitioned table** (Option 3). Separate tables provide:
- Clear state boundaries (can't accidentally query wrong state)
- Different indexes per state (candidates need different indexes than approved)
- Easy to add state-specific columns (validated needs validation_results)
- Performance: approved table optimized for reads, candidates for writes

If schema evolution becomes painful (>5 migrations affecting all 4 tables), migrate to partitioned table using:
```sql
CREATE TABLE content_lifecycle (
  id UUID PRIMARY KEY,
  state lifecycle_state NOT NULL,
  ...
) PARTITION BY LIST (state);

CREATE TABLE drafts PARTITION OF content_lifecycle FOR VALUES IN ('DRAFT');
```
This maintains separate physical storage while simplifying schema management.
