import { Pool } from 'pg';
import { NormalizationStep } from './steps/normalization.step';
import { ValidationStep, ValidationRepository } from './steps/validation.step';
import { ApprovalStep, ApprovalRepository } from './steps/approval.step';
import { PipelineItem, PipelineResult, PipelineStage, PipelineConfig } from './types';
import { logger } from '../utils/logger';
import { PipelineEventLogger } from '../services/pipeline-event-logger.service';

export interface PipelineRepository {
  fetchDrafts(limit: number): Promise<PipelineItem[]>;
  fetchCandidates(limit: number): Promise<PipelineItem[]>;
  fetchValidated(limit: number): Promise<PipelineItem[]>;
  moveToCandidates(item: PipelineItem): Promise<void>;
  moveToValidated(item: PipelineItem): Promise<void>;
  copyToApproved(item: PipelineItem): Promise<string>;
  deleteDraft(itemId: string): Promise<void>;
  deleteCandidate(itemId: string): Promise<void>;
  deleteValidated(itemId: string): Promise<void>;
  recordFailure(
    itemId: string,
    dataType: string,
    state: string,
    errorMessage: string
  ): Promise<void>;
  getNormalizationFailureCount(itemId: string): Promise<number>;
  recordMetrics(
    stage: string,
    dataType: string,
    processed: number,
    failed: number,
    avgDurationMs: number
  ): Promise<void>;
}

export class PipelineOrchestrator {
  private normalization: NormalizationStep;
  private validation: ValidationStep;
  private approval: ApprovalStep;
  private eventLogger: PipelineEventLogger;

  constructor(
    private readonly repository: PipelineRepository,
    validationRepository: ValidationRepository,
    approvalRepository: ApprovalRepository,
    pool: Pool,
    private readonly config: PipelineConfig
  ) {
    this.normalization = new NormalizationStep();
    this.validation = new ValidationStep(validationRepository);
    this.approval = new ApprovalStep(approvalRepository, config.autoApproval);
    this.eventLogger = new PipelineEventLogger(pool);
  }

  async processBatch(): Promise<void> {
    const batchSize = this.config.batchSize;

    const draftItems = await this.repository.fetchDrafts(batchSize);
    for (const item of draftItems) {
      await this.processItem(item);
    }

    const candidateItems = await this.repository.fetchCandidates(batchSize);
    for (const item of candidateItems) {
      await this.processItem(item);
    }

    if (this.config.autoApproval) {
      const validatedItems = await this.repository.fetchValidated(batchSize);
      for (const item of validatedItems) {
        await this.processItem(item);
      }
    }
  }

  async processItem(item: PipelineItem): Promise<PipelineResult> {
    const startTime = Date.now();
    let attempts = 0;

    while (attempts < this.config.retryAttempts) {
      try {
        logger.info({ itemId: item.id, state: item.currentState }, 'Processing pipeline item');

        switch (item.currentState) {
          case PipelineStage.DRAFT:
            return await this.promoteToCandidateWithMetrics(item, startTime);

          case PipelineStage.CANDIDATE:
            return await this.promoteToValidatedWithMetrics(item, startTime);

          case PipelineStage.VALIDATED:
            return await this.promoteToApprovedWithMetrics(item, startTime);

          default:
            throw new Error(`Unknown pipeline state: ${item.currentState}`);
        }
      } catch (error) {
        attempts++;
        logger.warn(
          { itemId: item.id, attempt: attempts, error: (error as Error).message },
          'Pipeline step failed'
        );

        if (attempts >= this.config.retryAttempts) {
          await this.repository.recordFailure(
            item.id,
            item.dataType,
            item.currentState,
            (error as Error).message
          );

          return {
            success: false,
            newState: item.currentState,
            errors: [(error as Error).message],
            metrics: { durationMs: Date.now() - startTime, stage: item.currentState },
          };
        }

        await this.sleep(Math.pow(2, attempts) * 1000);
      }
    }

    return {
      success: false,
      newState: item.currentState,
      errors: ['Max retries exceeded'],
      metrics: { durationMs: Date.now() - startTime, stage: item.currentState },
    };
  }

