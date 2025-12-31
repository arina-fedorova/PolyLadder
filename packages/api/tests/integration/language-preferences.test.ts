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

interface PreferencesResponse {
  baseLanguage: string;
  studiedLanguages: string[];
  focusModeEnabled: boolean;
  focusLanguage: string | null;
  onboardingCompleted: boolean;
  settings: Record<string, unknown>;
}

interface OrthographyGateRow {
  status: string;
}

describe('Language Preferences Integration Tests', () => {
  let server: FastifyInstance;
  let pool: Pool;
  let authToken: string;
  let userId: string;

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

    const uniqueEmail = `learner-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`;
    const user = await createTestUser(pool, {
      email: uniqueEmail,
      password: 'Password123!',
      role: 'learner',
    });
    userId = user.id;

    const loginResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: uniqueEmail,
        password: 'Password123!',
      },
    });

    const loginData = loginResponse.json<LoginResponse>();
    authToken = loginData.accessToken;

    // Initialize user preferences (GET creates them if they don't exist)
    await server.inject({
      method: 'GET',
      url: '/api/v1/learning/preferences',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });
  });

  describe('POST /learning/preferences/languages', () => {
    it('should add a new language successfully', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/preferences/languages',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          language: 'ES',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SuccessResponse>();
      expect(body.success).toBe(true);

      const prefsResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/preferences',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      const prefs = prefsResponse.json<PreferencesResponse>();
      expect(prefs.studiedLanguages).toContain('ES');
    });

    it('should create orthography gate when adding language', async () => {
      await server.inject({
        method: 'POST',
        url: '/api/v1/learning/preferences/languages',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          language: 'ES',
        },
      });

      const gateResult = await pool.query<OrthographyGateRow>(
        `SELECT status FROM user_orthography_gates WHERE user_id = $1 AND language = $2`,
        [userId, 'ES']
      );

      expect(gateResult.rows.length).toBe(1);
      expect(gateResult.rows[0].status).toBe('locked');
    });

    it('should reject adding more than 5 languages', async () => {
      const languages = ['ES', 'IT', 'PT', 'FR', 'DE'];

      for (const lang of languages) {
        await server.inject({
          method: 'POST',
          url: '/api/v1/learning/preferences/languages',
          headers: {
            authorization: `Bearer ${authToken}`,
          },
          payload: {
            language: lang,
          },
        });
      }

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/preferences/languages',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          language: 'RU',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ErrorResponse>();
      expect(body.error.code).toBe('MAX_LANGUAGES_EXCEEDED');
    });

    it('should reject adding duplicate language', async () => {
      await server.inject({
        method: 'POST',
        url: '/api/v1/learning/preferences/languages',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          language: 'ES',
        },
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/preferences/languages',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          language: 'ES',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ErrorResponse>();
      expect(body.error.code).toBe('LANGUAGE_ALREADY_ADDED');
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/preferences/languages',
        payload: {
          language: 'ES',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('DELETE /learning/preferences/languages/:language', () => {
    beforeEach(async () => {
      await server.inject({
        method: 'POST',
        url: '/api/v1/learning/preferences/languages',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          language: 'ES',
        },
      });

      await server.inject({
        method: 'POST',
        url: '/api/v1/learning/preferences/languages',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          language: 'IT',
        },
      });
    });

    it('should remove a language successfully', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/api/v1/learning/preferences/languages/ES',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SuccessResponse>();
      expect(body.success).toBe(true);
      expect(body.message).toContain('progress has been preserved');

      const prefsResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/preferences',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      const prefs = prefsResponse.json<PreferencesResponse>();
      expect(prefs.studiedLanguages).not.toContain('ES');
      expect(prefs.studiedLanguages).toContain('IT');
    });

    it('should reject removing last language', async () => {
      await server.inject({
        method: 'DELETE',
        url: '/api/v1/learning/preferences/languages/ES',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      const response = await server.inject({
        method: 'DELETE',
        url: '/api/v1/learning/preferences/languages/IT',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ErrorResponse>();
      expect(body.error.code).toBe('CANNOT_REMOVE_LAST_LANGUAGE');
    });

    it('should disable focus mode if removing focused language', async () => {
      await server.inject({
        method: 'POST',
        url: '/api/v1/learning/preferences/focus',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          enabled: true,
          language: 'ES',
        },
      });

      await server.inject({
        method: 'DELETE',
        url: '/api/v1/learning/preferences/languages/ES',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      const prefsResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/preferences',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      const prefs = prefsResponse.json<PreferencesResponse>();
      expect(prefs.focusModeEnabled).toBe(false);
      expect(prefs.focusLanguage).toBeNull();
    });

    it('should reject removing language not in studied list', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/api/v1/learning/preferences/languages/FR',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ErrorResponse>();
      expect(body.error.code).toBe('LANGUAGE_NOT_FOUND');
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/api/v1/learning/preferences/languages/ES',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
