import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { FeedbackService } from '../../src/services/feedback.service';
import { getTestPool, cleanupTestData } from '../setup';
import { createTestOperator } from '../helpers/db';

describe('FeedbackService', () => {
  let pool: Pool;
  let service: FeedbackService;
  let operator: { id: string; email: string; password: string; role: 'operator' };

  beforeEach(async () => {
    pool = getTestPool();
    service = new FeedbackService(pool);
    await cleanupTestData();
    operator = await createTestOperator(pool, {
      email: `test-operator-${Date.now()}@example.com`,
      password: 'TestPassword123!',
    });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('createFeedback', () => {
    it('should create feedback and save current version', async () => {
      const draftId = await createTestDraft(pool);

      const feedbackId = await service.createFeedback({
        itemId: draftId,
        itemType: 'draft',
        operatorId: operator.id,
        action: 'reject',
        category: 'incorrect_content',
        comment: 'This content is incorrect and needs revision',
      });

      expect(feedbackId).toBeDefined();

      const feedbackResult = await pool.query(
        'SELECT * FROM operator_feedback WHERE id = $1',
        [feedbackId]
      );
      expect(feedbackResult.rows).toHaveLength(1);
      expect((feedbackResult.rows[0] as { item_id: string }).item_id).toBe(draftId);
      expect((feedbackResult.rows[0] as { action: string }).action).toBe('reject');

      const versionResult = await pool.query(
        'SELECT * FROM item_versions WHERE item_id = $1',
        [draftId]
      );
      expect(versionResult.rows).toHaveLength(1);
    });

    it('should add item to retry queue when action is reject', async () => {
      const draftId = await createTestDraft(pool);

      const feedbackId = await service.createFeedback({
        itemId: draftId,
        itemType: 'draft',
        operatorId: operator.id,
        action: 'reject',
        category: 'poor_quality',
        comment: 'Quality is too low',
      });

      const retryResult = await pool.query(
        'SELECT * FROM retry_queue WHERE feedback_id = $1',
        [feedbackId]
      );
      expect(retryResult.rows).toHaveLength(1);
      expect((retryResult.rows[0] as { status: string }).status).toBe('pending');
    });

    it('should add item to retry queue when action is revise', async () => {
      const draftId = await createTestDraft(pool);

      const feedbackId = await service.createFeedback({
        itemId: draftId,
        itemType: 'draft',
        operatorId: operator.id,
        action: 'revise',
        category: 'missing_context',
        comment: 'Needs more context',
      });

      const retryResult = await pool.query(
        'SELECT * FROM retry_queue WHERE feedback_id = $1',
        [feedbackId]
      );
      expect(retryResult.rows).toHaveLength(1);
    });

    it('should not add to retry queue when action is flag', async () => {
      const draftId = await createTestDraft(pool);

      const feedbackId = await service.createFeedback({
        itemId: draftId,
        itemType: 'draft',
        operatorId: operator.id,
        action: 'flag',
        category: 'other',
        comment: 'Flagged for manual review',
      });

      const retryResult = await pool.query(
        'SELECT * FROM retry_queue WHERE feedback_id = $1',
        [feedbackId]
      );
      expect(retryResult.rows).toHaveLength(0);
    });

    it('should create feedback when action is reject', async () => {
      const draftId = await createTestDraft(pool);

      const feedbackId = await service.createFeedback({
        itemId: draftId,
        itemType: 'draft',
        operatorId: operator.id,
        action: 'reject',
        category: 'inappropriate',
        comment: 'Inappropriate content',
      });

      expect(feedbackId).toBeDefined();

      const feedbackResult = await pool.query(
        'SELECT * FROM operator_feedback WHERE id = $1',
        [feedbackId]
      );
      expect((feedbackResult.rows[0] as { action: string }).action).toBe('reject');
    });
  });

  describe('getFeedbackForItem', () => {
    it('should return all feedback for an item', async () => {
      const draftId = await createTestDraft(pool);

      await service.createFeedback({
        itemId: draftId,
        itemType: 'draft',
        operatorId: operator.id,
        action: 'reject',
        category: 'incorrect_content',
        comment: 'First feedback',
      });

      await service.createFeedback({
        itemId: draftId,
        itemType: 'draft',
        operatorId: operator.id,
        action: 'revise',
        category: 'poor_quality',
        comment: 'Second feedback',
      });

      const feedback = await service.getFeedbackForItem(draftId);

      expect(feedback).toHaveLength(2);
      expect((feedback[0] as { comment: string }).comment).toBe('Second feedback');
    });
  });

  describe('getItemVersions', () => {
    it('should return version history for an item', async () => {
      const draftId = await createTestDraft(pool);

      await service.createFeedback({
        itemId: draftId,
        itemType: 'draft',
        operatorId: operator.id,
        action: 'reject',
        category: 'incorrect_content',
        comment: 'First feedback',
      });

      const versions = await service.getItemVersions(draftId);

      expect(versions).toHaveLength(1);
      expect((versions[0] as { version_number: number }).version_number).toBe(1);
    });
  });

  describe('getPendingRetries', () => {
    it('should return pending retries', async () => {
      const draftId = await createTestDraft(pool);

      await service.createFeedback({
        itemId: draftId,
        itemType: 'draft',
        operatorId: operator.id,
        action: 'reject',
        category: 'incorrect_content',
        comment: 'Needs retry',
      });

      const retries = await service.getPendingRetries(10);

      expect(retries.length).toBeGreaterThan(0);
      expect((retries[0] as { item_id: string }).item_id).toBe(draftId);
    });

    it('should not return retries that exceeded max retries', async () => {
      const draftId = await createTestDraft(pool);

      const feedbackId = await service.createFeedback({
        itemId: draftId,
        itemType: 'draft',
        operatorId: operator.id,
        action: 'reject',
        category: 'incorrect_content',
        comment: 'Needs retry',
      });

      await pool.query(
        'UPDATE retry_queue SET retry_count = max_retries WHERE feedback_id = $1',
        [feedbackId]
      );

      const retries = await service.getPendingRetries(10);

      const matchingRetries = retries.filter((r) => (r as { item_id: string }).item_id === draftId);
      expect(matchingRetries).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('should return feedback statistics', async () => {
      const draftId1 = await createTestDraft(pool);
      const draftId2 = await createTestDraft(pool);

      await service.createFeedback({
        itemId: draftId1,
        itemType: 'draft',
        operatorId: operator.id,
        action: 'reject',
        category: 'incorrect_content',
        comment: 'First feedback',
      });

      await service.createFeedback({
        itemId: draftId2,
        itemType: 'draft',
        operatorId: operator.id,
        action: 'reject',
        category: 'poor_quality',
        comment: 'Second feedback',
      });

      const stats = await service.getStats(30);

      expect(stats.totalFeedback).toBe(2);
      expect(stats.byCategory['incorrect_content']).toBe(1);
      expect(stats.byCategory['poor_quality']).toBe(1);
      expect(stats.byOperator[operator.email]).toBe(2);
    });
  });

  describe('getTemplates', () => {
    it('should return all templates when no category specified', async () => {
      await service.createTemplate({
        name: 'Template 1',
        category: 'incorrect_content',
        templateText: 'This content is incorrect',
        createdBy: operator.id,
      });

      await service.createTemplate({
        name: 'Template 2',
        category: 'poor_quality',
        templateText: 'Quality is too low',
        createdBy: operator.id,
      });

      const templates = await service.getTemplates();

      expect(templates.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter templates by category', async () => {
      await service.createTemplate({
        name: 'Template 1',
        category: 'incorrect_content',
        templateText: 'This content is incorrect',
        createdBy: operator.id,
      });

      await service.createTemplate({
        name: 'Template 2',
        category: 'poor_quality',
        templateText: 'Quality is too low',
        createdBy: operator.id,
      });

      const templates = await service.getTemplates('incorrect_content');

      expect(templates.length).toBeGreaterThanOrEqual(1);
      expect((templates[0] as { category: string }).category).toBe('incorrect_content');
    });
  });

  describe('createTemplate', () => {
    it('should create a feedback template', async () => {
      const templateId = await service.createTemplate({
        name: 'Test Template',
        category: 'incorrect_content',
        templateText: 'This is a test template',
        createdBy: operator.id,
      });

      expect(templateId).toBeDefined();

      const result = await pool.query('SELECT * FROM feedback_templates WHERE id = $1', [
        templateId,
      ]);
      expect(result.rows).toHaveLength(1);
      expect((result.rows[0] as { name: string }).name).toBe('Test Template');
    });
  });

  describe('incrementTemplateUse', () => {
    it('should increment template use count', async () => {
      const templateId = await service.createTemplate({
        name: 'Test Template',
        category: 'incorrect_content',
        templateText: 'Test',
        createdBy: operator.id,
      });

      await service.incrementTemplateUse(templateId);
      await service.incrementTemplateUse(templateId);

      const result = await pool.query('SELECT use_count FROM feedback_templates WHERE id = $1', [
        templateId,
      ]);
      expect((result.rows[0] as { use_count: number }).use_count).toBe(2);
    });
  });
});

async function createTestDraft(pool: Pool): Promise<string> {
  const result = await pool.query(
    `INSERT INTO drafts (id, data_type, raw_data, source, created_at)
     VALUES (gen_random_uuid(), 'meaning', $1, 'test', CURRENT_TIMESTAMP)
     RETURNING id`,
    [JSON.stringify({ word: 'test', definition: 'a test' })]
  );
  return result.rows[0].id as string;
}

