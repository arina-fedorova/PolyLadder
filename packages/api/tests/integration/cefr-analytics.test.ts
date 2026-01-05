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

interface CEFRLevelData {
  level: string;
  vocabularyTotal: number;
  vocabularyMastered: number;
  vocabularyPercentage: number;
  grammarTotal: number;
  grammarCompleted: number;
  grammarPercentage: number;
  overallPercentage: number;
  isCompleted: boolean;
}

interface CEFRAssessmentResponse {
  userId: string;
  language: string;
  currentLevel: string;
  status: 'progressing' | 'ready' | 'completed';
  levelDetails: CEFRLevelData[];
  nextLevel: string | null;
  progressToNextLevel: number;
  estimatedDaysToNextLevel: number | null;
  assessedAt: string;
}

interface CEFRProgressionResponse {
  language: string;
  days: number;
  progression: Array<{
    date: string;
    level: string;
    vocabularyPercentage: number;
    grammarPercentage: number;
    overallPercentage: number;
  }>;
}

interface CEFRRequirementsResponse {
  level: string;
  vocabularyNeeded: number;
  grammarNeeded: number;
  vocabularyGap: string[];
  grammarGap: string[];
  estimatedPracticeHours: number;
}

interface CEFROverviewResponse {
  overview: Array<{
    language: string;
    currentLevel: string;
    status: string;
    progressToNextLevel: number;
    lastAssessed: string | null;
  }>;
}

