import { Pool } from 'pg';

export interface StateTransition {
  id: string;
  itemId: string;
  itemType: string;
  fromState: string;
  toState: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface TransitionParams {
  itemId: string;
  itemType: string;
  fromState: string;
  toState: string;
  metadata?: Record<string, unknown>;
}

export async function recordTransition(
  pool: Pool,
  params: TransitionParams
): Promise<StateTransition> {
  const { itemId, itemType, fromState, toState, metadata = {} } = params;

  const result = await pool.query<StateTransition>(
    `INSERT INTO state_transition_events (item_id, item_type, from_state, to_state, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, item_id as "itemId", item_type as "itemType",
               from_state as "fromState", to_state as "toState",
               metadata, created_at as "createdAt"`,
    [itemId, itemType, fromState, toState, JSON.stringify(metadata)]
  );

  return result.rows[0];
}

export async function moveItemToState(
  pool: Pool,
  itemId: string,
  itemType: string,
  fromState: string,
  toState: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // DRAFT -> CANDIDATE: create candidate from draft
    if (fromState === 'DRAFT' && toState === 'CANDIDATE') {
      const draft = await client.query<{ data_type: string; raw_data: unknown }>(
        'SELECT id, data_type, raw_data FROM drafts WHERE id = $1',
        [itemId]
      );

      if (draft.rows.length === 0) {
        throw new Error(`Draft ${itemId} not found`);
      }

      const { data_type, raw_data } = draft.rows[0];

      await client.query(
        `INSERT INTO candidates (data_type, normalized_data, draft_id)
         VALUES ($1, $2, $3)`,
        [data_type, raw_data, itemId]
      );
    }
    // CANDIDATE -> VALIDATED: create validated from candidate
    else if (fromState === 'CANDIDATE' && toState === 'VALIDATED') {
      const candidate = await client.query<{ data_type: string; normalized_data: unknown }>(
        'SELECT id, data_type, normalized_data FROM candidates WHERE id = $1',
        [itemId]
      );

      if (candidate.rows.length === 0) {
        throw new Error(`Candidate ${itemId} not found`);
      }

      const { data_type, normalized_data } = candidate.rows[0];

      await client.query(
        `INSERT INTO validated (data_type, validated_data, candidate_id, validation_results)
         VALUES ($1, $2, $3, $4)`,
        [data_type, normalized_data, itemId, JSON.stringify({})]
      );
    }
    // VALIDATED -> APPROVED: move to approved tables
    else if (fromState === 'VALIDATED' && toState === 'APPROVED') {
      const validated = await client.query<{ data_type: string; validated_data: unknown }>(
        'SELECT id, data_type, validated_data FROM validated WHERE id = $1',
        [itemId]
      );

      if (validated.rows.length === 0) {
        throw new Error(`Validated ${itemId} not found`);
      }

      const { data_type, validated_data } = validated.rows[0];
      const tableName = `approved_${data_type}s`;

      // Insert into appropriate approved table based on data_type
      await client.query(`INSERT INTO ${tableName} SELECT * FROM jsonb_to_record($1)`, [
        validated_data,
      ]);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
