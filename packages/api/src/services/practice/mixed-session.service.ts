import { Pool } from 'pg';
import {
  MixedSessionConfig,
  MixedExerciseItem,
  MixedSession,
  MixedSessionSummary,
  LanguagePerformance,
  PracticeType,
} from './mixed-session.interface';

/**
 * Error thrown when mixed practice requirements are not met
 */
class MixedSessionError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'MixedSessionError';
    this.statusCode = statusCode;
  }
}

/**
 * MixedSessionService handles language mixing practice sessions
 * that pull exercises from multiple languages for cognitive training
 */
export class MixedSessionService {
  private readonly MAX_CONSECUTIVE_SAME_LANGUAGE = 4;

  constructor(private readonly pool: Pool) {}

  /**
   * Create a mixed practice session with randomized language mixing
   */
  async createMixedSession(config: MixedSessionConfig): Promise<MixedSession> {
    // Get user's active languages
    interface LanguageRow {
      language: string;
      proficiency_score: number | null;
    }

    const languagesResult = await this.pool.query<LanguageRow>(
      `SELECT language, proficiency_score
       FROM user_language_progress
       WHERE user_id = $1 AND is_active = true
       ORDER BY language ASC`,
      [config.userId]
    );

    const languages = languagesResult.rows.map((r) => r.language);

    if (languages.length < 2) {
      throw new MixedSessionError('Mixed practice requires at least 2 active languages');
    }

    // Fetch items from each language
    const allItems: MixedExerciseItem[] = [];

    for (const language of languages) {
      const itemsForLanguage = await this.fetchItemsForLanguage(
        config.userId,
        language,
        config.practiceTypes,
        config.itemsPerLanguage
      );
      allItems.push(...itemsForLanguage);
    }

    if (allItems.length === 0) {
      throw new MixedSessionError('No items available for practice in any language');
    }

    // Apply mixing strategy
    let finalItems: MixedExerciseItem[];

    switch (config.mixingStrategy) {
      case 'equal':
        finalItems = this.equalDistribution(allItems, languages, config.totalItems);
        break;
      case 'weighted':
        finalItems = await this.weightedDistribution(
          config.userId,
          allItems,
          languages,
          config.totalItems
        );
        break;
      case 'random':
        finalItems = this.randomSample(allItems, config.totalItems);
        break;
      default:
        finalItems = this.equalDistribution(allItems, languages, config.totalItems);
    }

    // Shuffle with clustering prevention
    finalItems = this.shuffleWithClusteringPrevention(finalItems);

    // Create session record
    const sessionResult = await this.pool.query<{ id: string }>(
      `INSERT INTO mixed_practice_sessions
         (user_id, languages, mixing_strategy, total_items, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id`,
      [config.userId, languages, config.mixingStrategy, finalItems.length]
    );

    return {
      sessionId: sessionResult.rows[0].id,
      languages,
      mixingStrategy: config.mixingStrategy,
      items: finalItems,
    };
  }

  /**
   * Fetch SRS items for a specific language
   */
  private async fetchItemsForLanguage(
    userId: string,
    language: string,
    practiceTypes: PracticeType[],
    limit: number
  ): Promise<MixedExerciseItem[]> {
    interface ItemRow {
      meaning_id: string;
      word_text: string;
      definition: string | null;
      audio_url: string | null;
      level: string;
      ease_factor: number;
    }

    // Get SRS items due for review
    const result = await this.pool.query<ItemRow>(
      `SELECT DISTINCT ON (usi.meaning_id)
         usi.meaning_id,
         au.text as word_text,
         au.usage_notes as definition,
         au.audio_url,
         am.level,
         usi.ease_factor
       FROM user_srs_items usi
       JOIN approved_meanings am ON usi.meaning_id = am.id
       LEFT JOIN approved_utterances au ON au.meaning_id = am.id AND au.language = $2
       WHERE usi.user_id = $1
         AND usi.language = $2
         AND usi.next_review_at <= current_timestamp
         AND au.text IS NOT NULL
       ORDER BY usi.meaning_id, usi.next_review_at ASC
       LIMIT $3`,
      [userId, language, limit]
    );

    return result.rows.map((row, index) => {
      // Alternate practice types if multiple are specified
      const practiceType = practiceTypes[index % practiceTypes.length];

      return {
        id: `mixed_${row.meaning_id}_${Date.now()}_${index}`,
        language,
        practiceType,
        meaningId: row.meaning_id,
        content: {
          text: row.word_text,
          definition: row.definition,
          audioUrl: row.audio_url,
          level: row.level,
        },
        // Convert ease factor to difficulty (1-5 scale, inverse)
        estimatedDifficulty: Math.max(1, Math.min(5, Math.round(6 - row.ease_factor))),
      };
    });
  }

