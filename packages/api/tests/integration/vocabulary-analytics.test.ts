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

interface VocabularyStatsResponse {
  totalWords: number;
  byState: {
    unknown: number;
    learning: number;
    known: number;
  };
  byLanguage: Array<{
    language: string;
    totalWords: number;
    unknown: number;
    learning: number;
    known: number;
  }>;
  byCEFR: Array<{
    level: string;
    count: number;
  }>;
  recentlyLearned: Array<{
    meaningId: string;
    text: string;
    language: string;
    learnedAt: string;
  }>;
}

interface VocabularyTrendsResponse {
  trends: Array<{
    date: string;
    totalWords: number;
    learning: number;
    known: number;
  }>;
}

interface VelocityResponse {
  wordsPerDay: number;
  wordsPerWeek: number;
  wordsThisWeek: number;
  wordsLastWeek: number;
  trend: 'increasing' | 'stable' | 'decreasing';
}

interface PaginatedWordsResponse {
  words: Array<{
    meaningId: string;
    text: string;
    language: string;
    state: string;
    cefrLevel: string;
    totalReviews: number;
    successfulReviews: number;
    lastReviewedAt: string | null;
    nextReviewAt: string | null;
    easeFactor: number;
    interval: number;
  }>;
  total: number;
}

interface WordDetailsResponse {
  meaningId: string;
  text: string;
  language: string;
  state: string;
  cefrLevel: string;
  totalReviews: number;
  successfulReviews: number;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  easeFactor: number;
  interval: number;
}

