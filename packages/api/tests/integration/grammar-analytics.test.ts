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

interface GrammarCoverageResponse {
  totalConcepts: number;
  completedConcepts: number;
  coveragePercentage: number;
  byCEFR: Array<{
    level: string;
    total: number;
    completed: number;
    percentage: number;
  }>;
  byCategory: Array<{
    category: string;
    total: number;
    completed: number;
    percentage: number;
  }>;
  byLanguage: Array<{
    language: string;
    totalConcepts: number;
    completedConcepts: number;
    percentage: number;
  }>;
  gaps: Array<{
    id: string;
    title: string;
    cefrLevel: string;
    category: string;
  }>;
  recentlyCompleted: Array<{
    id: string;
    title: string;
    cefrLevel: string;
    lastPracticed: string;
  }>;
}

interface GrammarRecommendationsResponse {
  recommendations: Array<{
    conceptId: string;
    title: string;
    cefrLevel: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
  }>;
}

interface GrammarTrendsResponse {
  trends: Array<{
    date: string;
    conceptsCompleted: number;
    averageMastery: number;
  }>;
}

interface GrammarConceptResponse {
  id: string;
  title: string;
  description: string;
  cefrLevel: string;
  language: string;
  category: string;
  completed: boolean;
  masteryLevel: number;
  lastPracticed: string | null;
  practiceCount: number;
}

