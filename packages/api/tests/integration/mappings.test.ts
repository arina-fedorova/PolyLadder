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

describe('Mappings Integration Tests', () => {
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
    const uniqueEmail = `test-operator-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
    const operator = await createTestOperator(pool, {
      email: uniqueEmail,
      password: 'OperatorPassword123!',
    });

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: operator.email, password: operator.password },
    });

    return response.json<LoginResponse>().accessToken;
  }

  describe('GET /operational/transformation-jobs', () => {
    it('should return empty list when no jobs exist', async () => {
      const token = await getOperatorToken();

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/operational/transformation-jobs',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ jobs: unknown[]; total: number; page: number; limit: number }>();
      expect(body.jobs).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(50);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/operational/transformation-jobs',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should support pagination', async () => {
      const token = await getOperatorToken();

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/operational/transformation-jobs?page=2&limit=10',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ jobs: unknown[]; total: number; page: number; limit: number }>();
      expect(body.page).toBe(2);
      expect(body.limit).toBe(10);
    });
  });
});
