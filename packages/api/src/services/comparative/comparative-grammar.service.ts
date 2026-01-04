import { Pool } from 'pg';
import {
  GrammarComparison,
  LanguageGrammarData,
  ComparisonDifference,
  AvailableConcept,
  ComparisonHistoryItem,
  GrammarExample,
} from './comparative-grammar.interface';

/**
 * Database row for grammar rules
 */
interface RuleRow {
  id: string;
  language: string;
  level: string;
  category: string;
  title: string;
  explanation: string;
  examples: GrammarExample[] | null;
}

/**
 * ComparativeGrammarService provides cross-linguistic grammar comparisons
 *
 * Uses the `category` field in approved_rules to match equivalent grammar
 * concepts across languages (e.g., "past_tense" in Russian vs Arabic).
 */
export class ComparativeGrammarService {
  constructor(private readonly pool: Pool) {}

  /**
   * Get available grammar concepts for comparison
   * Only returns concepts that exist in at least 2 of the specified languages
   */
  async getAvailableConcepts(userId: string, languages: string[]): Promise<AvailableConcept[]> {
    // Keep userId for future use (e.g., user-specific concept prioritization)
    void userId;

    const result = await this.pool.query<{
      category: string;
      language_count: string;
    }>(
      `SELECT
         category,
         COUNT(DISTINCT language) AS language_count
       FROM approved_rules
       WHERE language = ANY($1::varchar[])
         AND category IS NOT NULL
       GROUP BY category
       HAVING COUNT(DISTINCT language) >= 2
       ORDER BY COUNT(DISTINCT language) DESC, category ASC`,
      [languages]
    );

    return result.rows.map((row) => ({
      conceptKey: row.category,
      conceptName: this.formatConceptName(row.category),
      languageCount: parseInt(row.language_count, 10),
    }));
  }

  /**
   * Get detailed grammar comparison for a specific concept across languages
   */
  async getGrammarComparison(
    userId: string,
    conceptKey: string,
    languages: string[]
  ): Promise<GrammarComparison> {
    // Fetch grammar rules for this concept in all specified languages
    const rulesResult = await this.pool.query<RuleRow>(
      `SELECT
         id,
         language,
         level,
         category,
         title,
         explanation,
         examples
       FROM approved_rules
       WHERE language = ANY($1::varchar[])
         AND category = $2
       ORDER BY language ASC`,
      [languages, conceptKey]
    );

    if (rulesResult.rows.length === 0) {
      throw new Error(`No grammar rules found for concept: ${conceptKey}`);
    }

    // Build language data
    const languagesData: LanguageGrammarData[] = rulesResult.rows.map((rule) => ({
      language: rule.language,
      ruleId: rule.id,
      ruleName: rule.title,
      explanation: rule.explanation,
      examples: this.parseExamples(rule.examples),
      level: rule.level,
      category: rule.category,
    }));

    // Analyze similarities and differences
    const { similarities, differences } = this.analyzeCrossLinguisticPatterns(
      conceptKey,
      languagesData
    );

    // Generate cross-linguistic insights
    const insights = this.generateCrossLinguisticInsights(languagesData, similarities, differences);

    // Record that user viewed this comparison
    await this.recordComparisonView(userId, conceptKey, languages);

    return {
      conceptKey,
      conceptName: this.formatConceptName(conceptKey),
      languages: languagesData,
      similarities,
      differences,
      crossLinguisticInsights: insights,
    };
  }

