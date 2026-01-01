import { Pool } from 'pg';

class NotFoundError extends Error {
  statusCode: number;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

export type CEFRLevel = 'A0' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface GrammarRule {
  ruleId: string;
  category: string;
  title: string;
  cefrLevel: CEFRLevel;
  explanation: string;
  language: string;
}

export interface GrammarExample {
  text: string;
  translation?: string | null;
  annotation?: string | null;
}

export interface GrammarLessonData {
  rule: GrammarRule;
  examples: GrammarExample[];
  relatedRules: Array<{
    ruleId: string;
    title: string;
    relationshipType: 'prerequisite' | 'related';
  }>;
  conjugationTable: null; // Not implemented in current schema
}

export class GrammarLessonService {
  constructor(private readonly pool: Pool) {}

  /**
   * Get grammar lesson data for a specific rule
   */
  async getGrammarLesson(ruleId: string): Promise<GrammarLessonData | null> {
    interface RuleRow {
      id: string;
      category: string;
      title: string;
      level: CEFRLevel;
      explanation: string;
      language: string;
      examples: GrammarExample[];
    }

    // Fetch grammar rule
    const ruleResult = await this.pool.query<RuleRow>(
      `SELECT
        id,
        category,
        title,
        level,
        explanation,
        language,
        examples
       FROM approved_rules
       WHERE id = $1`,
      [ruleId]
    );

    if (ruleResult.rows.length === 0) {
      return null;
    }

    const row = ruleResult.rows[0];
    const rule: GrammarRule = {
      ruleId: row.id,
      category: row.category,
      title: row.title,
      cefrLevel: row.level,
      explanation: row.explanation,
      language: row.language,
    };

    // Examples are stored as JSONB
    const examples: GrammarExample[] = Array.isArray(row.examples) ? row.examples : [];

    // Fetch related rules from curriculum graph
    const relatedRules = await this.getRelatedRules(ruleId, row.language);

    return {
      rule,
      examples,
      relatedRules,
      conjugationTable: null, // Not implemented yet
    };
  }

  /**
   * Get related rules using curriculum graph
   */
  private async getRelatedRules(
    ruleId: string,
    language: string
  ): Promise<
    Array<{ ruleId: string; title: string; relationshipType: 'prerequisite' | 'related' }>
  > {
    interface RelatedRow {
      concept_id: string;
      relationship_type: 'prerequisite' | 'related';
    }

    // Get concept_id for this rule (assuming it's grammar_{category})
    const ruleResult = await this.pool.query<{ category: string }>(
      `SELECT category FROM approved_rules WHERE id = $1`,
      [ruleId]
    );

    if (ruleResult.rows.length === 0) {
      return [];
    }

    const conceptId = `grammar_${ruleResult.rows[0].category}`;

    // Get prerequisites from curriculum graph
    const result = await this.pool.query<RelatedRow>(
      `SELECT
        unnest(prerequisites_and) as concept_id,
        'prerequisite' as relationship_type
       FROM curriculum_graph
       WHERE concept_id = $1 AND language = $2
       LIMIT 5`,
      [conceptId, language]
    );

    // Map concept_ids to rule titles
    const relatedRules: Array<{
      ruleId: string;
      title: string;
      relationshipType: 'prerequisite' | 'related';
    }> = [];

    for (const row of result.rows) {
      // Extract category from concept_id (e.g., grammar_present_tense -> present_tense)
      const category = row.concept_id.replace(/^grammar_/, '');

      // Find rule with this category
      interface RuleTitleRow {
        id: string;
        title: string;
      }
      const ruleResult = await this.pool.query<RuleTitleRow>(
        `SELECT id, title FROM approved_rules WHERE category = $1 AND language = $2 LIMIT 1`,
        [category, language]
      );

      if (ruleResult.rows.length > 0) {
        relatedRules.push({
          ruleId: ruleResult.rows[0].id,
          title: ruleResult.rows[0].title,
          relationshipType: row.relationship_type,
        });
      }
    }

    return relatedRules;
  }

  /**
   * Get next grammar lessons for user (unlocked by curriculum)
   */
  async getNextGrammarLessons(
    userId: string,
    language: string,
    limit: number = 10
  ): Promise<GrammarRule[]> {
    interface RuleRow {
      id: string;
      category: string;
      title: string;
      level: CEFRLevel;
      explanation: string;
      language: string;
    }

    const result = await this.pool.query<RuleRow>(
      `SELECT
        ar.id,
        ar.category,
        ar.title,
        ar.level,
        ar.explanation,
        ar.language
       FROM approved_rules ar
       JOIN curriculum_graph cg ON cg.concept_id = CONCAT('grammar_', ar.category) AND cg.language = ar.language
       JOIN user_concept_progress ucp ON ucp.concept_id = cg.concept_id AND ucp.language = cg.language
       WHERE ar.language = $1
         AND ucp.user_id = $2
         AND ucp.status IN ('unlocked', 'in_progress')
       GROUP BY ar.id, ar.category, ar.title, ar.level, ar.explanation, ar.language
       ORDER BY
         CASE ar.level
           WHEN 'A0' THEN 0
           WHEN 'A1' THEN 1
           WHEN 'A2' THEN 2
           WHEN 'B1' THEN 3
           WHEN 'B2' THEN 4
           WHEN 'C1' THEN 5
           WHEN 'C2' THEN 6
         END ASC,
         ar.title ASC
       LIMIT $3`,
      [language, userId, limit]
    );

    return result.rows.map((row) => ({
      ruleId: row.id,
      category: row.category,
      title: row.title,
      cefrLevel: row.level,
      explanation: row.explanation,
      language: row.language,
    }));
  }

  /**
   * Mark grammar lesson as completed
   */
  async markLessonComplete(userId: string, ruleId: string, language: string): Promise<void> {
    // Get grammar category to find curriculum concept
    interface CategoryRow {
      category: string;
    }
    const categoryResult = await this.pool.query<CategoryRow>(
      `SELECT category FROM approved_rules WHERE id = $1`,
      [ruleId]
    );

    if (categoryResult.rows.length === 0) {
      throw new NotFoundError('Grammar rule not found');
    }

    const conceptId = `grammar_${categoryResult.rows[0].category}`;

    // Update curriculum progress
    const result = await this.pool.query(
      `UPDATE user_concept_progress
       SET status = 'completed',
           completed_at = NOW(),
           progress_percentage = 100
       WHERE user_id = $1 AND concept_id = $2 AND language = $3
       RETURNING id`,
      [userId, conceptId, language]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('User concept progress not found');
    }
  }
}
