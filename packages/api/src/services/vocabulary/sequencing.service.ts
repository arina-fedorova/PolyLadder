import { Pool } from 'pg';

class NotFoundError extends Error {
  statusCode: number;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

export interface VocabularyItem {
  meaningId: string;
  level: string;
  tags: string[];
  utteranceCount: number;
}

export interface IntroductionSession {
  meaningIds: string[];
  level: string;
  totalCount: number;
}

const LEVEL_ORDER = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const DEFAULT_BATCH_SIZE = 10;

export class VocabularySequencingService {
  constructor(private readonly pool: Pool) {}

  /**
   * Get next batch of vocabulary for introduction
   * Returns words that haven't been introduced yet, prioritizing by CEFR level
   */
  async getNextVocabularyBatch(
    userId: string,
    language: string,
    maxLevel: string = 'C2',
    batchSize: number = DEFAULT_BATCH_SIZE
  ): Promise<VocabularyItem[]> {
    // Validate CEFR level
    if (!LEVEL_ORDER.includes(maxLevel)) {
      throw new Error(`Invalid CEFR level: ${maxLevel}`);
    }

    const maxLevelIndex = LEVEL_ORDER.indexOf(maxLevel);
    const allowedLevels = LEVEL_ORDER.slice(0, maxLevelIndex + 1);

    interface VocabRow {
      meaning_id: string;
      level: string;
      tags: string[];
      utterance_count: string;
    }

    // Get vocabulary that hasn't been introduced yet (not in user_word_state)
    // or is in 'unknown' state with no first_seen_at
    const languagePrefix = language.toLowerCase();
    const result = await this.pool.query<VocabRow>(
      `SELECT
        am.id as meaning_id,
        am.level,
        am.tags,
        COUNT(au.id) as utterance_count
       FROM approved_meanings am
       LEFT JOIN approved_utterances au ON au.meaning_id = am.id AND au.language = $2
       LEFT JOIN user_word_state uws ON uws.meaning_id = am.id AND uws.user_id = $1
       WHERE am.id LIKE $5 || '-%'
         AND am.level = ANY($3)
         AND (uws.meaning_id IS NULL OR (uws.state = 'unknown' AND uws.first_seen_at IS NULL))
       GROUP BY am.id, am.level, am.tags
       HAVING COUNT(au.id) > 0
       ORDER BY
         CASE am.level
           WHEN 'A0' THEN 0
           WHEN 'A1' THEN 1
           WHEN 'A2' THEN 2
           WHEN 'B1' THEN 3
           WHEN 'B2' THEN 4
           WHEN 'C1' THEN 5
           WHEN 'C2' THEN 6
         END,
         am.created_at ASC
       LIMIT $4`,
      [userId, language, allowedLevels, batchSize, languagePrefix]
    );

    return result.rows.map((row) => ({
      meaningId: row.meaning_id,
      level: row.level,
      tags: row.tags,
      utteranceCount: parseInt(row.utterance_count, 10),
    }));
  }

  /**
   * Mark vocabulary as introduced (creates or updates word state with first_seen_at)
   */
  async markVocabularyIntroduced(
    userId: string,
    meaningIds: string[]
  ): Promise<{ markedCount: number }> {
    if (meaningIds.length === 0) {
      return { markedCount: 0 };
    }

    // For each meaning, get the language from the meaning_id prefix
    const meaningLanguages = new Map<string, string>();
    for (const meaningId of meaningIds) {
      const language = meaningId.split('-')[0].toUpperCase();
      meaningLanguages.set(meaningId, language);
    }

    // Insert or update user_word_state for each meaning
    const values = meaningIds
      .map((meaningId, idx) => {
        const baseIdx = idx * 3;
        return `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, 'unknown', 0, 0, current_timestamp)`;
      })
      .join(', ');

    const params: string[] = [];
    meaningIds.forEach((meaningId) => {
      const language = meaningLanguages.get(meaningId)!;
      params.push(userId, meaningId, language);
    });

    const result = await this.pool.query(
      `INSERT INTO user_word_state
       (user_id, meaning_id, language, state, successful_reviews, total_reviews, first_seen_at)
       VALUES ${values}
       ON CONFLICT (user_id, meaning_id)
       DO UPDATE SET first_seen_at = COALESCE(user_word_state.first_seen_at, current_timestamp)
       RETURNING id`,
      params
    );

    return { markedCount: result.rowCount || 0 };
  }

  /**
   * Get introduction session statistics for a user
   */
  async getIntroductionStats(
    userId: string,
    language: string
  ): Promise<{
    totalAvailable: number;
    byLevel: Record<string, number>;
  }> {
    interface StatsRow {
      level: string;
      count: string;
    }

    const languagePrefix = language.toLowerCase();
    const result = await this.pool.query<StatsRow>(
      `SELECT
        am.level,
        COUNT(*) as count
       FROM approved_meanings am
       LEFT JOIN approved_utterances au ON au.meaning_id = am.id AND au.language = $2
       LEFT JOIN user_word_state uws ON uws.meaning_id = am.id AND uws.user_id = $1
       WHERE am.id LIKE $3 || '-%'
         AND (uws.meaning_id IS NULL OR (uws.state = 'unknown' AND uws.first_seen_at IS NULL))
       GROUP BY am.level
       HAVING COUNT(au.id) > 0`,
      [userId, language, languagePrefix]
    );

    const byLevel: Record<string, number> = {};
    let totalAvailable = 0;

    for (const row of result.rows) {
      const count = parseInt(row.count, 10);
      byLevel[row.level] = count;
      totalAvailable += count;
    }

    return {
      totalAvailable,
      byLevel,
    };
  }

  /**
   * Get vocabulary items by IDs (for detailed display)
   */
  async getVocabularyByIds(meaningIds: string[]): Promise<VocabularyItem[]> {
    if (meaningIds.length === 0) {
      return [];
    }

    interface VocabRow {
      meaning_id: string;
      level: string;
      tags: string[];
      utterance_count: string;
    }

    const result = await this.pool.query<VocabRow>(
      `SELECT
        am.id as meaning_id,
        am.level,
        am.tags,
        COUNT(au.id) as utterance_count
       FROM approved_meanings am
       LEFT JOIN approved_utterances au ON au.meaning_id = am.id
       WHERE am.id = ANY($1)
       GROUP BY am.id, am.level, am.tags
       ORDER BY am.level, am.created_at`,
      [meaningIds]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('No vocabulary found for given IDs');
    }

    return result.rows.map((row) => ({
      meaningId: row.meaning_id,
      level: row.level,
      tags: row.tags,
      utteranceCount: parseInt(row.utterance_count, 10),
    }));
  }
}
