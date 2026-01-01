import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { getTestPool, cleanupTestData, closeTestPool, setupTestEnv } from '../../../setup';
import { GrammarComparisonService } from '../../../../src/services/grammar/comparison.service';

describe('GrammarComparisonService', () => {
  let pool: Pool;
  let service: GrammarComparisonService;
  let testUserId: string;

  beforeAll(() => {
    setupTestEnv();
    pool = getTestPool();
    service = new GrammarComparisonService(pool);
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
      [`comparison-test-${Date.now()}@example.com`, 'hash']
    );
    testUserId = userResult.rows[0].id;
  });

  describe('getComparison', () => {
    it('should return null if user studies only one language', async () => {
      const timestamp = Date.now();
      const category = `test_category_${timestamp}`;

      // Create grammar rule for one language
      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation, examples)
         VALUES ($1, 'EN', 'A1', $2, 'Present Tense', 'Explanation', $3)`,
        [`en-rule-${timestamp}`, category, JSON.stringify([{ text: 'Example' }])]
      );

      // User studies only English
      await pool.query(
        `INSERT INTO user_languages (user_id, language)
         VALUES ($1, 'EN')`,
        [testUserId]
      );

      const comparison = await service.getComparison(testUserId, category);

      expect(comparison).toBeNull();
    });

    it('should return comparison when user studies multiple languages', async () => {
      const timestamp = Date.now();
      const category = `present_tense_${timestamp}`;

      // Create grammar rules for multiple languages
      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation, examples)
         VALUES
           ($1, 'EN', 'A1', $2, 'Present Tense', 'English present tense', $3),
           ($4, 'ES', 'A1', $2, 'Presente', 'Spanish present tense', $5)`,
        [
          `en-present-${timestamp}`,
          category,
          JSON.stringify([{ text: 'I eat', translation: 'Yo como' }]),
          `es-present-${timestamp}`,
          JSON.stringify([{ text: 'Yo como', translation: 'I eat' }]),
        ]
      );

      // User studies both English and Spanish
      await pool.query(
        `INSERT INTO user_languages (user_id, language)
         VALUES ($1, 'EN'), ($1, 'ES')`,
        [testUserId]
      );

      const comparison = await service.getComparison(testUserId, category);

      expect(comparison).not.toBeNull();
      expect(comparison!.category).toBe(category);
      expect(comparison!.languages).toHaveLength(2);

      const enRule = comparison!.languages.find((l) => l.language === 'EN');
      const esRule = comparison!.languages.find((l) => l.language === 'ES');

      expect(enRule).toBeDefined();
      expect(enRule!.title).toBe('Present Tense');
      expect(enRule!.explanation).toBe('English present tense');
      expect(enRule!.example).toBe('I eat');

      expect(esRule).toBeDefined();
      expect(esRule!.title).toBe('Presente');
      expect(esRule!.explanation).toBe('Spanish present tense');
      expect(esRule!.example).toBe('Yo como');

      // Similarities and differences are empty for now (future enhancement)
      expect(comparison!.similarities).toEqual([]);
      expect(comparison!.differences).toEqual([]);
    });

    it('should return null if less than 2 rules found across languages', async () => {
      const timestamp = Date.now();
      const category = `rare_category_${timestamp}`;

      // Create rule for only one language
      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation, examples)
         VALUES ($1, 'EN', 'A1', $2, 'Rare Rule', 'Explanation', $3)`,
        [`en-rare-${timestamp}`, category, JSON.stringify([])]
      );

      // User studies two languages but rule only exists for one
      await pool.query(
        `INSERT INTO user_languages (user_id, language)
         VALUES ($1, 'EN'), ($1, 'IT')`,
        [testUserId]
      );

      const comparison = await service.getComparison(testUserId, category);

      expect(comparison).toBeNull();
    });

    it('should only include rules for languages user is actively studying', async () => {
      const timestamp = Date.now();
      const category = `multi_lang_category_${timestamp}`;

      // Create rules for three languages
      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation, examples)
         VALUES
           ($1, 'EN', 'A1', $2, 'English Rule', 'EN explanation', $3),
           ($4, 'ES', 'A1', $2, 'Spanish Rule', 'ES explanation', $5),
           ($6, 'IT', 'A1', $2, 'Italian Rule', 'IT explanation', $7)`,
        [
          `en-multi-${timestamp}`,
          category,
          JSON.stringify([]),
          `es-multi-${timestamp}`,
          JSON.stringify([]),
          `it-multi-${timestamp}`,
          JSON.stringify([]),
        ]
      );

      // User studies only English and Spanish (not Italian)
      await pool.query(
        `INSERT INTO user_languages (user_id, language)
         VALUES ($1, 'EN'), ($1, 'ES')`,
        [testUserId]
      );

      const comparison = await service.getComparison(testUserId, category);

      expect(comparison).not.toBeNull();
      expect(comparison!.languages).toHaveLength(2);

      const languages = comparison!.languages.map((l) => l.language);
      expect(languages).toContain('EN');
      expect(languages).toContain('ES');
      expect(languages).not.toContain('IT');
    });

    it('should handle rules with no examples gracefully', async () => {
      const timestamp = Date.now();
      const category = `no_examples_${timestamp}`;

      await pool.query(
        `INSERT INTO approved_rules (id, language, level, category, title, explanation, examples)
         VALUES
           ($1, 'EN', 'A1', $2, 'English Rule', 'EN explanation', $3),
           ($4, 'ES', 'A1', $2, 'Spanish Rule', 'ES explanation', $3)`,
        [`en-no-ex-${timestamp}`, category, JSON.stringify([]), `es-no-ex-${timestamp}`]
      );

      await pool.query(
        `INSERT INTO user_languages (user_id, language)
         VALUES ($1, 'EN'), ($1, 'ES')`,
        [testUserId]
      );

      const comparison = await service.getComparison(testUserId, category);

      expect(comparison).not.toBeNull();
      expect(comparison!.languages).toHaveLength(2);
      expect(comparison!.languages.every((l) => l.example === null)).toBe(true);
    });
  });
});
