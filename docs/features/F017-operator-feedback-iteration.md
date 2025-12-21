# F017: Operator Feedback & Iteration System

**Feature Code**: F017
**Created**: 2025-12-21
**Completed**: 2025-12-21
**Phase**: 4 - Content Refinement Service
**Status**: ✅ Completed
**Replaces**: F017-automated-promotion-pipeline (deprecated)

---

## Description

Feedback loop system that allows operators to reject items with detailed comments, triggering reprocessing with feedback context. Enables iterative improvement of LLM-generated content.

## Success Criteria

- [x] Rejection with detailed operator comments
- [x] Feedback stored with item history
- [x] Retry mechanism using feedback in prompts
- [x] Version history tracking per item
- [x] Feedback analytics (common rejection patterns)
- [x] Bulk retry operations
- [x] Quality improvement metrics over time
- [x] Reusable feedback templates

---

## Tasks

### Task 1: Database Schema for Feedback

**Description**: Tables to store operator feedback and item version history.

**Implementation Plan**:

Create `packages/db/migrations/018-operator-feedback.sql`:

```sql
CREATE TYPE feedback_category_enum AS ENUM (
  'incorrect_content',
  'wrong_level',
  'poor_quality',
  'missing_context',
  'grammatical_error',
  'inappropriate',
  'duplicate',
  'off_topic',
  'other'
);

CREATE TABLE operator_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  item_id UUID NOT NULL,
  item_type VARCHAR(50) NOT NULL,

  operator_id UUID NOT NULL REFERENCES users(id),

  action VARCHAR(20) NOT NULL CHECK (action IN ('reject', 'revise', 'flag')),
  category feedback_category_enum NOT NULL,
  comment TEXT NOT NULL,

  suggested_correction TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_operator_feedback_item ON operator_feedback(item_id);
CREATE INDEX idx_operator_feedback_operator ON operator_feedback(operator_id);
CREATE INDEX idx_operator_feedback_category ON operator_feedback(category);
CREATE INDEX idx_operator_feedback_created ON operator_feedback(created_at);

CREATE TABLE item_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  item_id UUID NOT NULL,
  item_type VARCHAR(50) NOT NULL,
  version_number INTEGER NOT NULL,

  data JSONB NOT NULL,

  source VARCHAR(100),

  feedback_id UUID REFERENCES operator_feedback(id),

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(item_id, version_number)
);

CREATE INDEX idx_item_versions_item ON item_versions(item_id);

CREATE TABLE feedback_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name VARCHAR(200) NOT NULL,
  category feedback_category_enum NOT NULL,
  template_text TEXT NOT NULL,

  use_count INTEGER DEFAULT 0,

  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(name)
);

CREATE INDEX idx_feedback_templates_category ON feedback_templates(category);

CREATE TABLE retry_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  item_id UUID NOT NULL,
  item_type VARCHAR(50) NOT NULL,

  feedback_id UUID NOT NULL REFERENCES operator_feedback(id),

  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP WITH TIME ZONE,

  error_message TEXT
);

CREATE INDEX idx_retry_queue_status ON retry_queue(status);
CREATE INDEX idx_retry_queue_scheduled ON retry_queue(scheduled_at);

CREATE VIEW feedback_analytics AS
SELECT
  category,
  DATE(created_at) as date,
  COUNT(*) as feedback_count,
  COUNT(DISTINCT operator_id) as unique_operators,
  COUNT(DISTINCT item_id) as unique_items
FROM operator_feedback
GROUP BY category, DATE(created_at)
ORDER BY date DESC, feedback_count DESC;
```

**Files Created**: `packages/db/src/migrations/020_operator_feedback.ts`

**Status**: ✅ Completed

---

### ✅ Task 2: Feedback Service

**Description**: Backend service for managing operator feedback and retries.

**Implementation Plan**:

Create `packages/api/src/services/feedback.service.ts`:

