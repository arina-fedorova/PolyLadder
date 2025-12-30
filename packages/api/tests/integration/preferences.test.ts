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
import type { SuccessResponse, ErrorResponse, LoginResponse } from '../helpers/types';

interface UserPreferencesResponse {
  baseLanguage: string;
  studiedLanguages: string[];
  focusModeEnabled: boolean;
  focusLanguage: string | null;
  onboardingCompleted: boolean;
  settings: Record<string, unknown>;
}

describe('User Preferences Integration Tests', () => {
  let server: FastifyInstance;
  let pool: Pool;
  let learnerToken: string;

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

    const uniqueEmail = `learner-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
    await createTestUser(pool, {
      email: uniqueEmail,
      password: 'LearnerPassword123!',
      role: 'learner',
      baseLanguage: 'EN',
    });

    const loginResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: uniqueEmail, password: 'LearnerPassword123!' },
    });

    if (loginResponse.statusCode !== 200) {
      throw new Error(`Login failed: ${loginResponse.statusCode} - ${loginResponse.body}`);
    }

    learnerToken = loginResponse.json<LoginResponse>().accessToken;
  });

  describe('GET /api/v1/learning/preferences', () => {
    it('should get default preferences for new user', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/preferences',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<UserPreferencesResponse>();
      expect(body.baseLanguage).toBe('EN');
      expect(body.studiedLanguages).toEqual([]);
      expect(body.focusModeEnabled).toBe(false);
      expect(body.focusLanguage).toBeNull();
      expect(body.onboardingCompleted).toBe(false);
      expect(body.settings).toEqual({});
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/preferences',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('PUT /api/v1/learning/preferences', () => {
    it('should update studied languages', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/api/v1/learning/preferences',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          studiedLanguages: ['ES', 'IT'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SuccessResponse>();
      expect(body.success).toBe(true);

      // Verify preferences were updated
      const getResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/preferences',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      const prefs = getResponse.json<UserPreferencesResponse>();
      expect(prefs.studiedLanguages).toEqual(['ES', 'IT']);
    });

    it('should update onboarding completion status', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/api/v1/learning/preferences',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          onboardingCompleted: true,
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify
      const getResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/preferences',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      const prefs = getResponse.json<UserPreferencesResponse>();
      expect(prefs.onboardingCompleted).toBe(true);
    });

    it('should update multiple fields at once', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/api/v1/learning/preferences',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          studiedLanguages: ['PT', 'SL'],
          focusModeEnabled: true,
          focusLanguage: 'PT',
          onboardingCompleted: true,
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify all updates
      const getResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/preferences',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      const prefs = getResponse.json<UserPreferencesResponse>();
      expect(prefs.studiedLanguages).toEqual(['PT', 'SL']);
      expect(prefs.focusModeEnabled).toBe(true);
      expect(prefs.focusLanguage).toBe('PT');
      expect(prefs.onboardingCompleted).toBe(true);
    });

    it('should reject request with no fields', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/api/v1/learning/preferences',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ErrorResponse>();
      expect(body.error.code).toBe('NO_FIELDS');
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/api/v1/learning/preferences',
        payload: {
          studiedLanguages: ['ES'],
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/learning/preferences/focus', () => {
    it('should enable focus mode with language', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/preferences/focus',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          enabled: true,
          language: 'ES',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SuccessResponse>();
      expect(body.success).toBe(true);

      // Verify focus mode is enabled
      const getResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/preferences',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      const prefs = getResponse.json<UserPreferencesResponse>();
      expect(prefs.focusModeEnabled).toBe(true);
      expect(prefs.focusLanguage).toBe('ES');
    });

    it('should disable focus mode', async () => {
      // First enable
      await server.inject({
        method: 'POST',
        url: '/api/v1/learning/preferences/focus',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          enabled: true,
          language: 'IT',
        },
      });

      // Then disable
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/preferences/focus',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          enabled: false,
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify focus mode is disabled
      const getResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/preferences',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      const prefs = getResponse.json<UserPreferencesResponse>();
      expect(prefs.focusModeEnabled).toBe(false);
      expect(prefs.focusLanguage).toBeNull();
    });

    it('should reject enable without language', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/preferences/focus',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          enabled: true,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ErrorResponse>();
      expect(body.error.code).toBe('LANGUAGE_REQUIRED');
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/preferences/focus',
        payload: {
          enabled: true,
          language: 'ES',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
