import { Pool } from 'pg';
import {
  VocabularyStats,
  VocabularyTrend,
  WordDetails,
  LearningVelocity,
  PaginatedWords,
  WordState,
} from './vocabulary-analytics.interface';

/**
 * VocabularyAnalyticsService provides vocabulary progress statistics and analytics
 */
export class VocabularyAnalyticsService {
  constructor(private readonly pool: Pool) {}

  /**
   * Get overall vocabulary statistics for a user
   */
  async getVocabularyStats(userId: string, language?: string): Promise<VocabularyStats> {
    const params: (string | undefined)[] = [userId];
    const languageFilter = language ? 'AND uws.language = $2' : '';
    if (language) params.push(language);

    // Total words by state
    interface StateRow {
      state: string;
      count: string;
    }

    const stateResult = await this.pool.query<StateRow>(
      `SELECT state, COUNT(*) as count
       FROM user_word_state uws
       WHERE user_id = $1 ${languageFilter}
       GROUP BY state`,
      params
    );

    const byState = { unknown: 0, learning: 0, known: 0 };
    for (const row of stateResult.rows) {
      if (row.state in byState) {
        byState[row.state as keyof typeof byState] = parseInt(row.count);
      }
    }
    const totalWords = byState.unknown + byState.learning + byState.known;

    // Per-language breakdown
    interface LanguageRow {
      language: string;
      total_words: string;
      unknown: string;
      learning: string;
      known: string;
    }

    const languageResult = await this.pool.query<LanguageRow>(
      `SELECT
         uws.language,
         COUNT(*) as total_words,
         SUM(CASE WHEN uws.state = 'unknown' THEN 1 ELSE 0 END) as unknown,
         SUM(CASE WHEN uws.state = 'learning' THEN 1 ELSE 0 END) as learning,
         SUM(CASE WHEN uws.state = 'known' THEN 1 ELSE 0 END) as known
       FROM user_word_state uws
       WHERE uws.user_id = $1 ${languageFilter}
       GROUP BY uws.language
       ORDER BY total_words DESC`,
      params
    );

    const byLanguage = languageResult.rows.map((row) => ({
      language: row.language,
      totalWords: parseInt(row.total_words),
      unknown: parseInt(row.unknown),
      learning: parseInt(row.learning),
      known: parseInt(row.known),
    }));

    // CEFR level distribution
    interface CEFRRow {
      level: string;
      count: string;
    }

    const cefrResult = await this.pool.query<CEFRRow>(
      `SELECT
         am.level,
         COUNT(DISTINCT uws.meaning_id) as count
       FROM user_word_state uws
       JOIN approved_meanings am ON am.id = uws.meaning_id
       WHERE uws.user_id = $1 ${languageFilter}
       GROUP BY am.level
       ORDER BY
         CASE am.level
           WHEN 'A0' THEN 1
           WHEN 'A1' THEN 2
           WHEN 'A2' THEN 3
           WHEN 'B1' THEN 4
           WHEN 'B2' THEN 5
           WHEN 'C1' THEN 6
           WHEN 'C2' THEN 7
         END`,
      params
    );

    const byCEFR = cefrResult.rows.map((row) => ({
      level: row.level,
      count: parseInt(row.count),
    }));

    // Recently learned words (marked as 'known' in last 30 days)
    interface RecentRow {
      meaning_id: string;
      text: string;
      language: string;
      learned_at: Date;
    }

    const recentResult = await this.pool.query<RecentRow>(
      `SELECT
         uws.meaning_id,
         au.text,
         uws.language,
         uws.marked_known_at as learned_at
       FROM user_word_state uws
       JOIN approved_utterances au ON au.meaning_id = uws.meaning_id AND au.language = uws.language
       WHERE uws.user_id = $1
         AND uws.state = 'known'
         AND uws.marked_known_at >= NOW() - INTERVAL '30 days'
         ${languageFilter}
       ORDER BY uws.marked_known_at DESC
       LIMIT 20`,
      params
    );

    const recentlyLearned = recentResult.rows.map((row) => ({
      meaningId: row.meaning_id,
      text: row.text,
      language: row.language,
      learnedAt: new Date(row.learned_at),
    }));

    return {
      totalWords,
      byState,
      byLanguage,
      byCEFR,
      recentlyLearned,
    };
  }

