import { Pool } from 'pg';
import {
  WeaknessItem,
  WeaknessAnalysis,
  WeaknessRecommendation,
  ImprovementTracking,
  WeaknessHeatmapCell,
} from './weakness-identification.interface';

/**
 * Weakness Identification Service
 *
 * Identifies user's weak areas based on performance metrics:
 * 1. Vocabulary items with low accuracy or high lapse rate
 * 2. Grammar concepts with poor mastery scores
 *
 * Weakness Criteria:
 * - Accuracy < 70% over attempts
 * - OR ease factor < 2.0 (SRS metric indicating difficulty)
 * - OR recent failures (>=3 failures in last 7 days)
 *
 * Ranking Algorithm:
 * - Severity = (1 - accuracy) * 0.5 + (recency_weight) * 0.3 + (frequency_weight) * 0.2
 */
export class WeaknessIdentificationService {
  private readonly WEAKNESS_ACCURACY_THRESHOLD = 0.7; // 70%
  private readonly MIN_ATTEMPTS_FOR_ANALYSIS = 5;
  private readonly ANALYSIS_WINDOW_DAYS = 30;
  private readonly EASE_FACTOR_THRESHOLD = 2.0;

  constructor(private readonly pool: Pool) {}

  /**
   * Analyze user's performance to identify weaknesses
   */
  async analyzeWeaknesses(
    userId: string,
    language?: string,
    cefrLevel?: string
  ): Promise<WeaknessAnalysis> {
    // Get vocabulary weaknesses
    const vocabWeaknesses = await this.getVocabularyWeaknesses(userId, language, cefrLevel);

    // Get grammar weaknesses
    const grammarWeaknesses = await this.getGrammarWeaknesses(userId, language, cefrLevel);

    // Combine all weaknesses
    const allWeaknesses = [...vocabWeaknesses, ...grammarWeaknesses];

    // Sort by severity score (highest first)
    allWeaknesses.sort((a, b) => b.severityScore - a.severityScore);

    // Count by type
    const weaknessesByType = {
      vocabulary: vocabWeaknesses.length,
      grammar: grammarWeaknesses.length,
    };

    // Count by CEFR level
    const weaknessesByCEFR: Record<string, number> = {};
    allWeaknesses.forEach((w) => {
      weaknessesByCEFR[w.cefrLevel] = (weaknessesByCEFR[w.cefrLevel] || 0) + 1;
    });

    return {
      userId,
      language,
      totalWeaknesses: allWeaknesses.length,
      weaknessesByType,
      weaknessesByCEFR,
      topWeaknesses: allWeaknesses.slice(0, 50), // Top 50 weaknesses
      analyzedAt: new Date(),
    };
  }

