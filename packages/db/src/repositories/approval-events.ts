import { Pool, PoolClient } from 'pg';
import type {
  ApprovalEventRepository,
  ApprovalEventRecord,
  CreateApprovalParams,
  ApprovalStats,
} from '@polyladder/core';
import { ApprovalType } from '@polyladder/core';

interface ApprovalEventRow {
  id: string;
  item_id: string;
  item_type: string;
  operator_id: string | null;
  approval_type: string;
  notes: string | null;
  created_at: Date;
}

export function createApprovalEventRepository(pool: Pool | PoolClient): ApprovalEventRepository {
  return {
    async recordApproval(params: CreateApprovalParams): Promise<ApprovalEventRecord> {
      const result = await pool.query<ApprovalEventRow>(
        `INSERT INTO approval_events (item_id, item_type, operator_id, approval_type, notes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, item_id, item_type, operator_id, approval_type, notes, created_at`,
        [
          params.itemId,
          params.itemType,
          params.operatorId ?? null,
          params.approvalType,
          params.notes ?? null,
        ]
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error('Failed to create approval event');
      }

      const record: ApprovalEventRecord = {
        id: row.id,
        itemId: row.item_id,
        itemType: row.item_type,
        operatorId: row.operator_id ?? undefined,
        approvalType: row.approval_type as ApprovalType,
        notes: row.notes ?? undefined,
        createdAt: row.created_at,
      };
      return record;
    },

    async getApprovalEvent(itemId: string): Promise<ApprovalEventRecord | null> {
      const result = await pool.query<ApprovalEventRow>(
        `SELECT id, item_id, item_type, operator_id, approval_type, notes, created_at
         FROM approval_events
         WHERE item_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [itemId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      const record: ApprovalEventRecord = {
        id: row.id,
        itemId: row.item_id,
        itemType: row.item_type,
        operatorId: row.operator_id ?? undefined,
        approvalType: row.approval_type as ApprovalType,
        notes: row.notes ?? undefined,
        createdAt: row.created_at,
      };
      return record;
    },

    async getApprovalsByOperator(operatorId: string, limit = 100): Promise<ApprovalEventRecord[]> {
      const result = await pool.query<ApprovalEventRow>(
        `SELECT id, item_id, item_type, operator_id, approval_type, notes, created_at
         FROM approval_events
         WHERE operator_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [operatorId, limit]
      );

      const records: ApprovalEventRecord[] = result.rows.map((row: ApprovalEventRow) => {
        const record: ApprovalEventRecord = {
          id: String(row.id),
          itemId: String(row.item_id),
          itemType: String(row.item_type),
          operatorId: row.operator_id ? String(row.operator_id) : undefined,
          approvalType: row.approval_type as ApprovalType,
          notes: row.notes ? String(row.notes) : undefined,
          createdAt: row.created_at,
        };
        return record;
      });
      return records;
    },

    async getApprovalsByType(itemType: string, limit = 100): Promise<ApprovalEventRecord[]> {
      const result = await pool.query<ApprovalEventRow>(
        `SELECT id, item_id, item_type, operator_id, approval_type, notes, created_at
         FROM approval_events
         WHERE item_type = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [itemType, limit]
      );

      const records: ApprovalEventRecord[] = result.rows.map((row: ApprovalEventRow) => {
        const record: ApprovalEventRecord = {
          id: String(row.id),
          itemId: String(row.item_id),
          itemType: String(row.item_type),
          operatorId: row.operator_id ? String(row.operator_id) : undefined,
          approvalType: row.approval_type as ApprovalType,
          notes: row.notes ? String(row.notes) : undefined,
          createdAt: row.created_at,
        };
        return record;
      });
      return records;
    },

    async getApprovalStats(): Promise<ApprovalStats> {
      const totalResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM approval_events`
      );

      const manualResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM approval_events WHERE approval_type = 'MANUAL'`
      );

      const autoResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM approval_events WHERE approval_type = 'AUTOMATIC'`
      );

      const byTypeResult = await pool.query<{ item_type: string; count: string }>(
        `SELECT item_type, COUNT(*) as count FROM approval_events GROUP BY item_type`
      );

      const byType: Record<string, number> = {};
      for (const row of byTypeResult.rows) {
        byType[row.item_type] = parseInt(row.count, 10);
      }

      return {
        total: parseInt(totalResult.rows[0].count, 10),
        manual: parseInt(manualResult.rows[0].count, 10),
        automatic: parseInt(autoResult.rows[0].count, 10),
        byType,
      };
    },
  };
}
