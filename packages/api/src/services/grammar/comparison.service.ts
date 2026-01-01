import { Pool } from 'pg';

export interface GrammarComparison {
  category: string;
  languages: Array<{
    language: string;
    ruleId: string;
    title: string;
    explanation: string;
    example: string | null;
  }>;
  similarities: string[]; // Future: curated notes from grammar_cross_linguistic_notes
  differences: string[]; // Future: curated notes from grammar_cross_linguistic_notes
}

export class GrammarComparisonService {
  constructor(private readonly pool: Pool) {}

  /**
   * Get cross-linguistic comparison for a grammar concept
   * Only returns data if user is studying multiple languages
   */
  async getComparison(userId: string, category: string): Promise<GrammarComparison | null> {
    // Get all languages user is studying
    const userLanguages = await this.getUserLanguages(userId);

    if (userLanguages.length < 2) {
      return null; // No comparison if studying only one language
    }

    interface RuleRow {
      language: string;
      rule_id: string;
      title: string;
      explanation: string;
      example: string | null;
    }

    // Fetch grammar rules for this category across all user's languages
    const rulesResult = await this.pool.query<RuleRow>(
      `SELECT
        ar.language,
        ar.id as rule_id,
        ar.title,
        ar.explanation,
        (ar.examples->0->>'text') as example
       FROM approved_rules ar
       WHERE ar.category = $1
         AND ar.language = ANY($2::text[])
       ORDER BY ar.language ASC`,
      [category, userLanguages]
    );

    if (rulesResult.rows.length < 2) {
      return null; // Need at least 2 languages for comparison
    }

    const languages = rulesResult.rows.map((row) => ({
      language: row.language,
      ruleId: row.rule_id,
      title: row.title,
      explanation: row.explanation,
      example: row.example,
    }));

    // Future enhancement: Fetch curated comparison notes from grammar_cross_linguistic_notes table
    // For now, return empty arrays
    const similarities: string[] = [];
    const differences: string[] = [];

    return {
      category,
      languages,
      similarities,
      differences,
    };
  }

  /**
   * Get all languages user is studying
   */
  private async getUserLanguages(userId: string): Promise<string[]> {
    interface LanguageRow {
      language: string;
    }

    const result = await this.pool.query<LanguageRow>(
      `SELECT DISTINCT language
       FROM user_languages
       WHERE user_id = $1
       ORDER BY language ASC`,
      [userId]
    );

    return result.rows.map((r) => r.language);
  }
}
