import { Pool, PoolClient } from 'pg';
import type { StateTransition } from '@polyladder/core';
import { LifecycleState } from '@polyladder/core';

export interface TransitionParams {
  itemId: string;
  itemType: string;
  fromState: LifecycleState;
  toState: LifecycleState;
  metadata?: Record<string, unknown>;
}

export async function recordTransition(
  pool: Pool | PoolClient,
  params: TransitionParams
): Promise<StateTransition> {
  const { itemId, itemType, fromState, toState, metadata = {} } = params;

  const result = await pool.query<{
    id: string;
    item_id: string;
    item_type: string;
    from_state: string;
    to_state: string;
    metadata: Record<string, unknown>;
    created_at: Date;
  }>(
    `INSERT INTO state_transition_events (item_id, item_type, from_state, to_state, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, item_id, item_type, from_state, to_state, metadata, created_at`,
    [itemId, itemType, fromState, toState, JSON.stringify(metadata)]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    itemId: row.item_id,
    itemType: row.item_type,
    fromState: row.from_state as LifecycleState,
    toState: row.to_state as LifecycleState,
    metadata: row.metadata,
    timestamp: row.created_at,
  };
}

export async function moveItemToState(
  pool: Pool | PoolClient,
  itemId: string,
  itemType: string,
  fromState: LifecycleState,
  toState: LifecycleState
): Promise<void> {
  // If pool is already a client (in transaction), use it directly
  const isPoolClient = (p: Pool | PoolClient): p is PoolClient =>
    'release' in p && typeof p.release === 'function';

  const shouldManageTransaction = !isPoolClient(pool);
  const client = shouldManageTransaction ? await pool.connect() : pool;

  try {
    if (shouldManageTransaction) {
      await client.query('BEGIN');
    }

    // DRAFT -> CANDIDATE: create candidate from draft
    if (fromState === LifecycleState.DRAFT && toState === LifecycleState.CANDIDATE) {
      const draft = await client.query<{ data_type: string; raw_data: unknown }>(
        'SELECT id, data_type, raw_data FROM drafts WHERE id = $1',
        [itemId]
      );

      if (draft.rows.length === 0) {
        throw new Error(`Draft ${itemId} not found`);
      }

      const { data_type, raw_data } = draft.rows[0];

      // Validate itemType matches
      if (data_type !== itemType) {
        throw new Error(`Item type mismatch: expected ${itemType}, got ${data_type}`);
      }

      await client.query(
        `INSERT INTO candidates (data_type, normalized_data, draft_id)
         VALUES ($1, $2, $3)`,
        [data_type, raw_data, itemId]
      );
    }
    // CANDIDATE -> VALIDATED: create validated from candidate
    else if (fromState === LifecycleState.CANDIDATE && toState === LifecycleState.VALIDATED) {
      const candidate = await client.query<{ data_type: string; normalized_data: unknown }>(
        'SELECT id, data_type, normalized_data FROM candidates WHERE id = $1',
        [itemId]
      );

      if (candidate.rows.length === 0) {
        throw new Error(`Candidate ${itemId} not found`);
      }

      const { data_type, normalized_data } = candidate.rows[0];

      // Validate itemType matches
      if (data_type !== itemType) {
        throw new Error(`Item type mismatch: expected ${itemType}, got ${data_type}`);
      }

      await client.query(
        `INSERT INTO validated (data_type, validated_data, candidate_id, validation_results)
         VALUES ($1, $2, $3, $4)`,
        [data_type, normalized_data, itemId, JSON.stringify({})]
      );
    }
    // VALIDATED -> APPROVED: move to approved tables
    else if (fromState === LifecycleState.VALIDATED && toState === LifecycleState.APPROVED) {
      const validated = await client.query<{ data_type: string; validated_data: unknown }>(
        'SELECT id, data_type, validated_data FROM validated WHERE id = $1',
        [itemId]
      );

      if (validated.rows.length === 0) {
        throw new Error(`Validated ${itemId} not found`);
      }

      const { data_type, validated_data } = validated.rows[0];

      // Validate itemType matches
      if (data_type !== itemType) {
        throw new Error(`Item type mismatch: expected ${itemType}, got ${data_type}`);
      }

      const tableName = `approved_${data_type}s`;

      // Insert into appropriate approved table based on data_type
      await client.query(`INSERT INTO ${tableName} SELECT * FROM jsonb_to_record($1)`, [
        validated_data,
      ]);
    }

    if (shouldManageTransaction) {
      await client.query('COMMIT');
    }
  } catch (error) {
    if (shouldManageTransaction) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (shouldManageTransaction) {
      client.release();
    }
  }
}
