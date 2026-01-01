import { Pool } from 'pg';

class NotFoundError extends Error {
  statusCode: number;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

export type WordState = 'unknown' | 'learning' | 'known';

export interface WordStateInfo {
  meaningId: string;
  userId: string;
  state: WordState;
  successfulReviews: number;
  totalReviews: number;
  firstSeenAt: string | null;
  markedLearningAt: string | null;
  markedKnownAt: string | null;
  lastReviewedAt: string | null;
}

const KNOWN_THRESHOLD = 5; // Number of successful reviews to mark as "known"

export class WordStateService {
  constructor(private readonly pool: Pool) {}

  /**
   * Get word state for a user
   * Creates "unknown" entry if word not yet encountered
   */
  async getWordState(userId: string, meaningId: string): Promise<WordStateInfo> {
    // Try to get existing state
    const result = await this.pool.query<Record<string, unknown>>(
      `SELECT
        meaning_id,
        user_id,
        state,
        successful_reviews,
        total_reviews,
        first_seen_at,
        marked_learning_at,
        marked_known_at,
        last_reviewed_at
       FROM user_word_state
       WHERE user_id = $1 AND meaning_id = $2`,
      [userId, meaningId]
    );

    if (result.rows.length > 0) {
      return this.mapRowToWordState(result.rows[0]);
    }

    // Get meaning language for new entry
    const meaningResult = await this.pool.query<Record<string, unknown>>(
      `SELECT am.level
       FROM approved_meanings am
       WHERE am.id = $1`,
      [meaningId]
    );

    if (meaningResult.rows.length === 0) {
      throw new NotFoundError('Meaning not found');
    }

    // Extract language from meaning_id (format: language-word)
    const language = meaningId.split('-')[0].toUpperCase();

    // Create initial "unknown" state
    const insertResult = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO user_word_state
       (user_id, meaning_id, language, state, successful_reviews, total_reviews)
       VALUES ($1, $2, $3, 'unknown', 0, 0)
       RETURNING *`,
      [userId, meaningId, language]
    );

    return this.mapRowToWordState(insertResult.rows[0]);
  }

  /**
   * Mark word as encountered (unknown → learning)
   */
  async markAsEncountered(userId: string, meaningId: string): Promise<WordStateInfo> {
    const currentState = await this.getWordState(userId, meaningId);

    if (currentState.state !== 'unknown') {
      return currentState; // Already learning or known
    }

    const result = await this.pool.query<Record<string, unknown>>(
      `UPDATE user_word_state
       SET state = 'learning',
           first_seen_at = current_timestamp,
           marked_learning_at = current_timestamp
       WHERE user_id = $1 AND meaning_id = $2
       RETURNING *`,
      [userId, meaningId]
    );

    return this.mapRowToWordState(result.rows[0]);
  }

  /**
   * Record a review result and update state if necessary
   */
  async recordReview(
    userId: string,
    meaningId: string,
    wasSuccessful: boolean
  ): Promise<WordStateInfo> {
    // Mark as encountered if first time
    await this.markAsEncountered(userId, meaningId);

    // Get current state
    const currentState = await this.getWordState(userId, meaningId);

    const newSuccessfulReviews = wasSuccessful
      ? currentState.successfulReviews + 1
      : currentState.successfulReviews;
    const newTotalReviews = currentState.totalReviews + 1;

    // Determine new state
    let newState: WordState = currentState.state;
    const markedKnownAt =
      currentState.state === 'learning' && newSuccessfulReviews >= KNOWN_THRESHOLD
        ? 'current_timestamp'
        : currentState.markedKnownAt
          ? `'${currentState.markedKnownAt}'`
          : 'NULL';

    if (currentState.state === 'learning' && newSuccessfulReviews >= KNOWN_THRESHOLD) {
      newState = 'known';
    }

    // Update state
    const result = await this.pool.query<Record<string, unknown>>(
      `UPDATE user_word_state
       SET successful_reviews = $1,
           total_reviews = $2,
           last_reviewed_at = current_timestamp,
           state = $3,
           marked_known_at = ${markedKnownAt}
       WHERE user_id = $4 AND meaning_id = $5
       RETURNING *`,
      [newSuccessfulReviews, newTotalReviews, newState, userId, meaningId]
    );

    return this.mapRowToWordState(result.rows[0]);
  }

  /**
   * Manually reset word to learning state (if user forgot)
   */
  async resetToLearning(userId: string, meaningId: string): Promise<WordStateInfo> {
    const result = await this.pool.query<Record<string, unknown>>(
      `UPDATE user_word_state
       SET state = 'learning',
           marked_known_at = NULL,
           successful_reviews = 0
       WHERE user_id = $1 AND meaning_id = $2
       RETURNING *`,
      [userId, meaningId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Word state not found');
    }

    return this.mapRowToWordState(result.rows[0]);
  }

  /**
   * Get word state statistics for a user and language
   */
  async getStateStats(userId: string, language: string) {
    interface StatsRow {
      unknown_count: string;
      learning_count: string;
      known_count: string;
      total_words: string;
    }

    const result = await this.pool.query<StatsRow>(
      `SELECT
        COUNT(*) FILTER (WHERE state = 'unknown') as unknown_count,
        COUNT(*) FILTER (WHERE state = 'learning') as learning_count,
        COUNT(*) FILTER (WHERE state = 'known') as known_count,
        COUNT(*) as total_words
       FROM user_word_state
       WHERE user_id = $1 AND language = $2`,
      [userId, language]
    );

    const row = result.rows[0];

    return {
      unknownCount: parseInt(row.unknown_count, 10),
      learningCount: parseInt(row.learning_count, 10),
      knownCount: parseInt(row.known_count, 10),
      totalWords: parseInt(row.total_words, 10),
    };
  }

  /**
   * Get all words in a specific state for a user
   */
  async getWordsByState(
    userId: string,
    language: string,
    state: WordState,
    limit: number = 50,
    offset: number = 0
  ): Promise<
    Array<{
      meaning_id: string;
      state: string;
      successful_reviews: number;
      total_reviews: number;
      last_reviewed_at: Date | null;
      cefr_level: string;
    }>
  > {
    interface WordRow {
      meaning_id: string;
      state: string;
      successful_reviews: number;
      total_reviews: number;
      last_reviewed_at: Date | null;
      cefr_level: string;
    }

    const result = await this.pool.query<WordRow>(
      `SELECT
        uws.meaning_id,
        uws.state,
        uws.successful_reviews,
        uws.total_reviews,
        uws.last_reviewed_at,
        am.level as cefr_level
       FROM user_word_state uws
       JOIN approved_meanings am ON uws.meaning_id = am.id
       WHERE uws.user_id = $1
         AND uws.language = $2
         AND uws.state = $3
       ORDER BY uws.last_reviewed_at DESC NULLS LAST
       LIMIT $4 OFFSET $5`,
      [userId, language, state, limit, offset]
    );

    return result.rows;
  }

  /**
   * Bulk initialize word states for new vocabulary
   */
  async bulkInitializeWords(
    userId: string,
    meaningIds: string[],
    language: string
  ): Promise<number> {
    if (meaningIds.length === 0) {
      return 0;
    }

    const values = meaningIds
      .map((_, idx) => {
        const baseIdx = idx * 3;
        return `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, 'unknown', 0, 0)`;
      })
      .join(', ');

    const params: string[] = [];
    meaningIds.forEach((meaningId) => {
      params.push(userId, meaningId, language);
    });

    const result = await this.pool.query(
      `INSERT INTO user_word_state
       (user_id, meaning_id, language, state, successful_reviews, total_reviews)
       VALUES ${values}
       ON CONFLICT (user_id, meaning_id) DO NOTHING
       RETURNING id`,
      params
    );

    return result.rowCount || 0;
  }

  private mapRowToWordState(row: Record<string, unknown>): WordStateInfo {
    return {
      meaningId: row.meaning_id as string,
      userId: row.user_id as string,
      state: row.state as WordState,
      successfulReviews: row.successful_reviews as number,
      totalReviews: row.total_reviews as number,
      firstSeenAt: (row.first_seen_at as Date | null)?.toISOString() ?? null,
      markedLearningAt: (row.marked_learning_at as Date | null)?.toISOString() ?? null,
      markedKnownAt: (row.marked_known_at as Date | null)?.toISOString() ?? null,
      lastReviewedAt: (row.last_reviewed_at as Date | null)?.toISOString() ?? null,
    };
  }
}
