import { Pool } from 'pg';
import { PipelineItem, StepResult } from '../types';
import { logger } from '../../utils/logger';

export interface ApprovalRepository {
  getApprovedCount(dataType: string, language: string): Promise<number>;
  queueForReview(itemId: string, dataType: string, priority: number): Promise<void>;
}

export class ApprovalStep {
  constructor(
    private readonly repository: ApprovalRepository,
    private readonly autoApprovalEnabled: boolean
  ) {}

  async approve(item: PipelineItem): Promise<StepResult> {
    try {
      const needsReview = await this.requiresManualReview(item);

      if (needsReview && !this.autoApprovalEnabled) {
        const priority = this.calculatePriority(item);
        await this.repository.queueForReview(item.id, item.dataType, priority);

        logger.info({ itemId: item.id, dataType: item.dataType }, 'Queued for manual review');

        return {
          success: false,
          errors: ['Item requires manual operator review'],
        };
      }

      logger.info({ itemId: item.id, dataType: item.dataType }, 'Auto-approved');

      return { success: true };
    } catch (error) {
      return { success: false, errors: [(error as Error).message] };
    }
  }

  private async requiresManualReview(item: PipelineItem): Promise<boolean> {
    const sourceMetadata = item.data.sourceMetadata as Record<string, unknown> | undefined;
    if (sourceMetadata?.confidence && Number(sourceMetadata.confidence) < 0.7) {
      return true;
    }

    if (item.dataType === 'rule' || item.dataType === 'exercise') {
      return true;
    }

    const language = String(item.data.language);
    const approvedCount = await this.repository.getApprovedCount(item.dataType, language);

    if (approvedCount < 10) {
      return true;
    }

    if (Math.random() < 0.1) {
      return true;
    }

    return false;
  }

  private calculatePriority(item: PipelineItem): number {
    if (item.dataType === 'rule' && item.data.category === 'orthography') {
      return 1;
    }

    if (item.dataType === 'meaning') {
      return 2;
    }

    if (item.dataType === 'utterance') {
      return 3;
    }

    if (item.dataType === 'rule') {
      return 4;
    }

    if (item.dataType === 'exercise') {
      return 5;
    }

    return 10;
  }
}

export function createApprovalRepository(pool: Pool): ApprovalRepository {
  return {
    async getApprovedCount(dataType: string, language: string): Promise<number> {
      const tableMap: Record<string, string> = {
        meaning: 'approved_meanings',
        utterance: 'approved_utterances',
        rule: 'approved_rules',
        exercise: 'approved_exercises',
      };

      const table = tableMap[dataType];
      if (!table) return 0;

      const result = await pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM ${table} WHERE language = $1`,
        [language]
      );

      return parseInt(result.rows[0].count, 10);
    },

    async queueForReview(itemId: string, dataType: string, priority: number): Promise<void> {
      await pool.query(
        `INSERT INTO review_queue (item_id, data_type, queued_at, priority)
         VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
         ON CONFLICT (item_id) DO UPDATE SET priority = $3`,
        [itemId, dataType, priority]
      );
    },
  };
}