  /**
   * Equal distribution: same number from each language
   */
  private equalDistribution(
    items: MixedExerciseItem[],
    languages: string[],
    totalItems: number
  ): MixedExerciseItem[] {
    const itemsPerLanguage = Math.floor(totalItems / languages.length);
    const result: MixedExerciseItem[] = [];

    for (const language of languages) {
      const langItems = items.filter((i) => i.language === language);
      result.push(...langItems.slice(0, itemsPerLanguage));
    }

    return result;
  }

  /**
   * Weighted distribution: more items from weaker languages
   */
  private async weightedDistribution(
    userId: string,
    items: MixedExerciseItem[],
    languages: string[],
    totalItems: number
  ): Promise<MixedExerciseItem[]> {
    interface ProficiencyRow {
      language: string;
      proficiency_score: number | null;
    }

    // Get proficiency scores for each language
    const proficiencyResult = await this.pool.query<ProficiencyRow>(
      `SELECT language, proficiency_score
       FROM user_language_progress
       WHERE user_id = $1 AND language = ANY($2::varchar[])`,
      [userId, languages]
    );

    const proficiencies = new Map(
      proficiencyResult.rows.map((r) => [r.language, r.proficiency_score || 0])
    );

    // Calculate weights (inverse of proficiency)
    const profValues = Array.from(proficiencies.values());
    const maxProficiency = profValues.length > 0 ? Math.max(...profValues) : 1;
    const weights = new Map(
      Array.from(proficiencies.entries()).map(([lang, prof]) => [
        lang,
        maxProficiency - prof + 1, // Inverse weight
      ])
    );

    const totalWeight = Array.from(weights.values()).reduce((sum, w) => sum + w, 0);

    const result: MixedExerciseItem[] = [];

    for (const language of languages) {
      const weight = weights.get(language) || 1;
      const itemCount = Math.floor((weight / totalWeight) * totalItems);
      const langItems = items.filter((i) => i.language === language);
      result.push(...langItems.slice(0, itemCount));
    }

    return result;
  }

