import { Pool } from 'pg';
import {
  GrammarConcept,
  GrammarCoverageStats,
  GrammarRecommendation,
  GrammarMasteryTrend,
  CEFRCoverage,
  CategoryCoverage,
  LanguageCoverage,
} from './grammar-analytics.interface';

/**
 * GrammarAnalyticsService provides grammar coverage statistics and analytics
 */
export class GrammarAnalyticsService {
  constructor(private readonly pool: Pool) {}

  /**
   * Get comprehensive grammar coverage statistics
   */
  async getGrammarCoverage(userId: string, language?: string): Promise<GrammarCoverageStats> {
    const params: (string | undefined)[] = [userId];
    let languageFilter = '';

    if (language) {
      languageFilter = 'AND gr.language = $2';
      params.push(language);
    }

    // Get all grammar concepts with completion status
    interface ConceptRow {
      id: string;
      title: string;
      description: string;
      cefr_level: string;
      language: string;
      category: string;
      completed: boolean;
      mastery_level: string;
      last_practiced: Date | null;
      practice_count: string;
    }

    const conceptsQuery = `
      SELECT
        gr.id,
        gr.title,
        gr.explanation as description,
        gr.level as cefr_level,
        gr.language,
        gr.category,
        COALESCE(gp.is_completed, false) as completed,
        COALESCE(gp.mastery_level, 0) as mastery_level,
        gp.last_practiced,
        COALESCE(gp.practice_count, 0) as practice_count
      FROM approved_rules gr
      LEFT JOIN grammar_progress gp ON gp.grammar_id = gr.id AND gp.user_id = $1
      WHERE 1=1 ${languageFilter}
      ORDER BY
        CASE gr.level
          WHEN 'A0' THEN 1
          WHEN 'A1' THEN 2
          WHEN 'A2' THEN 3
          WHEN 'B1' THEN 4
          WHEN 'B2' THEN 5
          WHEN 'C1' THEN 6
          WHEN 'C2' THEN 7
        END,
        gr.category,
        gr.title
    `;

    const conceptsResult = await this.pool.query<ConceptRow>(conceptsQuery, params);

    const allConcepts: GrammarConcept[] = conceptsResult.rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      cefrLevel: row.cefr_level,
      language: row.language,
      category: row.category,
      completed: row.completed,
      masteryLevel: parseInt(row.mastery_level),
      lastPracticed: row.last_practiced ? new Date(row.last_practiced) : null,
      practiceCount: parseInt(row.practice_count),
    }));

    const totalConcepts = allConcepts.length;
    const completedConcepts = allConcepts.filter((c) => c.completed).length;
    const coveragePercentage =
      totalConcepts > 0 ? Math.round((completedConcepts / totalConcepts) * 100) : 0;

    // Group by CEFR level
    const byCEFRMap = new Map<string, { total: number; completed: number }>();
    allConcepts.forEach((concept) => {
      const existing = byCEFRMap.get(concept.cefrLevel) || { total: 0, completed: 0 };
      existing.total++;
      if (concept.completed) existing.completed++;
      byCEFRMap.set(concept.cefrLevel, existing);
    });

    const byCEFR: CEFRCoverage[] = Array.from(byCEFRMap.entries())
      .map(([level, stats]) => ({
        level,
        total: stats.total,
        completed: stats.completed,
        percentage: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
      }))
      .sort((a, b) => {
        const order: Record<string, number> = {
          A0: 1,
          A1: 2,
          A2: 3,
          B1: 4,
          B2: 5,
          C1: 6,
          C2: 7,
        };
        return (order[a.level] || 99) - (order[b.level] || 99);
      });

    // Group by category
    const byCategoryMap = new Map<string, { total: number; completed: number }>();
    allConcepts.forEach((concept) => {
      const existing = byCategoryMap.get(concept.category) || { total: 0, completed: 0 };
      existing.total++;
      if (concept.completed) existing.completed++;
      byCategoryMap.set(concept.category, existing);
    });

    const byCategory: CategoryCoverage[] = Array.from(byCategoryMap.entries())
      .map(([category, stats]) => ({
        category,
        total: stats.total,
        completed: stats.completed,
        percentage: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
      }))
      .sort((a, b) => b.percentage - a.percentage);

    // Group by language (if not filtered)
    let byLanguage: LanguageCoverage[] = [];

    if (!language) {
      const byLanguageMap = new Map<string, { total: number; completed: number }>();
      allConcepts.forEach((concept) => {
        const existing = byLanguageMap.get(concept.language) || { total: 0, completed: 0 };
        existing.total++;
        if (concept.completed) existing.completed++;
        byLanguageMap.set(concept.language, existing);
      });

      byLanguage = Array.from(byLanguageMap.entries())
        .map(([lang, stats]) => ({
          language: lang,
          totalConcepts: stats.total,
          completedConcepts: stats.completed,
          percentage: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
        }))
        .sort((a, b) => b.percentage - a.percentage);
    }

    // Identify gaps (not completed, prioritize by CEFR level)
    const gaps = allConcepts.filter((c) => !c.completed).slice(0, 20);

    // Recently completed (last 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentlyCompleted = allConcepts
      .filter((c) => c.completed && c.lastPracticed)
      .filter((c) => c.lastPracticed!.getTime() >= thirtyDaysAgo)
      .sort((a, b) => b.lastPracticed!.getTime() - a.lastPracticed!.getTime())
      .slice(0, 10);

    return {
      totalConcepts,
      completedConcepts,
      coveragePercentage,
      byCEFR,
      byCategory,
      byLanguage,
      gaps,
      recentlyCompleted,
    };
  }

  /**
   * Get personalized grammar recommendations
   */
  async getGrammarRecommendations(
    userId: string,
    language: string,
    limit: number = 5
  ): Promise<GrammarRecommendation[]> {
    // Get user's current CEFR level from user_languages
    interface UserLevelRow {
      cefr_level: string;
    }

    const userLevelResult = await this.pool.query<UserLevelRow>(
      `SELECT
         COALESCE(
           (SELECT cefr_level FROM user_language_progress WHERE user_id = $1 AND language = $2),
           'A1'
         ) as cefr_level`,
      [userId, language]
    );

    const userCEFRLevel = userLevelResult.rows[0]?.cefr_level || 'A1';
    const nextLevel = this.getNextCEFRLevel(userCEFRLevel);

    interface RecommendationRow {
      concept_id: string;
      title: string;
      cefr_level: string;
      category: string;
      practice_count: string;
      mastery_level: string;
    }

    const query = `
      SELECT
        gr.id as concept_id,
        gr.title,
        gr.level as cefr_level,
        gr.category,
        COALESCE(gp.practice_count, 0) as practice_count,
        COALESCE(gp.mastery_level, 0) as mastery_level
      FROM approved_rules gr
      LEFT JOIN grammar_progress gp ON gp.grammar_id = gr.id AND gp.user_id = $1
      WHERE gr.language = $2
        AND (gr.level = $3 OR gr.level = $4)
        AND COALESCE(gp.is_completed, false) = false
      ORDER BY
        CASE gr.level
          WHEN $3 THEN 1
          WHEN $4 THEN 2
        END,
        gp.practice_count NULLS FIRST,
        gr.title
      LIMIT $5
    `;

    const result = await this.pool.query<RecommendationRow>(query, [
      userId,
      language,
      userCEFRLevel,
      nextLevel,
      limit,
    ]);

    return result.rows.map((row) => {
      let reason = '';
      let priority: 'high' | 'medium' | 'low' = 'medium';

      if (row.practice_count === '0') {
        reason = 'Not yet practiced';
        priority = row.cefr_level === userCEFRLevel ? 'high' : 'medium';
      } else if (parseInt(row.mastery_level) < 50) {
        reason = 'Low mastery - needs more practice';
        priority = 'high';
      } else {
        reason = 'Ready to complete';
        priority = 'medium';
      }

      if (row.cefr_level !== userCEFRLevel) {
        reason += ' (next level)';
        priority = 'low';
      }

      return {
        conceptId: row.concept_id,
        title: row.title,
        cefrLevel: row.cefr_level,
        reason,
        priority,
      };
    });
  }

  /**
   * Get grammar mastery trends over time
   */
  async getGrammarMasteryTrends(
    userId: string,
    language?: string,
    days: number = 30
  ): Promise<GrammarMasteryTrend[]> {
    const params: (string | number)[] = [userId, days];
    let languageFilter = '';

    if (language) {
      languageFilter = 'AND gr.language = $3';
      params.push(language);
    }

    interface TrendRow {
      date: string;
      concepts_completed: string;
      average_mastery: string;
    }

    const query = `
      WITH date_series AS (
        SELECT generate_series(
          CURRENT_DATE - $2::int,
          CURRENT_DATE,
          '1 day'::interval
        )::date AS date
      ),
      daily_progress AS (
        SELECT
          DATE(gp.completed_at) as completion_date,
          COUNT(DISTINCT gp.grammar_id) as concepts_completed,
          AVG(gp.mastery_level) as avg_mastery
        FROM grammar_progress gp
        JOIN approved_rules gr ON gr.id = gp.grammar_id
        WHERE gp.user_id = $1
          AND gp.is_completed = true
          AND gp.completed_at IS NOT NULL
          ${languageFilter}
        GROUP BY DATE(gp.completed_at)
      )
      SELECT
        ds.date::text,
        COALESCE(SUM(dp.concepts_completed) OVER (ORDER BY ds.date), 0) as concepts_completed,
        COALESCE(dp.avg_mastery, 0) as average_mastery
      FROM date_series ds
      LEFT JOIN daily_progress dp ON dp.completion_date = ds.date
      ORDER BY ds.date
    `;

    const result = await this.pool.query<TrendRow>(query, params);

    return result.rows.map((row) => ({
      date: row.date,
      conceptsCompleted: parseInt(row.concepts_completed),
      averageMastery: Math.round(parseFloat(row.average_mastery) * 10) / 10,
    }));
  }

  /**
   * Get detailed concept information
   */
  async getConceptDetails(userId: string, conceptId: string): Promise<GrammarConcept | null> {
    interface ConceptRow {
      id: string;
      title: string;
      description: string;
      cefr_level: string;
      language: string;
      category: string;
      completed: boolean;
      mastery_level: string;
      last_practiced: Date | null;
      practice_count: string;
    }

    const query = `
      SELECT
        gr.id,
        gr.title,
        gr.explanation as description,
        gr.level as cefr_level,
        gr.language,
        gr.category,
        COALESCE(gp.is_completed, false) as completed,
        COALESCE(gp.mastery_level, 0) as mastery_level,
        gp.last_practiced,
        COALESCE(gp.practice_count, 0) as practice_count
      FROM approved_rules gr
      LEFT JOIN grammar_progress gp ON gp.grammar_id = gr.id AND gp.user_id = $1
      WHERE gr.id = $2
    `;

    const result = await this.pool.query<ConceptRow>(query, [userId, conceptId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      cefrLevel: row.cefr_level,
      language: row.language,
      category: row.category,
      completed: row.completed,
      masteryLevel: parseInt(row.mastery_level),
      lastPracticed: row.last_practiced ? new Date(row.last_practiced) : null,
      practiceCount: parseInt(row.practice_count),
    };
  }

  /**
   * Helper: Get next CEFR level
   */
  private getNextCEFRLevel(currentLevel: string): string {
    const levels = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const currentIndex = levels.indexOf(currentLevel);
    return currentIndex < levels.length - 1 ? levels[currentIndex + 1] : currentLevel;
  }
}
