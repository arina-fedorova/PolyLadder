import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

interface RetryJob {
  id: string;
  item_id: string;
  item_type: string;
  comment: string;
  category: string;
  suggested_correction: string | null;
}

export class FeedbackRetryService {
  private client: Anthropic;

  constructor(
    private readonly pool: Pool,
    apiKey: string
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async processPendingRetries(): Promise<number> {
    const retries = await this.getPendingRetries(5);
    let processed = 0;

    for (const retry of retries) {
      try {
        await this.markRetryProcessing(retry.id);
        await this.retryWithFeedback(retry);
        await this.markRetryComplete(retry.id, true);
        processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.markRetryComplete(retry.id, false, errorMessage);
        logger.error({ retryId: retry.id, error }, 'Retry failed');
      }
    }

    return processed;
  }

  private async retryWithFeedback(retry: RetryJob): Promise<void> {
    const originalData = await this.getOriginalData(retry.item_id, retry.item_type);
    const feedbackHistory = await this.getFeedbackHistory(retry.item_id);

    const prompt = this.buildFeedbackAwarePrompt(originalData, feedbackHistory, retry);

    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const improved = this.parseImprovedContent(content.text);
    await this.updateItem(retry.item_id, retry.item_type, improved);

    logger.info({ retryId: retry.id, itemId: retry.item_id }, 'Item improved with feedback');
  }

  private buildFeedbackAwarePrompt(
    originalData: unknown,
    feedbackHistory: unknown[],
    currentFeedback: RetryJob
  ): string {
    const feedbackSummary = (feedbackHistory as Array<{ category: string; comment: string }>)
      .map((f) => `- [${f.category}] ${f.comment}`)
      .join('\n');

    return `You are improving language learning content based on operator feedback.

## Original Content:
${JSON.stringify(originalData, null, 2)}

## Feedback History:
${feedbackSummary}

## Current Issue:
Category: ${currentFeedback.category}
Comment: ${currentFeedback.comment}
${currentFeedback.suggested_correction ? `Suggested Fix: ${currentFeedback.suggested_correction}` : ''}

## Instructions:
1. Carefully review the feedback
2. Fix the issues mentioned
3. Maintain the same format as the original
4. Do NOT change content that wasn't flagged

## Output:
Return the improved content in the exact same JSON format as the original.`;
  }

  private async getOriginalData(itemId: string, itemType: string): Promise<unknown> {
    const tableName =
      itemType === 'draft'
        ? 'drafts'
        : itemType === 'candidate'
          ? 'candidates'
          : 'content_topic_mappings';

    const result = await this.pool.query(`SELECT * FROM ${tableName} WHERE id = $1`, [itemId]);

    if (result.rows.length === 0) {
      throw new Error(`Item not found: ${itemId}`);
    }

    return result.rows[0];
  }

  private async getFeedbackHistory(itemId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT f.*, u.email as operator_email
       FROM operator_feedback f
       JOIN users u ON f.operator_id = u.id
       WHERE f.item_id = $1
       ORDER BY f.created_at DESC`,
      [itemId]
    );
    return result.rows as Array<{
      id: string;
      item_id: string;
      item_type: string;
      feedback_id: string;
      comment: string;
      category: string;
      suggested_correction: string | null;
    }>;
  }

  private parseImprovedContent(response: string): unknown {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    return JSON.parse(jsonMatch[0]);
  }

  private async updateItem(itemId: string, itemType: string, improved: unknown): Promise<void> {
    if (itemType === 'draft') {
      await this.pool.query(
        `UPDATE drafts SET raw_data = $1, status = 'pending', updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [JSON.stringify(improved), itemId]
      );
    } else if (itemType === 'candidate') {
      await this.pool.query(
        `UPDATE candidates SET normalized_data = $1, status = 'pending', updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [JSON.stringify(improved), itemId]
      );
    }
  }

  private async getPendingRetries(limit: number): Promise<RetryJob[]> {
    const result = await this.pool.query(
      `SELECT r.id, r.item_id, r.item_type, f.comment, f.category, f.suggested_correction
       FROM retry_queue r
       JOIN operator_feedback f ON r.feedback_id = f.id
       WHERE r.status = 'pending'
         AND r.retry_count < r.max_retries
         AND r.scheduled_at <= CURRENT_TIMESTAMP
       ORDER BY r.scheduled_at
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row: {
      id: unknown;
      item_id: unknown;
      item_type: unknown;
      comment: unknown;
      category: unknown;
      suggested_correction: unknown;
    }) => ({
      id: row.id as string,
      item_id: row.item_id as string,
      item_type: row.item_type as string,
      comment: row.comment as string,
      category: row.category as string,
      suggested_correction: (row.suggested_correction as string) || null,
    }));
  }

  private async markRetryProcessing(retryId: string): Promise<void> {
    await this.pool.query(
      `UPDATE retry_queue 
       SET status = 'processing', retry_count = retry_count + 1
       WHERE id = $1`,
      [retryId]
    );
  }

  private async markRetryComplete(retryId: string, success: boolean, error?: string): Promise<void> {
    await this.pool.query(
      `UPDATE retry_queue 
       SET status = $1, processed_at = CURRENT_TIMESTAMP, error_message = $2
       WHERE id = $3`,
      [success ? 'completed' : 'failed', error, retryId]
    );
  }
}