  /**
   * Get user's comparison history
   */
  async getUserComparisonHistory(
    userId: string,
    limit: number = 10
  ): Promise<ComparisonHistoryItem[]> {
    const result = await this.pool.query<{
      concept_key: string;
      languages: string[];
      viewed_at: Date;
    }>(
      `SELECT
         concept_key,
         languages,
         viewed_at
       FROM user_grammar_comparisons_viewed
       WHERE user_id = $1
       ORDER BY viewed_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map((row) => ({
      conceptKey: row.concept_key,
      conceptName: this.formatConceptName(row.concept_key),
      languages: row.languages,
      viewedAt: row.viewed_at,
    }));
  }

  /**
   * Record that a user viewed a grammar comparison
   */
  private async recordComparisonView(
    userId: string,
    conceptKey: string,
    languages: string[]
  ): Promise<void> {
    const sortedLanguages = [...languages].sort();

    await this.pool.query(
      `INSERT INTO user_grammar_comparisons_viewed
         (user_id, concept_key, languages, viewed_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, concept_key, languages) DO UPDATE
       SET viewed_at = NOW()`,
      [userId, conceptKey, sortedLanguages]
    );
  }

  /**
   * Parse examples from JSONB
   */
  private parseExamples(examples: GrammarExample[] | null): GrammarExample[] {
    if (!examples || !Array.isArray(examples)) {
      return [];
    }

    return examples.map((ex) => ({
      sentence: ex.sentence || (ex as unknown as { text?: string }).text || '',
      translation: ex.translation || '',
      highlighted: ex.highlighted,
    }));
  }

  /**
   * Format concept key to human-readable name
   */
  private formatConceptName(conceptKey: string): string {
    return conceptKey
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Analyze cross-linguistic patterns to identify similarities and differences
   */
  private analyzeCrossLinguisticPatterns(
    conceptKey: string,
    languagesData: LanguageGrammarData[]
  ): { similarities: string[]; differences: ComparisonDifference[] } {
    const similarities: string[] = [];
    const differences: ComparisonDifference[] = [];

    // Check for level similarities
    const levels = languagesData.map((l) => l.level);
    const allSameLevel = levels.every((level) => level === levels[0]);

    if (allSameLevel && languagesData.length > 1) {
      similarities.push(`All languages introduce this concept at ${levels[0]} level`);
    } else if (languagesData.length > 1) {
      differences.push({
        aspect: 'Difficulty Level',
        descriptions: languagesData.map((l) => ({
          language: l.language,
          description: `Introduced at ${l.level} level`,
        })),
      });
    }

    // Analyze example count (proxy for complexity)
    const exampleCounts = languagesData.map((l) => ({
      language: l.language,
      count: l.examples.length,
    }));

    const maxExamples = Math.max(...exampleCounts.map((e) => e.count));
    const minExamples = Math.min(...exampleCounts.map((e) => e.count));

    if (maxExamples > minExamples && minExamples > 0) {
      const complexLanguage = exampleCounts.find((e) => e.count === maxExamples);
      const simpleLanguage = exampleCounts.find((e) => e.count === minExamples);

      if (complexLanguage && simpleLanguage) {
        differences.push({
          aspect: 'Usage Complexity',
          descriptions: [
            {
              language: complexLanguage.language,
              description: `More usage patterns (${complexLanguage.count} examples)`,
            },
            {
              language: simpleLanguage.language,
              description: `Simpler usage (${simpleLanguage.count} examples)`,
            },
          ],
        });
      }
    }

    // Add general similarity based on category match
    if (languagesData.length >= 2) {
      similarities.push(
        `All languages have a grammatical structure for expressing "${this.formatConceptName(conceptKey).toLowerCase()}"`
      );
    }

    return { similarities, differences };
  }

  /**
   * Generate cross-linguistic insights and learning tips
   */
  private generateCrossLinguisticInsights(
    languagesData: LanguageGrammarData[],
    similarities: string[],
    differences: ComparisonDifference[]
  ): string[] {
    const insights: string[] = [];

    // Insight: Transfer strategy
    if (similarities.length > 0) {
      insights.push(
        'Transfer Strategy: Similar grammatical concepts exist across these languages. Understanding in one can accelerate learning in others.'
      );
    }

    // Insight: Interference warning
    if (differences.length > 0) {
      insights.push(
        'Interference Alert: Different approaches to this concept mean you should be careful not to apply rules from one language to another.'
      );
    }

    // Insight: Learning order recommendation
    const levelOrder = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const sortedByLevel = [...languagesData].sort(
      (a, b) => levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level)
    );

    if (
      sortedByLevel.length >= 2 &&
      sortedByLevel[0].level !== sortedByLevel[sortedByLevel.length - 1].level
    ) {
      insights.push(
        `Learning Order: Master this concept in ${sortedByLevel[0].language} first (${sortedByLevel[0].level}), then transfer to ${sortedByLevel[sortedByLevel.length - 1].language} (${sortedByLevel[sortedByLevel.length - 1].level}).`
      );
    }

    // Insight: Practice recommendation
    if (languagesData.length === 2) {
      insights.push(
        'Practice Tip: Alternate between languages when practicing this concept to strengthen cross-linguistic connections.'
      );
    } else if (languagesData.length >= 3) {
      insights.push(
        'Practice Tip: Create comparison flashcards showing how this concept works in each language side-by-side.'
      );
    }

    return insights;
  }
}