  /**
   * Get vocabulary learning trends over time
   */
  async getVocabularyTrends(
    userId: string,
    language?: string,
    days: number = 30
  ): Promise<VocabularyTrend[]> {
    const params: (string | number)[] = [userId, days];
    let languageFilter = '';

    if (language) {
      languageFilter = 'AND uws.language = $3';
      params.push(language);
    }

    interface TrendRow {
      date: string;
      learning_count: string;
      known_count: string;
    }

    // Get daily counts of words reaching learning/known state
    const result = await this.pool.query<TrendRow>(
      `WITH date_series AS (
         SELECT generate_series(
           CURRENT_DATE - $2::int,
           CURRENT_DATE,
           '1 day'::interval
         )::date AS date
       ),
       daily_learning AS (
         SELECT
           DATE(marked_learning_at) as date,
           COUNT(*) as count
         FROM user_word_state uws
         WHERE user_id = $1
           AND marked_learning_at IS NOT NULL
           AND marked_learning_at >= CURRENT_DATE - $2::int
           ${languageFilter}
         GROUP BY DATE(marked_learning_at)
       ),
       daily_known AS (
         SELECT
           DATE(marked_known_at) as date,
           COUNT(*) as count
         FROM user_word_state uws
         WHERE user_id = $1
           AND marked_known_at IS NOT NULL
           AND marked_known_at >= CURRENT_DATE - $2::int
           ${languageFilter}
         GROUP BY DATE(marked_known_at)
       )
       SELECT
         ds.date::text,
         COALESCE(SUM(dl.count) OVER (ORDER BY ds.date), 0) as learning_count,
         COALESCE(SUM(dk.count) OVER (ORDER BY ds.date), 0) as known_count
       FROM date_series ds
       LEFT JOIN daily_learning dl ON dl.date = ds.date
       LEFT JOIN daily_known dk ON dk.date = ds.date
       ORDER BY ds.date`,
      params
    );

    return result.rows.map((row) => {
      const learning = parseInt(row.learning_count) || 0;
      const known = parseInt(row.known_count) || 0;
      return {
        date: row.date,
        totalWords: learning + known,
        learning,
        known,
      };
    });
  }

  /**
   * Get detailed word information
   */
  async getWordDetails(userId: string, meaningId: string): Promise<WordDetails | null> {
    interface WordRow {
      meaning_id: string;
      text: string;
      language: string;
      state: WordState;
      level: string;
      total_reviews: string;
      successful_reviews: string;
      last_reviewed_at: Date | null;
      next_review_at: Date | null;
      ease_factor: string | null;
      interval: string | null;
    }

    const result = await this.pool.query<WordRow>(
      `SELECT
         uws.meaning_id,
         au.text,
         uws.language,
         uws.state,
         am.level,
         uws.total_reviews,
         uws.successful_reviews,
         uws.last_reviewed_at,
         usi.next_review_at,
         usi.ease_factor,
         usi.interval
       FROM user_word_state uws
       JOIN approved_utterances au ON au.meaning_id = uws.meaning_id AND au.language = uws.language
       JOIN approved_meanings am ON am.id = uws.meaning_id
       LEFT JOIN user_srs_items usi ON usi.meaning_id = uws.meaning_id AND usi.user_id = uws.user_id
       WHERE uws.user_id = $1 AND uws.meaning_id = $2`,
      [userId, meaningId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      meaningId: row.meaning_id,
      text: row.text,
      language: row.language,
      state: row.state,
      cefrLevel: row.level,
      totalReviews: parseInt(row.total_reviews),
      successfulReviews: parseInt(row.successful_reviews),
      lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at) : null,
      nextReviewAt: row.next_review_at ? new Date(row.next_review_at) : null,
      easeFactor: parseFloat(row.ease_factor || '2.5'),
      interval: parseInt(row.interval || '0'),
    };
  }

