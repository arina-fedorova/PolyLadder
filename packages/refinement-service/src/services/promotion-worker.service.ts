import { Pool } from 'pg';
import {
  executeTransitionSimple,
  LifecycleState,
  type StateTransition,
  type TransitionRepository,
} from '@polyladder/core';
import { recordTransition, moveItemToState } from '@polyladder/db';
import { logger } from '../utils/logger';
import { PipelineEventLogger } from './pipeline-event-logger.service';

export interface CandidateRecord {
  id: string;
  dataType: string;
  normalizedData: unknown;
  draftId: string;
  createdAt: Date;
}

export class PromotionWorker {
  private pool: Pool;
  private eventLogger: PipelineEventLogger;

  constructor(pool: Pool) {
    this.pool = pool;
    this.eventLogger = new PipelineEventLogger(pool);
  }

  private createTransitionRepository(): TransitionRepository {
    const pool = this.pool;
    return {
      async recordTransition(params): Promise<StateTransition> {
        return await recordTransition(pool, params);
      },
      async moveItemToState(
        itemId: string,
        itemType: string,
        fromState: LifecycleState,
        toState: LifecycleState,
        metadata?: Record<string, unknown>
      ): Promise<void> {
        return await moveItemToState(pool, itemId, itemType, fromState, toState, metadata);
      },
    };
  }

  async processBatch(batchSize = 10): Promise<number> {
    const result = await this.pool.query<CandidateRecord>(
      `SELECT c.id, c.data_type as "dataType", c.normalized_data as "normalizedData",
              c.draft_id as "draftId", c.created_at as "createdAt"
       FROM candidates c
       WHERE c.id NOT IN (SELECT candidate_id FROM validated)
         AND NOT EXISTS (
           SELECT 1 FROM drafts d
           WHERE d.id = c.draft_id
             AND d.document_id IS NOT NULL
         )
       ORDER BY c.created_at ASC
       LIMIT $1`,
      [batchSize]
    );

    const candidates = result.rows;
    if (candidates.length === 0) {
      return 0;
    }

    logger.info({ count: candidates.length }, 'Processing candidate batch');

    let processed = 0;
    for (const candidate of candidates) {
      try {
        await this.processCandidate(candidate);
        processed++;
      } catch (error) {
        logger.error(
          {
            candidateId: candidate.id,
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
          },
          'Failed to process candidate'
        );
      }
    }

    return processed;
  }

  private async processCandidate(candidate: CandidateRecord): Promise<void> {
    const normalizedData = candidate.normalizedData as Record<string, unknown>;

    const contentKey =
      candidate.dataType === 'meaning'
        ? normalizedData.word
        : candidate.dataType === 'rule'
          ? normalizedData.title
          : candidate.dataType === 'utterance'
            ? normalizedData.text
            : normalizedData.prompt;

    if (contentKey) {
      const wasRejected = await this.pool.query<{ id: string }>(
        `SELECT 1 FROM rejected_items ri
         JOIN validated v ON ri.validated_id = v.id
         JOIN candidates c ON v.candidate_id = c.id
         JOIN drafts d ON c.draft_id = d.id
         WHERE ri.data_type = $1
           AND d.topic_id = (
             SELECT topic_id FROM drafts WHERE id = $2
           )
           AND (
             (ri.data_type = 'meaning' AND ri.rejected_data->>'word' = $3)
             OR (ri.data_type = 'rule' AND ri.rejected_data->>'title' = $4)
             OR (ri.data_type = 'utterance' AND ri.rejected_data->>'text' = $5)
             OR (ri.data_type = 'exercise' AND ri.rejected_data->>'prompt' = $6)
           )
         LIMIT 1`,
        [candidate.dataType, candidate.draftId, contentKey, contentKey, contentKey, contentKey]
      );

      if (wasRejected.rows.length > 0) {
        logger.warn(
          {
            candidateId: candidate.id,
            dataType: candidate.dataType,
            contentKey,
            draftId: candidate.draftId,
          },
          'Skipping promotion to validated - content was previously rejected for this topic'
        );
        return;
      }
    }

    const transitionRepo = this.createTransitionRepository();
    await executeTransitionSimple(transitionRepo, {
      itemId: candidate.id,
      itemType: candidate.dataType,
      fromState: LifecycleState.CANDIDATE,
      toState: LifecycleState.VALIDATED,
      metadata: {
        promotedAt: new Date().toISOString(),
      },
    });

    const validatedResult = await this.pool.query<{ id: string }>(
      `SELECT id FROM validated WHERE candidate_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [candidate.id]
    );

    const validatedId = validatedResult.rows[0]?.id;

    if (validatedId) {
      await this.pool.query(
        `UPDATE pipeline_tasks
         SET item_id = $1, item_type = 'validated', current_stage = 'VALIDATED', updated_at = CURRENT_TIMESTAMP
         WHERE item_id = $2 AND current_stage = 'CANDIDATE'`,
        [validatedId, candidate.id]
      );

      const priority = this.calculateReviewPriority(candidate.dataType);
      await this.pool.query(
        `INSERT INTO review_queue (item_id, data_type, queued_at, priority)
         VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
         ON CONFLICT (item_id) DO UPDATE SET priority = $3, reviewed_at = NULL`,
        [validatedId, candidate.dataType, priority]
      );
    }

    await this.eventLogger.logEvent({
      itemId: candidate.id,
      itemType: 'candidate',
      eventType: 'promoted_to_validated',
      fromStage: 'CANDIDATE',
      toStage: 'VALIDATED',
      fromStatus: 'processing',
      toStatus: 'completed',
      stage: 'VALIDATED',
      status: 'completed',
      success: true,
      payload: {
        validatedId,
      },
    });

    logger.info({ candidateId: candidate.id, validatedId }, 'Candidate promoted to VALIDATED');
  }

  private calculateReviewPriority(dataType: string): number {
    if (dataType === 'rule') {
      return 1;
    }
    if (dataType === 'meaning') {
      return 2;
    }
    if (dataType === 'utterance') {
      return 3;
    }
    if (dataType === 'exercise') {
      return 4;
    }
    return 10;
  }
}
