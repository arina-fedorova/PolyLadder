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
  toState: LifecycleState,
  metadata?: Record<string, unknown>
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

      const validationResults = metadata?.gateResults
        ? { passed: true, gateResults: metadata.gateResults }
        : {};

      await client.query(
        `INSERT INTO validated (data_type, validated_data, candidate_id, validation_results)
         VALUES ($1, $2, $3, $4)`,
        [data_type, normalized_data, itemId, JSON.stringify(validationResults)]
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

      // Insert into appropriate approved table based on data_type
      if (data_type === 'rule') {
        const data = validated_data as Record<string, unknown>;
        await client.query(
          `INSERT INTO approved_rules (id, language, level, category, title, explanation, examples)
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)`,
          [
            data.language,
            data.level,
            data.category || 'general',
            data.title,
            data.explanation,
            JSON.stringify(data.examples || []),
          ]
        );
      } else if (data_type === 'exercise') {
        const data = validated_data as Record<string, unknown>;
        await client.query(
          `INSERT INTO approved_exercises (type, level, languages, prompt, correct_answer, options, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            data.type,
            data.level,
            JSON.stringify(data.languages || []),
            data.prompt,
            data.correctAnswer || data.correct_answer,
            JSON.stringify(data.options || null),
            JSON.stringify(data.metadata || {}),
          ]
        );
      } else if (data_type === 'meaning') {
        const data = validated_data as Record<string, unknown>;
        await client.query(
          `INSERT INTO approved_meanings (id, level, tags)
           VALUES ($1, $2, $3)`,
          [data.id, data.level, JSON.stringify(data.tags || [])]
        );
      } else if (data_type === 'utterance') {
        const data = validated_data as Record<string, unknown>;
        await client.query(
          `INSERT INTO approved_utterances (meaning_id, language, text, register, usage_notes, audio_url)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            data.meaningId || data.meaning_id,
            data.language,
            data.text,
            data.register || null,
            data.usageNotes || data.usage_notes || null,
            data.audioUrl || data.audio_url || null,
          ]
        );
      } else {
        throw new Error(`Unknown data_type: ${data_type}`);
      }

      // Delete from validated after moving to approved
      await client.query('DELETE FROM validated WHERE id = $1', [itemId]);
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
