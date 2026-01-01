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

interface Exercise {
  id: string;
  type: string;
  language: string;
  level: string;
  prompt: string;
  options: string[] | null;
  metadata?: Record<string, unknown>;
}

interface ExercisesResponse {
  exercises: Exercise[];
  total: number;
}

interface SubmitExerciseResponse {
  correct: boolean;
  correctAnswer: string;
  explanation: string | null;
}

interface ExerciseStatsResponse {
  totalAttempts: number;
  correctAttempts: number;
  accuracyPercent: number;
  byType: {
    type: string;
    attempts: number;
    correct: number;
    accuracy: number;
  }[];
}

describe('Exercises Integration Tests', () => {
  let server: FastifyInstance;
  let pool: Pool;
  let learnerToken: string;
  let learnerId: string;
  let exerciseId: string;

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

    // Clean up exercise results (approved_exercises cannot be deleted due to immutability trigger)
    await pool.query(`DELETE FROM user_exercise_results`);

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

    // Create test exercises
    const exerciseResult = await pool.query<{ id: string }>(
      `INSERT INTO approved_exercises (type, level, languages, prompt, correct_answer, options, metadata)
       VALUES
       ('multiple_choice', 'A1', '["ES"]'::jsonb, 'A', 'A', '["A","B","C","D"]'::jsonb, '{"test": true, "audioUrl": "https://example.com/a.mp3"}'::jsonb),
       ('multiple_choice', 'A1', '["ES"]'::jsonb, 'B', 'B', '["A","B","C","D"]'::jsonb, '{"test": true}'::jsonb),
       ('dictation', 'A1', '["ES"]'::jsonb, 'cat', 'cat', NULL, '{"test": true, "audioUrl": "https://example.com/cat.mp3"}'::jsonb)
       RETURNING id`
    );

    exerciseId = exerciseResult.rows[0].id;
  });

  describe('GET /learning/exercises', () => {
    it('should return exercises for a language', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/exercises?language=ES&count=10',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ExercisesResponse>();
      expect(body.exercises).toBeDefined();
      expect(body.exercises.length).toBeGreaterThan(0);
      expect(body.exercises.length).toBeLessThanOrEqual(10);
      expect(body.total).toBe(body.exercises.length);

      // Verify exercise structure
      const firstExercise = body.exercises[0];
      expect(firstExercise).toHaveProperty('id');
      expect(firstExercise).toHaveProperty('type');
      expect(firstExercise).toHaveProperty('language', 'ES');
      expect(firstExercise).toHaveProperty('prompt');
    });

    it('should filter exercises by type', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/exercises?language=ES&type=multiple_choice&count=10',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ExercisesResponse>();
      expect(body.exercises).toBeDefined();
      body.exercises.forEach((exercise) => {
        expect(exercise.type).toBe('multiple_choice');
      });
    });

    it('should filter exercises by level', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/exercises?language=ES&level=A1&count=10',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ExercisesResponse>();
      expect(body.exercises).toBeDefined();
      body.exercises.forEach((exercise) => {
        expect(exercise.level).toBe('A1');
      });
    });

    it('should respect count parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/exercises?language=ES&count=2',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ExercisesResponse>();
      expect(body.exercises.length).toBeLessThanOrEqual(2);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/exercises?language=ES',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 if user has not added the language', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/exercises?language=IT',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /learning/exercises/submit', () => {
    it('should submit correct answer', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/exercises/submit',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          exerciseId,
          answer: 'A',
          timeSpentMs: 5000,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SubmitExerciseResponse>();
      expect(body.correct).toBe(true);
      expect(body.correctAnswer).toBe('A');

      // Verify database was updated
      const dbResult = await pool.query<{ correct: boolean; time_spent_ms: number }>(
        `SELECT correct, time_spent_ms
         FROM user_exercise_results
         WHERE user_id = $1 AND exercise_id = $2`,
        [learnerId, exerciseId]
      );

      expect(dbResult.rows).toHaveLength(1);
      expect(dbResult.rows[0].correct).toBe(true);
      expect(dbResult.rows[0].time_spent_ms).toBe(5000);
    });

    it('should submit incorrect answer', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/exercises/submit',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          exerciseId,
          answer: 'B',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SubmitExerciseResponse>();
      expect(body.correct).toBe(false);
      expect(body.correctAnswer).toBe('A');

      // Verify database was updated
      const dbResult = await pool.query<{ correct: boolean }>(
        `SELECT correct
         FROM user_exercise_results
         WHERE user_id = $1 AND exercise_id = $2`,
        [learnerId, exerciseId]
      );

      expect(dbResult.rows).toHaveLength(1);
      expect(dbResult.rows[0].correct).toBe(false);
    });

    it('should handle case-insensitive answers', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/exercises/submit',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          exerciseId,
          answer: 'a', // lowercase
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<SubmitExerciseResponse>();
      expect(body.correct).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/exercises/submit',
        payload: {
          exerciseId,
          answer: 'A',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 404 for non-existent exercise', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/exercises/submit',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          exerciseId: '00000000-0000-0000-0000-000000000000',
          answer: 'A',
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /learning/exercises/stats', () => {
    beforeEach(async () => {
      // Insert some test results
      await pool.query(
        `INSERT INTO user_exercise_results (user_id, exercise_id, language, exercise_type, correct, submitted_at)
         VALUES
         ($1, $2, 'ES', 'multiple_choice', true, CURRENT_TIMESTAMP),
         ($1, $2, 'ES', 'multiple_choice', true, CURRENT_TIMESTAMP),
         ($1, $2, 'ES', 'multiple_choice', false, CURRENT_TIMESTAMP),
         ($1, $2, 'ES', 'dictation', true, CURRENT_TIMESTAMP),
         ($1, $2, 'ES', 'dictation', false, CURRENT_TIMESTAMP)`,
        [learnerId, exerciseId]
      );
    });

    it('should return exercise statistics', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/exercises/stats?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ExerciseStatsResponse>();
      expect(body.totalAttempts).toBe(5);
      expect(body.correctAttempts).toBe(3);
      expect(body.accuracyPercent).toBe(60);

      // Check by-type stats
      expect(body.byType).toHaveLength(2);

      const mcStats = body.byType.find((t) => t.type === 'multiple_choice');
      expect(mcStats).toBeDefined();
      expect(mcStats!.attempts).toBe(3);
      expect(mcStats!.correct).toBe(2);
      expect(mcStats!.accuracy).toBe(67);

      const dictationStats = body.byType.find((t) => t.type === 'dictation');
      expect(dictationStats).toBeDefined();
      expect(dictationStats!.attempts).toBe(2);
      expect(dictationStats!.correct).toBe(1);
      expect(dictationStats!.accuracy).toBe(50);
    });

    it('should return zero stats for no attempts', async () => {
      // Create a new user with no attempts
      const newEmail = `new-${Date.now()}@test.com`;
      await createTestUser(pool, {
        email: newEmail,
        password: 'Password123!',
        role: 'learner',
      });

      const loginResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: newEmail,
          password: 'Password123!',
        },
      });

      const loginData = loginResponse.json<LoginResponse>();

      // Add ES language
      await server.inject({
        method: 'POST',
        url: '/api/v1/learning/preferences/languages',
        headers: {
          authorization: `Bearer ${loginData.accessToken}`,
        },
        payload: {
          language: 'ES',
        },
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/exercises/stats?language=ES',
        headers: {
          authorization: `Bearer ${loginData.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ExerciseStatsResponse>();
      expect(body.totalAttempts).toBe(0);
      expect(body.correctAttempts).toBe(0);
      expect(body.accuracyPercent).toBe(0);
      expect(body.byType).toHaveLength(0);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/exercises/stats?language=ES',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
