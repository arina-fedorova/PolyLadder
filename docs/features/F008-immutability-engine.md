# F008: Immutability Engine

**Feature Code**: F008
**Created**: 2025-12-17
**Phase**: 2 - Data Governance Core
**Status**: ✅ Completed
**Completed**: 2025-12-19
**PR**: #11

---

## Description

Implement write-once enforcement for approved data tables. Once content reaches APPROVED state, it cannot be modified or deleted, only deprecated. This ensures data integrity and enables reliable curriculum planning.

## Success Criteria

- [x] Database triggers prevent UPDATE/DELETE on approved\_\* tables
- [x] Deprecation mechanism implemented (soft delete with version tracking)
- [x] Audit log records all attempts to modify approved data
- [x] Violation detection with clear error messages
- [x] Version tracking for deprecated/replaced content

---

## Tasks

### Task 1: Create Immutability Database Constraints

**Description**: Add database triggers to enforce immutability.

**Implementation Plan**:

Create `packages/db/migrations/004-immutability-constraints.sql`:

```sql
-- Function to prevent updates on approved tables
CREATE OR REPLACE FUNCTION prevent_approved_updates()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Cannot modify approved data. Use deprecation instead.';
END;
$$ LANGUAGE plpgsql;

-- Function to prevent deletes on approved tables
CREATE OR REPLACE FUNCTION prevent_approved_deletes()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Cannot delete approved data. Use deprecation instead.';
END;
$$ LANGUAGE plpgsql;

-- Apply to all approved_* tables (will be created in other migrations)
-- Example for approved_meanings:
-- CREATE TRIGGER immutable_approved_meanings_update
--   BEFORE UPDATE ON approved_meanings
--   FOR EACH ROW EXECUTE FUNCTION prevent_approved_updates();

-- CREATE TRIGGER immutable_approved_meanings_delete
--   BEFORE DELETE ON approved_meanings
--   FOR EACH ROW EXECUTE FUNCTION prevent_approved_deletes();
```

**Files Created**:

- `packages/db/migrations/004-immutability-constraints.sql`

---

### Task 2: Implement Deprecation Service

**Description**: Create deprecation mechanism for approved content.

**Implementation Plan**:

Create `packages/core/src/lifecycle/deprecation.ts`:

```typescript
import { Pool } from 'pg';

export interface DeprecationParams {
  itemId: string;
  itemType: string;
  reason: string;
  replacementId?: string;
  operatorId: string;
}

export interface DeprecationRecord {
  id: string;
  itemId: string;
  deprecatedAt: Date;
  reason: string;
  replacementId?: string;
}

/**
 * Deprecate approved content (soft delete)
 */
export async function deprecateApprovedItem(
  pool: Pool,
  params: DeprecationParams
): Promise<DeprecationRecord> {
  const { itemId, itemType, reason, replacementId, operatorId } = params;

  const result = await pool.query(
    `INSERT INTO deprecations (item_id, item_type, reason, replacement_id, operator_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, item_id as "itemId", deprecated_at as "deprecatedAt",
               reason, replacement_id as "replacementId"`,
    [itemId, itemType, reason, replacementId, operatorId]
  );

  return result.rows[0];
}

/**
 * Check if item is deprecated
 */
export async function isDeprecated(pool: Pool, itemId: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT EXISTS(SELECT 1 FROM deprecations WHERE item_id = $1) as deprecated',
    [itemId]
  );
  return result.rows[0].deprecated;
}

/**
 * Get replacement for deprecated item
 */
export async function getReplacement(pool: Pool, itemId: string): Promise<string | null> {
  const result = await pool.query('SELECT replacement_id FROM deprecations WHERE item_id = $1', [
    itemId,
  ]);
  return result.rows[0]?.replacement_id || null;
}
```

**Files Created**:

- `packages/core/src/lifecycle/deprecation.ts`

---

### Task 3: Create Deprecations Table

**Description**: Database schema for tracking deprecations.

**Implementation Plan**:

Create `packages/db/migrations/005-deprecations-table.sql`:

```sql
CREATE TABLE deprecations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL,
  item_type VARCHAR(50) NOT NULL,
  reason TEXT NOT NULL,
  replacement_id UUID,
  operator_id UUID NOT NULL REFERENCES users(id),
  deprecated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deprecations_item ON deprecations(item_id);
CREATE INDEX idx_deprecations_replacement ON deprecations(replacement_id);
```

**Files Created**:

- `packages/db/migrations/005-deprecations-table.sql`

---

### Task 4: Create Immutability Violation Logger

**Description**: Log all attempts to violate immutability.

**Implementation Plan**:

Create `packages/core/src/lifecycle/immutability-logger.ts`:

```typescript
import { Pool } from 'pg';

export interface ViolationParams {
  itemId: string;
  itemType: string;
  attemptedOperation: 'UPDATE' | 'DELETE';
  userId?: string;
}

export async function logImmutabilityViolation(pool: Pool, params: ViolationParams): Promise<void> {
  await pool.query(
    `INSERT INTO immutability_violations (item_id, item_type, attempted_operation, user_id)
     VALUES ($1, $2, $3, $4)`,
    [params.itemId, params.itemType, params.attemptedOperation, params.userId]
  );
}
```

**Files Created**:

- `packages/core/src/lifecycle/immutability-logger.ts`

---

### Task 5: Create Unit Tests

**Description**: Test deprecation and immutability enforcement.

**Implementation Plan**:

Create `packages/core/tests/lifecycle/deprecation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
// Tests for deprecation logic
```

**Files Created**:

- `packages/core/tests/lifecycle/deprecation.test.ts`

---

## Dependencies

- **Blocks**: F009, F020, F028
- **Depends on**: F001, F007

---

## Notes

- Approved data is write-once, never modified
- Deprecation is only way to "remove" approved content
- Database triggers enforce at lowest level
- Violations logged for security audit