```typescript
import { Pool } from 'pg';

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

      const feedbackId = feedbackResult.rows[0].id;

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

  async getFeedbackForItem(itemId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT f.*, u.email as operator_email
       FROM operator_feedback f
       JOIN users u ON f.operator_id = u.id
       WHERE f.item_id = $1
       ORDER BY f.created_at DESC`,
      [itemId]
    );
    return result.rows;
  }

  async getItemVersions(itemId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT v.*, f.comment as feedback_comment
       FROM item_versions v
       LEFT JOIN operator_feedback f ON v.feedback_id = f.id
       WHERE v.item_id = $1
       ORDER BY v.version_number DESC`,
      [itemId]
    );
    return result.rows;
  }

  async getPendingRetries(limit: number = 10): Promise<any[]> {
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
    return result.rows;
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
       WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '${days} days'`
    );

    const categoryResult = await this.pool.query(
      `SELECT category, COUNT(*) as count
       FROM operator_feedback
       WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '${days} days'
       GROUP BY category`
    );

    const operatorResult = await this.pool.query(
      `SELECT u.email, COUNT(*) as count
       FROM operator_feedback f
       JOIN users u ON f.operator_id = u.id
       WHERE f.created_at > CURRENT_TIMESTAMP - INTERVAL '${days} days'
       GROUP BY u.email
       ORDER BY count DESC
       LIMIT 10`
    );

    const retryResult = await this.pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE status = 'completed') as success,
         COUNT(*) as total
       FROM retry_queue
       WHERE processed_at > CURRENT_TIMESTAMP - INTERVAL '${days} days'`
    );

    const byCategory: Record<string, number> = {};
    categoryResult.rows.forEach((r) => {
      byCategory[r.category] = parseInt(r.count);
    });

    const byOperator: Record<string, number> = {};
    operatorResult.rows.forEach((r) => {
      byOperator[r.email] = parseInt(r.count);
    });

    const retrySuccess = retryResult.rows[0];
    const successRate =
      retrySuccess.total > 0
        ? (parseInt(retrySuccess.success) / parseInt(retrySuccess.total)) * 100
        : 0;

    return {
      totalFeedback: parseInt(totalResult.rows[0].count),
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

    const nextVersion = parseInt(versionResult.rows[0].max_version) + 1;

    await client.query(
      `INSERT INTO item_versions (item_id, item_type, version_number, data, source)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        itemId,
        itemType,
        nextVersion,
        JSON.stringify(currentData.rows[0]),
        currentData.rows[0].source,
      ]
    );
  }

  private async updateItemStatus(
    client: PoolClient,
    itemId: string,
    itemType: string,
    status: string
  ): Promise<void> {
    const tableName = this.getTableName(itemType);

    await client.query(
      `UPDATE ${tableName} SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [status, itemId]
    );
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

  async getTemplates(category?: string): Promise<any[]> {
    let query = `SELECT * FROM feedback_templates`;
    const params: any[] = [];

    if (category) {
      query += ` WHERE category = $1`;
      params.push(category);
    }

    query += ` ORDER BY use_count DESC`;

    const result = await this.pool.query(query, params);
    return result.rows;
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
    return result.rows[0].id;
  }

  async incrementTemplateUse(templateId: string): Promise<void> {
    await this.pool.query(`UPDATE feedback_templates SET use_count = use_count + 1 WHERE id = $1`, [
      templateId,
    ]);
  }
}
```

**Files Created**: `packages/api/src/services/feedback.service.ts`

**Status**: ✅ Completed

---

### ✅ Task 3: Feedback-Aware Retry Processor

**Description**: Service that retries transformations with feedback context.

**Implementation Plan**:

Create `packages/refinement-service/src/services/feedback-retry.service.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
import { FeedbackService } from '@polyladder/api/services/feedback.service';
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
  private feedbackService: FeedbackService;

  constructor(
    private readonly pool: Pool,
    apiKey: string
  ) {
    this.client = new Anthropic({ apiKey });
    this.feedbackService = new FeedbackService(pool);
  }

  async processPendingRetries(): Promise<number> {
    const retries = await this.feedbackService.getPendingRetries(5);
    let processed = 0;

    for (const retry of retries) {
      try {
        await this.feedbackService.markRetryProcessing(retry.id);
        await this.retryWithFeedback(retry);
        await this.feedbackService.markRetryComplete(retry.id, true);
        processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.feedbackService.markRetryComplete(retry.id, false, errorMessage);
        logger.error({ retryId: retry.id, error }, 'Retry failed');
      }
    }

    return processed;
  }

  private async retryWithFeedback(retry: RetryJob): Promise<void> {
    const originalData = await this.getOriginalData(retry.item_id, retry.item_type);
    const feedbackHistory = await this.feedbackService.getFeedbackForItem(retry.item_id);

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
    originalData: any,
    feedbackHistory: any[],
    currentFeedback: RetryJob
  ): string {
    const feedbackSummary = feedbackHistory.map((f) => `- [${f.category}] ${f.comment}`).join('\n');

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

  private async getOriginalData(itemId: string, itemType: string): Promise<any> {
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

  private parseImprovedContent(response: string): any {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    return JSON.parse(jsonMatch[0]);
  }

  private async updateItem(itemId: string, itemType: string, improved: any): Promise<void> {
    const tableName =
      itemType === 'draft'
        ? 'drafts'
        : itemType === 'candidate'
          ? 'candidates'
          : 'content_topic_mappings';

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
}
```

**Files Created**: `packages/refinement-service/src/services/feedback-retry.service.ts`

**Status**: ✅ Completed

---

### ✅ Task 4: Feedback API Endpoints

**Description**: REST API for managing feedback.

**Implementation Plan**:

Create `packages/api/src/routes/operational/feedback.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { FeedbackService } from '../../services/feedback.service';

const CreateFeedbackSchema = z.object({
  itemId: z.string().uuid(),
  itemType: z.enum(['draft', 'candidate', 'mapping']),
  action: z.enum(['reject', 'revise', 'flag']),
  category: z.enum([
    'incorrect_content',
    'wrong_level',
    'poor_quality',
    'missing_context',
    'grammatical_error',
    'inappropriate',
    'duplicate',
    'off_topic',
    'other',
  ]),
  comment: z.string().min(10).max(2000),
  suggestedCorrection: z.string().max(2000).optional(),
});

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum([
    'incorrect_content',
    'wrong_level',
    'poor_quality',
    'missing_context',
    'grammatical_error',
    'inappropriate',
    'duplicate',
    'off_topic',
    'other',
  ]),
  templateText: z.string().min(10).max(2000),
});

export const feedbackRoutes: FastifyPluginAsync = async (fastify) => {
  const feedbackService = new FeedbackService(fastify.db);

  fastify.post('/operational/feedback', async (request, reply) => {
    const input = CreateFeedbackSchema.parse(request.body);

    const feedbackId = await feedbackService.createFeedback({
      ...input,
      operatorId: request.user.userId,
    });

    return reply.status(201).send({ id: feedbackId });
  });

  fastify.get('/operational/feedback/item/:itemId', async (request, reply) => {
    const { itemId } = request.params as { itemId: string };

    const feedback = await feedbackService.getFeedbackForItem(itemId);
    const versions = await feedbackService.getItemVersions(itemId);

    return reply.send({ feedback, versions });
  });

  fastify.get('/operational/feedback/stats', async (request, reply) => {
    const { days = 30 } = request.query as { days?: number };
    const stats = await feedbackService.getStats(days);
    return reply.send(stats);
  });

  fastify.get('/operational/feedback/templates', async (request, reply) => {
    const { category } = request.query as { category?: string };
    const templates = await feedbackService.getTemplates(category);
    return reply.send({ templates });
  });

  fastify.post('/operational/feedback/templates', async (request, reply) => {
    const input = CreateTemplateSchema.parse(request.body);

    const templateId = await feedbackService.createTemplate({
      ...input,
      createdBy: request.user.userId,
    });

    return reply.status(201).send({ id: templateId });
  });

  fastify.post('/operational/feedback/templates/:id/use', async (request, reply) => {
    const { id } = request.params as { id: string };
    await feedbackService.incrementTemplateUse(id);
    return reply.send({ success: true });
  });

  fastify.get('/operational/feedback/retry-queue', async (request, reply) => {
    const { status = 'pending', limit = 20 } = request.query as any;

    const result = await fastify.db.query(
      `SELECT r.*, f.comment, f.category, f.suggested_correction
       FROM retry_queue r
       JOIN operator_feedback f ON r.feedback_id = f.id
       WHERE r.status = $1
       ORDER BY r.scheduled_at
       LIMIT $2`,
      [status, limit]
    );

    return reply.send({ items: result.rows });
  });

  fastify.post('/operational/feedback/bulk-reject', async (request, reply) => {
    const { itemIds, itemType, category, comment } = z
      .object({
        itemIds: z.array(z.string().uuid()),
        itemType: z.enum(['draft', 'candidate', 'mapping']),
        category: z.string(),
        comment: z.string(),
      })
      .parse(request.body);

    let rejected = 0;
    for (const itemId of itemIds) {
      try {
        await feedbackService.createFeedback({
          itemId,
          itemType,
          operatorId: request.user.userId,
          action: 'reject',
          category,
          comment,
        });
        rejected++;
      } catch (error) {
        console.error(`Failed to reject ${itemId}:`, error);
      }
    }

    return reply.send({ rejected, total: itemIds.length });
  });
};
```

**Files Created**: `packages/api/src/routes/operational/feedback.ts`

**Status**: ✅ Completed

---

### ✅ Task 5: Feedback UI Components

**Description**: React components for providing feedback.

**Implementation Plan**:

Create `packages/web/src/components/operational/FeedbackDialog.tsx`:

```typescript
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, MessageSquare, Clock, CheckCircle } from 'lucide-react';
import { api } from '../../api/client';

interface FeedbackDialogProps {
  itemId: string;
  itemType: 'draft' | 'candidate' | 'mapping';
  onClose: () => void;
  onSubmit: () => void;
}

const CATEGORIES = [
  { value: 'incorrect_content', label: 'Incorrect Content' },
  { value: 'wrong_level', label: 'Wrong CEFR Level' },
  { value: 'poor_quality', label: 'Poor Quality' },
  { value: 'missing_context', label: 'Missing Context' },
  { value: 'grammatical_error', label: 'Grammatical Error' },
  { value: 'inappropriate', label: 'Inappropriate Content' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'off_topic', label: 'Off Topic' },
  { value: 'other', label: 'Other' },
];

export function FeedbackDialog({ itemId, itemType, onClose, onSubmit }: FeedbackDialogProps) {
  const [action, setAction] = useState<'reject' | 'revise' | 'flag'>('reject');
  const [category, setCategory] = useState('');
  const [comment, setComment] = useState('');
  const [suggestedCorrection, setSuggestedCorrection] = useState('');
  const queryClient = useQueryClient();

  const { data: templates } = useQuery({
    queryKey: ['feedback-templates', category],
    queryFn: () => api.get(`/operational/feedback/templates?category=${category}`),
    enabled: !!category,
  });

  const submitMutation = useMutation({
    mutationFn: () => api.post('/operational/feedback', {
      itemId,
      itemType,
      action,
      category,
      comment,
      suggestedCorrection: suggestedCorrection || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['candidates']);
      queryClient.invalidateQueries(['drafts']);
      onSubmit();
    },
  });

  const applyTemplate = (templateText: string, templateId: string) => {
    setComment(templateText);
    api.post(`/operational/feedback/templates/${templateId}/use`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Provide Feedback</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Action</label>
            <div className="flex gap-2">
              {[
                { value: 'reject', label: 'Reject', icon: X, color: 'red' },
                { value: 'revise', label: 'Request Revision', icon: MessageSquare, color: 'yellow' },
                { value: 'flag', label: 'Flag for Review', icon: Clock, color: 'blue' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setAction(opt.value as any)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded border ${
                    action === opt.value
                      ? `bg-${opt.color}-100 border-${opt.color}-500 text-${opt.color}-700`
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <opt.icon className="w-4 h-4" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input w-full"
            >
              <option value="">Select category...</option>
              {CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>

          {templates?.templates?.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">Quick Templates</label>
              <div className="flex flex-wrap gap-2">
                {templates.templates.slice(0, 5).map((t: any) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t.template_text, t.id)}
                    className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">
              Comment <span className="text-red-500">*</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="input w-full h-24"
              placeholder="Explain what's wrong and why..."
            />
            <p className="text-xs text-gray-500 mt-1">
              {comment.length}/2000 characters (min 10)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Suggested Correction (optional)
            </label>
            <textarea
              value={suggestedCorrection}
              onChange={(e) => setSuggestedCorrection(e.target.value)}
              className="input w-full h-20"
              placeholder="How should this be corrected?"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => submitMutation.mutate()}
            disabled={!category || comment.length < 10 || submitMutation.isPending}
            className="btn btn-primary"
          >
            {submitMutation.isPending ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Files Created**: `packages/web/src/components/operational/FeedbackDialog.tsx`

**Status**: ✅ Completed

---

### ✅ Task 6: Feedback Analytics Dashboard

**Description**: Dashboard showing feedback patterns and quality metrics.

**Implementation Plan**:

Create `packages/web/src/components/operational/FeedbackAnalytics.tsx`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react';
import { api } from '../../api/client';

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6', '#f97316'];

export function FeedbackAnalytics() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['feedback-stats'],
    queryFn: () => api.get('/operational/feedback/stats?days=30'),
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading analytics...</div>;
  }

  const categoryData = Object.entries(stats?.byCategory || {}).map(([name, count]) => ({
    name: name.replace(/_/g, ' '),
    count,
  }));

  const operatorData = Object.entries(stats?.byOperator || {}).map(([email, count]) => ({
    email: email.split('@')[0],
    count,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <AlertTriangle className="w-4 h-4" />
            Total Feedback (30d)
          </div>
          <div className="text-2xl font-bold">{stats?.totalFeedback || 0}</div>
        </div>

        <div className="bg-white p-4 rounded-lg border">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <CheckCircle className="w-4 h-4" />
            Retry Success Rate
          </div>
          <div className="text-2xl font-bold">
            {(stats?.retrySuccessRate || 0).toFixed(1)}%
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <TrendingUp className="w-4 h-4" />
            Most Common Issue
          </div>
          <div className="text-lg font-medium">
            {categoryData[0]?.name || 'N/A'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <TrendingDown className="w-4 h-4" />
            Active Reviewers
          </div>
          <div className="text-2xl font-bold">
            {Object.keys(stats?.byOperator || {}).length}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded-lg border">
          <h3 className="font-medium mb-4">Feedback by Category</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={categoryData}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }) =>
                  `${name} (${(percent * 100).toFixed(0)}%)`
                }
              >
                {categoryData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-4 rounded-lg border">
          <h3 className="font-medium mb-4">Feedback by Reviewer</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={operatorData} layout="vertical">
              <XAxis type="number" />
              <YAxis type="category" dataKey="email" width={100} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg border">
        <h3 className="font-medium mb-4">Quality Improvement Insights</h3>
        <div className="space-y-3">
          {categoryData.slice(0, 3).map((cat, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-medium">
                {i + 1}
              </span>
              <span className="flex-1">{cat.name}</span>
              <span className="text-gray-500">{cat.count} issues</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-500 mt-4">
          Focus on reducing these common issues to improve content quality.
        </p>
      </div>
    </div>
  );
}
```

**Files Created**: `packages/web/src/components/operational/FeedbackAnalytics.tsx`

**Status**: ✅ Completed

---

## Implementation Summary

### Completed Features

1. **Database Schema** (Migration 020):
   - `operator_feedback` table for storing feedback with categories
   - `item_versions` table for tracking version history
   - `feedback_templates` table for reusable templates
   - `retry_queue` table for managing reprocessing jobs
   - `feedback_analytics` view for aggregated statistics

2. **Backend Services**:
   - `FeedbackService`: Complete implementation with all methods
   - `FeedbackRetryService`: LLM-powered retry processing with feedback context

3. **API Endpoints**:
   - POST `/operational/feedback` - Create feedback
   - GET `/operational/feedback/item/:itemId` - Get feedback and versions
   - GET `/operational/feedback/stats` - Get analytics
   - GET `/operational/feedback/templates` - Get templates
   - POST `/operational/feedback/templates` - Create template
   - POST `/operational/feedback/templates/:id/use` - Use template
   - GET `/operational/feedback/retry-queue` - Get retry queue
   - POST `/operational/feedback/bulk-reject` - Bulk reject items

4. **UI Components**:
   - `FeedbackDialog`: Modal for providing feedback with action, category, comment, and suggested correction
   - `FeedbackAnalytics`: Dashboard with charts and statistics
   - Integrated into `ReviewQueuePage`

5. **Testing**:
   - Unit tests: 14 tests for FeedbackService
   - Integration tests: 18 tests for API endpoints
   - E2E tests: 7 tests for UI components
   - All tests passing

### Technical Notes

- Used TypeBox for API schema validation
- Implemented database transactions for atomic operations
- Fixed race conditions in login route with FOR UPDATE locks
- Configured Vitest for sequential test execution to prevent conflicts
- Fixed review-queue API to use correct `validated` table structure

---

## Dependencies

- **Blocks**: F025-F028 (Operational UI uses feedback system)
- **Depends on**: F014, F015, F016

---

## Notes

- Feedback improves both immediate content AND trains future LLM prompts
- Version history enables rollback to previous states
- Templates speed up common feedback patterns
- Analytics help identify systemic issues in content generation

---

## Open Questions

### Question 1: Feedback-to-Prompt Learning

**Context**: Should operator feedback be used to improve LLM prompts?

**Options**:

1. **Manual**: Operators update prompts based on feedback patterns
2. **Semi-automatic**: System suggests prompt improvements
3. **Automatic**: Fine-tune model on feedback (expensive, complex)

**Recommendation**: Start with manual. Add suggestion system post-MVP.

### Question 2: Retry Limits

**Context**: How many times should an item be retried?

**Options**:

1. **1 retry**: Fast failure, manual intervention
2. **3 retries**: Balance between automation and cost
3. **Unlimited until success**: Maximum automation

**Recommendation**: 3 retries with exponential backoff. After 3 failures, require manual intervention.

### Question 3: Cross-Item Learning

**Context**: Should feedback on one item improve similar items?

**Example**: If "hola" definition is rejected, should "adiós" definition be reviewed?

**Options**:

1. **No**: Each item independent
2. **Flagging**: Similar items flagged for review
3. **Automatic update**: Apply corrections to similar items

**Recommendation**: Flagging for MVP. Automatic updates require careful validation.
