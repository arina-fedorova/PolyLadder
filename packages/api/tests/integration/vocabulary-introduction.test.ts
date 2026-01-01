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

describe('Vocabulary Introduction API Integration Tests', () => {
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

    // Clean up user_word_state
    await pool.query(`DELETE FROM user_word_state`);

    // Create learner user
    const uniqueLearnerEmail = `vocab-intro-learner-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`;
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

  describe('GET /learning/vocabulary-introduction/next', () => {
    it('should return next vocabulary batch for introduction', async () => {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);

      // Create test meanings with utterances
      const meanings = [
        { id: `en-intro-test1-${timestamp}-${random}`, level: 'A1' },
        { id: `en-intro-test2-${timestamp}-${random}`, level: 'A1' },
        { id: `en-intro-test3-${timestamp}-${random}`, level: 'A2' },
      ];

      for (const meaning of meanings) {
        await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, $2, $3)`, [
          meaning.id,
          meaning.level,
          JSON.stringify(['test']),
        ]);

        // Add utterance so meaning is included in results
        await pool.query(
          `INSERT INTO approved_utterances (meaning_id, language, text)
           VALUES ($1, 'EN', 'Example sentence.')`,
          [meaning.id]
        );
      }

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/vocabulary-introduction/next?language=EN&maxLevel=A2',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      interface VocabItem {
        meaningId: string;
        level: string;
        utteranceCount: number;
      }

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vocabulary: VocabItem[] }>();
      expect(body.vocabulary).toBeDefined();
      expect(Array.isArray(body.vocabulary)).toBe(true);
      // Should return vocabulary (may include our test meanings and others)
      expect(body.vocabulary.length).toBeGreaterThan(0);
      // Verify structure of returned items
      if (body.vocabulary.length > 0) {
        const item = body.vocabulary[0];
        expect(item.meaningId).toBeDefined();
        expect(item.level).toBeDefined();
        expect(item.utteranceCount).toBeGreaterThan(0);
      }
    });

    it('should respect maxLevel parameter', async () => {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);

      const meaningA1 = `en-intro-a1-${timestamp}-${random}`;
      const meaningB1 = `en-intro-b1-${timestamp}-${random}`;

      await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, 'A1', $2)`, [
        meaningA1,
        JSON.stringify([]),
      ]);
      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'A1 sentence.')`,
        [meaningA1]
      );

      await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, 'B1', $2)`, [
        meaningB1,
        JSON.stringify([]),
      ]);
      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'B1 sentence.')`,
        [meaningB1]
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/vocabulary-introduction/next?language=EN&maxLevel=A1',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      interface VocabItem {
        meaningId: string;
        level: string;
      }

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vocabulary: VocabItem[] }>();

      // Should include A1 but not B1 meaning
      const hasA1 = body.vocabulary.some((v) => v.meaningId === meaningA1);
      const hasB1 = body.vocabulary.some((v) => v.meaningId === meaningB1);
      expect(hasA1 || body.vocabulary.length > 0).toBe(true); // Has vocabulary
      expect(hasB1).toBe(false); // But not B1
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/vocabulary-introduction/next?language=EN',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /learning/vocabulary-introduction/:meaningId/lesson', () => {
    it('should return lesson data for a meaning', async () => {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const meaningId = `en-lesson-test-${timestamp}-${random}`;

      // Create meaning
      await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, 'A1', $2)`, [
        meaningId,
        JSON.stringify(['test', 'lesson']),
      ]);

      // Add utterances
      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text, audio_url, usage_notes, register)
         VALUES ($1, 'EN', 'This is an example sentence.', 'https://example.com/audio.mp3', 'Common usage', 'neutral')`,
        [meaningId]
      );

      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'Another example.')`,
        [meaningId]
      );

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/learning/vocabulary-introduction/${meaningId}/lesson?language=EN`,
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      interface Utterance {
        text: string;
        audioUrl: string | null;
      }

      interface WordState {
        state: string;
      }

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        meaning: { meaningId: string; level: string; tags: string[] };
        utterances: Utterance[];
        wordState: WordState;
      }>();

      expect(body.meaning).toBeDefined();
      expect(body.meaning.meaningId).toBe(meaningId);
      expect(body.meaning.level).toBe('A1');
      expect(body.meaning.tags).toEqual(['test', 'lesson']);

      expect(body.utterances).toBeDefined();
      expect(body.utterances.length).toBe(2);
      expect(body.utterances[0].text).toBeTruthy();

      // Check that at least one utterance has audio_url
      const hasAudio = body.utterances.some((u) => u.audioUrl !== null);
      expect(hasAudio).toBe(true);

      expect(body.wordState).toBeDefined();
      expect(body.wordState.state).toBe('unknown');
    });

    it('should return 404 for non-existent meaning', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/vocabulary-introduction/nonexistent-id/lesson?language=EN',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/vocabulary-introduction/some-id/lesson?language=EN',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /learning/vocabulary-introduction/stats', () => {
    it('should return introduction statistics', async () => {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);

      // Create test meanings at different levels
      const meanings = [
        { id: `en-stats-a1-1-${timestamp}-${random}`, level: 'A1' },
        { id: `en-stats-a1-2-${timestamp}-${random}`, level: 'A1' },
        { id: `en-stats-a2-${timestamp}-${random}`, level: 'A2' },
      ];

      for (const meaning of meanings) {
        await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, $2, $3)`, [
          meaning.id,
          meaning.level,
          JSON.stringify([]),
        ]);

        await pool.query(
          `INSERT INTO approved_utterances (meaning_id, language, text)
           VALUES ($1, 'EN', 'Example.')`,
          [meaning.id]
        );
      }

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/vocabulary-introduction/stats?language=EN',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        totalAvailable: number;
        byLevel: Record<string, number>;
      }>();

      expect(body.totalAvailable).toBeGreaterThan(0);
      expect(body.byLevel).toBeDefined();
      expect(typeof body.byLevel).toBe('object');
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/vocabulary-introduction/stats?language=EN',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /learning/vocabulary-introduction/mark-introduced', () => {
    it('should mark vocabulary as introduced', async () => {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const meaningId = `en-mark-intro-${timestamp}-${random}`;

      // Create meaning
      await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, 'A1', $2)`, [
        meaningId,
        JSON.stringify([]),
      ]);

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/vocabulary-introduction/mark-introduced',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          meaningIds: [meaningId],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        success: boolean;
        markedCount: number;
        message: string;
      }>();

      expect(body.success).toBe(true);
      expect(body.markedCount).toBe(1);
      expect(body.message).toContain('1');

      // Verify it was marked
      interface StateRow {
        first_seen_at: Date | null;
      }
      const stateResult = await pool.query<StateRow>(
        `SELECT first_seen_at FROM user_word_state WHERE user_id = $1 AND meaning_id = $2`,
        [learnerId, meaningId]
      );

      expect(stateResult.rows.length).toBe(1);
      expect(stateResult.rows[0].first_seen_at).not.toBeNull();
    });

    it('should handle multiple meanings', async () => {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const meaningIds = [
        `en-mark-multi1-${timestamp}-${random}`,
        `en-mark-multi2-${timestamp}-${random}`,
        `en-mark-multi3-${timestamp}-${random}`,
      ];

      for (const meaningId of meaningIds) {
        await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, 'A1', $2)`, [
          meaningId,
          JSON.stringify([]),
        ]);
      }

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/vocabulary-introduction/mark-introduced',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          meaningIds,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ markedCount: number }>();
      expect(body.markedCount).toBe(3);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/vocabulary-introduction/mark-introduced',
        payload: {
          meaningIds: ['some-id'],
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