describe('CEFR Analytics Integration Tests', () => {
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

    // Clean up CEFR level history
    await pool.query(`DELETE FROM cefr_level_history`);
    await pool.query(`DELETE FROM grammar_progress`);
    await pool.query(`DELETE FROM user_word_state`);

    // Create learner user
    const uniqueLearnerEmail = `cefr-learner-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`;
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

  describe('GET /analytics/cefr/assessment/:language', () => {
    it('should return CEFR assessment for a language', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/assessment/ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<CEFRAssessmentResponse>();
      expect(body.userId).toBe(learnerId);
      expect(body.language).toBe('ES');
      expect(body.currentLevel).toBeDefined();
      expect(body.status).toBeDefined();
      expect(['progressing', 'ready', 'completed']).toContain(body.status);
      expect(body.levelDetails).toBeDefined();
      expect(body.levelDetails.length).toBe(7); // A0, A1, A2, B1, B2, C1, C2
      expect(body.assessedAt).toBeDefined();
    });

    it('should return all CEFR levels in levelDetails', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/assessment/ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<CEFRAssessmentResponse>();

      const levels = body.levelDetails.map((l) => l.level);
      expect(levels).toEqual(['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
    });

    it('should include proper level data structure', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/assessment/ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<CEFRAssessmentResponse>();

      const levelData = body.levelDetails[0];
      expect(levelData.level).toBeDefined();
      expect(typeof levelData.vocabularyTotal).toBe('number');
      expect(typeof levelData.vocabularyMastered).toBe('number');
      expect(typeof levelData.vocabularyPercentage).toBe('number');
      expect(typeof levelData.grammarTotal).toBe('number');
      expect(typeof levelData.grammarCompleted).toBe('number');
      expect(typeof levelData.grammarPercentage).toBe('number');
      expect(typeof levelData.overallPercentage).toBe('number');
      expect(typeof levelData.isCompleted).toBe('boolean');
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/assessment/ES',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate language parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/assessment/X',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /analytics/cefr/progression', () => {
    it('should return progression history', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/progression?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<CEFRProgressionResponse>();
      expect(body.language).toBe('ES');
      expect(body.days).toBeDefined();
      expect(body.progression).toBeDefined();
      expect(Array.isArray(body.progression)).toBe(true);
    });

    it('should accept days parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/progression?language=ES&days=30',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<CEFRProgressionResponse>();
      expect(body.days).toBe(30);
    });

    it('should use default days when not specified', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/progression?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<CEFRProgressionResponse>();
      expect(body.days).toBe(90); // default is 90 days
    });

    it('should require language parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/progression',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/progression?language=ES',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /analytics/cefr/requirements', () => {
    it('should return requirements for next level', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/requirements?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<CEFRRequirementsResponse | null>();

      // May be null if already at max level
      if (body !== null) {
        expect(body.level).toBeDefined();
        expect(typeof body.vocabularyNeeded).toBe('number');
        expect(typeof body.grammarNeeded).toBe('number');
        expect(Array.isArray(body.vocabularyGap)).toBe(true);
        expect(Array.isArray(body.grammarGap)).toBe(true);
        expect(typeof body.estimatedPracticeHours).toBe('number');
      }
    });

    it('should accept targetLevel parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/requirements?language=ES&targetLevel=B1',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<CEFRRequirementsResponse | null>();

      if (body !== null) {
        expect(body.level).toBe('B1');
      }
    });

    it('should require language parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/requirements',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/requirements?language=ES',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /analytics/cefr/overview', () => {
    it('should return overview for all languages', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/overview',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<CEFROverviewResponse>();
      expect(body.overview).toBeDefined();
      expect(Array.isArray(body.overview)).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/overview',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Assessment with test data', () => {
    beforeEach(async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Create vocabulary (approved_meanings with approved_utterances)
      const meaningIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const meaningId = `meaning-${uniqueSuffix}-${i}`;
        meaningIds.push(meaningId);

        await pool.query(
          `INSERT INTO approved_meanings (id, level, tags)
           VALUES ($1, $2, $3)`,
          [meaningId, 'A0', JSON.stringify([])]
        );

        await pool.query(
          `INSERT INTO approved_utterances (meaning_id, language, text)
           VALUES ($1, $2, $3)`,
          [meaningId, 'ES', `palabra${i}`]
        );
      }

      // Mark 8 of 10 words as known (80% vocabulary)
      for (let i = 0; i < 8; i++) {
        await pool.query(
          `INSERT INTO user_word_state (user_id, meaning_id, language, state, updated_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
          [learnerId, meaningIds[i], 'ES', 'known']
        );
      }

      // Create grammar rules
      const ruleIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const ruleId = `rule-${uniqueSuffix}-${i}`;
        ruleIds.push(ruleId);

        await pool.query(
          `INSERT INTO approved_rules (id, language, level, category, title, explanation, examples)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [ruleId, 'ES', 'A0', 'Grammar', `Rule ${i}`, `Explanation ${i}`, JSON.stringify([])]
        );
      }

      // Mark 7 of 10 rules as completed (70% grammar)
      for (let i = 0; i < 7; i++) {
        await pool.query(
          `INSERT INTO grammar_progress (user_id, grammar_id, language, is_completed, mastery_level, practice_count, correct_count, completed_at, last_practiced)
           VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [learnerId, ruleIds[i], 'ES', true, 85, 10, 8]
        );
      }
    });

    it('should calculate vocabulary percentage correctly', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/assessment/ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<CEFRAssessmentResponse>();

      const a0Level = body.levelDetails.find((l) => l.level === 'A0');
      expect(a0Level).toBeDefined();
      // At least 8 mastered (our test data)
      expect(a0Level!.vocabularyMastered).toBeGreaterThanOrEqual(8);
      // At least 10 total (our test data)
      expect(a0Level!.vocabularyTotal).toBeGreaterThanOrEqual(10);
      // Percentage is calculated correctly (within 1%)
      const expectedVocabPct = (a0Level!.vocabularyMastered / a0Level!.vocabularyTotal) * 100;
      expect(a0Level!.vocabularyPercentage).toBeCloseTo(expectedVocabPct, 0);
    });

    it('should calculate grammar percentage correctly', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/assessment/ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<CEFRAssessmentResponse>();

      const a0Level = body.levelDetails.find((l) => l.level === 'A0');
      expect(a0Level).toBeDefined();
      // At least 7 completed (our test data)
      expect(a0Level!.grammarCompleted).toBeGreaterThanOrEqual(7);
      // At least 10 total (our test data)
      expect(a0Level!.grammarTotal).toBeGreaterThanOrEqual(10);
      // Percentage is calculated correctly (within 1%)
      const expectedGrammarPct = (a0Level!.grammarCompleted / a0Level!.grammarTotal) * 100;
      expect(a0Level!.grammarPercentage).toBeCloseTo(expectedGrammarPct, 0);
    });

    it('should calculate overall percentage with 60/40 weighting', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/assessment/ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<CEFRAssessmentResponse>();

      const a0Level = body.levelDetails.find((l) => l.level === 'A0');
      expect(a0Level).toBeDefined();
      // Overall = vocab * 0.6 + grammar * 0.4 (within 1%)
      const expectedOverall =
        a0Level!.vocabularyPercentage * 0.6 + a0Level!.grammarPercentage * 0.4;
      expect(a0Level!.overallPercentage).toBeCloseTo(expectedOverall, 0);
    });

    it('should mark level as completed when thresholds are met', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/assessment/ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<CEFRAssessmentResponse>();

      const a0Level = body.levelDetails.find((l) => l.level === 'A0');
      expect(a0Level).toBeDefined();
      // Level is completed if vocab >= 80% AND grammar >= 70%
      const shouldBeCompleted =
        a0Level!.vocabularyPercentage >= 80 && a0Level!.grammarPercentage >= 70;
      expect(a0Level!.isCompleted).toBe(shouldBeCompleted);
    });

    it('should record assessment in history', async () => {
      // First call to create history
      await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/assessment/ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      // Check history was recorded
      interface HistoryRow {
        cefr_level: string;
        vocabulary_percentage: number;
        grammar_percentage: number;
        overall_percentage: number;
      }
      const historyResult = await pool.query<HistoryRow>(
        `SELECT cefr_level, vocabulary_percentage, grammar_percentage, overall_percentage
         FROM cefr_level_history WHERE user_id = $1 AND language = $2`,
        [learnerId, 'ES']
      );

      expect(historyResult.rowCount).toBeGreaterThan(0);
      const history = historyResult.rows[0];
      expect(history.cefr_level).toBeDefined();
      expect(history.vocabulary_percentage).toBeDefined();
      expect(history.grammar_percentage).toBeDefined();
      expect(history.overall_percentage).toBeDefined();
    });
  });

  describe('Progression with history data', () => {
    beforeEach(async () => {
      // Insert history entries
      const dates = [
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        new Date(), // today
      ];

      for (let i = 0; i < dates.length; i++) {
        await pool.query(
          `INSERT INTO cefr_level_history (user_id, language, cefr_level, vocabulary_percentage, grammar_percentage, overall_percentage, assessed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [learnerId, 'ES', 'A0', 50 + i * 10, 40 + i * 10, 46 + i * 10, dates[i]]
        );
      }
    });

    it('should return progression history', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/progression?language=ES&days=30',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<CEFRProgressionResponse>();

      expect(body.progression.length).toBe(3);
      expect(body.progression[0].level).toBe('A0');
      expect(body.progression[0].vocabularyPercentage).toBe(50);
    });

    it('should filter by days parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/progression?language=ES&days=5',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<CEFRProgressionResponse>();

      // Should only have 2 entries (3 days ago and today)
      expect(body.progression.length).toBe(2);
    });
  });

  describe('Overview with multiple languages', () => {
    beforeEach(async () => {
      // Add user languages
      await pool.query(
        `INSERT INTO user_languages (user_id, language, started_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, language) DO NOTHING`,
        [learnerId, 'ES']
      );

      await pool.query(
        `INSERT INTO user_languages (user_id, language, started_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, language) DO NOTHING`,
        [learnerId, 'FR']
      );

      // Add history for both languages
      await pool.query(
        `INSERT INTO cefr_level_history (user_id, language, cefr_level, vocabulary_percentage, grammar_percentage, overall_percentage, assessed_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [learnerId, 'ES', 'A1', 60, 50, 56]
      );

      await pool.query(
        `INSERT INTO cefr_level_history (user_id, language, cefr_level, vocabulary_percentage, grammar_percentage, overall_percentage, assessed_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [learnerId, 'FR', 'A0', 30, 20, 26]
      );
    });

    it('should return overview for all user languages', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/cefr/overview',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<CEFROverviewResponse>();

      expect(body.overview.length).toBeGreaterThanOrEqual(2);

      const esOverview = body.overview.find((o) => o.language === 'ES');
      const frOverview = body.overview.find((o) => o.language === 'FR');

      expect(esOverview).toBeDefined();
      expect(frOverview).toBeDefined();
      expect(esOverview!.currentLevel).toBe('A1');
      expect(frOverview!.currentLevel).toBe('A0');
    });
  });
});
