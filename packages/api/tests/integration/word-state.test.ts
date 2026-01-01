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

interface WordStateResponse {
  meaningId: string;
  userId: string;
  state: string;
  successfulReviews: number;
  totalReviews: number;
  firstSeenAt: string | null;
  markedLearningAt: string | null;
  markedKnownAt: string | null;
  lastReviewedAt: string | null;
}

interface RecordReviewResponse {
  meaningId: string;
  state: string;
  successfulReviews: number;
  totalReviews: number;
  stateChanged: boolean;
}

interface StateStatsResponse {
  unknownCount: number;
  learningCount: number;
  knownCount: number;
  totalWords: number;
}

describe('Word State Integration Tests', () => {
  let server: FastifyInstance;
  let pool: Pool;
  let learnerToken: string;
  let learnerId: string;
  let meaningId: string;

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

    // Clean up word states
    await pool.query(`DELETE FROM user_word_state`);

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

    // Create test meaning with unique ID to avoid immutability trigger
    const uniqueMeaningId = `en-test-word-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    await pool.query(
      `INSERT INTO approved_meanings (id, level, tags)
       VALUES ($1, $2, $3)`,
      [uniqueMeaningId, 'A1', JSON.stringify([])]
    );

    meaningId = uniqueMeaningId;
  });

  describe('GET /learning/word-state/:meaningId', () => {
    it('should get word state (creates unknown if not exists)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/learning/word-state/${meaningId}`,
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WordStateResponse>();
      expect(body.meaningId).toBe(meaningId);
      expect(body.userId).toBe(learnerId);
      expect(body.state).toBe('unknown');
      expect(body.successfulReviews).toBe(0);
      expect(body.totalReviews).toBe(0);
      expect(body.firstSeenAt).toBeNull();
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/learning/word-state/${meaningId}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 404 for non-existent meaning', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/word-state/nonexistent-meaning',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /learning/word-state/record-review', () => {
    it('should record successful review and transition to learning', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/word-state/record-review',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          meaningId,
          wasSuccessful: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<RecordReviewResponse>();
      expect(body.meaningId).toBe(meaningId);
      expect(body.state).toBe('learning');
      expect(body.successfulReviews).toBe(1);
      expect(body.totalReviews).toBe(1);
      expect(body.stateChanged).toBe(true);
    });

    it('should record failed review', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/word-state/record-review',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          meaningId,
          wasSuccessful: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<RecordReviewResponse>();
      expect(body.state).toBe('learning');
      expect(body.successfulReviews).toBe(0);
      expect(body.totalReviews).toBe(1);
    });

    it('should transition to known after 5 successful reviews', async () => {
      // Record 4 successful reviews
      for (let i = 0; i < 4; i++) {
        await server.inject({
          method: 'POST',
          url: '/api/v1/learning/word-state/record-review',
          headers: {
            authorization: `Bearer ${learnerToken}`,
          },
          payload: {
            meaningId,
            wasSuccessful: true,
          },
        });
      }

      // 5th successful review should mark as known
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/word-state/record-review',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          meaningId,
          wasSuccessful: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<RecordReviewResponse>();
      expect(body.state).toBe('known');
      expect(body.successfulReviews).toBe(5);
      expect(body.stateChanged).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/word-state/record-review',
        payload: {
          meaningId,
          wasSuccessful: true,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /learning/word-state/reset', () => {
    beforeEach(async () => {
      // Mark word as known first
      for (let i = 0; i < 5; i++) {
        await server.inject({
          method: 'POST',
          url: '/api/v1/learning/word-state/record-review',
          headers: {
            authorization: `Bearer ${learnerToken}`,
          },
          payload: {
            meaningId,
            wasSuccessful: true,
          },
        });
      }
    });

    it('should reset known word to learning', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/word-state/reset',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          meaningId,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ success: boolean; message: string }>();
      expect(body.success).toBe(true);

      // Verify state was reset
      const stateResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/learning/word-state/${meaningId}`,
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      const state = stateResponse.json<WordStateResponse>();
      expect(state.state).toBe('learning');
      expect(state.successfulReviews).toBe(0);
      expect(state.markedKnownAt).toBeNull();
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/word-state/reset',
        payload: {
          meaningId,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /learning/word-state/stats', () => {
    let statsMeanings: string[];

    beforeEach(async () => {
      // Create multiple meanings with unique IDs
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      statsMeanings = [
        `en-word1-${uniqueSuffix}`,
        `en-word2-${uniqueSuffix}`,
        `en-word3-${uniqueSuffix}`,
        `en-word4-${uniqueSuffix}`,
        `en-word5-${uniqueSuffix}`,
      ];

      for (const id of statsMeanings) {
        await pool.query(
          `INSERT INTO approved_meanings (id, level, tags)
           VALUES ($1, $2, $3)`,
          [id, 'A1', JSON.stringify([])]
        );
      }

      // Mark some as learning (1 review)
      await server.inject({
        method: 'POST',
        url: '/api/v1/learning/word-state/record-review',
        headers: { authorization: `Bearer ${learnerToken}` },
        payload: { meaningId: statsMeanings[0], wasSuccessful: true },
      });

      await server.inject({
        method: 'POST',
        url: '/api/v1/learning/word-state/record-review',
        headers: { authorization: `Bearer ${learnerToken}` },
        payload: { meaningId: statsMeanings[1], wasSuccessful: true },
      });

      // Mark one as known (5 reviews)
      for (let i = 0; i < 5; i++) {
        await server.inject({
          method: 'POST',
          url: '/api/v1/learning/word-state/record-review',
          headers: { authorization: `Bearer ${learnerToken}` },
          payload: { meaningId: statsMeanings[2], wasSuccessful: true },
        });
      }

      // Create unknown states for remaining
      await server.inject({
        method: 'GET',
        url: `/api/v1/learning/word-state/${statsMeanings[3]}`,
        headers: { authorization: `Bearer ${learnerToken}` },
      });

      await server.inject({
        method: 'GET',
        url: `/api/v1/learning/word-state/${statsMeanings[4]}`,
        headers: { authorization: `Bearer ${learnerToken}` },
      });
    });

    it('should return state statistics', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/word-state/stats?language=EN',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<StateStatsResponse>();
      expect(body.unknownCount).toBe(2);
      expect(body.learningCount).toBe(2);
      expect(body.knownCount).toBe(1);
      expect(body.totalWords).toBe(5);
    });

    it('should return zero stats when no words', async () => {
      // Clean all word states
      await pool.query('DELETE FROM user_word_state');

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/word-state/stats?language=EN',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<StateStatsResponse>();
      expect(body.unknownCount).toBe(0);
      expect(body.learningCount).toBe(0);
      expect(body.knownCount).toBe(0);
      expect(body.totalWords).toBe(0);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/word-state/stats?language=EN',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /learning/word-state/by-state', () => {
    let byStateMeanings: string[];

    beforeEach(async () => {
      // Create test meanings with unique IDs
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      byStateMeanings = [
        `en-learning1-${uniqueSuffix}`,
        `en-learning2-${uniqueSuffix}`,
        `en-known1-${uniqueSuffix}`,
      ];

      for (const id of byStateMeanings) {
        await pool.query(
          `INSERT INTO approved_meanings (id, level, tags)
           VALUES ($1, $2, $3)`,
          [id, 'A1', JSON.stringify([])]
        );
      }

      // Mark as learning
      await server.inject({
        method: 'POST',
        url: '/api/v1/learning/word-state/record-review',
        headers: { authorization: `Bearer ${learnerToken}` },
        payload: { meaningId: byStateMeanings[0], wasSuccessful: true },
      });

      await server.inject({
        method: 'POST',
        url: '/api/v1/learning/word-state/record-review',
        headers: { authorization: `Bearer ${learnerToken}` },
        payload: { meaningId: byStateMeanings[1], wasSuccessful: true },
      });

      // Mark as known
      for (let i = 0; i < 5; i++) {
        await server.inject({
          method: 'POST',
          url: '/api/v1/learning/word-state/record-review',
          headers: { authorization: `Bearer ${learnerToken}` },
          payload: { meaningId: byStateMeanings[2], wasSuccessful: true },
        });
      }
    });

    it('should return words by state', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/word-state/by-state?language=EN&state=learning',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        words: Array<{ meaning_id: string; state: string }>;
        total: number;
      }>();
      expect(body.words.length).toBe(2);
      expect(body.words.every((w) => w.state === 'learning')).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/word-state/by-state?language=EN&state=learning&limit=1&offset=0',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ words: unknown[]; limit: number; offset: number }>();
      expect(body.words.length).toBe(1);
      expect(body.limit).toBe(1);
      expect(body.offset).toBe(0);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/word-state/by-state?language=EN&state=learning',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
