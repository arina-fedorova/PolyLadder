import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer, closeTestPool, setupTestEnv } from '../setup';
import { HealthResponse, ApiInfoResponse, ErrorResponse } from '../helpers/types';

describe('Health Integration Tests', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    setupTestEnv();
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer();
    await closeTestPool();
  });

  describe('GET /health', () => {
    it('should return healthy status when database is connected', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HealthResponse>();
      expect(body.status).toBe('healthy');
      expect(body.service).toBe('polyladder-api');
      expect(body.database.connected).toBe(true);
      expect(body.database.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /', () => {
    it('should return API info', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ApiInfoResponse>();
      expect(body.service).toBe('PolyLadder API');
      expect(body.endpoints).toBeDefined();
      expect(body.endpoints.auth).toBe('/auth');
      expect(body.endpoints.operational).toBe('/operational');
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/unknown-route',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});
