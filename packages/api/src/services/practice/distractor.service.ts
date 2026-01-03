import { Pool } from 'pg';

/**
 * Service for generating intelligent distractors (wrong answers)
 * for multiple choice recognition practice questions.
 *
 * Strategies:
 * - Same CEFR level to ensure appropriate difficulty
 * - Exclude the correct answer
 * - Random selection for variety
 */
export class DistractorGenerationService {
  constructor(private readonly pool: Pool) {}

  /**
   * Generate word distractors for vocabulary recognition
   * Strategy: Other words from same CEFR level + same language
   */
  async generateWordDistractors(
    meaningId: string,
    language: string,
    count: number = 3
  ): Promise<string[]> {
    // Get target meaning's level
    const meaningResult = await this.pool.query<{ level: string }>(
      `SELECT level FROM approved_meanings WHERE id = $1`,
      [meaningId]
    );

    if (meaningResult.rows.length === 0) {
      return [];
    }

    const { level } = meaningResult.rows[0];

    // Get distractor words from same level (different meanings)
    interface DistractorRow {
      text: string;
    }

    const distractorsResult = await this.pool.query<DistractorRow>(
      `SELECT DISTINCT au.text
       FROM approved_utterances au
       JOIN approved_meanings am ON au.meaning_id = am.id
       WHERE am.level = $1
         AND au.language = $2
         AND au.meaning_id != $3
         AND au.text IS NOT NULL
         AND au.text != ''
       ORDER BY RANDOM()
       LIMIT $4`,
      [level, language, meaningId, count]
    );

    return distractorsResult.rows.map((r) => r.text);
  }

  /**
   * Generate definition distractors for vocabulary recognition
   * Strategy: Definitions (usage_notes) from same CEFR level
   */
  async generateDefinitionDistractors(
    meaningId: string,
    language: string,
    count: number = 3
  ): Promise<string[]> {
    // Get target meaning's level
    const meaningResult = await this.pool.query<{ level: string }>(
      `SELECT level FROM approved_meanings WHERE id = $1`,
      [meaningId]
    );

    if (meaningResult.rows.length === 0) {
      return [];
    }

    const { level } = meaningResult.rows[0];

    // Get distractor definitions from same level
    interface DefinitionRow {
      usage_notes: string;
    }

    const distractorsResult = await this.pool.query<DefinitionRow>(
      `SELECT DISTINCT au.usage_notes
       FROM approved_utterances au
       JOIN approved_meanings am ON au.meaning_id = am.id
       WHERE am.level = $1
         AND au.language = $2
         AND au.meaning_id != $3
         AND au.usage_notes IS NOT NULL
         AND au.usage_notes != ''
       ORDER BY RANDOM()
       LIMIT $4`,
      [level, language, meaningId, count]
    );

    return distractorsResult.rows.map((r) => r.usage_notes);
  }

  /**
   * Generate grammar rule title distractors
   * Strategy: Other rule titles from same category and level
   */
  async generateGrammarTitleDistractors(ruleId: string, count: number = 3): Promise<string[]> {
    // Get target rule's level and category
    const ruleResult = await this.pool.query<{
      level: string;
      category: string;
      language: string;
    }>(`SELECT level, category, language FROM approved_rules WHERE id = $1`, [ruleId]);

    if (ruleResult.rows.length === 0) {
      return [];
    }

    const { level, category, language } = ruleResult.rows[0];

    // First try: same category and level
    interface TitleRow {
      title: string;
    }

    let distractorsResult = await this.pool.query<TitleRow>(
      `SELECT title
       FROM approved_rules
       WHERE language = $1
         AND level = $2
         AND category = $3
         AND id != $4
       ORDER BY RANDOM()
       LIMIT $5`,
      [language, level, category, ruleId, count]
    );

    // Fallback: same level, any category
    if (distractorsResult.rows.length < count) {
      distractorsResult = await this.pool.query<TitleRow>(
        `SELECT title
         FROM approved_rules
         WHERE language = $1
           AND level = $2
           AND id != $3
         ORDER BY RANDOM()
         LIMIT $4`,
        [language, level, ruleId, count]
      );
    }

    return distractorsResult.rows.map((r) => r.title);
  }

  /**
   * Generate example sentence distractors for grammar
   * Strategy: Example sentences from other rules in same category
   */
  async generateGrammarExampleDistractors(ruleId: string, count: number = 3): Promise<string[]> {
    // Get rule's category and level
    const ruleResult = await this.pool.query<{
      level: string;
      category: string;
      language: string;
    }>(`SELECT level, category, language FROM approved_rules WHERE id = $1`, [ruleId]);

    if (ruleResult.rows.length === 0) {
      return [];
    }

    const { level, language } = ruleResult.rows[0];

    // Get examples from other rules at same level
    // examples is JSONB array like: [{"sentence": "...", "translation": "..."}]
    interface ExampleRow {
      example: { sentence: string; translation?: string };
    }

    const examplesResult = await this.pool.query<ExampleRow>(
      `SELECT jsonb_array_elements(examples) as example
       FROM approved_rules
       WHERE language = $1
         AND level = $2
         AND id != $3
         AND jsonb_array_length(examples) > 0
       ORDER BY RANDOM()
       LIMIT $4`,
      [language, level, ruleId, count * 2] // Fetch extra in case some are duplicates
    );

    const sentences = examplesResult.rows
      .map((r) => r.example?.sentence)
      .filter((s): s is string => !!s && s.length > 0);

    // Return unique sentences
    return [...new Set(sentences)].slice(0, count);
  }

  /**
   * Generate fill-in-the-blank option distractors
   * Strategy: Similar word forms or common confusions
   */
  async generateFillBlankDistractors(
    correctAnswer: string,
    language: string,
    cefrLevel: string,
    count: number = 3
  ): Promise<string[]> {
    // For fill-in-blank, we need plausible alternatives
    // Use words from same level that start with similar letters or have similar length
    interface WordRow {
      text: string;
    }

    const wordLength = correctAnswer.length;
    const minLength = Math.max(1, wordLength - 3);
    const maxLength = wordLength + 3;

    const distractorsResult = await this.pool.query<WordRow>(
      `SELECT DISTINCT au.text
       FROM approved_utterances au
       JOIN approved_meanings am ON au.meaning_id = am.id
       WHERE au.language = $1
         AND am.level = $2
         AND au.text != $3
         AND LENGTH(au.text) BETWEEN $4 AND $5
         AND au.text IS NOT NULL
       ORDER BY RANDOM()
       LIMIT $6`,
      [language, cefrLevel, correctAnswer, minLength, maxLength, count]
    );

    return distractorsResult.rows.map((r) => r.text);
  }
}