  private async promoteToCandidateWithMetrics(
    item: PipelineItem,
    startTime: number
  ): Promise<PipelineResult> {
    const result = this.normalization.normalize(item);

    if (!result.success) {
      const failureCount = await this.repository.getNormalizationFailureCount(item.id);
      const maxFailures = 3;

      logger.warn(
        {
          itemId: item.id,
          dataType: item.dataType,
          errors: result.errors,
          failureCount,
          data: item.data,
        },
        'Normalization failed'
      );

      const errorMessage = result.errors?.join('; ') || 'Normalization failed';
      await this.repository.recordFailure(
        item.id,
        item.dataType,
        PipelineStage.DRAFT,
        errorMessage
      );

      if (failureCount + 1 >= maxFailures) {
        await this.repository.deleteDraft(item.id);
        logger.error(
          { itemId: item.id, failureCount: failureCount + 1, errors: result.errors },
          'Draft deleted after repeated normalization failures'
        );
        await this.repository.recordMetrics(
          'normalization',
          item.dataType,
          0,
          1,
          Date.now() - startTime
        );
        return {
          success: false,
          newState: PipelineStage.DRAFT,
          errors: result.errors,
          metrics: { durationMs: Date.now() - startTime, stage: 'normalization' },
        };
      }

      await this.repository.recordMetrics(
        'normalization',
        item.dataType,
        0,
        1,
        Date.now() - startTime
      );
      return {
        success: false,
        newState: PipelineStage.DRAFT,
        errors: result.errors,
        metrics: { durationMs: Date.now() - startTime, stage: 'normalization' },
      };
    }

    await this.repository.moveToCandidates(item);

    await this.repository.recordMetrics(
      'normalization',
      item.dataType,
      1,
      0,
      Date.now() - startTime
    );

    await this.eventLogger.logEvent({
      itemId: item.id,
      itemType: 'draft',
      eventType: 'stage_transition',
      fromStage: 'DRAFT',
      toStage: 'CANDIDATE',
      fromStatus: 'processing',
      toStatus: 'completed',
      stage: 'CANDIDATE',
      status: 'completed',
      success: true,
      durationMs: Date.now() - startTime,
      payload: { operation: 'normalization', dataType: item.dataType },
    });

    logger.info({ itemId: item.id }, 'Promoted to CANDIDATE');

    return {
      success: true,
      newState: PipelineStage.CANDIDATE,
      metrics: { durationMs: Date.now() - startTime, stage: 'normalization' },
    };
  }

  private async promoteToValidatedWithMetrics(
    item: PipelineItem,
    startTime: number
  ): Promise<PipelineResult> {
    const result = await this.validation.validate(item);

    if (!result.success) {
      await this.repository.recordMetrics(
        'validation',
        item.dataType,
        0,
        1,
        Date.now() - startTime
      );
      return {
        success: false,
        newState: PipelineStage.CANDIDATE,
        errors: result.errors,
        metrics: { durationMs: Date.now() - startTime, stage: 'validation' },
      };
    }

    await this.repository.moveToValidated(item);
    await this.repository.deleteCandidate(item.id);

    await this.repository.recordMetrics('validation', item.dataType, 1, 0, Date.now() - startTime);

    await this.eventLogger.logEvent({
      itemId: item.id,
      itemType: 'candidate',
      eventType: 'stage_transition',
      fromStage: 'CANDIDATE',
      toStage: 'VALIDATED',
      fromStatus: 'processing',
      toStatus: 'completed',
      stage: 'VALIDATED',
      status: 'completed',
      success: true,
      durationMs: Date.now() - startTime,
      payload: { operation: 'validation', dataType: item.dataType },
    });

    logger.info({ itemId: item.id }, 'Promoted to VALIDATED');

    return {
      success: true,
      newState: PipelineStage.VALIDATED,
      metrics: { durationMs: Date.now() - startTime, stage: 'validation' },
    };
  }

