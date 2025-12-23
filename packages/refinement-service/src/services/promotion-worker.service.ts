import { Pool } from 'pg';
import {
  runGatesByTier,
  type QualityGate,
  type GateInput,
  executeTransitionSimple,
  LifecycleState,
  type StateTransition,
  type TransitionRepository,
} from '@polyladder/core';
import { recordTransition, moveItemToState } from '@polyladder/db';
import { logger } from '../utils/logger';

export interface CandidateRecord {
  id: string;
  dataType: string;
  normalizedData: unknown;
  draftId: string;
  createdAt: Date;
}

export class PromotionWorker {
  private pool: Pool;
  private gates: QualityGate[];

  constructor(pool: Pool, gates: QualityGate[]) {
    this.pool = pool;
    this.gates = gates;
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
        toState: LifecycleState
      ): Promise<void> {
        return await moveItemToState(pool, itemId, itemType, fromState, toState);
      },
    };
  }

  async processBatch(batchSize = 10): Promise<number> {
    // Find candidates that haven't been validated yet
    const result = await this.pool.query<CandidateRecord>(
      `SELECT id, data_type as "dataType", normalized_data as "normalizedData",
              draft_id as "draftId", created_at as "createdAt"
       FROM candidates
       WHERE id NOT IN (SELECT candidate_id FROM validated)
       ORDER BY created_at ASC
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
        logger.error({ candidateId: candidate.id, error }, 'Failed to process candidate');
      }
    }

    return processed;
  }

  private async processCandidate(candidate: CandidateRecord): Promise<void> {
    const input: GateInput = {
      content: candidate.normalizedData as Record<string, unknown>,
      metadata: {
        candidateId: candidate.id,
        dataType: candidate.dataType,
        draftId: candidate.draftId,
      },
    };

    // Run quality gates
    const gateResult = await runGatesByTier(this.gates, input);

    if (gateResult.allPassed) {
      // Transition to VALIDATED
      const transitionRepo = this.createTransitionRepository();
      await executeTransitionSimple(transitionRepo, {
        itemId: candidate.id,
        itemType: candidate.dataType,
        fromState: LifecycleState.CANDIDATE,
        toState: LifecycleState.VALIDATED,
        metadata: {
          gateResults: gateResult.results,
          executionTimeMs: gateResult.executionTimeMs,
        },
      });

      logger.info(
        { candidateId: candidate.id, gates: gateResult.results.length },
        'Candidate promoted to VALIDATED'
      );
    } else {
      // Record failures
      await this.recordFailures(candidate.id, gateResult.results);

      logger.warn(
        { candidateId: candidate.id, failedAt: gateResult.failedAt },
        'Candidate failed quality gates'
      );
    }
  }

  private async recordFailures(
    candidateId: string,
    results: import('@polyladder/core').QualityGateResult[]
  ): Promise<void> {
    const failedResults = results.filter((r) => !r.passed);

    for (const result of failedResults) {
      await this.pool.query(
        `INSERT INTO validation_failures (candidate_id, gate_name, failure_reason, failure_details)
         VALUES ($1, $2, $3, $4)`,
        [candidateId, result.gateName, result.message, JSON.stringify(result.details ?? {})]
      );
    }
  }
}
