import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { getTestPool, cleanupTestData, closeTestPool, setupTestEnv } from '../../setup';
import { GrammarLessonService } from '../../../src/services/grammar/lesson.service';

describe('GrammarLessonService', () => {
  let pool: Pool;
  let service: GrammarLessonService;
  let testUserId: string;

  beforeAll(() => {
    setupTestEnv();
    pool = getTestPool();
    service = new GrammarLessonService(pool);
  });

  afterAll(() => {
    return closeTestPool();
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Create test user
    interface UserRow {
      id: string;
    }
    const userResult = await pool.query<UserRow>(
      `INSERT INTO users (email, password_hash, role, base_language)
       VALUES ($1, $2, 'learner', 'EN')
       RETURNING id`,
      [`grammar-test-${Date.now()}@example.com`, 'hash']
    );
    testUserId = userResult.rows[0].id;
  });

  describe('getGrammarLesson', () => {
    it('should return grammar lesson with examples', async () => {
      const timestamp = Date.now();
      const ruleId = `en-present-tense-${timestamp}`;

      // Create grammar rule
      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation, examples)
         VALUES ($1, 'EN', 'A1', 'present_tense', 'Present Tense', 'The present tense describes current actions.', $2)`,
        [
          ruleId,
          JSON.stringify([
            {
              text: 'I eat breakfast.',
              translation: 'Je mange le petit déjeuner.',
              annotation: 'Simple present',
            },
            { text: 'She runs every day.', translation: 'Elle court tous les jours.' },
          ]),
        ]
      );

      const lesson = await service.getGrammarLesson(ruleId);

      expect(lesson).not.toBeNull();
      expect(lesson!.rule.ruleId).toBe(ruleId);
      expect(lesson!.rule.category).toBe('present_tense');
      expect(lesson!.rule.title).toBe('Present Tense');
      expect(lesson!.rule.cefrLevel).toBe('A1');
      expect(lesson!.rule.explanation).toBe('The present tense describes current actions.');
      expect(lesson!.rule.language).toBe('EN');

      expect(lesson!.examples).toHaveLength(2);
      expect(lesson!.examples[0].text).toBe('I eat breakfast.');
      expect(lesson!.examples[0].translation).toBe('Je mange le petit déjeuner.');
      expect(lesson!.examples[0].annotation).toBe('Simple present');

      expect(lesson!.conjugationTable).toBeNull();
    });

    it('should return null for non-existent rule', async () => {
      const lesson = await service.getGrammarLesson('nonexistent-rule-id');
      expect(lesson).toBeNull();
    });

    it('should handle rules with no examples', async () => {
      const timestamp = Date.now();
      const ruleId = `en-no-examples-${timestamp}`;

      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation, examples)
         VALUES ($1, 'EN', 'A2', 'test_category', 'Test Rule', 'Test explanation', $2)`,
        [ruleId, JSON.stringify([])]
      );

      const lesson = await service.getGrammarLesson(ruleId);

      expect(lesson).not.toBeNull();
      expect(lesson!.examples).toHaveLength(0);
    });
  });

  describe('getNextGrammarLessons', () => {
    it('should return lessons for unlocked concepts', async () => {
      const timestamp = Date.now();
      const ruleId = `en-unlocked-lesson-${timestamp}`;
      const category = `test_category_${timestamp}`;
      const conceptId = `grammar_${category}`;

      // Create grammar rule
      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation)
         VALUES ($1, 'EN', 'A1', $2, 'Test Grammar Lesson', 'Explanation')`,
        [ruleId, category]
      );

      // Create curriculum concept
      await pool.query(
        `INSERT INTO curriculum_graph (concept_id, language, cefr_level, concept_type, title)
         VALUES ($1, 'EN', 'A1', 'grammar', 'Test Concept')`,
        [conceptId]
      );

      // Create user progress (unlocked)
      await pool.query(
        `INSERT INTO user_concept_progress (user_id, concept_id, language, status)
         VALUES ($1, $2, 'EN', 'unlocked')`,
        [testUserId, conceptId]
      );

      const lessons = await service.getNextGrammarLessons(testUserId, 'EN', 10);

      expect(lessons.length).toBeGreaterThanOrEqual(1);
      const testLesson = lessons.find((l) => l.ruleId === ruleId);
      expect(testLesson).toBeDefined();
      expect(testLesson!.category).toBe(category);
      expect(testLesson!.title).toBe('Test Grammar Lesson');
    });

    it('should not return lessons for locked concepts', async () => {
      const timestamp = Date.now();
      const ruleId = `en-locked-lesson-${timestamp}`;
      const category = `locked_category_${timestamp}`;
      const conceptId = `grammar_${category}`;

      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation)
         VALUES ($1, 'EN', 'B1', $2, 'Locked Grammar Lesson', 'Explanation')`,
        [ruleId, category]
      );

      await pool.query(
        `INSERT INTO curriculum_graph (concept_id, language, cefr_level, concept_type, title)
         VALUES ($1, 'EN', 'B1', 'grammar', 'Locked Concept')`,
        [conceptId]
      );

      await pool.query(
        `INSERT INTO user_concept_progress (user_id, concept_id, language, status)
         VALUES ($1, $2, 'EN', 'locked')`,
        [testUserId, conceptId]
      );

      const lessons = await service.getNextGrammarLessons(testUserId, 'EN', 10);

      const lockedLesson = lessons.find((l) => l.ruleId === ruleId);
      expect(lockedLesson).toBeUndefined();
    });

    it('should order lessons by CEFR level', async () => {
      const timestamp = Date.now();
      const categoryA1 = `a1_category_${timestamp}`;
      const categoryB1 = `b1_category_${timestamp}`;

      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation)
         VALUES
           ($1, 'EN', 'B1', $2, 'B1 Lesson', 'B1 explanation'),
           ($3, 'EN', 'A1', $4, 'A1 Lesson', 'A1 explanation')`,
        [`en-b1-${timestamp}`, categoryB1, `en-a1-${timestamp}`, categoryA1]
      );

      await pool.query(
        `INSERT INTO curriculum_graph (concept_id, language, cefr_level, concept_type, title)
         VALUES
           ($1, 'EN', 'B1', 'grammar', 'B1 Concept'),
           ($2, 'EN', 'A1', 'grammar', 'A1 Concept')`,
        [`grammar_${categoryB1}`, `grammar_${categoryA1}`]
      );

      await pool.query(
        `INSERT INTO user_concept_progress (user_id, concept_id, language, status)
         VALUES
           ($1, $2, 'EN', 'unlocked'),
           ($1, $3, 'EN', 'unlocked')`,
        [testUserId, `grammar_${categoryB1}`, `grammar_${categoryA1}`]
      );

      const lessons = await service.getNextGrammarLessons(testUserId, 'EN', 10);

      const a1Index = lessons.findIndex((l) => l.title === 'A1 Lesson');
      const b1Index = lessons.findIndex((l) => l.title === 'B1 Lesson');

      if (a1Index >= 0 && b1Index >= 0) {
        expect(a1Index).toBeLessThan(b1Index);
      }
    });
  });

  describe('markLessonComplete', () => {
    it('should mark lesson as completed', async () => {
      const timestamp = Date.now();
      const ruleId = `en-complete-lesson-${timestamp}`;
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
        [testUserId, conceptId]
      );

      await service.markLessonComplete(testUserId, ruleId, 'EN');

      interface ProgressRow {
        status: string;
        progress_percentage: number;
        completed_at: Date | null;
      }
      const result = await pool.query<ProgressRow>(
        `SELECT status, progress_percentage, completed_at
         FROM user_concept_progress
         WHERE user_id = $1 AND concept_id = $2 AND language = 'EN'`,
        [testUserId, conceptId]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].status).toBe('completed');
      expect(result.rows[0].progress_percentage).toBe(100);
      expect(result.rows[0].completed_at).not.toBeNull();
    });

    it('should throw error for non-existent rule', async () => {
      await expect(
        service.markLessonComplete(testUserId, 'nonexistent-rule', 'EN')
      ).rejects.toThrow('Grammar rule not found');
    });

    it('should throw error for non-existent user progress', async () => {
      const timestamp = Date.now();
      const ruleId = `en-no-progress-${timestamp}`;

      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation)
         VALUES ($1, 'EN', 'A1', 'no_progress_category', 'No Progress Lesson', 'Explanation')`,
        [ruleId]
      );

      await expect(service.markLessonComplete(testUserId, ruleId, 'EN')).rejects.toThrow(
        'User concept progress not found'
      );
    });
  });
});