  /**
   * Get vocabulary weaknesses based on user_word_state and SRS performance
   */
  private async getVocabularyWeaknesses(
    userId: string,
    language?: string,
    cefrLevel?: string
  ): Promise<WeaknessItem[]> {
    interface VocabRow {
      meaning_id: string;
      item_text: string;
      language: string;
      cefr_level: string;
      successful_reviews: string;
      total_reviews: string;
      last_reviewed_at: Date | null;
      ease_factor: string | null;
      recent_failures: string;
    }

    // Build WHERE clause parts dynamically
    const whereClauses = [
      'uws.user_id = $1',
      `uws.total_reviews >= ${this.MIN_ATTEMPTS_FOR_ANALYSIS}`,
    ];
    const params: (string | undefined)[] = [userId];

    if (language) {
      params.push(language);
      whereClauses.push(`uws.language = $${params.length}`);
    }
    if (cefrLevel) {
      params.push(cefrLevel);
      whereClauses.push(`am.level = $${params.length}`);
    }

    const query = `
      WITH recent_failures AS (
        SELECT
          srh.item_id,
          COUNT(*) as failure_count
        FROM srs_review_history srh
        WHERE srh.user_id = $1
          AND srh.item_type = 'vocabulary'
          AND srh.rating IN ('again', 'hard')
          AND srh.reviewed_at >= NOW() - INTERVAL '${this.ANALYSIS_WINDOW_DAYS} days'
        GROUP BY srh.item_id
      )
      SELECT
        uws.meaning_id,
        au.text as item_text,
        uws.language,
        am.level as cefr_level,
        uws.successful_reviews::text,
        uws.total_reviews::text,
        uws.last_reviewed_at,
        usi.ease_factor::text,
        COALESCE(rf.failure_count, 0)::text as recent_failures
      FROM user_word_state uws
      INNER JOIN approved_meanings am ON am.id = uws.meaning_id
      INNER JOIN approved_utterances au ON au.meaning_id = am.id AND au.language = uws.language
      LEFT JOIN user_srs_items usi ON usi.meaning_id = uws.meaning_id AND usi.user_id = uws.user_id
      LEFT JOIN recent_failures rf ON rf.item_id = uws.meaning_id
      WHERE ${whereClauses.join(' AND ')}
        AND (
          (uws.total_reviews > 0 AND (uws.successful_reviews::float / uws.total_reviews) < ${this.WEAKNESS_ACCURACY_THRESHOLD})
          OR usi.ease_factor < ${this.EASE_FACTOR_THRESHOLD}
          OR COALESCE(rf.failure_count, 0) >= 3
        )
      ORDER BY (uws.successful_reviews::float / NULLIF(uws.total_reviews, 0)) ASC, rf.failure_count DESC NULLS LAST
    `;

    const result = await this.pool.query<VocabRow>(
      query,
      params.filter((p) => p !== undefined)
    );

    return result.rows.map((row) => {
      const totalReviews = parseInt(row.total_reviews);
      const successfulReviews = parseInt(row.successful_reviews);
      const accuracy = totalReviews > 0 ? successfulReviews / totalReviews : 0;
      const recencyWeight = this.calculateRecencyWeight(row.last_reviewed_at);
      const frequencyWeight = Math.min(totalReviews / 50, 1.0);
      const severityScore = (1 - accuracy) * 0.5 + recencyWeight * 0.3 + frequencyWeight * 0.2;

      return {
        itemId: row.meaning_id,
        itemType: 'vocabulary' as const,
        itemText: row.item_text,
        language: row.language,
        cefrLevel: row.cefr_level,
        accuracy: Math.round(accuracy * 1000) / 10, // Convert to percentage with 1 decimal
        totalAttempts: totalReviews,
        recentAttempts: totalReviews, // Will be refined with history query if needed
        failureCount: parseInt(row.recent_failures),
        lastAttemptDate: row.last_reviewed_at,
        severityScore: Math.round(severityScore * 1000) / 10,
        improvementPotential: this.calculateImprovementPotential(accuracy, totalReviews),
      };
    });
  }

  /**
   * Get grammar weaknesses based on grammar_progress
   */
  private async getGrammarWeaknesses(
    userId: string,
    language?: string,
    cefrLevel?: string
  ): Promise<WeaknessItem[]> {
    interface GrammarRow {
      grammar_id: string;
      item_text: string;
      language: string;
      cefr_level: string;
      category: string;
      mastery_level: string;
      practice_count: string;
      correct_count: string;
      last_practiced: Date | null;
      recent_failures: string;
    }

    // Build WHERE clause parts dynamically
    const whereClauses = [
      'gp.user_id = $1',
      `gp.practice_count >= ${this.MIN_ATTEMPTS_FOR_ANALYSIS}`,
    ];
    const params: (string | undefined)[] = [userId];

    if (language) {
      params.push(language);
      whereClauses.push(`gp.language = $${params.length}`);
    }
    if (cefrLevel) {
      params.push(cefrLevel);
      whereClauses.push(`ar.level = $${params.length}`);
    }

    const query = `
      WITH recent_failures AS (
        SELECT
          srh.item_id,
          COUNT(*) as failure_count
        FROM srs_review_history srh
        WHERE srh.user_id = $1
          AND srh.item_type = 'grammar'
          AND srh.rating IN ('again', 'hard')
          AND srh.reviewed_at >= NOW() - INTERVAL '${this.ANALYSIS_WINDOW_DAYS} days'
        GROUP BY srh.item_id
      )
      SELECT
        gp.grammar_id,
        ar.title as item_text,
        gp.language,
        ar.level as cefr_level,
        ar.category,
        gp.mastery_level::text,
        gp.practice_count::text,
        gp.correct_count::text,
        gp.last_practiced,
        COALESCE(rf.failure_count, 0)::text as recent_failures
      FROM grammar_progress gp
      INNER JOIN approved_rules ar ON ar.id = gp.grammar_id
      LEFT JOIN recent_failures rf ON rf.item_id = gp.grammar_id
      WHERE ${whereClauses.join(' AND ')}
        AND (
          gp.mastery_level < 70
          OR (gp.practice_count > 0 AND (gp.correct_count::float / gp.practice_count) < ${this.WEAKNESS_ACCURACY_THRESHOLD})
          OR COALESCE(rf.failure_count, 0) >= 3
        )
      ORDER BY gp.mastery_level ASC, rf.failure_count DESC NULLS LAST
    `;

    const result = await this.pool.query<GrammarRow>(
      query,
      params.filter((p) => p !== undefined)
    );

    return result.rows.map((row) => {
      const practiceCount = parseInt(row.practice_count);
      const correctCount = parseInt(row.correct_count);
      const accuracy = practiceCount > 0 ? correctCount / practiceCount : 0;
      const recencyWeight = this.calculateRecencyWeight(row.last_practiced);
      const frequencyWeight = Math.min(practiceCount / 30, 1.0);
      const severityScore = (1 - accuracy) * 0.5 + recencyWeight * 0.3 + frequencyWeight * 0.2;

      return {
        itemId: row.grammar_id,
        itemType: 'grammar' as const,
        itemText: row.item_text,
        language: row.language,
        cefrLevel: row.cefr_level,
        category: row.category,
        accuracy: Math.round(accuracy * 1000) / 10,
        totalAttempts: practiceCount,
        recentAttempts: practiceCount,
        failureCount: parseInt(row.recent_failures),
        lastAttemptDate: row.last_practiced,
        severityScore: Math.round(severityScore * 1000) / 10,
        improvementPotential: this.calculateImprovementPotential(accuracy, practiceCount),
      };
    });
  }

