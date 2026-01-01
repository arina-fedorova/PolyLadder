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

interface OrthographyLesson {
  conceptId: string;
  letter: string;
  ipa: string;
  soundDescription: string;
  examples: {
    word: string;
    audioUrl: string | null;
  }[];
  completed: boolean;
}

interface OrthographyResponse {
  lessons: OrthographyLesson[];
  totalLessons: number;
  completedLessons: number;
  orthographyCompleted: boolean;
}

interface CompleteOrthographyResponse {
  success: boolean;
  gateCompleted: boolean;
  accuracy: number;
  requiredAccuracy: number;
}

interface ProgressResponse {
  success: boolean;
}

interface ErrorResponse {
  error: {
    statusCode: number;
    message: string;
    requestId: string;
    code: string;
  };
}

interface UserLanguageRow {
  orthography_completed: boolean;
  orthography_accuracy: string;
}

interface UserProgressRow {
  status: string;
  completion_date: Date | null;
  count?: string;
  concept_id?: string;
}

describe('Orthography Learning Integration Tests', () => {
  let server: FastifyInstance;
  let pool: Pool;
  let learnerToken: string;
  let learnerId: string;

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

    // Clean up test data
    await pool.query(`DELETE FROM user_progress WHERE concept_id LIKE 'ortho-%'`);
    await pool.query(`DELETE FROM curriculum_graph WHERE concept_type = 'orthography'`);

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

    // Insert test orthography concepts
    await pool.query(
      `INSERT INTO curriculum_graph (concept_id, language, cefr_level, concept_type, title, priority_order, metadata, prerequisites_and, prerequisites_or)
       VALUES
       ('ortho-a', 'ES', 'A0', 'orthography', 'Letter A', 1, '{"letter": "A", "ipa": "a", "soundDescription": "Open front unrounded vowel", "exampleWords": ["agua", "amor"], "order": 1}'::jsonb, '{}', '{}'),
       ('ortho-b', 'ES', 'A0', 'orthography', 'Letter B', 2, '{"letter": "B", "ipa": "b", "soundDescription": "Voiced bilabial plosive", "exampleWords": ["bueno", "boca"], "order": 2}'::jsonb, '{}', '{}'),
       ('ortho-c', 'ES', 'A0', 'orthography', 'Letter C', 3, '{"letter": "C", "ipa": "k", "soundDescription": "Voiceless velar plosive", "exampleWords": ["casa", "comer"], "order": 3}'::jsonb, '{}', '{}')`
    );
  });

  describe('GET /learning/orthography/:language', () => {
    it('should return orthography lessons for a language', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/orthography/ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<OrthographyResponse>();
      expect(body.lessons).toHaveLength(3);
      expect(body.totalLessons).toBe(3);
      expect(body.completedLessons).toBe(0);
      expect(body.orthographyCompleted).toBe(false);

      // Verify first lesson structure
      const firstLesson = body.lessons[0];
      expect(firstLesson.conceptId).toBe('ortho-a');
      expect(firstLesson.letter).toBe('A');
      expect(firstLesson.ipa).toBe('a');
      expect(firstLesson.soundDescription).toBe('Open front unrounded vowel');
      expect(firstLesson.examples).toHaveLength(2);
      expect(firstLesson.examples[0].word).toBe('agua');
      expect(firstLesson.completed).toBe(false);
    });

    it('should return completed lessons correctly', async () => {
      // Mark first lesson as completed
      await pool.query(
        `INSERT INTO user_progress (user_id, concept_id, status, completion_date)
         VALUES ($1, 'ortho-a', 'completed', CURRENT_TIMESTAMP)`,
        [learnerId]
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/orthography/ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<OrthographyResponse>();
      expect(body.completedLessons).toBe(1);
      expect(body.lessons[0].completed).toBe(true);
      expect(body.lessons[1].completed).toBe(false);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/orthography/ES',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 if user has not added the language', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/orthography/IT',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json<ErrorResponse>();
      expect(body.error.code).toBe('LANGUAGE_NOT_STARTED');
    });

    it('should return lessons ordered by metadata.order', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/orthography/ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<OrthographyResponse>();
      expect(body.lessons[0].letter).toBe('A');
      expect(body.lessons[1].letter).toBe('B');
      expect(body.lessons[2].letter).toBe('C');
    });
  });

  describe('POST /learning/orthography/complete', () => {
    it('should mark orthography as completed with passing accuracy', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/orthography/complete',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          language: 'ES',
          accuracy: 85.5,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<CompleteOrthographyResponse>();
      expect(body.success).toBe(true);
      expect(body.gateCompleted).toBe(true);
      expect(body.accuracy).toBe(85.5);
      expect(body.requiredAccuracy).toBe(80);

      // Verify database was updated
      const dbResult = await pool.query<UserLanguageRow>(
        `SELECT orthography_completed, orthography_accuracy
         FROM user_languages
         WHERE user_id = $1 AND language = $2`,
        [learnerId, 'ES']
      );

      expect(dbResult.rows[0].orthography_completed).toBe(true);
      expect(parseFloat(dbResult.rows[0].orthography_accuracy)).toBe(85.5);
    });

    it('should not mark as completed with failing accuracy', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/orthography/complete',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          language: 'ES',
          accuracy: 75.0,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<CompleteOrthographyResponse>();
      expect(body.success).toBe(true);
      expect(body.gateCompleted).toBe(false);
      expect(body.accuracy).toBe(75.0);

      // Verify database was not marked as completed
      const dbResult = await pool.query<UserLanguageRow>(
        `SELECT orthography_completed, orthography_accuracy
         FROM user_languages
         WHERE user_id = $1 AND language = $2`,
        [learnerId, 'ES']
      );

      expect(dbResult.rows[0].orthography_completed).toBe(false);
      expect(parseFloat(dbResult.rows[0].orthography_accuracy)).toBe(75.0);
    });

    it('should return success if already completed', async () => {
      // Mark as completed first
      await pool.query(
        `UPDATE user_languages
         SET orthography_completed = true, orthography_accuracy = 90
         WHERE user_id = $1 AND language = $2`,
        [learnerId, 'ES']
      );

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/orthography/complete',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          language: 'ES',
          accuracy: 95.0,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<CompleteOrthographyResponse>();
      expect(body.success).toBe(true);
      expect(body.gateCompleted).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/orthography/complete',
        payload: {
          language: 'ES',
          accuracy: 85,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 if user has not added the language', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/orthography/complete',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          language: 'IT',
          accuracy: 85,
        },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json<ErrorResponse>();
      expect(body.error.code).toBe('LANGUAGE_NOT_STARTED');
    });
  });

  describe('POST /learning/orthography/progress', () => {
    it('should mark concept as completed', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/orthography/progress',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          conceptId: 'ortho-a',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ProgressResponse>();
      expect(body.success).toBe(true);

      // Verify database was updated
      const dbResult = await pool.query<UserProgressRow>(
        `SELECT status, completion_date
         FROM user_progress
         WHERE user_id = $1 AND concept_id = $2`,
        [learnerId, 'ortho-a']
      );

      expect(dbResult.rows[0].status).toBe('completed');
      expect(dbResult.rows[0].completion_date).toBeTruthy();
    });

    it('should update existing progress record', async () => {
      // Insert initial progress
      await pool.query(
        `INSERT INTO user_progress (user_id, concept_id, status)
         VALUES ($1, 'ortho-a', 'in_progress')`,
        [learnerId]
      );

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/orthography/progress',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          conceptId: 'ortho-a',
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify it was updated, not duplicated
      const dbResult = await pool.query<UserProgressRow>(
        `SELECT COUNT(*), status
         FROM user_progress
         WHERE user_id = $1 AND concept_id = $2
         GROUP BY status`,
        [learnerId, 'ortho-a']
      );

      expect(dbResult.rows).toHaveLength(1);
      expect(dbResult.rows[0].status).toBe('completed');
      expect(parseInt(dbResult.rows[0].count || '0')).toBe(1);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/orthography/progress',
        payload: {
          conceptId: 'ortho-a',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should handle multiple concepts for same user', async () => {
      // Mark two concepts as completed
      await server.inject({
        method: 'POST',
        url: '/api/v1/learning/orthography/progress',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          conceptId: 'ortho-a',
        },
      });

      await server.inject({
        method: 'POST',
        url: '/api/v1/learning/orthography/progress',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          conceptId: 'ortho-b',
        },
      });

      // Verify both are completed
      const dbResult = await pool.query<UserProgressRow>(
        `SELECT concept_id, status
         FROM user_progress
         WHERE user_id = $1 AND concept_id IN ('ortho-a', 'ortho-b')
         ORDER BY concept_id`,
        [learnerId]
      );

      expect(dbResult.rows).toHaveLength(2);
      expect(dbResult.rows[0].concept_id).toBe('ortho-a');
      expect(dbResult.rows[0].status).toBe('completed');
      expect(dbResult.rows[1].concept_id).toBe('ortho-b');
      expect(dbResult.rows[1].status).toBe('completed');
    });
  });
});
