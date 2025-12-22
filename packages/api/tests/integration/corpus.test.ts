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
import { createTestOperator } from '../helpers/db';
import { LoginResponse } from '../helpers/types';

describe('Corpus Export Integration Tests', () => {
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
      email: `test-operator-${Date.now()}@example.com`,
      password: 'OperatorPassword123!',
    });

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: operator.email, password: operator.password },
    });

    expect(response.statusCode).toBe(200);
    return response.json<LoginResponse>().accessToken;
  }

  async function createTestMeanings(count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const id = `test-meaning-${i}-${Date.now()}`;
      await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, $2, $3)`, [
        id,
        'A1',
        JSON.stringify([]),
      ]);
      ids.push(id);
    }
    return ids;
  }

  describe('POST /operational/corpus/export', () => {
    it('should export small dataset as JSON', async () => {
      const token = await getOperatorToken();
      const itemIds = await createTestMeanings(5);

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/corpus/export',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          itemIds,
          contentType: 'meaning',
          format: 'json',
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body) as unknown[];
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(5);
    });

    it('should export small dataset as CSV', async () => {
      const token = await getOperatorToken();
      const itemIds = await createTestMeanings(5);

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/corpus/export',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          itemIds,
          contentType: 'meaning',
          format: 'csv',
        },
      });

      expect(response.statusCode).toBe(200);
      const lines = response.body.split('\n');
      expect(lines.length).toBeGreaterThan(5);
      expect(lines[0]).toContain('id');
      expect(lines[0]).toContain('level');
    });

    it('should stream large dataset as JSON', async () => {
      const token = await getOperatorToken();
      const itemIds = await createTestMeanings(1500);

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/corpus/export',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          itemIds,
          contentType: 'meaning',
          format: 'json',
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body) as unknown[];
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1500);
    });

    it('should stream large dataset as CSV', async () => {
      const token = await getOperatorToken();
      const itemIds = await createTestMeanings(1500);

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/corpus/export',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          itemIds,
          contentType: 'meaning',
          format: 'csv',
        },
      });

      expect(response.statusCode).toBe(200);
      const lines = response.body.split('\n').filter((line) => line.trim().length > 0);
      expect(lines.length).toBe(1501);
      expect(lines[0]).toContain('id');
    });

    it('should reject export with more than 10000 items', async () => {
      const token = await getOperatorToken();
      const itemIds = await createTestMeanings(10001);

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/corpus/export',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          itemIds,
          contentType: 'meaning',
          format: 'json',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: { message: string } }>();
      expect(body.error.message).toContain('Export limit is 10000 items');
    });

    it('should reject empty itemIds', async () => {
      const token = await getOperatorToken();

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/corpus/export',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          itemIds: [],
          contentType: 'meaning',
          format: 'json',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: { message: string } }>();
      expect(body.error.message).toContain('No items selected');
    });

    it('should reject invalid content type', async () => {
      const token = await getOperatorToken();
      const itemIds = await createTestMeanings(5);

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/corpus/export',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          itemIds,
          contentType: 'invalid',
          format: 'json',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: { message: string } }>();
      expect(body.error.message).toContain('Invalid content type');
    });

    it('should require operator role', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/corpus/export',
        payload: {
          itemIds: ['test-id'],
          contentType: 'meaning',
          format: 'json',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should handle export of non-existent items', async () => {
      const token = await getOperatorToken();

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/corpus/export',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          itemIds: ['non-existent-id-1', 'non-existent-id-2'],
          contentType: 'meaning',
          format: 'csv',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: { message: string } }>();
      expect(body.error.message).toContain('No items found');
    });
  });
});
