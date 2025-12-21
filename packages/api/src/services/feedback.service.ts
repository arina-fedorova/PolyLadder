import { Pool, PoolClient } from 'pg';

export interface CreateFeedbackInput {
  itemId: string;
  itemType: 'draft' | 'candidate' | 'mapping';
  operatorId: string;
  action: 'reject' | 'revise' | 'flag';
  category: string;
  comment: string;
  suggestedCorrection?: string;
}

export interface FeedbackStats {
  totalFeedback: number;
  byCategory: Record<string, number>;
  byOperator: Record<string, number>;
  retrySuccessRate: number;
}

export class FeedbackService {
  constructor(private readonly pool: Pool) {}

  async createFeedback(input: CreateFeedbackInput): Promise<string> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      await this.saveCurrentVersion(client, input.itemId, input.itemType);

      const feedbackResult = await client.query(
        `INSERT INTO operator_feedback 
         (item_id, item_type, operator_id, action, category, comment, suggested_correction)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          input.itemId,
          input.itemType,
          input.operatorId,
          input.action,
          input.category,
          input.comment,
          input.suggestedCorrection,
        ]
      );

      const feedbackId = (feedbackResult.rows[0] as { id: string }).id;

      if (input.action === 'reject' || input.action === 'revise') {
        await client.query(
          `INSERT INTO retry_queue (item_id, item_type, feedback_id)
           VALUES ($1, $2, $3)`,
          [input.itemId, input.itemType, feedbackId]
        );
      }

      if (input.action === 'reject') {
        await this.updateItemStatus(client, input.itemId, input.itemType, 'rejected');
      }

      await client.query('COMMIT');
      return feedbackId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getFeedbackForItem(itemId: string): Promise<unknown[]> {
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
      operator_id: string;
      action: string;
      category: string;
      comment: string;
      suggested_correction: string | null;
      created_at: Date;
      operator_email: string;
    }>;
  }

  async getItemVersions(itemId: string): Promise<Array<{
    id: string;
    item_id: string;
    item_type: string;
    version_number: number;
    data: unknown;
    source: string;
    feedback_id: string | null;
    feedback_comment: string | null;
    created_at: Date;
  }>> {
    const result = await this.pool.query(
      `SELECT v.*, f.comment as feedback_comment
       FROM item_versions v
       LEFT JOIN operator_feedback f ON v.feedback_id = f.id
       WHERE v.item_id = $1
       ORDER BY v.version_number DESC`,
      [itemId]
    );
    return result.rows as Array<{
      id: string;
      item_id: string;
      item_type: string;
      version_number: number;
      data: unknown;
      source: string;
      feedback_id: string | null;
      feedback_comment: string | null;
      created_at: Date;
    }>;
  }

  async getPendingRetries(limit: number = 10): Promise<Array<{
    id: string;
    item_id: string;
    item_type: string;
    feedback_id: string;
    status: string;
    retry_count: number;
    max_retries: number;
    scheduled_at: Date;
    created_at: Date;
  }>> {
    const result = await this.pool.query(
      `SELECT r.*, f.comment, f.category, f.suggested_correction
       FROM retry_queue r
       JOIN operator_feedback f ON r.feedback_id = f.id
       WHERE r.status = 'pending'
         AND r.retry_count < r.max_retries
         AND r.scheduled_at <= CURRENT_TIMESTAMP
       ORDER BY r.scheduled_at
       LIMIT $1`,
      [limit]
    );
    return result.rows as Array<{
      id: string;
      item_id: string;
      item_type: string;
      feedback_id: string;
      status: string;
      retry_count: number;
      max_retries: number;
      scheduled_at: Date;
      created_at: Date;
    }>;
  }

  async markRetryProcessing(retryId: string): Promise<void> {
    await this.pool.query(
      `UPDATE retry_queue 
       SET status = 'processing', retry_count = retry_count + 1
       WHERE id = $1`,
      [retryId]
    );
  }

  async markRetryComplete(retryId: string, success: boolean, error?: string): Promise<void> {
    await this.pool.query(
      `UPDATE retry_queue 
       SET status = $1, processed_at = CURRENT_TIMESTAMP, error_message = $2
       WHERE id = $3`,
      [success ? 'completed' : 'failed', error, retryId]
    );
  }

  async getStats(days: number = 30): Promise<FeedbackStats> {
    const totalResult = await this.pool.query(
      `SELECT COUNT(*) FROM operator_feedback 
       WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '${String(days)} days'`
    );

    const categoryResult = await this.pool.query(
      `SELECT category, COUNT(*) as count
       FROM operator_feedback
       WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '${String(days)} days'
       GROUP BY category`
    );

    const operatorResult = await this.pool.query(
      `SELECT u.email, COUNT(*) as count
       FROM operator_feedback f
       JOIN users u ON f.operator_id = u.id
       WHERE f.created_at > CURRENT_TIMESTAMP - INTERVAL '${String(days)} days'
       GROUP BY u.email
       ORDER BY count DESC
       LIMIT 10`
    );

    const retryResult = await this.pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE status = 'completed') as success,
         COUNT(*) as total
       FROM retry_queue
       WHERE processed_at > CURRENT_TIMESTAMP - INTERVAL '${String(days)} days'`
    );

