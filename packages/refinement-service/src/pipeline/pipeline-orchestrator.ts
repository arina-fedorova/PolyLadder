import { Pool } from 'pg';
import { NormalizationStep } from './steps/normalization.step';
import { ValidationStep, ValidationRepository } from './steps/validation.step';
import { ApprovalStep, ApprovalRepository } from './steps/approval.step';
import { PipelineItem, PipelineResult, PipelineStage, PipelineConfig } from './types';
import { logger } from '../utils/logger';

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

  constructor(
    private readonly repository: PipelineRepository,
    validationRepository: ValidationRepository,
    approvalRepository: ApprovalRepository,
    private readonly config: PipelineConfig
  ) {
    this.normalization = new NormalizationStep();
    this.validation = new ValidationStep(validationRepository);
    this.approval = new ApprovalStep(approvalRepository, config.autoApproval);
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
      logger.warn(
        { itemId: item.id, dataType: item.dataType, errors: result.errors, data: item.data },
        'Normalization failed'
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

    await this.repository.moveToCandidates(item);
    await this.repository.deleteDraft(item.id);

    await this.repository.recordMetrics(
      'normalization',
      item.dataType,
      1,
      0,
      Date.now() - startTime
    );

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
      await pool.query(
        `INSERT INTO candidates (data_type, normalized_data, draft_id)
         VALUES ($1, $2, $3)`,
        [item.dataType, JSON.stringify(item.data), item.id]
      );
    },

    async moveToValidated(item: PipelineItem): Promise<void> {
      const candidateResult = await pool.query<{ id: string }>(
        `SELECT id FROM candidates WHERE draft_id = $1`,
        [item.id]
      );

      const candidateId = candidateResult.rows[0]?.id ?? item.id;

      await pool.query(
        `INSERT INTO validated (data_type, validated_data, candidate_id, validation_results)
         VALUES ($1, $2, $3, $4)`,
        [item.dataType, JSON.stringify(item.data), candidateId, JSON.stringify({ passed: true })]
      );
    },

    async copyToApproved(item: PipelineItem): Promise<string> {
      const data = item.data;
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

      return result.rows[0].id;
    },

    async deleteDraft(itemId: string): Promise<void> {
      await pool.query('DELETE FROM drafts WHERE id = $1', [itemId]);
    },

    async deleteCandidate(itemId: string): Promise<void> {
      await pool.query('DELETE FROM candidates WHERE draft_id = $1', [itemId]);
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
         VALUES ($1, $2, $3, $4)`,
        [itemId, dataType, state, errorMessage]
      );
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