  private async promoteToApprovedWithMetrics(
    item: PipelineItem,
    startTime: number
  ): Promise<PipelineResult> {
    const result = await this.approval.approve(item);

    if (!result.success) {
      await this.repository.recordMetrics('approval', item.dataType, 0, 1, Date.now() - startTime);
      return {
        success: false,
        newState: PipelineStage.VALIDATED,
        errors: result.errors,
        metrics: { durationMs: Date.now() - startTime, stage: 'approval' },
      };
    }

    await this.repository.copyToApproved(item);
    await this.repository.deleteValidated(item.id);

    await this.repository.recordMetrics('approval', item.dataType, 1, 0, Date.now() - startTime);

    logger.info({ itemId: item.id }, 'Promoted to APPROVED');

    return {
      success: true,
      newState: PipelineStage.APPROVED,
      metrics: { durationMs: Date.now() - startTime, stage: 'approval' },
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export function createPipelineRepository(pool: Pool): PipelineRepository {
  async function fetchItems(
    tableName: string,
    limit: number,
    state: PipelineStage
  ): Promise<PipelineItem[]> {
    const dataColumn =
      tableName === 'drafts'
        ? 'raw_data'
        : tableName === 'candidates'
          ? 'normalized_data'
          : 'validated_data';

    const result = await pool.query<{
      id: string;
      data_type: string;
      data: unknown;
    }>(
      `SELECT id, data_type, ${dataColumn} as data
       FROM ${tableName}
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => {
      let data: Record<string, unknown> = {};
      if (row.data) {
        if (typeof row.data === 'string') {
          try {
            data = JSON.parse(row.data) as Record<string, unknown>;
          } catch {
            data = {};
          }
        } else if (typeof row.data === 'object' && row.data !== null) {
          data = row.data as Record<string, unknown>;
        }
      }

      return {
        id: row.id,
        dataType: row.data_type,
        currentState: state,
        data,
      };
    });
  }

  return {
    async fetchDrafts(limit: number): Promise<PipelineItem[]> {
      return fetchItems('drafts', limit, PipelineStage.DRAFT);
    },

    async fetchCandidates(limit: number): Promise<PipelineItem[]> {
      return fetchItems('candidates', limit, PipelineStage.CANDIDATE);
    },

    async fetchValidated(limit: number): Promise<PipelineItem[]> {
      return fetchItems('validated', limit, PipelineStage.VALIDATED);
    },

    async moveToCandidates(item: PipelineItem): Promise<void> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          `INSERT INTO candidates (data_type, normalized_data, draft_id)
           VALUES ($1, $2, $3)`,
          [item.dataType, JSON.stringify(item.data), item.id]
        );

        await client.query(`DELETE FROM drafts WHERE id = $1`, [item.id]);

        // Update pipeline_tasks to track DRAFT → CANDIDATE transition
        await client.query(
          `UPDATE pipeline_tasks
           SET current_stage = 'CANDIDATE', updated_at = CURRENT_TIMESTAMP
           WHERE item_id = $1 AND current_stage = 'DRAFT'`,
          [item.id]
        );

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async moveToValidated(item: PipelineItem): Promise<void> {
      const candidateId = item.id;

      // Get draft_id from candidate before it gets deleted
      const candidateResult = await pool.query<{ draft_id: string }>(
        `SELECT draft_id FROM candidates WHERE id = $1`,
        [candidateId]
      );
      const draftId = candidateResult.rows[0]?.draft_id;

      // Store draft_id in validated_data so we can track it to APPROVED stage
      const validatedData = { ...item.data, __draft_id: draftId };

      await pool.query(
        `INSERT INTO validated (data_type, validated_data, candidate_id, validation_results)
         VALUES ($1, $2, $3, $4)`,
        [
          item.dataType,
          JSON.stringify(validatedData),
          candidateId,
          JSON.stringify({ passed: true }),
        ]
      );

      // Update pipeline_tasks to track CANDIDATE → VALIDATED transition
      if (draftId) {
        await pool.query(
          `UPDATE pipeline_tasks
           SET current_stage = 'VALIDATED', updated_at = CURRENT_TIMESTAMP
           WHERE item_id = $1 AND current_stage = 'CANDIDATE'`,
          [draftId]
        );
      }
    },

    async copyToApproved(item: PipelineItem): Promise<string> {
      const data = item.data;
      const draftId = data.__draft_id as string | undefined;
      let result;

      switch (item.dataType) {
        case 'meaning':
          result = await pool.query<{ id: string }>(
            `INSERT INTO approved_meanings (language, level, text, definition, part_of_speech, usage_notes)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [
              data.language,
              data.level,
              data.word,
              data.definition,
              data.partOfSpeech ?? 'unknown',
              data.usageNotes ?? null,
            ]
          );
          break;

        case 'utterance':
          result = await pool.query<{ id: string }>(
            `INSERT INTO approved_utterances (language, meaning_id, text, translation, audio_url, phonetic)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [data.language, data.meaningId, data.text, data.translation ?? null, null, null]
          );
          break;

        case 'rule':
          result = await pool.query<{ id: string }>(
            `INSERT INTO approved_rules (language, level, topic, category, explanation, examples, prerequisites)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [
              data.language,
              data.level,
              data.title,
              data.category ?? 'general',
              data.explanation,
              JSON.stringify(data.examples),
              null,
            ]
          );
          break;

        case 'exercise':
          result = await pool.query<{ id: string }>(
            `INSERT INTO approved_exercises (language, level, exercise_type, question, correct_answer, alternatives, source_utterance_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [
              data.language,
              data.level,
              'multiple_choice',
              data.prompt,
              data.correctIndex,
              JSON.stringify(data.options),
              null,
            ]
          );
          break;

        default:
          throw new Error(`Unknown data type: ${item.dataType}`);
      }

      // Update pipeline_tasks to track VALIDATED → APPROVED transition
      if (draftId) {
        await pool.query(
          `UPDATE pipeline_tasks
           SET current_stage = 'APPROVED', updated_at = CURRENT_TIMESTAMP
           WHERE item_id = $1 AND current_stage = 'VALIDATED'`,
          [draftId]
        );
      }

      return result.rows[0].id;
    },

    async deleteDraft(itemId: string): Promise<void> {
      await pool.query('DELETE FROM drafts WHERE id = $1', [itemId]);
    },

    async deleteCandidate(itemId: string): Promise<void> {
      await pool.query('DELETE FROM candidates WHERE id = $1', [itemId]);
    },

    async deleteValidated(itemId: string): Promise<void> {
      await pool.query(
        `DELETE FROM validated WHERE candidate_id IN (SELECT id FROM candidates WHERE draft_id = $1)`,
        [itemId]
      );
    },

    async recordFailure(
      itemId: string,
      dataType: string,
      state: string,
      errorMessage: string
    ): Promise<void> {
      await pool.query(
        `INSERT INTO pipeline_failures (item_id, data_type, state, error_message)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [itemId, dataType, state, errorMessage]
      );
    },

    async getNormalizationFailureCount(itemId: string): Promise<number> {
      const result = await pool.query<{ count: string }>(
        `SELECT COUNT(*) as count
         FROM pipeline_failures
         WHERE item_id = $1 AND state = 'DRAFT'`,
        [itemId]
      );
      return parseInt(result.rows[0]?.count || '0', 10);
    },

    async recordMetrics(
      stage: string,
      dataType: string,
      processed: number,
      failed: number,
      avgDurationMs: number
    ): Promise<void> {
      await pool.query(
        `INSERT INTO pipeline_metrics (stage, data_type, items_processed, items_failed, avg_duration_ms)
         VALUES ($1, $2, $3, $4, $5)`,
        [stage, dataType, processed, failed, Math.round(avgDurationMs)]
      );
    },
  };
}