    const byCategory: Record<string, number> = {};
    categoryResult.rows.forEach((r) => {
      const row = r as { category: string; count: string };
      byCategory[row.category] = parseInt(row.count, 10);
    });

    const byOperator: Record<string, number> = {};
    operatorResult.rows.forEach((r) => {
      const row = r as { email: string; count: string };
      byOperator[row.email] = parseInt(row.count, 10);
    });

    const retrySuccess = retryResult.rows[0] as { success: string; total: string } | undefined;
    const successRate =
      retrySuccess && parseInt(retrySuccess.total, 10) > 0
        ? (parseInt(retrySuccess.success, 10) / parseInt(retrySuccess.total, 10)) * 100
        : 0;

    return {
      totalFeedback: parseInt((totalResult.rows[0] as { count: string }).count, 10),
      byCategory,
      byOperator,
      retrySuccessRate: successRate,
    };
  }

  private async saveCurrentVersion(
    client: PoolClient,
    itemId: string,
    itemType: string
  ): Promise<void> {
    const tableName = this.getTableName(itemType);

    const currentData = await client.query(`SELECT * FROM ${tableName} WHERE id = $1`, [itemId]);

    if (currentData.rows.length === 0) return;

    const versionResult = await client.query(
      `SELECT COALESCE(MAX(version_number), 0) as max_version
       FROM item_versions WHERE item_id = $1`,
      [itemId]
    );

    const nextVersion = parseInt((versionResult.rows[0] as { max_version: string }).max_version, 10) + 1;

    await client.query(
      `INSERT INTO item_versions (item_id, item_type, version_number, data, source)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        itemId,
        itemType,
        nextVersion,
        JSON.stringify(currentData.rows[0]),
        (currentData.rows[0] as { source?: string }).source,
      ]
    );
  }

  private async updateItemStatus(
    client: PoolClient,
    itemId: string,
    itemType: string,
    status: string
  ): Promise<void> {
    if (itemType === 'draft') {
      return;
    }

    const tableName = this.getTableName(itemType);

    const hasStatusColumn = await client.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = $1 AND column_name = 'status'`,
      [tableName]
    );

    if (hasStatusColumn.rows.length > 0) {
      await client.query(
        `UPDATE ${tableName} SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [status, itemId]
      );
    }
  }

  private getTableName(itemType: string): string {
    switch (itemType) {
      case 'draft':
        return 'drafts';
      case 'candidate':
        return 'candidates';
      case 'mapping':
        return 'content_topic_mappings';
      default:
        throw new Error(`Unknown item type: ${itemType}`);
    }
  }

  async getTemplates(category?: string): Promise<Array<{
    id: string;
    name: string;
    category: string;
    template_text: string;
    use_count: number;
    created_by: string;
    created_at: Date;
  }>> {
    let query = `SELECT * FROM feedback_templates`;
    const params: unknown[] = [];

    if (category) {
      query += ` WHERE category = $1`;
      params.push(category);
    }

    query += ` ORDER BY use_count DESC`;

    const result = await this.pool.query(query, params);
    return result.rows as Array<{
      id: string;
      name: string;
      category: string;
      template_text: string;
      use_count: number;
      created_by: string;
      created_at: Date;
    }>;
  }

  async createTemplate(input: {
    name: string;
    category: string;
    templateText: string;
    createdBy: string;
  }): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO feedback_templates (name, category, template_text, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [input.name, input.category, input.templateText, input.createdBy]
    );
    return (result.rows[0] as { id: string }).id;
  }

  async incrementTemplateUse(templateId: string): Promise<void> {
    await this.pool.query(`UPDATE feedback_templates SET use_count = use_count + 1 WHERE id = $1`, [
      templateId,
    ]);
  }
}

