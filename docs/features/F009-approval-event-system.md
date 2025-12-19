# F009: Approval Event System

**Feature Code**: F009
**Created**: 2025-12-17
**Phase**: 2 - Data Governance Core
**Status**: Not Started

---

## Description

Implement comprehensive audit trail for all approval events. Every item that reaches APPROVED state must have a traceable approval event recording who approved it, when, and why.

## Success Criteria

- [ ] Approval events recorded for every approval
- [ ] Events include operator ID, timestamp, and notes
- [ ] Automatic vs manual approval distinguished
- [ ] Complete approval history queryable
- [ ] Traceability: approved item → approval event linkable

---

## Tasks

### Task 1: Create Approval Events Schema

**Description**: Database table for approval event tracking.

**Implementation Plan**:

Create `packages/db/migrations/006-approval-events.sql`:
```sql
CREATE TABLE approval_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL,
  item_type VARCHAR(50) NOT NULL,
  operator_id UUID REFERENCES users(id),
  approval_type VARCHAR(20) NOT NULL CHECK (approval_type IN ('MANUAL', 'AUTOMATIC')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_approval_events_item ON approval_events(item_id);
CREATE INDEX idx_approval_events_operator ON approval_events(operator_id);
CREATE INDEX idx_approval_events_type ON approval_events(item_type);
CREATE INDEX idx_approval_events_created ON approval_events(created_at);
```

**Files Created**:
- `packages/db/migrations/006-approval-events.sql`

---

### Task 2: Implement Approval Event Service

**Description**: Service for creating and querying approval events.

**Implementation Plan**:

Create `packages/core/src/lifecycle/approval-events.ts`:
```typescript
import { Pool } from 'pg';

export interface ApprovalEventParams {
  itemId: string;
  itemType: string;
  operatorId?: string;
  approvalType: 'MANUAL' | 'AUTOMATIC';
  notes?: string;
}

export interface ApprovalEvent {
  id: string;
  itemId: string;
  itemType: string;
  operatorId?: string;
  approvalType: 'MANUAL' | 'AUTOMATIC';
  notes?: string;
  createdAt: Date;
}

/**
 * Record approval event
 */
export async function recordApprovalEvent(
  pool: Pool,
  params: ApprovalEventParams
): Promise<ApprovalEvent> {
  const result = await pool.query(
    `INSERT INTO approval_events (item_id, item_type, operator_id, approval_type, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, item_id as "itemId", item_type as "itemType",
               operator_id as "operatorId", approval_type as "approvalType",
               notes, created_at as "createdAt"`,
    [params.itemId, params.itemType, params.operatorId, params.approvalType, params.notes]
  );
  return result.rows[0];
}

/**
 * Get approval event for item
 */
export async function getApprovalEvent(
  pool: Pool,
  itemId: string
): Promise<ApprovalEvent | null> {
  const result = await pool.query(
    `SELECT id, item_id as "itemId", item_type as "itemType",
            operator_id as "operatorId", approval_type as "approvalType",
            notes, created_at as "createdAt"
     FROM approval_events
     WHERE item_id = $1`,
    [itemId]
  );
  return result.rows[0] || null;
}

/**
 * Get all approval events by operator
 */
export async function getApprovalsByOperator(
  pool: Pool,
  operatorId: string,
  limit: number = 50
): Promise<ApprovalEvent[]> {
  const result = await pool.query(
    `SELECT id, item_id as "itemId", item_type as "itemType",
            operator_id as "operatorId", approval_type as "approvalType",
            notes, created_at as "createdAt"
     FROM approval_events
     WHERE operator_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [operatorId, limit]
  );
  return result.rows;
}

/**
 * Get approval statistics
 */
export async function getApprovalStats(pool: Pool): Promise<{
  total: number;
  manual: number;
  automatic: number;
}> {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN approval_type = 'MANUAL' THEN 1 ELSE 0 END) as manual,
      SUM(CASE WHEN approval_type = 'AUTOMATIC' THEN 1 ELSE 0 END) as automatic
    FROM approval_events
  `);
  return result.rows[0];
}
```

**Files Created**:
- `packages/core/src/lifecycle/approval-events.ts`

---

### Task 3: Integrate with Approval Workflow

**Description**: Ensure approval events are created during state transitions.

**Implementation Plan**:

Update `packages/core/src/lifecycle/transition-service.ts` to record approval events when transitioning to APPROVED state.

**Files Modified**:
- `packages/core/src/lifecycle/transition-service.ts`

---

### Task 4: Create Query Endpoints for Audit

**Description**: API endpoints for querying approval history.

**Implementation Plan**:

Create `packages/api/src/routes/operational/approval-history.ts`:
```typescript
import { FastifyInstance } from 'fastify';
import { protectOperatorRoute } from '../../decorators/route-protection';
import { getApprovalEvent, getApprovalsByOperator, getApprovalStats } from '@polyladder/core';

export async function approvalHistoryRoutes(fastify: FastifyInstance) {
  // GET /api/v1/operational/approval-history/:itemId
  fastify.get(
    '/approval-history/:itemId',
    protectOperatorRoute(fastify),
    async (request, reply) => {
      const { itemId } = request.params as { itemId: string };
      const event = await getApprovalEvent(fastify.pg, itemId);
      return { event };
    }
  );

  // GET /api/v1/operational/approval-stats
  fastify.get(
    '/approval-stats',
    protectOperatorRoute(fastify),
    async (request, reply) => {
      const stats = await getApprovalStats(fastify.pg);
      return { stats };
    }
  );
}
```

**Files Created**:
- `packages/api/src/routes/operational/approval-history.ts`

---

## Dependencies

- **Blocks**: F020, F026
- **Depends on**: F001, F007, F008

---

## Notes

- Every approved item MUST have approval event
- Automatic approvals (if enabled) recorded as AUTOMATIC
- Manual approvals include operator ID
- Complete audit trail for compliance
