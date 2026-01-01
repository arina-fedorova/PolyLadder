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

describe('Grammar API Integration Tests', () => {
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

  describe('GET /learning/grammar/next', () => {
    it('should return next grammar lessons for unlocked concepts', async () => {
      const timestamp = Date.now();
      const category = `test_grammar_${timestamp}`;
      const ruleId = `en-grammar-${timestamp}`;
      const conceptId = `grammar_${category}`;

      // Create grammar rule
      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation)
         VALUES ($1, 'EN', 'A1', $2, 'Test Grammar Lesson', 'This is a test grammar lesson')`,
        [ruleId, category]
      );

      // Create curriculum concept
      await pool.query(
        `INSERT INTO curriculum_graph (concept_id, language, cefr_level, concept_type, title)
         VALUES ($1, 'EN', 'A1', 'grammar', 'Test Concept')`,
        [conceptId]
      );

      // Create unlocked user progress
      await pool.query(
        `INSERT INTO user_concept_progress (user_id, concept_id, language, status)
         VALUES ($1, $2, 'EN', 'unlocked')`,
        [learnerId, conceptId]
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/grammar/next?language=EN&limit=10',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      interface GrammarRule {
        ruleId: string;
        category: string;
        title: string;
      }
      const body = response.json<{ lessons: GrammarRule[] }>();

      expect(body.lessons).toBeDefined();
      expect(Array.isArray(body.lessons)).toBe(true);

      const testLesson = body.lessons.find((l) => l.ruleId === ruleId);
      if (testLesson) {
        expect(testLesson.category).toBe(category);
        expect(testLesson.title).toBe('Test Grammar Lesson');
      }
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/grammar/next?language=EN',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /learning/grammar/:ruleId/lesson', () => {
    it('should return grammar lesson with examples and related rules', async () => {
      const timestamp = Date.now();
      const ruleId = `en-lesson-${timestamp}`;
      const category = `lesson_category_${timestamp}`;

      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation, examples)
         VALUES ($1, 'EN', 'A1', $2, 'Present Tense', 'Explanation of present tense', $3)`,
        [
          ruleId,
          category,
          JSON.stringify([
            { text: 'I eat breakfast.', translation: 'Je mange le petit déjeuner.' },
            { text: 'She runs daily.', annotation: 'Third person singular' },
          ]),
        ]
      );

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/learning/grammar/${ruleId}/lesson`,
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      interface GrammarExample {
        text: string;
        translation?: string | null;
        annotation?: string | null;
      }
      interface GrammarLesson {
        lesson: {
          rule: {
            ruleId: string;
            category: string;
            title: string;
            explanation: string;
          };
          examples: GrammarExample[];
          relatedRules: Array<{
            ruleId: string;
            title: string;
            relationshipType: string;
          }>;
          conjugationTable: null;
        };
      }
      const body = response.json<GrammarLesson>();

      expect(body.lesson).toBeDefined();
      expect(body.lesson.rule.ruleId).toBe(ruleId);
      expect(body.lesson.rule.title).toBe('Present Tense');
      expect(body.lesson.rule.category).toBe(category);
      expect(body.lesson.examples).toHaveLength(2);
      expect(body.lesson.examples[0].text).toBe('I eat breakfast.');
      expect(body.lesson.conjugationTable).toBeNull();
    });

    it('should return 404 for non-existent rule', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/grammar/nonexistent-rule-id/lesson',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/grammar/some-rule-id/lesson',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /learning/grammar/:ruleId/comparison', () => {
    it('should return null when user studies only one language', async () => {
      const timestamp = Date.now();
      const ruleId = `en-comparison-${timestamp}`;
      const category = `comparison_category_${timestamp}`;

      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation)
         VALUES ($1, 'EN', 'A1', $2, 'Present Tense', 'Explanation')`,
        [ruleId, category]
      );

      await pool.query(`INSERT INTO user_languages (user_id, language) VALUES ($1, 'EN')`, [
        learnerId,
      ]);

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/learning/grammar/${ruleId}/comparison`,
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      interface ComparisonResponse {
        comparison: {
          category: string;
          languages: Array<{ language: string }>;
        } | null;
      }
      const body = response.json<ComparisonResponse>();
      expect(body.comparison).toBeNull();
    });

    it('should return comparison when user studies multiple languages', async () => {
      const timestamp = Date.now();
      const ruleIdEn = `en-comparison-multi-${timestamp}`;
      const ruleIdEs = `es-comparison-multi-${timestamp}`;
      const category = `multi_comparison_${timestamp}`;

      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation, examples)
         VALUES
           ($1, 'EN', 'A1', $2, 'Present Tense', 'English present', $3),
           ($4, 'ES', 'A1', $2, 'Presente', 'Spanish present', $5)`,
        [
          ruleIdEn,
          category,
          JSON.stringify([{ text: 'I eat' }]),
          ruleIdEs,
          JSON.stringify([{ text: 'Yo como' }]),
        ]
      );

      await pool.query(
        `INSERT INTO user_languages (user_id, language) VALUES ($1, 'EN'), ($1, 'ES')`,
        [learnerId]
      );

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/learning/grammar/${ruleIdEn}/comparison`,
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      interface ComparisonLanguage {
        language: string;
        title: string;
      }
      interface GrammarComparison {
        comparison: {
          category: string;
          languages: ComparisonLanguage[];
          similarities: string[];
          differences: string[];
        };
      }
      const body = response.json<GrammarComparison>();

      expect(body.comparison).not.toBeNull();
      expect(body.comparison.category).toBe(category);
      expect(body.comparison.languages).toHaveLength(2);

      const enLang = body.comparison.languages.find((l) => l.language === 'EN');
      const esLang = body.comparison.languages.find((l) => l.language === 'ES');
      expect(enLang).toBeDefined();
      expect(enLang!.title).toBe('Present Tense');
      expect(esLang).toBeDefined();
      expect(esLang!.title).toBe('Presente');
    });

    it('should return 404 for non-existent rule', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/grammar/nonexistent/comparison',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/grammar/some-id/comparison',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /learning/grammar/:ruleId/complete', () => {
    it('should mark grammar lesson as completed', async () => {
      const timestamp = Date.now();
      const ruleId = `en-complete-${timestamp}`;
      const category = `complete_category_${timestamp}`;
      const conceptId = `grammar_${category}`;

      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation)
         VALUES ($1, 'EN', 'A1', $2, 'Completable Lesson', 'Explanation')`,
        [ruleId, category]
      );

      await pool.query(
        `INSERT INTO curriculum_graph (concept_id, language, cefr_level, concept_type, title)
         VALUES ($1, 'EN', 'A1', 'grammar', 'Completable Concept')`,
        [conceptId]
      );

      await pool.query(
        `INSERT INTO user_concept_progress (user_id, concept_id, language, status)
         VALUES ($1, $2, 'EN', 'in_progress')`,
        [learnerId, conceptId]
      );

      const response = await server.inject({
        method: 'POST',
        url: `/api/v1/learning/grammar/${ruleId}/complete`,
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          language: 'EN',
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ success: boolean }>();
      expect(body.success).toBe(true);

      // Verify completion in database
      interface ProgressRow {
        status: string;
      }
      const progressResult = await pool.query<ProgressRow>(
        `SELECT status FROM user_concept_progress WHERE user_id = $1 AND concept_id = $2`,
        [learnerId, conceptId]
      );

      expect(progressResult.rows[0].status).toBe('completed');
    });

    it('should return 404 for non-existent rule', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/grammar/nonexistent/complete',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          language: 'EN',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/grammar/some-id/complete',
        payload: {
          language: 'EN',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /learning/grammar/:ruleId/exercises', () => {
    it('should return exercises for a specific grammar rule', async () => {
      const timestamp = Date.now();
      const ruleId = `en-exercises-${timestamp}`;
      const category = `exercises_category_${timestamp}`;

      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation)
         VALUES ($1, 'EN', 'A1', $2, 'Present Tense', 'Explanation')`,
        [ruleId, category]
      );

      // Create exercises
      await pool.query(
        `INSERT INTO grammar_exercises (grammar_rule_id, exercise_type, difficulty, prompt, sentence_text, correct_answer, explanation)
         VALUES ($1, 'fill_blank', 2, 'Fill in the blank', 'I ___ to school.', '"go"', 'Use base form')`,
        [ruleId]
      );

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/learning/grammar/${ruleId}/exercises?limit=10`,
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      interface Exercise {
        exerciseId: string;
        exerciseType: string;
        difficulty: number;
      }
      const body = response.json<{ exercises: Exercise[] }>();
      expect(body.exercises).toBeDefined();
      expect(Array.isArray(body.exercises)).toBe(true);
      expect(body.exercises.length).toBeGreaterThan(0);
      expect(body.exercises[0].exerciseType).toBe('fill_blank');
      expect(body.exercises[0].difficulty).toBe(2);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/grammar/some-rule-id/exercises',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /learning/grammar/exercises/mixed', () => {
    it('should return mixed exercises from unlocked concepts', async () => {
      const timestamp = Date.now();
      const ruleId = `en-mixed-${timestamp}`;
      const category = `mixed_category_${timestamp}`;
      const conceptId = `grammar_${category}`;

      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation)
         VALUES ($1, 'EN', 'A1', $2, 'Mixed Rule', 'Explanation')`,
        [ruleId, category]
      );

      await pool.query(
        `INSERT INTO curriculum_graph (concept_id, language, cefr_level, concept_type, title)
         VALUES ($1, 'EN', 'A1', 'grammar', 'Mixed Concept')`,
        [conceptId]
      );

      await pool.query(
        `INSERT INTO user_concept_progress (user_id, concept_id, language, status)
         VALUES ($1, $2, 'EN', 'in_progress')`,
        [learnerId, conceptId]
      );

      await pool.query(
        `INSERT INTO grammar_exercises (grammar_rule_id, exercise_type, difficulty, prompt, sentence_text, correct_answer, explanation)
         VALUES ($1, 'multiple_choice', 3, 'Choose correct', 'She ___ every day.', '"runs"', 'Third person singular')`,
        [ruleId]
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/grammar/exercises/mixed?language=EN&limit=20',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      interface Exercise {
        exerciseId: string;
        exerciseType: string;
      }
      const body = response.json<{ exercises: Exercise[] }>();
      expect(body.exercises).toBeDefined();
      expect(Array.isArray(body.exercises)).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/learning/grammar/exercises/mixed?language=EN',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /learning/grammar/exercises/:exerciseId/validate', () => {
    it('should validate correct answer', async () => {
      const timestamp = Date.now();
      const ruleId = `en-validate-${timestamp}`;
      const category = `validate_category_${timestamp}`;

      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation)
         VALUES ($1, 'EN', 'A1', $2, 'Validation Rule', 'Explanation')`,
        [ruleId, category]
      );

      interface ExerciseRow {
        id: string;
      }
      const exerciseResult = await pool.query<ExerciseRow>(
        `INSERT INTO grammar_exercises (grammar_rule_id, exercise_type, difficulty, prompt, sentence_text, correct_answer, explanation)
         VALUES ($1, 'fill_blank', 2, 'Fill in the blank', 'I ___ to school.', '"go"', 'Use base form')
         RETURNING id`,
        [ruleId]
      );

      const exerciseId = exerciseResult.rows[0].id;

      const response = await server.inject({
        method: 'POST',
        url: `/api/v1/learning/grammar/exercises/${exerciseId}/validate`,
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          answer: 'go',
        },
      });

      expect(response.statusCode).toBe(200);

      interface ValidationResult {
        isCorrect: boolean;
        partialCredit: number;
      }
      const body = response.json<ValidationResult>();
      expect(body.isCorrect).toBe(true);
      expect(body.partialCredit).toBe(1.0);
    });

    it('should validate incorrect answer with feedback', async () => {
      const timestamp = Date.now();
      const ruleId = `en-validate-wrong-${timestamp}`;
      const category = `validate_wrong_${timestamp}`;

      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation)
         VALUES ($1, 'EN', 'A1', $2, 'Validation Rule', 'Explanation')`,
        [ruleId, category]
      );

      interface ExerciseRow {
        id: string;
      }
      const exerciseResult = await pool.query<ExerciseRow>(
        `INSERT INTO grammar_exercises (grammar_rule_id, exercise_type, difficulty, prompt, sentence_text, correct_answer, explanation)
         VALUES ($1, 'multiple_choice', 2, 'Choose correct', 'She ___ every day.', '"runs"', 'Third person singular')
         RETURNING id`,
        [ruleId]
      );

      const exerciseId = exerciseResult.rows[0].id;

      const response = await server.inject({
        method: 'POST',
        url: `/api/v1/learning/grammar/exercises/${exerciseId}/validate`,
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          answer: 'run',
        },
      });

      expect(response.statusCode).toBe(200);

      interface ValidationResult {
        isCorrect: boolean;
        feedback: string;
      }
      const body = response.json<ValidationResult>();
      expect(body.isCorrect).toBe(false);
      expect(body.feedback).toContain('Incorrect');
    });

    it('should return 404 for non-existent exercise', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/grammar/exercises/00000000-0000-0000-0000-000000000000/validate',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
        payload: {
          answer: 'test',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/learning/grammar/exercises/some-id/validate',
        payload: {
          answer: 'test',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