  /**
   * Calculate learning velocity (words learned per day/week)
   */
  async getLearningVelocity(userId: string, language?: string): Promise<LearningVelocity> {
    const params: string[] = [userId];
    let languageFilter = '';

    if (language) {
      languageFilter = 'AND language = $2';
      params.push(language);
    }

    interface VelocityRow {
      this_week: string;
      last_week: string;
      total_words: string;
      days_learning: string | null;
    }

    const result = await this.pool.query<VelocityRow>(
      `WITH this_week AS (
         SELECT COUNT(*) as count
         FROM user_word_state
         WHERE user_id = $1
           AND state = 'known'
           AND marked_known_at >= CURRENT_DATE - INTERVAL '7 days'
           ${languageFilter}
       ),
       last_week AS (
         SELECT COUNT(*) as count
         FROM user_word_state
         WHERE user_id = $1
           AND state = 'known'
           AND marked_known_at >= CURRENT_DATE - INTERVAL '14 days'
           AND marked_known_at < CURRENT_DATE - INTERVAL '7 days'
           ${languageFilter}
       ),
       total AS (
         SELECT
           COUNT(*) as total_words,
           MIN(marked_known_at) as first_known
         FROM user_word_state
         WHERE user_id = $1
           AND state = 'known'
           AND marked_known_at IS NOT NULL
           ${languageFilter}
       )
       SELECT
         tw.count as this_week,
         lw.count as last_week,
         t.total_words,
         EXTRACT(EPOCH FROM (NOW() - t.first_known)) / 86400 as days_learning
       FROM this_week tw, last_week lw, total t`,
      params
    );

    if (result.rows.length === 0 || !result.rows[0].days_learning) {
      return {
        wordsPerDay: 0,
        wordsPerWeek: 0,
        wordsThisWeek: 0,
        wordsLastWeek: 0,
        trend: 'stable',
      };
    }

    const row = result.rows[0];
    const daysLearning = parseFloat(row.days_learning || '0');
    const totalWords = parseInt(row.total_words);
    const wordsThisWeek = parseInt(row.this_week);
    const wordsLastWeek = parseInt(row.last_week);

    const wordsPerDay = daysLearning > 0 ? totalWords / daysLearning : 0;
    const wordsPerWeek = wordsPerDay * 7;

    let trend: 'increasing' | 'stable' | 'decreasing';
    if (wordsLastWeek === 0) {
      trend = wordsThisWeek > 0 ? 'increasing' : 'stable';
    } else if (wordsThisWeek > wordsLastWeek * 1.1) {
      trend = 'increasing';
    } else if (wordsThisWeek < wordsLastWeek * 0.9) {
      trend = 'decreasing';
    } else {
      trend = 'stable';
    }

    return {
      wordsPerDay: Math.round(wordsPerDay * 10) / 10,
      wordsPerWeek: Math.round(wordsPerWeek),
      wordsThisWeek,
      wordsLastWeek,
      trend,
    };
  }

  /**
   * Get words by state with pagination
   */
  async getWordsByState(
    userId: string,
    state: WordState,
    language?: string,
    offset: number = 0,
    limit: number = 50
  ): Promise<PaginatedWords> {
    const params: (string | number)[] = [userId, state];
    let languageFilter = '';
    let paramIndex = 3;

    if (language) {
      languageFilter = 'AND uws.language = $3';
      params.push(language);
      paramIndex = 4;
    }

    // Get total count
    interface CountRow {
      total: string;
    }

    const countResult = await this.pool.query<CountRow>(
      `SELECT COUNT(*) as total
       FROM user_word_state uws
       WHERE uws.user_id = $1 AND uws.state = $2 ${languageFilter}`,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    // Get paginated words
    params.push(limit, offset);

    interface WordRow {
      meaning_id: string;
      text: string;
      language: string;
      state: WordState;
      level: string;
      total_reviews: string;
      successful_reviews: string;
      last_reviewed_at: Date | null;
      next_review_at: Date | null;
      ease_factor: string | null;
      interval: string | null;
    }

    const wordsResult = await this.pool.query<WordRow>(
      `SELECT
         uws.meaning_id,
         au.text,
         uws.language,
         uws.state,
         am.level,
         uws.total_reviews,
         uws.successful_reviews,
         uws.last_reviewed_at,
         usi.next_review_at,
         usi.ease_factor,
         usi.interval
       FROM user_word_state uws
       JOIN approved_utterances au ON au.meaning_id = uws.meaning_id AND au.language = uws.language
       JOIN approved_meanings am ON am.id = uws.meaning_id
       LEFT JOIN user_srs_items usi ON usi.meaning_id = uws.meaning_id AND usi.user_id = uws.user_id
       WHERE uws.user_id = $1 AND uws.state = $2 ${languageFilter}
       ORDER BY uws.last_reviewed_at DESC NULLS LAST
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    const words = wordsResult.rows.map((row) => ({
      meaningId: row.meaning_id,
      text: row.text,
      language: row.language,
      state: row.state,
      cefrLevel: row.level,
      totalReviews: parseInt(row.total_reviews),
      successfulReviews: parseInt(row.successful_reviews),
      lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at) : null,
      nextReviewAt: row.next_review_at ? new Date(row.next_review_at) : null,
      easeFactor: parseFloat(row.ease_factor || '2.5'),
      interval: parseInt(row.interval || '0'),
    }));

    return { words, total };
  }
}
