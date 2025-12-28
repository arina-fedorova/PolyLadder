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
import { createTestOperator, createTestDocument, createTestChunk, createTestTopic, createTestMapping } from '../helpers/db';
import { LoginResponse } from '../helpers/types';

describe('Pipeline Tasks Integration Tests', () => {
  let server: FastifyInstance;
  let pool: Pool;
  let operatorToken: string;
  let operatorId: string;

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
    const uniqueEmail = `operator-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
    const operator = await createTestOperator(pool, { email: uniqueEmail, password: 'OperatorPass123!' });
    operatorId = operator.id;

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: operator.email, password: operator.password },
    });
    operatorToken = response.json<LoginResponse>().accessToken;
  });

  describe('GET /operational/pipeline-tasks', () => {
    it('should return empty list when no tasks exist', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/operational/pipeline-tasks',
        headers: { authorization: `Bearer ${operatorToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.tasks).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(50);
    });

    it('should return a list of pipeline tasks', async () => {
      const doc = await createTestDocument(pool, { uploadedBy: operatorId });
      const chunk = await createTestChunk(pool, { documentId: doc.id });
      const level = await pool.query(
        `INSERT INTO curriculum_levels (language, cefr_level, name, description, sort_order) 
         VALUES ('EN', 'A1', 'A1 Level', 'Beginner level', 1) 
         ON CONFLICT (language, cefr_level) DO NOTHING RETURNING id`
      ).then(res => res.rows[0]?.id || pool.query(`SELECT id FROM curriculum_levels WHERE language = 'EN' AND cefr_level = 'A1'`).then(r => r.rows[0].id));
      const topic = await createTestTopic(pool, { levelId: level });
      const mapping = await createTestMapping(pool, { chunkId: chunk.id, topicId: topic.id, status: 'confirmed' });

      await pool.query(
        `INSERT INTO pipeline_tasks 
         (item_id, item_type, data_type, current_status, current_stage, source, document_id, chunk_id, topic_id, mapping_id)
         VALUES ($1, 'draft', 'rule', 'pending', 'DRAFT', 'document_transform', $2, $3, $4, $5)`,
        [chunk.id, doc.id, chunk.id, topic.id, mapping.id]
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/operational/pipeline-tasks',
        headers: { authorization: `Bearer ${operatorToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.tasks).toHaveLength(1);
      expect(body.tasks[0].current_status).toBe('pending');
      expect(body.tasks[0].current_stage).toBe('DRAFT');
      expect(body.tasks[0].data_type).toBe('rule');
    });

    it('should support filtering by status', async () => {
      await pool.query(
        `INSERT INTO pipeline_tasks (item_id, item_type, data_type, current_status, current_stage)
         VALUES 
         (gen_random_uuid(), 'draft', 'rule', 'pending', 'DRAFT'),
         (gen_random_uuid(), 'draft', 'rule', 'failed', 'DRAFT')`
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/operational/pipeline-tasks?status=failed',
        headers: { authorization: `Bearer ${operatorToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.tasks.every((t: { current_status: string }) => t.current_status === 'failed')).toBe(true);
    });

    it('should support pagination', async () => {
      for (let i = 0; i < 3; i++) {
        await pool.query(
          `INSERT INTO pipeline_tasks (item_id, item_type, data_type, current_status, current_stage)
           VALUES (gen_random_uuid(), 'draft', 'rule', 'pending', 'DRAFT')`
        );
      }

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/operational/pipeline-tasks?page=1&limit=2',
        headers: { authorization: `Bearer ${operatorToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.tasks).toHaveLength(2);
      expect(body.total).toBe(3);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(2);
    });
  });

  describe('GET /operational/pipeline-tasks/:taskId', () => {
    it('should return 404 for non-existent task', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/operational/pipeline-tasks/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${operatorToken}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return task details with events', async () => {
      const taskId = await pool.query(
        `INSERT INTO pipeline_tasks 
         (item_id, item_type, data_type, current_status, current_stage)
         VALUES (gen_random_uuid(), 'draft', 'rule', 'pending', 'DRAFT')
         RETURNING id`
      ).then(res => res.rows[0].id);

      await pool.query(
        `INSERT INTO pipeline_events 
         (task_id, item_id, item_type, event_type, stage, status)
         VALUES ($1, (SELECT item_id FROM pipeline_tasks WHERE id = $1), 'draft', 'draft_created', 'DRAFT', 'pending')`,
        [taskId]
      );

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/operational/pipeline-tasks/${taskId}`,
        headers: { authorization: `Bearer ${operatorToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.task.id).toBe(taskId);
      expect(body.events).toHaveLength(1);
      expect(body.events[0].event_type).toBe('draft_created');
    });
  });

  describe('POST /operational/pipeline-tasks/:taskId/retry', () => {
    it('should return 404 for non-existent task', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/pipeline-tasks/00000000-0000-0000-0000-000000000000/retry',
        headers: { authorization: `Bearer ${operatorToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(404);
    });

    it('should retry a failed task', async () => {
      const taskId = await pool.query(
        `INSERT INTO pipeline_tasks 
         (item_id, item_type, data_type, current_status, current_stage, error_message)
         VALUES (gen_random_uuid(), 'draft', 'rule', 'failed', 'DRAFT', 'Test error')
         RETURNING id`
      ).then(res => res.rows[0].id);

      const response = await server.inject({
        method: 'POST',
        url: `/api/v1/operational/pipeline-tasks/${taskId}/retry`,
        headers: { authorization: `Bearer ${operatorToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);

      const task = await pool.query(
        `SELECT current_status, error_message FROM pipeline_tasks WHERE id = $1`,
        [taskId]
      );
      expect(task.rows[0].current_status).toBe('pending');
      expect(task.rows[0].error_message).toBeNull();
    });

    it('should return 400 if task is not failed', async () => {
      const taskId = await pool.query(
        `INSERT INTO pipeline_tasks 
         (item_id, item_type, data_type, current_status, current_stage)
         VALUES (gen_random_uuid(), 'draft', 'rule', 'pending', 'DRAFT')
         RETURNING id`
      ).then(res => res.rows[0].id);

      const response = await server.inject({
        method: 'POST',
        url: `/api/v1/operational/pipeline-tasks/${taskId}/retry`,
        headers: { authorization: `Bearer ${operatorToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /operational/pipeline-tasks/:taskId', () => {
    it('should return 404 for non-existent task', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/api/v1/operational/pipeline-tasks/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${operatorToken}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should delete a task and associated item', async () => {
      const itemId = await pool.query(
        `INSERT INTO drafts (data_type, raw_data, source)
         VALUES ('rule', '{}', 'test')
         RETURNING id`
      ).then(res => res.rows[0].id);

      const taskId = await pool.query(
        `INSERT INTO pipeline_tasks 
         (item_id, item_type, data_type, current_status, current_stage)
         VALUES ($1, 'draft', 'rule', 'pending', 'DRAFT')
         RETURNING id`,
        [itemId]
      ).then(res => res.rows[0].id);

      const response = await server.inject({
        method: 'DELETE',
        url: `/api/v1/operational/pipeline-tasks/${taskId}`,
        headers: { authorization: `Bearer ${operatorToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);

      const task = await pool.query(`SELECT id FROM pipeline_tasks WHERE id = $1`, [taskId]);
      expect(task.rows).toHaveLength(0);

      const draft = await pool.query(`SELECT id FROM drafts WHERE id = $1`, [itemId]);
      expect(draft.rows).toHaveLength(0);
    });
  });
});

