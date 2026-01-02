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

describe('Recall Practice API Integration Tests', () => {
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

    // Create learner user
    const uniqueLearnerEmail = `recall-learner-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`;
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
  });

  describe('GET /learning/recall/due', () => {
    it('should return due words for recall practice', async () => {
      const timestamp = Date.now();
      const meaningId = `en-test-${timestamp}`;

      // Create a test meaning
      await pool.query(
        `INSERT INTO approved_meanings (id, level)
         VALUES ($1, 'A1')`,
        [meaningId]
      );

      // Create an utterance for the meaning
      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'test')`,
        [meaningId]
      );

      // Create word state (learning)
      await pool.query(
        `INSERT INTO user_word_state (user_id, meaning_id, language, state)
         VALUES ($1, $2, 'EN', 'learning')`,
        [learnerId, meaningId]
      );

      // Create SRS item (due now)
      await pool.query(
        `INSERT INTO user_srs_items (user_id, meaning_id, language, interval, repetitions, ease_factor, next_review_at)
         VALUES ($1, $2, 'EN', 0, 0, 2.5, current_timestamp - interval '1 hour')`,
        [learnerId, meaningId]
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/recall/due?language=EN&limit=20',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      interface DueWord {
        meaningId: string;
        word: string;
        cefrLevel: string;
        lastReviewedAt: string | null;
        nextReviewAt: string;
      }
      const body = response.json<{ words: DueWord[]; count: number }>();

      expect(body.words).toBeDefined();
      expect(Array.isArray(body.words)).toBe(true);
      expect(body.count).toBe(body.words.length);

      const testWord = body.words.find((w) => w.meaningId === meaningId);
      expect(testWord).toBeDefined();
      expect(testWord!.word).toBe('test');
      expect(testWord!.cefrLevel).toBe('A1');
      expect(testWord!.lastReviewedAt).toBeNull();
    });

    it('should initialize learning words into SRS automatically', async () => {
      const timestamp = Date.now();
      const meaningId = `en-auto-${timestamp}`;

      // Create a test meaning
      await pool.query(
        `INSERT INTO approved_meanings (id, level)
         VALUES ($1, 'A1')`,
        [meaningId]
      );

      // Create an utterance
      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'auto')`,
        [meaningId]
      );

      // Create word state (learning) but NO SRS item
      await pool.query(
        `INSERT INTO user_word_state (user_id, meaning_id, language, state)
         VALUES ($1, $2, 'EN', 'learning')`,
        [learnerId, meaningId]
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/recall/due?language=EN&limit=20',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      // Check that SRS item was created
      interface SRSRow {
        meaning_id: string;
      }
      const srsResult = await pool.query<SRSRow>(
        `SELECT meaning_id FROM user_srs_items WHERE user_id = $1 AND meaning_id = $2`,
        [learnerId, meaningId]
      );

      expect(srsResult.rows.length).toBe(1);
      expect(srsResult.rows[0].meaning_id).toBe(meaningId);
    });

    it('should return empty array when no words are due', async () => {
      // Create SRS item due in the future
      const timestamp = Date.now();
      const meaningId = `en-future-${timestamp}`;

      await pool.query(
        `INSERT INTO approved_meanings (id, level)
         VALUES ($1, 'A1')`,
        [meaningId]
      );

      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'future')`,
        [meaningId]
      );

      await pool.query(
        `INSERT INTO user_srs_items (user_id, meaning_id, language, interval, repetitions, ease_factor, next_review_at)
         VALUES ($1, $2, 'EN', 1, 0, 2.5, current_timestamp + interval '1 day')`,
        [learnerId, meaningId]
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/recall/due?language=EN&limit=20',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ words: unknown[]; count: number }>();

      expect(body.words).toHaveLength(0);
      expect(body.count).toBe(0);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/recall/due?language=EN',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /learning/recall/review', () => {
    it('should submit review and update SRS scheduling', async () => {
      const timestamp = Date.now();
      const meaningId = `en-review-${timestamp}`;

      // Create meaning
      await pool.query(
        `INSERT INTO approved_meanings (id, level)
         VALUES ($1, 'A1')`,
        [meaningId]
      );

      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'review')`,
        [meaningId]
      );

      // Create SRS item
      await pool.query(
        `INSERT INTO user_srs_items (user_id, meaning_id, language, interval, repetitions, ease_factor, next_review_at)
         VALUES ($1, $2, 'EN', 0, 0, 2.5, current_timestamp)`,
        [learnerId, meaningId]
      );

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/recall/review',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          meaningId,
          quality: 5, // Perfect recall
        },
      });

      expect(response.statusCode).toBe(200);

      interface ReviewResponse {
        nextReviewAt: string;
        interval: number;
        repetitions: number;
      }
      const body = response.json<ReviewResponse>();

      expect(body.nextReviewAt).toBeDefined();
      expect(body.interval).toBe(1); // First review: 1 day
      expect(body.repetitions).toBe(1);

      // Verify database was updated
      interface SRSItemRow {
        interval: number;
        repetitions: number;
        ease_factor: number;
        last_reviewed_at: Date | null;
      }
      const srsResult = await pool.query<SRSItemRow>(
        `SELECT interval, repetitions, ease_factor, last_reviewed_at
         FROM user_srs_items
         WHERE user_id = $1 AND meaning_id = $2`,
        [learnerId, meaningId]
      );

      expect(srsResult.rows[0].interval).toBe(1);
      expect(srsResult.rows[0].repetitions).toBe(1);
      expect(srsResult.rows[0].ease_factor).toBeCloseTo(2.6, 1); // 2.5 + 0.1 for quality 5
      expect(srsResult.rows[0].last_reviewed_at).not.toBeNull();
    });

    it('should handle failed review (quality < 3)', async () => {
      const timestamp = Date.now();
      const meaningId = `en-failed-${timestamp}`;

      await pool.query(
        `INSERT INTO approved_meanings (id, level)
         VALUES ($1, 'A1')`,
        [meaningId]
      );

      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'failed')`,
        [meaningId]
      );

      // Create SRS item with some progress
      await pool.query(
        `INSERT INTO user_srs_items (user_id, meaning_id, language, interval, repetitions, ease_factor, next_review_at)
         VALUES ($1, $2, 'EN', 6, 2, 2.5, current_timestamp)`,
        [learnerId, meaningId]
      );

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/recall/review',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          meaningId,
          quality: 1, // Failed review
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ interval: number; repetitions: number }>();

      // Should reset to day 1
      expect(body.interval).toBe(1);
      expect(body.repetitions).toBe(0);
    });

    it('should return 404 for non-existent SRS item', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/recall/review',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          meaningId: 'nonexistent',
          quality: 5,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should validate quality rating (0-5)', async () => {
      const timestamp = Date.now();
      const meaningId = `en-quality-${timestamp}`;

      await pool.query(
        `INSERT INTO approved_meanings (id, level)
         VALUES ($1, 'A1')`,
        [meaningId]
      );

      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'quality')`,
        [meaningId]
      );

      await pool.query(
        `INSERT INTO user_srs_items (user_id, meaning_id, language, interval, repetitions, ease_factor, next_review_at)
         VALUES ($1, $2, 'EN', 0, 0, 2.5, current_timestamp)`,
        [learnerId, meaningId]
      );

      // Invalid quality rating
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/recall/review',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          meaningId,
          quality: 6, // Invalid
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/recall/review',
        payload: {
          meaningId: 'some-id',
          quality: 5,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /learning/recall/stats', () => {
    it('should return recall practice statistics', async () => {
      const timestamp = Date.now();

      // Create 3 SRS items with different states
      for (let i = 0; i < 3; i++) {
        const meaningId = `en-stat-${timestamp}-${i}`;

        await pool.query(
          `INSERT INTO approved_meanings (id, level)
           VALUES ($1, 'A1')`,
          [meaningId]
        );

        await pool.query(
          `INSERT INTO approved_utterances (meaning_id, language, text)
           VALUES ($1, 'EN', $2)`,
          [meaningId, `word${i}`]
        );

        const nextReviewAt =
          i === 0
            ? "current_timestamp - interval '1 hour'" // due now
            : i === 1
              ? "current_timestamp + interval '12 hours'" // due today
              : "current_timestamp + interval '2 days'"; // future

        const repetitions = i === 2 ? 3 : 0; // Last one is learned

        await pool.query(
          `INSERT INTO user_srs_items (user_id, meaning_id, language, interval, repetitions, ease_factor, next_review_at)
           VALUES ($1, $2, 'EN', ${i}, ${repetitions}, 2.5, ${nextReviewAt})`,
          [learnerId, meaningId]
        );
      }

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/recall/stats?language=EN',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      interface Stats {
        stats: {
          totalItems: number;
          dueNow: number;
          dueToday: number;
          learned: number;
        };
      }
      const body = response.json<Stats>();

      expect(body.stats).toBeDefined();
      expect(body.stats.totalItems).toBe(3);
      expect(body.stats.dueNow).toBeGreaterThanOrEqual(1);
      expect(body.stats.dueToday).toBeGreaterThanOrEqual(1);
      expect(body.stats.learned).toBe(1); // One item has repetitions >= 1
    });

    it('should return zero statistics when no SRS items exist', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/recall/stats?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        stats: { totalItems: number; dueNow: number; dueToday: number; learned: number };
      }>();

      expect(body.stats.totalItems).toBe(0);
      expect(body.stats.dueNow).toBe(0);
      expect(body.stats.dueToday).toBe(0);
      expect(body.stats.learned).toBe(0);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/recall/stats?language=EN',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