describe('Vocabulary Analytics Integration Tests', () => {
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

    // Clean up word states and SRS items
    await pool.query(`DELETE FROM user_srs_items`);
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
  });

  describe('GET /analytics/vocabulary/stats', () => {
    it('should return vocabulary statistics', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/vocabulary/stats',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<VocabularyStatsResponse>();
      expect(body.totalWords).toBeDefined();
      expect(body.byState).toBeDefined();
      expect(body.byState.unknown).toBeDefined();
      expect(body.byState.learning).toBeDefined();
      expect(body.byState.known).toBeDefined();
      expect(body.byLanguage).toBeDefined();
      expect(body.byCEFR).toBeDefined();
      expect(body.recentlyLearned).toBeDefined();
    });

    it('should return stats filtered by language', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/vocabulary/stats?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<VocabularyStatsResponse>();
      expect(body).toBeDefined();
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/vocabulary/stats',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /analytics/vocabulary/trends', () => {
    it('should return vocabulary trends', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/vocabulary/trends',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<VocabularyTrendsResponse>();
      expect(body.trends).toBeDefined();
      expect(Array.isArray(body.trends)).toBe(true);
    });

    it('should accept days parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/vocabulary/trends?days=7',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<VocabularyTrendsResponse>();
      expect(body.trends).toBeDefined();
    });

    it('should filter by language', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/vocabulary/trends?language=ES&days=14',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<VocabularyTrendsResponse>();
      expect(body.trends).toBeDefined();
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/vocabulary/trends',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /analytics/vocabulary/velocity', () => {
    it('should return learning velocity', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/vocabulary/velocity',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<VelocityResponse>();
      expect(body.wordsPerDay).toBeDefined();
      expect(body.wordsPerWeek).toBeDefined();
      expect(body.wordsThisWeek).toBeDefined();
      expect(body.wordsLastWeek).toBeDefined();
      expect(body.trend).toBeDefined();
      expect(['increasing', 'stable', 'decreasing']).toContain(body.trend);
    });

    it('should filter by language', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/vocabulary/velocity?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<VelocityResponse>();
      expect(body.trend).toBeDefined();
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/vocabulary/velocity',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /analytics/vocabulary/words', () => {
    let meaningId: string;

    beforeEach(async () => {
      // Create test meaning with unique ID
      const uniqueMeaningId = `en-test-word-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      await pool.query(
        `INSERT INTO approved_meanings (id, level, tags)
         VALUES ($1, $2, $3)`,
        [uniqueMeaningId, 'A1', JSON.stringify([])]
      );

      // Create approved utterance
      await pool.query(
        `INSERT INTO approved_utterances (id, meaning_id, language, text, pronunciation, audio_url, created_at)
         VALUES ($1, $2, $3, $4, NULL, NULL, CURRENT_TIMESTAMP)`,
        [`${uniqueMeaningId}-ES`, uniqueMeaningId, 'ES', 'palabra']
      );

      meaningId = uniqueMeaningId;

      // Create word state
      await pool.query(
        `INSERT INTO user_word_state (meaning_id, user_id, language, state, total_reviews, successful_reviews, marked_learning_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [meaningId, learnerId, 'ES', 'learning', 3, 2]
      );
    });

    it('should return words by state', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/vocabulary/words?state=learning',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PaginatedWordsResponse>();
      expect(body.words).toBeDefined();
      expect(body.total).toBeDefined();
      expect(Array.isArray(body.words)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/vocabulary/words?state=learning&limit=10&offset=0',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PaginatedWordsResponse>();
      expect(body.words).toBeDefined();
      expect(body.total).toBeGreaterThanOrEqual(0);
    });

    it('should filter by language', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/vocabulary/words?state=learning&language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PaginatedWordsResponse>();
      expect(body.words).toBeDefined();
    });

    it('should require state parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/vocabulary/words',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/vocabulary/words?state=learning',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /analytics/vocabulary/word/:meaningId', () => {
    let meaningId: string;

    beforeEach(async () => {
      // Create test meaning with unique ID
      const uniqueMeaningId = `en-detail-word-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      await pool.query(
        `INSERT INTO approved_meanings (id, level, tags)
         VALUES ($1, $2, $3)`,
        [uniqueMeaningId, 'B1', JSON.stringify([])]
      );

      // Create approved utterance
      await pool.query(
        `INSERT INTO approved_utterances (id, meaning_id, language, text, pronunciation, audio_url, created_at)
         VALUES ($1, $2, $3, $4, NULL, NULL, CURRENT_TIMESTAMP)`,
        [`${uniqueMeaningId}-ES`, uniqueMeaningId, 'ES', 'detalle']
      );

      meaningId = uniqueMeaningId;

      // Create word state
      await pool.query(
        `INSERT INTO user_word_state (meaning_id, user_id, language, state, total_reviews, successful_reviews, last_reviewed_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [meaningId, learnerId, 'ES', 'known', 10, 8]
      );
    });

    it('should return word details', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/analytics/vocabulary/word/${meaningId}`,
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WordDetailsResponse>();
      expect(body.meaningId).toBe(meaningId);
      expect(body.text).toBe('detalle');
      expect(body.language).toBe('ES');
      expect(body.state).toBe('known');
      expect(body.cefrLevel).toBe('B1');
      expect(body.totalReviews).toBe(10);
      expect(body.successfulReviews).toBe(8);
    });

    it('should return 404 for non-existent word', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/vocabulary/word/nonexistent-meaning',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/analytics/vocabulary/word/${meaningId}`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Stats with test data', () => {
    let testMeanings: string[];

    beforeEach(async () => {
      // Create multiple meanings with word states
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      testMeanings = [
        `es-word1-${uniqueSuffix}`,
        `es-word2-${uniqueSuffix}`,
        `es-word3-${uniqueSuffix}`,
        `es-word4-${uniqueSuffix}`,
        `es-word5-${uniqueSuffix}`,
      ];

      for (const id of testMeanings) {
        await pool.query(
          `INSERT INTO approved_meanings (id, level, tags)
           VALUES ($1, $2, $3)`,
          [id, 'A1', JSON.stringify([])]
        );

        await pool.query(
          `INSERT INTO approved_utterances (id, meaning_id, language, text, pronunciation, audio_url, created_at)
           VALUES ($1, $2, $3, $4, NULL, NULL, CURRENT_TIMESTAMP)`,
          [`${id}-ES`, id, 'ES', `word-${id}`]
        );
      }

      // Create states: 2 unknown, 2 learning, 1 known
      await pool.query(
        `INSERT INTO user_word_state (meaning_id, user_id, language, state, total_reviews, successful_reviews)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [testMeanings[0], learnerId, 'ES', 'unknown', 0, 0]
      );

      await pool.query(
        `INSERT INTO user_word_state (meaning_id, user_id, language, state, total_reviews, successful_reviews)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [testMeanings[1], learnerId, 'ES', 'unknown', 0, 0]
      );

      await pool.query(
        `INSERT INTO user_word_state (meaning_id, user_id, language, state, total_reviews, successful_reviews, marked_learning_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [testMeanings[2], learnerId, 'ES', 'learning', 3, 2]
      );

      await pool.query(
        `INSERT INTO user_word_state (meaning_id, user_id, language, state, total_reviews, successful_reviews, marked_learning_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [testMeanings[3], learnerId, 'ES', 'learning', 2, 1]
      );

      await pool.query(
        `INSERT INTO user_word_state (meaning_id, user_id, language, state, total_reviews, successful_reviews, marked_known_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [testMeanings[4], learnerId, 'ES', 'known', 5, 5]
      );
    });

    it('should return correct state counts', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/vocabulary/stats',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<VocabularyStatsResponse>();
      expect(body.totalWords).toBe(5);
      expect(body.byState.unknown).toBe(2);
      expect(body.byState.learning).toBe(2);
      expect(body.byState.known).toBe(1);
    });

    it('should return language breakdown', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/vocabulary/stats',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<VocabularyStatsResponse>();
      expect(body.byLanguage.length).toBeGreaterThan(0);

      const esLanguage = body.byLanguage.find((l) => l.language === 'ES');
      expect(esLanguage).toBeDefined();
      expect(esLanguage!.totalWords).toBe(5);
    });

    it('should return CEFR distribution', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/vocabulary/stats',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<VocabularyStatsResponse>();
      expect(body.byCEFR.length).toBeGreaterThan(0);

      const a1Level = body.byCEFR.find((c) => c.level === 'A1');
      expect(a1Level).toBeDefined();
      expect(a1Level!.count).toBe(5);
    });
  });
});