  /**
   * Calculate recency weight (more recent = higher weight)
   * Returns value between 0 and 1
   */
  private calculateRecencyWeight(lastAttemptDate: Date | null): number {
    if (!lastAttemptDate) return 0.1;

    const daysSinceAttempt = Math.floor(
      (Date.now() - lastAttemptDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceAttempt <= 1) return 1.0;
    if (daysSinceAttempt <= 3) return 0.8;
    if (daysSinceAttempt <= 7) return 0.6;
    if (daysSinceAttempt <= 14) return 0.4;
    if (daysSinceAttempt <= 30) return 0.2;
    return 0.1;
  }

  /**
   * Calculate improvement potential (lower accuracy + more attempts = higher potential)
   */
  private calculateImprovementPotential(accuracy: number, totalAttempts: number): number {
    const accuracyGap = 1.0 - accuracy;
    const attemptFactor = Math.min(totalAttempts / 20, 1.0);
    return Math.round((accuracyGap * 0.7 + attemptFactor * 0.3) * 100);
  }

  /**
   * Generate practice recommendations for identified weaknesses
   */
  async getWeaknessRecommendations(
    userId: string,
    language?: string,
    limit: number = 10
  ): Promise<WeaknessRecommendation[]> {
    const analysis = await this.analyzeWeaknesses(userId, language);

    const recommendations: WeaknessRecommendation[] = [];

    for (const weakness of analysis.topWeaknesses.slice(0, limit)) {
      let practiceType: 'recall' | 'recognition' | 'production' | 'mixed';
      let estimatedTime: number;
      let priority: 'critical' | 'high' | 'medium' | 'low';

      // Determine practice type based on accuracy level
      if (weakness.accuracy < 40) {
        practiceType = 'recognition'; // Easiest for very weak areas
        estimatedTime = 15;
      } else if (weakness.accuracy < 60) {
        practiceType = 'mixed';
        estimatedTime = 10;
      } else {
        practiceType = 'recall'; // Harder practice for near-threshold items
        estimatedTime = 5;
      }

      // Determine priority
      if (weakness.severityScore >= 80) priority = 'critical';
      else if (weakness.severityScore >= 60) priority = 'high';
      else if (weakness.severityScore >= 40) priority = 'medium';
      else priority = 'low';

      recommendations.push({
        itemId: weakness.itemId,
        itemType: weakness.itemType,
        itemText: weakness.itemText,
        reason: this.generateRecommendationReason(weakness),
        practiceType,
        estimatedPracticeTime: estimatedTime,
        priority,
      });
    }

    return recommendations;
  }

  /**
   * Generate human-readable reason for recommendation
   */
  private generateRecommendationReason(weakness: WeaknessItem): string {
    if (weakness.accuracy < 50) {
      return `Low accuracy (${weakness.accuracy.toFixed(1)}%) - needs fundamental review`;
    } else if (weakness.failureCount >= 5) {
      return `${weakness.failureCount} recent failures - persistent difficulty`;
    } else if (weakness.totalAttempts > 10 && weakness.accuracy < 70) {
      return `Practiced frequently but accuracy still low - needs different approach`;
    } else {
      return `Below target accuracy (${weakness.accuracy.toFixed(1)}%) - needs reinforcement`;
    }
  }

  /**
   * Track improvement for previously identified weaknesses
   */
  async trackImprovements(
    userId: string,
    language?: string,
    daysSince: number = 14
  ): Promise<ImprovementTracking[]> {
    interface HistoricalRow {
      item_id: string;
      item_type: string;
      accuracy: string;
      attempts: string;
    }

    // Get historical performance from N days ago (older window)
    const historicalQuery = `
      WITH historical_performance AS (
        SELECT
          srh.item_id,
          srh.item_type,
          AVG(CASE WHEN srh.rating IN ('good', 'easy') THEN 1.0 ELSE 0.0 END) as accuracy,
          COUNT(srh.id) as attempts
        FROM srs_review_history srh
        WHERE srh.user_id = $1
          AND srh.reviewed_at BETWEEN NOW() - INTERVAL '${daysSince + 30} days' AND NOW() - INTERVAL '${daysSince} days'
          ${language ? 'AND srh.language = $2' : ''}
        GROUP BY srh.item_id, srh.item_type
        HAVING COUNT(srh.id) >= 3
      )
      SELECT * FROM historical_performance
    `;

    const historicalParams: string[] = [userId];
    if (language) historicalParams.push(language);

    const historicalResult = await this.pool.query<HistoricalRow>(
      historicalQuery,
      historicalParams
    );
    const historicalPerformance = new Map(
      historicalResult.rows.map((row) => [
        `${row.item_type}:${row.item_id}`,
        { accuracy: parseFloat(row.accuracy), attempts: parseInt(row.attempts) },
      ])
    );

    // Get current weaknesses
    const currentAnalysis = await this.analyzeWeaknesses(userId, language);
    const currentWeaknesses = new Map(
      currentAnalysis.topWeaknesses.map((w) => [`${w.itemType}:${w.itemId}`, w])
    );

    const improvements: ImprovementTracking[] = [];

    // Compare historical vs current
    for (const [key, current] of currentWeaknesses.entries()) {
      const historical = historicalPerformance.get(key);

      if (historical) {
        const beforeAccuracy = historical.accuracy * 100;
        const afterAccuracy = current.accuracy;
        const improvementPct =
          beforeAccuracy > 0 ? ((afterAccuracy - beforeAccuracy) / beforeAccuracy) * 100 : 0;

        let status: 'improving' | 'stagnant' | 'regressing';
        if (improvementPct > 10) status = 'improving';
        else if (improvementPct < -10) status = 'regressing';
        else status = 'stagnant';

        improvements.push({
          itemId: current.itemId,
          itemType: current.itemType,
          itemText: current.itemText,
          beforeAccuracy: Math.round(beforeAccuracy * 10) / 10,
          afterAccuracy: Math.round(afterAccuracy * 10) / 10,
          improvementPercentage: Math.round(improvementPct * 10) / 10,
          practiceSessionsCompleted: current.recentAttempts,
          status,
        });
      }
    }

    return improvements.sort((a, b) => b.improvementPercentage - a.improvementPercentage);
  }

  /**
   * Get weakness heatmap data (CEFR level x category)
   */
  async getWeaknessHeatmap(userId: string, language?: string): Promise<WeaknessHeatmapCell[]> {
    const analysis = await this.analyzeWeaknesses(userId, language);

    // Group weaknesses by CEFR level and category
    const heatmapData = new Map<string, { count: number; totalSeverity: number }>();

    for (const weakness of analysis.topWeaknesses) {
      const category = weakness.category || weakness.itemType;
      const key = `${weakness.cefrLevel}:${category}`;

      const existing = heatmapData.get(key) || { count: 0, totalSeverity: 0 };
      heatmapData.set(key, {
        count: existing.count + 1,
        totalSeverity: existing.totalSeverity + weakness.severityScore,
      });
    }

    const cells: WeaknessHeatmapCell[] = [];
    for (const [key, data] of heatmapData.entries()) {
      const [cefrLevel, category] = key.split(':');
      cells.push({
        cefrLevel,
        category,
        weaknessCount: data.count,
        avgSeverity: Math.round((data.totalSeverity / data.count) * 10) / 10,
      });
    }

    return cells.sort((a, b) => b.avgSeverity - a.avgSeverity);
  }
}