  /**
   * Random sample from all items
   */
  private randomSample(items: MixedExerciseItem[], count: number): MixedExerciseItem[] {
    const shuffled = this.fisherYatesShuffle([...items]);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  /**
   * Fisher-Yates shuffle algorithm
   */
  private fisherYatesShuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Shuffle with clustering prevention (max consecutive same-language items)
   */
  private shuffleWithClusteringPrevention(items: MixedExerciseItem[]): MixedExerciseItem[] {
    const shuffled = this.fisherYatesShuffle([...items]);

    // Check for clusters and break them up
    for (let i = this.MAX_CONSECUTIVE_SAME_LANGUAGE; i < shuffled.length; i++) {
      let consecutiveCount = 1;
      for (let j = i - 1; j >= 0 && shuffled[j].language === shuffled[i].language; j--) {
        consecutiveCount++;
      }

      if (consecutiveCount > this.MAX_CONSECUTIVE_SAME_LANGUAGE) {
        // Find an item with a different language to swap
        for (let k = i + 1; k < shuffled.length; k++) {
          if (shuffled[k].language !== shuffled[i].language) {
            [shuffled[i], shuffled[k]] = [shuffled[k], shuffled[i]];
            break;
          }
        }
      }
    }

    return shuffled;
  }

  /**
   * Record a practice attempt in a mixed session
   */
  async recordMixedAttempt(
    sessionId: string,
    itemId: string,
    itemType: string,
    language: string,
    isCorrect: boolean,
    timeSpent: number
  ): Promise<{ success: boolean; completedItems: number }> {
    // Get previous attempt to track language switching
    interface PrevAttemptRow {
      language: string;
    }

    const prevAttemptResult = await this.pool.query<PrevAttemptRow>(
      `SELECT language
       FROM mixed_session_attempts
       WHERE session_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [sessionId]
    );

    const previousLanguage =
      prevAttemptResult.rows.length > 0 ? prevAttemptResult.rows[0].language : null;

    // Insert the attempt
    await this.pool.query(
      `INSERT INTO mixed_session_attempts
         (session_id, item_id, item_type, language, previous_language, is_correct, time_spent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [sessionId, itemId, itemType, language, previousLanguage, isCorrect, timeSpent]
    );

    // Update completed items count
    const updateResult = await this.pool.query<{ completed_items: number }>(
      `UPDATE mixed_practice_sessions
       SET completed_items = completed_items + 1
       WHERE id = $1
       RETURNING completed_items`,
      [sessionId]
    );

    return {
      success: true,
      completedItems: updateResult.rows[0].completed_items,
    };
  }

  /**
   * Generate session summary with per-language breakdown
   */
  async generateSessionSummary(sessionId: string): Promise<MixedSessionSummary> {
    interface OverallStatsRow {
      total_items: string;
      total_correct: string;
      total_time: string;
    }

    // Get overall stats
    const overallResult = await this.pool.query<OverallStatsRow>(
      `SELECT
         COUNT(*) AS total_items,
         SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS total_correct,
         COALESCE(SUM(time_spent), 0) AS total_time
       FROM mixed_session_attempts
       WHERE session_id = $1`,
      [sessionId]
    );

    interface LanguageStatsRow {
      language: string;
      items_attempted: string;
      correct_answers: string;
      average_time: string;
      accuracy: string;
    }

    // Get per-language breakdown
    const languageResult = await this.pool.query<LanguageStatsRow>(
      `SELECT
         language,
         COUNT(*) AS items_attempted,
         SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct_answers,
         AVG(time_spent) AS average_time,
         CAST(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(COUNT(*), 0) AS accuracy
       FROM mixed_session_attempts
       WHERE session_id = $1
       GROUP BY language
       ORDER BY language ASC`,
      [sessionId]
    );

    const languageBreakdown: LanguagePerformance[] = languageResult.rows.map((row) => ({
      language: row.language,
      itemsAttempted: parseInt(row.items_attempted, 10),
      correctAnswers: parseInt(row.correct_answers, 10),
      averageTime: parseFloat(row.average_time) || 0,
      accuracy: parseFloat(row.accuracy) || 0,
    }));

    // Calculate switching efficiency
    const switchingEfficiency = await this.calculateSwitchingEfficiency(sessionId);

    // Mark session as completed
    await this.pool.query(
      `UPDATE mixed_practice_sessions
       SET completed_at = NOW(), switching_efficiency = $2
       WHERE id = $1`,
      [sessionId, switchingEfficiency]
    );

    const overall = overallResult.rows[0];

    return {
      sessionId,
      totalItems: parseInt(overall.total_items, 10) || 0,
      totalCorrect: parseInt(overall.total_correct, 10) || 0,
      totalTime: parseInt(overall.total_time, 10) || 0,
      languageBreakdown,
      switchingEfficiency,
    };
  }

  /**
   * Calculate how efficiently user handles language switches
   * Looks at accuracy immediately after language changes
   */
  async calculateSwitchingEfficiency(sessionId: string): Promise<number> {
    interface EfficiencyRow {
      efficiency: string;
    }

    const result = await this.pool.query<EfficiencyRow>(
      `SELECT
         COALESCE(
           AVG(CASE WHEN is_correct THEN 1.0 ELSE 0.0 END)::float,
           1.0
         ) AS efficiency
       FROM mixed_session_attempts
       WHERE session_id = $1
         AND previous_language IS NOT NULL
         AND language != previous_language`,
      [sessionId]
    );

    return parseFloat(result.rows[0]?.efficiency || '1.0');
  }

  /**
   * Get user's mixed session history
   */
  async getUserMixedSessionHistory(
    userId: string,
    limit: number = 10
  ): Promise<
    {
      sessionId: string;
      languages: string[];
      totalItems: number;
      completedItems: number;
      switchingEfficiency: number | null;
      createdAt: Date;
      completedAt: Date | null;
    }[]
  > {
    interface SessionRow {
      id: string;
      languages: string[];
      total_items: number;
      completed_items: number;
      switching_efficiency: number | null;
      created_at: Date;
      completed_at: Date | null;
    }

    const result = await this.pool.query<SessionRow>(
      `SELECT id, languages, total_items, completed_items, switching_efficiency, created_at, completed_at
       FROM mixed_practice_sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map((row) => ({
      sessionId: row.id,
      languages: row.languages,
      totalItems: row.total_items,
      completedItems: row.completed_items,
      switchingEfficiency: row.switching_efficiency,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    }));
  }
}
