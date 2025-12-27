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
  private gates: QualityGate[];
  private eventLogger: PipelineEventLogger;

  constructor(pool: Pool, gates: QualityGate[]) {
    this.pool = pool;
    this.gates = gates;
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
    const normalizedData = candidate.normalizedData as Record<string, unknown>;
    const text = this.extractTextFromNormalizedData(normalizedData);
    const language = (normalizedData.language as string) ?? 'EN';
    const level = (normalizedData.level as string) ?? 'A1';

    const input: GateInput = {
      text,
      language,
      contentType: candidate.dataType,
      metadata: {
        candidateId: candidate.id,
        dataType: candidate.dataType,
        draftId: candidate.draftId,
        level,
      },
    };

    // Run quality gates
    const gateResult = await runGatesByTier(this.gates, input);

    if (gateResult.allPassed) {
      // Move candidate to validated table
      await this.pool.query(
        `INSERT INTO validated (data_type, validated_data, candidate_id, validation_results)
         VALUES ($1, $2, $3, $4)`,
        [
          candidate.dataType,
          JSON.stringify(candidate.normalizedData),
          candidate.id,
          JSON.stringify({ passed: true, gateResults: gateResult.results }),
        ]
      );

      // Delete candidate
      await this.pool.query('DELETE FROM candidates WHERE id = $1', [candidate.id]);

      // Update pipeline_tasks to track CANDIDATE → VALIDATED transition
      await this.pool.query(
        `UPDATE pipeline_tasks
         SET current_stage = 'VALIDATED', updated_at = CURRENT_TIMESTAMP
         WHERE item_id = $1 AND current_stage = 'CANDIDATE'`,
        [candidate.draftId]
      );

      // Record transition
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

      await this.eventLogger.logEvent({
        itemId: candidate.id,
        itemType: 'candidate',
        eventType: 'quality_gates_passed',
        fromStage: 'CANDIDATE',
        toStage: 'VALIDATED',
        fromStatus: 'processing',
        toStatus: 'completed',
        stage: 'VALIDATED',
        status: 'completed',
        success: true,
        durationMs: gateResult.executionTimeMs,
        payload: {
          gateResults: gateResult.results,
          gatesPassed: gateResult.results.length,
        },
      });

      logger.info(
        { candidateId: candidate.id, gates: gateResult.results.length },
        'Candidate promoted to VALIDATED'
      );
    } else {
      // Record failures
      await this.recordFailures(candidate.id, gateResult.results);

      await this.eventLogger.logEvent({
        itemId: candidate.id,
        itemType: 'candidate',
        eventType: 'quality_gates_failed',
        stage: 'CANDIDATE',
        status: 'failed',
        fromStatus: 'processing',
        toStatus: 'failed',
        success: false,
        errorMessage: `Failed at gate: ${gateResult.failedAt}`,
        durationMs: gateResult.executionTimeMs,
        payload: {
          gateResults: gateResult.results,
          failedAt: gateResult.failedAt,
        },
      });

      logger.warn(
        { candidateId: candidate.id, failedAt: gateResult.failedAt },
        'Candidate failed quality gates'
      );
    }
  }

  private extractTextFromNormalizedData(normalizedData: Record<string, unknown>): string {
    if (typeof normalizedData.text === 'string') {
      return normalizedData.text;
    }
    if (typeof normalizedData.content === 'string') {
      return normalizedData.content;
    }
    if (typeof normalizedData.prompt === 'string') {
      return normalizedData.prompt;
    }
    if (typeof normalizedData.title === 'string') {
      return normalizedData.title;
    }
    if (typeof normalizedData.explanation === 'string') {
      return normalizedData.explanation;
    }
    if (Array.isArray(normalizedData.examples) && normalizedData.examples.length > 0) {
      return String(normalizedData.examples[0]);
    }
    return JSON.stringify(normalizedData);
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
        [
          candidateId,
          result.gateName,
          result.reason ?? 'Validation failed',
          JSON.stringify(result.details ?? {}),
        ]
      );
    }
  }
}
