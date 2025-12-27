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
import { createTestOperator, createTestDocument } from '../helpers/db';
import { LoginResponse } from '../helpers/types';

describe('Pipelines Integration Tests', () => {
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

  describe('GET /operational/pipelines', () => {
    it('should return empty list when no pipelines exist', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/operational/pipelines',
        headers: { authorization: `Bearer ${operatorToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.pipelines).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(50);
    });

    it('should require operator role', async () => {
      // Create learner
      const learnerEmail = `learner-${Date.now()}@example.com`;
      await pool.query(
        `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'learner')`,
        [learnerEmail, 'hash']
      );

      const loginResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: learnerEmail, password: 'password' },
      });
      const learnerToken = loginResponse.json<LoginResponse>().accessToken;

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/operational/pipelines',
        headers: { authorization: `Bearer ${learnerToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return pipelines when they exist', async () => {
      // Create document
      const doc = await createTestDocument(pool, { uploadedBy: operatorId });

      // Create pipeline
      await pool.query(
        `INSERT INTO pipelines (document_id, status, current_stage)
         VALUES ($1, 'processing', 'extracting')`,
        [doc.id]
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/operational/pipelines',
        headers: { authorization: `Bearer ${operatorToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.pipelines).toHaveLength(1);
      expect(body.pipelines[0].status).toBe('processing');
      expect(body.pipelines[0].current_stage).toBe('extracting');
    });

    it('should filter by status', async () => {
      const doc1 = await createTestDocument(pool, { uploadedBy: operatorId });
      const doc2 = await createTestDocument(pool, { uploadedBy: operatorId });

      await pool.query(
        `INSERT INTO pipelines (document_id, status, current_stage) VALUES
         ($1, 'processing', 'extracting'),
         ($2, 'completed', 'completed')`,
        [doc1.id, doc2.id]
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/operational/pipelines?status=processing',
        headers: { authorization: `Bearer ${operatorToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.pipelines).toHaveLength(1);
      expect(body.pipelines[0].status).toBe('processing');
    });
  });

  describe('GET /operational/pipelines/:pipelineId', () => {
    it('should return 404 for non-existent pipeline', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/operational/pipelines/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${operatorToken}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return pipeline details with tasks and events', async () => {
      const doc = await createTestDocument(pool, { uploadedBy: operatorId });

      const pipelineResult = await pool.query(
        `INSERT INTO pipelines (document_id, status, current_stage)
         VALUES ($1, 'processing', 'extracting')
         RETURNING id`,
        [doc.id]
      );
      const pipelineId = pipelineResult.rows[0].id;

      // Create task
      await pool.query(
        `INSERT INTO pipeline_tasks
         (pipeline_id, item_id, item_type, data_type, task_type, current_status, current_stage)
         VALUES ($1, $2, 'chunk', 'document', 'extract', 'processing', 'EXTRACTING')`,
        [pipelineId, doc.id]
      );

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/operational/pipelines/${pipelineId}`,
        headers: { authorization: `Bearer ${operatorToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.pipeline).toBeDefined();
      expect(body.pipeline.id).toBe(pipelineId);
      expect(body.tasks).toHaveLength(1);
      expect(body.tasks[0].task_type).toBe('extract');
    });
  });

  describe('POST /operational/pipelines/:pipelineId/retry', () => {
    it('should return 404 for non-existent pipeline', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/pipelines/00000000-0000-0000-0000-000000000000/retry',
        headers: { authorization: `Bearer ${operatorToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(404);
    });

    it('should retry failed tasks', async () => {
      const doc = await createTestDocument(pool, { uploadedBy: operatorId });

      const pipelineResult = await pool.query(
        `INSERT INTO pipelines (document_id, status, current_stage, error_message)
         VALUES ($1, 'failed', 'extracting', 'Test error')
         RETURNING id`,
        [doc.id]
      );
      const pipelineId = pipelineResult.rows[0].id;

      // Create failed task
      await pool.query(
        `INSERT INTO pipeline_tasks
         (pipeline_id, item_id, item_type, data_type, task_type, current_status, current_stage, error_message, retry_count)
         VALUES ($1, $2, 'chunk', 'document', 'extract', 'failed', 'EXTRACTING', 'Test error', 1)`,
        [pipelineId, doc.id]
      );

      const response = await server.inject({
        method: 'POST',
        url: `/api/v1/operational/pipelines/${pipelineId}/retry`,
        headers: { authorization: `Bearer ${operatorToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.retriedTasks).toBe(1);

      // Check task was reset
      const taskCheck = await pool.query(
        `SELECT current_status, error_message FROM pipeline_tasks WHERE pipeline_id = $1`,
        [pipelineId]
      );
      expect(taskCheck.rows[0].current_status).toBe('pending');
      expect(taskCheck.rows[0].error_message).toBeNull();

      // Check pipeline was reset
      const pipelineCheck = await pool.query(
        `SELECT status, error_message FROM pipelines WHERE id = $1`,
        [pipelineId]
      );
      expect(pipelineCheck.rows[0].status).toBe('processing');
      expect(pipelineCheck.rows[0].error_message).toBeNull();
    });

    it('should not retry tasks that exceeded max retries', async () => {
      const doc = await createTestDocument(pool, { uploadedBy: operatorId });

      const pipelineResult = await pool.query(
        `INSERT INTO pipelines (document_id, status, current_stage)
         VALUES ($1, 'failed', 'extracting')
         RETURNING id`,
        [doc.id]
      );
      const pipelineId = pipelineResult.rows[0].id;

      // Create task with max retries
      await pool.query(
        `INSERT INTO pipeline_tasks
         (pipeline_id, item_id, item_type, data_type, task_type, current_status, current_stage, retry_count)
         VALUES ($1, $2, 'chunk', 'document', 'extract', 'failed', 'EXTRACTING', 3)`,
        [pipelineId, doc.id]
      );

      const response = await server.inject({
        method: 'POST',
        url: `/api/v1/operational/pipelines/${pipelineId}/retry`,
        headers: { authorization: `Bearer ${operatorToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.retriedTasks).toBe(0);
    });
  });

  describe('DELETE /operational/pipelines/:pipelineId', () => {
    it('should return 404 for non-existent pipeline', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/api/v1/operational/pipelines/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${operatorToken}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should delete pipeline and document', async () => {
      const doc = await createTestDocument(pool, { uploadedBy: operatorId });

      const pipelineResult = await pool.query(
        `INSERT INTO pipelines (document_id, status, current_stage)
         VALUES ($1, 'processing', 'extracting')
         RETURNING id`,
        [doc.id]
      );
      const pipelineId = pipelineResult.rows[0].id;

      const response = await server.inject({
        method: 'DELETE',
        url: `/api/v1/operational/pipelines/${pipelineId}`,
        headers: { authorization: `Bearer ${operatorToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);

      // Check pipeline deleted (cascade from document delete)
      const pipelineCheck = await pool.query(
        `SELECT id FROM pipelines WHERE id = $1`,
        [pipelineId]
      );
      expect(pipelineCheck.rows).toHaveLength(0);

      // Check document deleted
      const docCheck = await pool.query(
        `SELECT id FROM document_sources WHERE id = $1`,
        [doc.id]
      );
      expect(docCheck.rows).toHaveLength(0);
    });
  });
});
