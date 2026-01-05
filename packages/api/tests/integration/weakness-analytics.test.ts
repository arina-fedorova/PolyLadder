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

interface WeaknessItem {
  itemId: string;
  itemType: 'vocabulary' | 'grammar';
  itemText: string;
  language: string;
  cefrLevel: string;
  category?: string;
  accuracy: number;
  totalAttempts: number;
  recentAttempts: number;
  failureCount: number;
  lastAttemptDate: string | null;
  severityScore: number;
  improvementPotential: number;
}

interface WeaknessAnalysisResponse {
  userId: string;
  language?: string;
  totalWeaknesses: number;
  weaknessesByType: {
    vocabulary: number;
    grammar: number;
  };
  weaknessesByCEFR: Record<string, number>;
  topWeaknesses: WeaknessItem[];
  analyzedAt: string;
}

interface WeaknessRecommendation {
  itemId: string;
  itemType: string;
  itemText: string;
  reason: string;
  practiceType: 'recall' | 'recognition' | 'production' | 'mixed';
  estimatedPracticeTime: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

interface WeaknessRecommendationsResponse {
  recommendations: WeaknessRecommendation[];
}

interface ImprovementTracking {
  itemId: string;
  itemType: string;
  itemText: string;
  beforeAccuracy: number;
  afterAccuracy: number;
  improvementPercentage: number;
  practiceSessionsCompleted: number;
  status: 'improving' | 'stagnant' | 'regressing';
}

interface ImprovementsResponse {
  improvements: ImprovementTracking[];
}

interface HeatmapCell {
  cefrLevel: string;
  category: string;
  weaknessCount: number;
  avgSeverity: number;
}

interface HeatmapResponse {
  heatmap: HeatmapCell[];
}

describe('Weakness Analytics Integration Tests', () => {
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

    // Clean up related tables
    await pool.query(`DELETE FROM srs_review_history`);
    await pool.query(`DELETE FROM user_srs_items`);
    await pool.query(`DELETE FROM grammar_progress`);
    await pool.query(`DELETE FROM user_word_state`);

    // Create learner user
    const uniqueLearnerEmail = `weakness-learner-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`;
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

  describe('GET /analytics/weakness/analysis', () => {
    it('should return empty analysis when no weaknesses exist', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/analysis',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WeaknessAnalysisResponse>();
      expect(body.userId).toBe(learnerId);
      expect(body.totalWeaknesses).toBe(0);
      expect(body.weaknessesByType.vocabulary).toBe(0);
      expect(body.weaknessesByType.grammar).toBe(0);
      expect(body.topWeaknesses).toHaveLength(0);
      expect(body.analyzedAt).toBeDefined();
    });

    it('should accept language filter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/analysis?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WeaknessAnalysisResponse>();
      expect(body.language).toBe('ES');
    });

    it('should accept cefrLevel filter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/analysis?cefrLevel=A1',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept combined filters', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/analysis?language=ES&cefrLevel=A1',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WeaknessAnalysisResponse>();
      expect(body.language).toBe('ES');
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/analysis',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate cefrLevel parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/analysis?cefrLevel=INVALID',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /analytics/weakness/recommendations', () => {
    it('should return empty recommendations when no weaknesses exist', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/recommendations',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WeaknessRecommendationsResponse>();
      expect(body.recommendations).toHaveLength(0);
    });

    it('should accept language filter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/recommendations?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept limit parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/recommendations?limit=5',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/recommendations',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /analytics/weakness/improvements', () => {
    it('should return empty improvements when no data exists', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/improvements',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ImprovementsResponse>();
      expect(body.improvements).toHaveLength(0);
    });

    it('should accept language filter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/improvements?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept daysSince parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/improvements?daysSince=7',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/improvements',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /analytics/weakness/heatmap', () => {
    it('should return empty heatmap when no weaknesses exist', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/heatmap',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HeatmapResponse>();
      expect(body.heatmap).toHaveLength(0);
    });

    it('should accept language filter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/heatmap?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/heatmap',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Analysis with test data - vocabulary weaknesses', () => {
    beforeEach(async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Create vocabulary items with low accuracy (weakness)
      const meaningIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const meaningId = `weak-meaning-${uniqueSuffix}-${i}`;
        meaningIds.push(meaningId);

        await pool.query(
          `INSERT INTO approved_meanings (id, level, tags)
           VALUES ($1, $2, $3)`,
          [meaningId, 'A1', JSON.stringify([])]
        );

        await pool.query(
          `INSERT INTO approved_utterances (meaning_id, language, text)
           VALUES ($1, $2, $3)`,
          [meaningId, 'ES', `palabra_debil${i}`]
        );

        // Create user_word_state with low accuracy (3/10 = 30%)
        await pool.query(
          `INSERT INTO user_word_state (user_id, meaning_id, language, state, successful_reviews, total_reviews, last_reviewed_at)
           VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
          [learnerId, meaningId, 'ES', 'learning', 3, 10]
        );
      }
    });

    it('should identify vocabulary weaknesses', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/analysis?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WeaknessAnalysisResponse>();

      expect(body.totalWeaknesses).toBeGreaterThan(0);
      expect(body.weaknessesByType.vocabulary).toBeGreaterThan(0);
    });

    it('should return proper weakness item structure', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/analysis?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WeaknessAnalysisResponse>();

      if (body.topWeaknesses.length > 0) {
        const weakness = body.topWeaknesses[0];
        expect(weakness.itemId).toBeDefined();
        expect(weakness.itemType).toBe('vocabulary');
        expect(weakness.itemText).toBeDefined();
        expect(weakness.language).toBe('ES');
        expect(weakness.cefrLevel).toBe('A1');
        expect(typeof weakness.accuracy).toBe('number');
        expect(typeof weakness.totalAttempts).toBe('number');
        expect(typeof weakness.severityScore).toBe('number');
        expect(typeof weakness.improvementPotential).toBe('number');
      }
    });

    it('should count weaknesses by CEFR level', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/analysis?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WeaknessAnalysisResponse>();

      expect(body.weaknessesByCEFR).toBeDefined();
      if (body.totalWeaknesses > 0) {
        expect(body.weaknessesByCEFR['A1']).toBeGreaterThan(0);
      }
    });

    it('should generate recommendations for weaknesses', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/recommendations?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WeaknessRecommendationsResponse>();

      if (body.recommendations.length > 0) {
        const rec = body.recommendations[0];
        expect(rec.itemId).toBeDefined();
        expect(rec.itemType).toBe('vocabulary');
        expect(rec.itemText).toBeDefined();
        expect(rec.reason).toBeDefined();
        expect(['recall', 'recognition', 'production', 'mixed']).toContain(rec.practiceType);
        expect(['critical', 'high', 'medium', 'low']).toContain(rec.priority);
        expect(typeof rec.estimatedPracticeTime).toBe('number');
      }
    });
  });

  describe('Analysis with test data - grammar weaknesses', () => {
    beforeEach(async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Create grammar rules with low mastery (weakness)
      const ruleIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const ruleId = `weak-rule-${uniqueSuffix}-${i}`;
        ruleIds.push(ruleId);

        await pool.query(
          `INSERT INTO approved_rules (id, language, level, category, title, explanation, examples)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [ruleId, 'ES', 'A1', 'Verbs', `Weak Rule ${i}`, `Explanation ${i}`, JSON.stringify([])]
        );

        // Create grammar_progress with low mastery (40%) and low accuracy (4/10)
        await pool.query(
          `INSERT INTO grammar_progress (user_id, grammar_id, language, is_completed, mastery_level, practice_count, correct_count, last_practiced)
           VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
          [learnerId, ruleId, 'ES', false, 40, 10, 4]
        );
      }
    });

    it('should identify grammar weaknesses', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/analysis?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WeaknessAnalysisResponse>();

      expect(body.totalWeaknesses).toBeGreaterThan(0);
      expect(body.weaknessesByType.grammar).toBeGreaterThan(0);
    });

    it('should return proper grammar weakness structure', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/analysis?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WeaknessAnalysisResponse>();

      const grammarWeakness = body.topWeaknesses.find((w) => w.itemType === 'grammar');
      if (grammarWeakness) {
        expect(grammarWeakness.itemId).toBeDefined();
        expect(grammarWeakness.itemType).toBe('grammar');
        expect(grammarWeakness.itemText).toBeDefined();
        expect(grammarWeakness.category).toBe('Verbs');
      }
    });

    it('should populate heatmap with grammar weaknesses', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/heatmap?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HeatmapResponse>();

      if (body.heatmap.length > 0) {
        const cell = body.heatmap[0];
        expect(cell.cefrLevel).toBeDefined();
        expect(cell.category).toBeDefined();
        expect(typeof cell.weaknessCount).toBe('number');
        expect(typeof cell.avgSeverity).toBe('number');
      }
    });
  });

  describe('Filtering by CEFR level', () => {
    beforeEach(async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Create A1 level vocabulary weakness
      const a1MeaningId = `a1-meaning-${uniqueSuffix}`;
      await pool.query(
        `INSERT INTO approved_meanings (id, level, tags)
         VALUES ($1, $2, $3)`,
        [a1MeaningId, 'A1', JSON.stringify([])]
      );
      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, $2, $3)`,
        [a1MeaningId, 'ES', 'palabra_a1']
      );
      await pool.query(
        `INSERT INTO user_word_state (user_id, meaning_id, language, state, successful_reviews, total_reviews, last_reviewed_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [learnerId, a1MeaningId, 'ES', 'learning', 3, 10]
      );

      // Create B1 level vocabulary weakness
      const b1MeaningId = `b1-meaning-${uniqueSuffix}`;
      await pool.query(
        `INSERT INTO approved_meanings (id, level, tags)
         VALUES ($1, $2, $3)`,
        [b1MeaningId, 'B1', JSON.stringify([])]
      );
      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, $2, $3)`,
        [b1MeaningId, 'ES', 'palabra_b1']
      );
      await pool.query(
        `INSERT INTO user_word_state (user_id, meaning_id, language, state, successful_reviews, total_reviews, last_reviewed_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [learnerId, b1MeaningId, 'ES', 'learning', 2, 10]
      );
    });

    it('should filter weaknesses by A1 level', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/analysis?language=ES&cefrLevel=A1',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WeaknessAnalysisResponse>();

      // All weaknesses should be A1 level
      body.topWeaknesses.forEach((w) => {
        expect(w.cefrLevel).toBe('A1');
      });
    });

    it('should filter weaknesses by B1 level', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/weakness/analysis?language=ES&cefrLevel=B1',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WeaknessAnalysisResponse>();

      // All weaknesses should be B1 level
      body.topWeaknesses.forEach((w) => {
        expect(w.cefrLevel).toBe('B1');
      });
    });
  });
});
