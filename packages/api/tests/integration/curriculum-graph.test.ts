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

interface CurriculumConcept {
  conceptId: string;
  title: string;
  cefrLevel: string;
  conceptType: string;
  description: string | null;
  estimatedDurationMinutes: number | null;
  priorityOrder: number;
}

interface ConceptWithStatus {
  conceptId: string;
  title: string;
  cefrLevel: string;
  conceptType: string;
  status: string;
}

interface GraphEdge {
  from: string;
  to: string;
  type: string;
}

interface ConceptProgressRow {
  status: string;
  accuracy_percentage: string;
}

describe('Curriculum Graph Integration Tests', () => {
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
    await pool.query(`DELETE FROM user_concept_progress`);
    await pool.query(`DELETE FROM curriculum_graph`);

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

    await pool.query(
      `INSERT INTO curriculum_graph (concept_id, language, cefr_level, concept_type, title, priority_order, prerequisites_and, prerequisites_or)
       VALUES
       ('es_ortho_alphabet', 'ES', 'A0', 'orthography', 'Spanish Alphabet', 1, '{}', '{}'),
       ('es_ortho_pronunciation', 'ES', 'A0', 'orthography', 'Spanish Pronunciation', 2, '{es_ortho_alphabet}', '{}'),
       ('es_vocab_basics', 'ES', 'A1', 'vocabulary', 'Basic Vocabulary', 3, '{es_ortho_pronunciation}', '{}'),
       ('es_grammar_present', 'ES', 'A1', 'grammar', 'Present Tense', 4, '{es_vocab_basics}', '{}')`
    );

    await pool.query(
      `INSERT INTO user_concept_progress (user_id, concept_id, language, status, progress_percentage)
       VALUES
       ($1, 'es_ortho_alphabet', 'ES', 'unlocked', 0),
       ($1, 'es_ortho_pronunciation', 'ES', 'locked', 0),
       ($1, 'es_vocab_basics', 'ES', 'locked', 0),
       ($1, 'es_grammar_present', 'ES', 'locked', 0)`,
      [learnerId]
    );
  });

  describe('GET /learning/curriculum/available', () => {
    it('should return available concepts for user', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/curriculum/available?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ concepts: CurriculumConcept[] }>();
      expect(body.concepts).toHaveLength(1);
      expect(body.concepts[0].conceptId).toBe('es_ortho_alphabet');
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/curriculum/available?language=ES',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /learning/curriculum/next', () => {
    it('should return next recommended concept', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/curriculum/next?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ concept: CurriculumConcept | null }>();
      expect(body.concept).toBeDefined();
      expect(body.concept!.conceptId).toBe('es_ortho_alphabet');
    });

    it('should return null when no concepts available', async () => {
      await pool.query(`UPDATE user_concept_progress SET status = 'completed' WHERE user_id = $1`, [
        learnerId,
      ]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/curriculum/next?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ concept: CurriculumConcept | null }>();
      expect(body.concept).toBeNull();
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/curriculum/next?language=ES',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /learning/curriculum/graph', () => {
    it('should return full graph with nodes and edges', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/curriculum/graph?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ nodes: ConceptWithStatus[]; edges: GraphEdge[] }>();
      expect(body.nodes).toHaveLength(4);
      expect(body.edges).toHaveLength(3);

      const alphabetNode = body.nodes.find((n) => n.conceptId === 'es_ortho_alphabet');
      expect(alphabetNode!.status).toBe('unlocked');

      const pronunciationNode = body.nodes.find((n) => n.conceptId === 'es_ortho_pronunciation');
      expect(pronunciationNode!.status).toBe('locked');

      const edge = body.edges.find((e) => e.to === 'es_ortho_pronunciation');
      expect(edge!.from).toBe('es_ortho_alphabet');
      expect(edge!.type).toBe('and');
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/curriculum/graph?language=ES',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /learning/curriculum/complete/:conceptId', () => {
    it('should mark concept as completed and unlock dependents', async () => {
      const completeResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/curriculum/complete/es_ortho_alphabet',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          language: 'ES',
          accuracyPercentage: 95.5,
        },
      });

      expect(completeResponse.statusCode).toBe(200);
      const completeBody = completeResponse.json<{
        success: boolean;
        unlockedConcepts: string[];
      }>();
      expect(completeBody.success).toBe(true);
      expect(completeBody.unlockedConcepts).toContain('es_ortho_pronunciation');

      const statusResult = await pool.query<ConceptProgressRow>(
        `SELECT status, accuracy_percentage FROM user_concept_progress
         WHERE user_id = $1 AND concept_id = 'es_ortho_alphabet'`,
        [learnerId]
      );

      expect(statusResult.rows[0].status).toBe('completed');
      expect(parseFloat(statusResult.rows[0].accuracy_percentage)).toBe(95.5);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/curriculum/complete/es_ortho_alphabet',
        payload: {
          language: 'ES',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /learning/curriculum/stats', () => {
    it('should return curriculum statistics', async () => {
      await pool.query(
        `UPDATE user_concept_progress
         SET status = 'completed', accuracy_percentage = 90
         WHERE user_id = $1 AND concept_id = 'es_ortho_alphabet'`,
        [learnerId]
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/curriculum/stats?language=ES',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        completedCount: number;
        inProgressCount: number;
        unlockedCount: number;
        lockedCount: number;
        totalCount: number;
        avgAccuracy: number | null;
        completionPercentage: number;
      }>();

      expect(body.totalCount).toBe(4);
      expect(body.completedCount).toBe(1);
      expect(body.lockedCount).toBe(3);
      expect(body.completionPercentage).toBe(25);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/curriculum/stats?language=ES',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
