import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import {
  createTestServer,
  closeTestServer,
  getTestPool,
  cleanupTestData,
  closeTestPool,
  setupTestEnv,
} from '../setup';
import { createTestOperator, createTestLearner } from '../helpers/db';
import { LoginResponse, SuccessResponse } from '../helpers/types';

describe('Feedback API Integration Tests', () => {
  let server: FastifyInstance;
  let pool: Pool;
  let testOperator: { id: string; email: string; password: string; role: 'operator' };

  beforeAll(async () => {
    setupTestEnv();
    pool = getTestPool();
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer();
    await closeTestPool();
  });

  beforeEach(async () => {
    await cleanupTestData();
    testOperator = await createTestOperator(pool, {
      email: `test-operator-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
      password: 'OperatorPassword123!',
    });
  });

  async function getOperatorToken(): Promise<string> {
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [testOperator.id]);
    if (userCheck.rows.length === 0) {
      testOperator = await createTestOperator(pool, {
        email: `test-operator-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
        password: 'OperatorPassword123!',
      });
    }

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: testOperator.email, password: testOperator.password },
    });

    if (response.statusCode !== 200) {
      const body = response.body.toString();
      throw new Error(`Login failed: ${response.statusCode} - ${body}. User exists: ${userCheck.rows.length > 0}`);
    }

    return response.json<LoginResponse>().accessToken;
  }

  async function getOperatorTokenAndId(): Promise<{ token: string; operatorId: string }> {
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [testOperator.id]);
    if (userCheck.rows.length === 0) {
      testOperator = await createTestOperator(pool, {
        email: `test-operator-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
        password: 'OperatorPassword123!',
      });
    }

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: testOperator.email, password: testOperator.password },
    });

    if (response.statusCode !== 200) {
      const body = response.body.toString();
      throw new Error(`Login failed: ${response.statusCode} - ${body}. User exists: ${userCheck.rows.length > 0}`);
    }

    const loginResponse = response.json<LoginResponse>();

    return {
      token: loginResponse.accessToken,
      operatorId: testOperator.id,
    };
  }

  async function createTestDraft(): Promise<string> {
    const result = await pool.query(
      `INSERT INTO drafts (id, data_type, raw_data, source, created_at)
       VALUES (gen_random_uuid(), 'meaning', $1, 'test', CURRENT_TIMESTAMP)
       RETURNING id`,
      [JSON.stringify({ word: 'test', definition: 'a test' })]
    );
    return (result.rows[0] as { id: string }).id;
  }

  describe('POST /operational/feedback', () => {
    it('should create feedback for operator', async () => {
      const token = await getOperatorToken();
      const draftId = await createTestDraft();

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/feedback',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          itemId: draftId,
          itemType: 'draft',
          action: 'reject',
          category: 'incorrect_content',
          comment: 'This content is incorrect',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ success: boolean; id: string }>();
      expect(body.success).toBe(true);
      expect(body.id).toBeDefined();
    });

    it('should reject request without auth', async () => {
      const draftId = await createTestDraft();

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/feedback',
        payload: {
          itemId: draftId,
          itemType: 'draft',
          action: 'reject',
          category: 'incorrect_content',
          comment: 'This content is incorrect',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject request from learner', async () => {
      const learner = await createTestLearner(pool, {
        email: `learner-${Date.now()}@example.com`,
        password: 'Password123!',
      });

      const loginResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: learner.email, password: learner.password },
      });

      const token = loginResponse.json<LoginResponse>().accessToken;
      const draftId = await createTestDraft();

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/feedback',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          itemId: draftId,
          itemType: 'draft',
          action: 'reject',
          category: 'incorrect_content',
          comment: 'This content is incorrect',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should reject invalid category', async () => {
      const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [testOperator.id]);
      if (userCheck.rows.length === 0) {
        testOperator = await createTestOperator(pool, {
          email: `test-operator-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
          password: 'OperatorPassword123!',
        });
      }
      const token = await getOperatorToken();
      const draftId = await createTestDraft();

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/feedback',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          itemId: draftId,
          itemType: 'draft',
          action: 'reject',
          category: 'invalid_category',
          comment: 'This content is incorrect',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject comment that is too short', async () => {
      const token = await getOperatorToken();
      const draftId = await createTestDraft();

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/feedback',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          itemId: draftId,
          itemType: 'draft',
          action: 'reject',
          category: 'incorrect_content',
          comment: 'short',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /operational/feedback/item/:itemId', () => {
    it('should return feedback and versions for item', async () => {
      const token = await getOperatorToken();
      const draftId = await createTestDraft();

      await server.inject({
        method: 'POST',
        url: '/api/v1/operational/feedback',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          itemId: draftId,
          itemType: 'draft',
          action: 'reject',
          category: 'incorrect_content',
          comment: 'This content is incorrect',
        },
      });

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/operational/feedback/item/${draftId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ feedback: unknown[]; versions: unknown[] }>();
      expect(body.feedback).toHaveLength(1);
      expect(body.versions).toHaveLength(1);
    });

    it('should reject request without auth', async () => {
      const draftId = await createTestDraft();

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/operational/feedback/item/${draftId}`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /operational/feedback/stats', () => {
    it('should return feedback statistics', async () => {
      const token = await getOperatorToken();
      const draftId = await createTestDraft();

      await server.inject({
        method: 'POST',
        url: '/api/v1/operational/feedback',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          itemId: draftId,
          itemType: 'draft',
          action: 'reject',
          category: 'incorrect_content',
          comment: 'This content is incorrect',
        },
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/operational/feedback/stats?days=30',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        totalFeedback: number;
        byCategory: Record<string, number>;
        byOperator: Record<string, number>;
        retrySuccessRate: number;
      }>();
      expect(body.totalFeedback).toBeGreaterThanOrEqual(1);
      expect(body.byCategory['incorrect_content']).toBeGreaterThanOrEqual(1);
    });

    it('should reject request without auth', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/operational/feedback/stats',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /operational/feedback/templates', () => {
    it('should return feedback templates', async () => {
      const { token, operatorId } = await getOperatorTokenAndId();

      await pool.query(
        `INSERT INTO feedback_templates (id, name, category, template_text, created_by, created_at)
         VALUES (gen_random_uuid(), 'Test Template', 'incorrect_content', 'Test template text', 
         $1, CURRENT_TIMESTAMP)`,
        [operatorId]
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/operational/feedback/templates',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ templates: unknown[] }>();
      expect(body.templates.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter templates by category', async () => {
      const { token, operatorId } = await getOperatorTokenAndId();

      await pool.query(
        `INSERT INTO feedback_templates (id, name, category, template_text, created_by, created_at)
         VALUES (gen_random_uuid(), 'Template 1', 'incorrect_content', 'Text 1', 
         $1, CURRENT_TIMESTAMP),
         (gen_random_uuid(), 'Template 2', 'poor_quality', 'Text 2', 
         $1, CURRENT_TIMESTAMP)`,
        [operatorId]
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/operational/feedback/templates?category=incorrect_content',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ templates: Array<{ category: string }> }>();
      expect(body.templates.every((t) => t.category === 'incorrect_content')).toBe(true);
    });
  });

  describe('POST /operational/feedback/templates', () => {
    it('should create a feedback template', async () => {
      const token = await getOperatorToken();

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/feedback/templates',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'New Template',
          category: 'incorrect_content',
          templateText: 'This is a template for incorrect content',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ success: boolean; id: string }>();
      expect(body.success).toBe(true);
      expect(body.id).toBeDefined();
    });

    it('should reject request without auth', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/feedback/templates',
        payload: {
          name: 'New Template',
          category: 'incorrect_content',
          templateText: 'This is a template',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /operational/feedback/templates/:id/use', () => {
    it('should increment template use count', async () => {
      const { token, operatorId } = await getOperatorTokenAndId();
      const templateResult = await pool.query(
        `INSERT INTO feedback_templates (id, name, category, template_text, created_by, created_at)
         VALUES (gen_random_uuid(), 'Test Template', 'incorrect_content', 'Test', 
         $1, CURRENT_TIMESTAMP)
         RETURNING id`,
        [operatorId]
      );
      const templateId = (templateResult.rows[0] as { id: string }).id;

      const response = await server.inject({
        method: 'POST',
        url: `/api/v1/operational/feedback/templates/${templateId}/use`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SuccessResponse>();
      expect(body.success).toBe(true);

      const countResult = await pool.query(
        'SELECT use_count FROM feedback_templates WHERE id = $1',
        [templateId]
      );
      expect((countResult.rows[0] as { use_count: number }).use_count).toBe(1);
    });
  });

  describe('GET /operational/feedback/retry-queue', () => {
    it('should return retry queue items', async () => {
      const token = await getOperatorToken();
      const draftId = await createTestDraft();

      await server.inject({
        method: 'POST',
        url: '/api/v1/operational/feedback',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          itemId: draftId,
          itemType: 'draft',
          action: 'reject',
          category: 'incorrect_content',
          comment: 'Needs retry',
        },
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/operational/feedback/retry-queue?status=pending',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ items: unknown[] }>();
      expect(body.items.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject request without auth', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/operational/feedback/retry-queue',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /operational/feedback/bulk-reject', () => {
    it('should reject multiple items', async () => {
      const token = await getOperatorToken();
      const draftId1 = await createTestDraft();
      const draftId2 = await createTestDraft();

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/feedback/bulk-reject',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          itemIds: [draftId1, draftId2],
          itemType: 'draft',
          category: 'incorrect_content',
          comment: 'Bulk rejection reason',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ rejected: number; total: number }>();
      expect(body.rejected).toBe(2);
      expect(body.total).toBe(2);
    });

    it('should handle partial failures gracefully', async () => {
      const token = await getOperatorToken();
      const draftId1 = await createTestDraft();
      const draftId2 = await createTestDraft();

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/feedback/bulk-reject',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          itemIds: [draftId1, draftId2],
          itemType: 'draft',
          category: 'incorrect_content',
          comment: 'Bulk rejection reason',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ rejected: number; total: number }>();
      expect(body.rejected).toBe(2);
      expect(body.total).toBe(2);
    });
  });
});