describe('Grammar Analytics Integration Tests', () => {
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

    // Clean up grammar progress
    await pool.query(`DELETE FROM grammar_progress`);

    // Create learner user
    const uniqueLearnerEmail = `grammar-learner-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`;
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

  describe('GET /analytics/grammar/coverage', () => {
    it('should return grammar coverage statistics', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/grammar/coverage',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<GrammarCoverageResponse>();
      expect(body.totalConcepts).toBeDefined();
      expect(body.completedConcepts).toBeDefined();
      expect(body.coveragePercentage).toBeDefined();
      expect(body.byCEFR).toBeDefined();
      expect(body.byCategory).toBeDefined();
      expect(body.byLanguage).toBeDefined();
      expect(body.gaps).toBeDefined();
      expect(body.recentlyCompleted).toBeDefined();
    });

    it('should return coverage filtered by language', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/grammar/coverage?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<GrammarCoverageResponse>();
      expect(body).toBeDefined();
      // When filtered by language, byLanguage should be empty
      expect(body.byLanguage).toEqual([]);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/grammar/coverage',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /analytics/grammar/recommendations', () => {
    it('should return grammar recommendations', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/grammar/recommendations?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<GrammarRecommendationsResponse>();
      expect(body.recommendations).toBeDefined();
      expect(Array.isArray(body.recommendations)).toBe(true);
    });

    it('should accept limit parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/grammar/recommendations?language=ES&limit=3',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<GrammarRecommendationsResponse>();
      expect(body.recommendations.length).toBeLessThanOrEqual(3);
    });

    it('should require language parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/grammar/recommendations',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/grammar/recommendations?language=ES',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /analytics/grammar/trends', () => {
    it('should return grammar mastery trends', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/grammar/trends',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<GrammarTrendsResponse>();
      expect(body.trends).toBeDefined();
      expect(Array.isArray(body.trends)).toBe(true);
    });

    it('should accept days parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/grammar/trends?days=7',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<GrammarTrendsResponse>();
      expect(body.trends).toBeDefined();
    });

    it('should filter by language', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/grammar/trends?language=ES&days=14',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<GrammarTrendsResponse>();
      expect(body.trends).toBeDefined();
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/grammar/trends',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /analytics/grammar/concept/:conceptId', () => {
    let testRuleId: string;

    beforeEach(async () => {
      // Create test grammar rule
      const uniqueRuleId = `es-rule-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation, examples)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          uniqueRuleId,
          'ES',
          'A1',
          'Verbs',
          'Present Tense Conjugation',
          'How to conjugate verbs in present tense',
          JSON.stringify(['yo hablo', 'tú hablas']),
        ]
      );

      testRuleId = uniqueRuleId;

      // Create grammar progress for this rule
      await pool.query(
        `INSERT INTO grammar_progress (user_id, grammar_id, language, is_completed, mastery_level, practice_count, correct_count, last_practiced)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [learnerId, testRuleId, 'ES', true, 85, 10, 8]
      );
    });

    it('should return concept details', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/analytics/grammar/concept/${testRuleId}`,
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<GrammarConceptResponse>();
      expect(body.id).toBe(testRuleId);
      expect(body.title).toBe('Present Tense Conjugation');
      expect(body.language).toBe('ES');
      expect(body.cefrLevel).toBe('A1');
      expect(body.category).toBe('Verbs');
      expect(body.completed).toBe(true);
      expect(body.masteryLevel).toBe(85);
      expect(body.practiceCount).toBe(10);
    });

    it('should return 404 for non-existent concept', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/grammar/concept/nonexistent-concept',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/analytics/grammar/concept/${testRuleId}`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Coverage with test data', () => {
    let testRules: string[];

    beforeEach(async () => {
      // Create multiple grammar rules
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      testRules = [
        `es-rule1-${uniqueSuffix}`,
        `es-rule2-${uniqueSuffix}`,
        `es-rule3-${uniqueSuffix}`,
        `es-rule4-${uniqueSuffix}`,
      ];

      const ruleData = [
        { level: 'A1', category: 'Verbs', title: 'Present Tense' },
        { level: 'A1', category: 'Nouns', title: 'Articles' },
        { level: 'A2', category: 'Verbs', title: 'Past Tense' },
        { level: 'B1', category: 'Verbs', title: 'Subjunctive' },
      ];

      for (let i = 0; i < testRules.length; i++) {
        await pool.query(
          `INSERT INTO approved_rules (id, language, level, category, title, explanation, examples)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            testRules[i],
            'ES',
            ruleData[i].level,
            ruleData[i].category,
            ruleData[i].title,
            `Explanation for ${ruleData[i].title}`,
            JSON.stringify([]),
          ]
        );
      }

      // Mark 2 rules as completed
      await pool.query(
        `INSERT INTO grammar_progress (user_id, grammar_id, language, is_completed, mastery_level, practice_count, correct_count, completed_at, last_practiced)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [learnerId, testRules[0], 'ES', true, 90, 10, 9]
      );

      await pool.query(
        `INSERT INTO grammar_progress (user_id, grammar_id, language, is_completed, mastery_level, practice_count, correct_count, completed_at, last_practiced)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [learnerId, testRules[1], 'ES', true, 85, 8, 7]
      );
    });

    it('should return correct coverage statistics', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/grammar/coverage?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<GrammarCoverageResponse>();

      // Should have at least 4 concepts (our test rules)
      expect(body.totalConcepts).toBeGreaterThanOrEqual(4);
      // Should have at least 2 completed (our test progress)
      expect(body.completedConcepts).toBeGreaterThanOrEqual(2);
    });

    it('should return CEFR breakdown', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/grammar/coverage?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<GrammarCoverageResponse>();
      expect(body.byCEFR.length).toBeGreaterThan(0);

      const a1Level = body.byCEFR.find((c) => c.level === 'A1');
      expect(a1Level).toBeDefined();
      expect(a1Level!.total).toBeGreaterThanOrEqual(2);
    });

    it('should return category breakdown', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/grammar/coverage?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<GrammarCoverageResponse>();
      expect(body.byCategory.length).toBeGreaterThan(0);

      const verbsCategory = body.byCategory.find((c) => c.category === 'Verbs');
      expect(verbsCategory).toBeDefined();
      expect(verbsCategory!.total).toBeGreaterThanOrEqual(3);
    });

    it('should return gaps (uncompleted concepts)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/grammar/coverage?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<GrammarCoverageResponse>();
      // Should have gaps (concepts not yet completed)
      expect(body.gaps.length).toBeGreaterThanOrEqual(2);
      // Each gap should have required fields
      if (body.gaps.length > 0) {
        expect(body.gaps[0].id).toBeDefined();
        expect(body.gaps[0].title).toBeDefined();
        expect(body.gaps[0].cefrLevel).toBeDefined();
        expect(body.gaps[0].category).toBeDefined();
      }
    });

    it('should return recently completed concepts', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/grammar/coverage?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<GrammarCoverageResponse>();
      expect(body.recentlyCompleted.length).toBeGreaterThanOrEqual(2);

      // Check that completed rules are in recently completed
      const completedIds = body.recentlyCompleted.map((c) => c.id);
      expect(completedIds).toContain(testRules[0]);
      expect(completedIds).toContain(testRules[1]);
    });
  });
});
