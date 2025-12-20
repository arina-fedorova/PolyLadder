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
import {
  createTestOperator,
  createTestLearner,
  insertReviewQueueItem,
  insertPipelineFailure,
  insertValidatedMeaning,
  insertServiceState,
} from '../helpers/db';
import {
  LoginResponse,
  SuccessResponse,
  PipelineHealthResponse,
  PaginatedResponse,
  ReviewQueueItem,
  ItemDetailResponse,
  FailureItem,
} from '../helpers/types';

describe('Operational Integration Tests', () => {
  let server: FastifyInstance;
  let pool: Pool;

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
  });

  async function getOperatorToken(): Promise<string> {
    const operator = await createTestOperator(pool, {
      email: 'test-operator@example.com',
      password: 'OperatorPassword123!',
    });

    const response = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: operator.email, password: operator.password },
    });

    return response.json<LoginResponse>().accessToken;
  }

  async function getLearnerToken(): Promise<string> {
    const learner = await createTestLearner(pool, {
      email: 'test-learner@example.com',
      password: 'LearnerPassword123!',
    });

    const response = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: learner.email, password: learner.password },
    });

    return response.json<LoginResponse>().accessToken;
  }

  describe('GET /operational/health', () => {
    it('should return pipeline health for operator', async () => {
      const token = await getOperatorToken();
      await insertServiceState(pool, {
        serviceName: 'refinement_service',
        lastCheckpoint: new Date(),
      });

      const response = await server.inject({
        method: 'GET',
        url: '/operational/health',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PipelineHealthResponse>();
      expect(body.pipeline).toBeDefined();
      expect(body.pipeline.draft).toBeGreaterThanOrEqual(0);
      expect(body.pipeline.candidate).toBeGreaterThanOrEqual(0);
      expect(body.pipeline.validated).toBeGreaterThanOrEqual(0);
      expect(body.pipeline.approved).toBeGreaterThanOrEqual(0);
      expect(body.byTable).toBeInstanceOf(Array);
      expect(body.recentActivity).toBeDefined();
      expect(body.serviceStatus).toBeDefined();
    });

    it('should reject request from learner', async () => {
      const token = await getLearnerToken();

      const response = await server.inject({
        method: 'GET',
        url: '/operational/health',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should reject request without auth', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/operational/health',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /operational/review-queue', () => {
    it('should return empty queue', async () => {
      const token = await getOperatorToken();

      const response = await server.inject({
        method: 'GET',
        url: '/operational/review-queue',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PaginatedResponse<ReviewQueueItem>>();
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('should return items in queue ordered by priority', async () => {
      const token = await getOperatorToken();
      const meaningId = await insertValidatedMeaning(pool);

      await insertReviewQueueItem(pool, {
        itemId: meaningId,
        tableName: 'meanings',
        priority: 3,
        reason: 'Low confidence',
      });

      const response = await server.inject({
        method: 'GET',
        url: '/operational/review-queue',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PaginatedResponse<ReviewQueueItem>>();
      expect(body.total).toBe(1);
      expect(body.items[0].itemId).toBe(meaningId);
      expect(body.items[0].tableName).toBe('meanings');
      expect(body.items[0].priority).toBe(3);
    });

    it('should paginate results', async () => {
      const token = await getOperatorToken();

      const response = await server.inject({
        method: 'GET',
        url: '/operational/review-queue?limit=5&offset=0',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PaginatedResponse<ReviewQueueItem>>();
      expect(body.limit).toBe(5);
      expect(body.offset).toBe(0);
    });
  });

  describe('GET /operational/items/:tableName/:id', () => {
    it('should return item details', async () => {
      const token = await getOperatorToken();
      const meaningId = await insertValidatedMeaning(pool, {
        word: 'hello',
        definition: 'a greeting',
      });

      const response = await server.inject({
        method: 'GET',
        url: `/operational/items/meanings/${meaningId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ItemDetailResponse>();
      expect(body.id).toBe(meaningId);
      expect(body.tableName).toBe('meanings');
    });

    it('should return 404 for non-existent item', async () => {
      const token = await getOperatorToken();

      const response = await server.inject({
        method: 'GET',
        url: '/operational/items/meanings/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should reject invalid table name', async () => {
      const token = await getOperatorToken();

      const response = await server.inject({
        method: 'GET',
        url: '/operational/items/invalid_table/some-id',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /operational/approve/:id', () => {
    it('should approve validated item', async () => {
      const token = await getOperatorToken();
      const meaningId = await insertValidatedMeaning(pool);

      const response = await server.inject({
        method: 'POST',
        url: `/operational/approve/${meaningId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          tableName: 'meanings',
          notes: 'Looks good!',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<SuccessResponse>().success).toBe(true);

      const approved = await pool.query('SELECT * FROM approved_meanings WHERE word = $1', [
        'test',
      ]);
      expect(approved.rows.length).toBe(1);
    });

    it('should reject invalid table name', async () => {
      const token = await getOperatorToken();

      const response = await server.inject({
        method: 'POST',
        url: '/operational/approve/some-id',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          tableName: 'invalid_table',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /operational/reject/:id', () => {
    it('should reject validated item', async () => {
      const token = await getOperatorToken();
      const meaningId = await insertValidatedMeaning(pool);

      const response = await server.inject({
        method: 'POST',
        url: `/operational/reject/${meaningId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          tableName: 'meanings',
          reason: 'Definition is incorrect and misleading',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<SuccessResponse>().success).toBe(true);

      const validated = await pool.query('SELECT * FROM validated_meanings WHERE id = $1', [
        meaningId,
      ]);
      expect(validated.rows.length).toBe(0);
    });

    it('should require minimum reason length', async () => {
      const token = await getOperatorToken();
      const meaningId = await insertValidatedMeaning(pool);

      const response = await server.inject({
        method: 'POST',
        url: `/operational/reject/${meaningId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          tableName: 'meanings',
          reason: 'short',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /operational/failures', () => {
    it('should return empty failures list', async () => {
      const token = await getOperatorToken();

      const response = await server.inject({
        method: 'GET',
        url: '/operational/failures',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PaginatedResponse<FailureItem>>();
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('should return pipeline failures', async () => {
      const token = await getOperatorToken();
      await insertPipelineFailure(pool, {
        itemId: '00000000-0000-0000-0000-000000000001',
        tableName: 'meanings',
        stage: 'validation',
        errorMessage: 'Schema validation failed',
      });

      const response = await server.inject({
        method: 'GET',
        url: '/operational/failures',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PaginatedResponse<FailureItem>>();
      expect(body.total).toBe(1);
      expect(body.items[0].tableName).toBe('meanings');
      expect(body.items[0].stage).toBe('validation');
    });

    it('should filter by tableName', async () => {
      const token = await getOperatorToken();
      await insertPipelineFailure(pool, {
        itemId: '00000000-0000-0000-0000-000000000001',
        tableName: 'meanings',
        stage: 'validation',
        errorMessage: 'Error 1',
      });
      await insertPipelineFailure(pool, {
        itemId: '00000000-0000-0000-0000-000000000002',
        tableName: 'utterances',
        stage: 'validation',
        errorMessage: 'Error 2',
      });

      const response = await server.inject({
        method: 'GET',
        url: '/operational/failures?tableName=meanings',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PaginatedResponse<FailureItem>>();
      expect(body.total).toBe(1);
      expect(body.items[0].tableName).toBe('meanings');
    });
  });
});
