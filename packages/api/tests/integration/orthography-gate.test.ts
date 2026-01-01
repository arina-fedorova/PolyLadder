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
import { createTestUser } from '../helpers/db';

interface LoginResponse {
  userId: string;
  email: string;
  role: string;
  accessToken: string;
  refreshToken: string;
}

interface GateProgress {
  language: string;
  status: 'locked' | 'unlocked' | 'completed';
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AllGatesResponse {
  gates: GateProgress[];
}

interface SuccessResponse {
  success: boolean;
  message: string;
}

interface ErrorResponse {
  error: {
    statusCode: number;
    message: string;
    requestId: string;
    code: string;
  };
}

describe('Orthography Gate Integration Tests', () => {
  let server: FastifyInstance;
  let pool: Pool;
  let learnerToken: string;
  let learnerId: string;
  let operatorToken: string;

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

    // Create learner user
    const uniqueLearnerEmail = `learner-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`;
    const learner = await createTestUser(pool, {
      email: uniqueLearnerEmail,
      password: 'Password123!',
      role: 'learner',
    });
    learnerId = learner.id;

    const learnerLoginResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: uniqueLearnerEmail,
        password: 'Password123!',
      },
    });

    const learnerLoginData = learnerLoginResponse.json<LoginResponse>();
    learnerToken = learnerLoginData.accessToken;

    // Initialize user preferences with ES language
    await server.inject({
      method: 'GET',
      url: '/api/v1/learning/preferences',
      headers: {
        authorization: `Bearer ${learnerToken}`,
      },
    });

    await server.inject({
      method: 'POST',
      url: '/api/v1/learning/preferences/languages',
      headers: {
        authorization: `Bearer ${learnerToken}`,
      },
      payload: {
        language: 'ES',
      },
    });

    // Create operator user
    const uniqueOperatorEmail = `operator-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`;
    await createTestUser(pool, {
      email: uniqueOperatorEmail,
      password: 'Password123!',
      role: 'operator',
    });

    const operatorLoginResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: uniqueOperatorEmail,
        password: 'Password123!',
      },
    });

    const operatorLoginData = operatorLoginResponse.json<LoginResponse>();
    operatorToken = operatorLoginData.accessToken;
  });

  describe('GET /learning/orthography-gate/status', () => {
    it('should return gate status for a language', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/orthography-gate/status?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<GateProgress>();
      expect(body.language).toBe('ES');
      expect(body.status).toBe('locked');
      expect(body.completedAt).toBeNull();
      expect(body.createdAt).toBeDefined();
      expect(body.updatedAt).toBeDefined();
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/orthography-gate/status?language=ES',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should initialize gate if it does not exist', async () => {
      // Add new language
      await server.inject({
        method: 'POST',
        url: '/api/v1/learning/preferences/languages',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          language: 'IT',
        },
      });

      // Check gate status
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/orthography-gate/status?language=IT',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<GateProgress>();
      expect(body.language).toBe('IT');
      expect(body.status).toBe('locked');
    });
  });

  describe('GET /learning/orthography-gate/all', () => {
    it('should return gate status for all user languages', async () => {
      // Add second language
      await server.inject({
        method: 'POST',
        url: '/api/v1/learning/preferences/languages',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          language: 'IT',
        },
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/orthography-gate/all',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AllGatesResponse>();
      expect(body.gates).toHaveLength(2);
      expect(body.gates[0].language).toBe('ES');
      expect(body.gates[1].language).toBe('IT');
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/orthography-gate/all',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /learning/orthography-gate/unlock', () => {
    it('should unlock gate from locked to unlocked', async () => {
      // Unlock gate
      const unlockResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/orthography-gate/unlock',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          language: 'ES',
        },
      });

      expect(unlockResponse.statusCode).toBe(200);
      const unlockBody = unlockResponse.json<SuccessResponse>();
      expect(unlockBody.success).toBe(true);

      // Verify gate is unlocked
      const statusResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/orthography-gate/status?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      const statusBody = statusResponse.json<GateProgress>();
      expect(statusBody.status).toBe('unlocked');
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/orthography-gate/unlock',
        payload: {
          language: 'ES',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /learning/orthography-gate/complete', () => {
    it('should mark gate as completed', async () => {
      // Complete gate
      const completeResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/orthography-gate/complete',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          language: 'ES',
        },
      });

      expect(completeResponse.statusCode).toBe(200);
      const completeBody = completeResponse.json<SuccessResponse>();
      expect(completeBody.success).toBe(true);

      // Verify gate is completed
      const statusResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/orthography-gate/status?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      const statusBody = statusResponse.json<GateProgress>();
      expect(statusBody.status).toBe('completed');
      expect(statusBody.completedAt).toBeDefined();
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/orthography-gate/complete',
        payload: {
          language: 'ES',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /learning/orthography-gate/bypass', () => {
    it('should allow operator to bypass gate for any user', async () => {
      // Bypass gate
      const bypassResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/orthography-gate/bypass',
        headers: {
          authorization: `Bearer ${operatorToken}`,
        },
        payload: {
          userId: learnerId,
          language: 'ES',
        },
      });

      expect(bypassResponse.statusCode).toBe(200);
      const bypassBody = bypassResponse.json<SuccessResponse>();
      expect(bypassBody.success).toBe(true);

      // Verify gate is completed
      const statusResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/orthography-gate/status?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      const statusBody = statusResponse.json<GateProgress>();
      expect(statusBody.status).toBe('completed');
      expect(statusBody.completedAt).toBeDefined();
    });

    it('should reject non-operator users', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/orthography-gate/bypass',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          userId: learnerId,
          language: 'ES',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json<ErrorResponse>();
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/orthography-gate/bypass',
        payload: {
          userId: learnerId,
          language: 'ES',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
