import { Pool } from 'pg';

export interface Utterance {
  utteranceId: string;
  meaningId: string;
  text: string;
  language: string;
  register: string | null;
  usageNotes: string | null;
  audioUrl: string | null;
}

export interface MeaningWithUtterances {
  meaningId: string;
  level: string;
  tags: string[];
  utterances: Utterance[];
}

export class UtteranceService {
  constructor(private readonly pool: Pool) {}

  /**
   * Get example utterances for a specific meaning
   * Returns diverse examples showing different usage contexts
   */
  async getUtterancesForMeaning(meaningId: string, limit: number = 5): Promise<Utterance[]> {
    interface UtteranceRow {
      utterance_id: string;
      meaning_id: string;
      text: string;
      language: string;
      register: string | null;
      usage_notes: string | null;
      audio_url: string | null;
    }

    const result = await this.pool.query<UtteranceRow>(
      `SELECT
        au.id as utterance_id,
        au.meaning_id,
        au.text,
        au.language,
        au.register,
        au.usage_notes,
        au.audio_url
       FROM approved_utterances au
       WHERE au.meaning_id = $1
       ORDER BY
         -- Prefer shorter sentences (easier to comprehend)
         LENGTH(au.text) ASC,
         au.created_at ASC
       LIMIT $2`,
      [meaningId, limit]
    );

    return result.rows.map((row) => ({
      utteranceId: row.utterance_id,
      meaningId: row.meaning_id,
      text: row.text,
      language: row.language,
      register: row.register,
      usageNotes: row.usage_notes,
      audioUrl: row.audio_url,
    }));
  }

  /**
   * Get utterances for multiple meanings at once (batch operation)
   */
  async getUtterancesForMeanings(
    meaningIds: string[],
    limit: number = 5
  ): Promise<Map<string, Utterance[]>> {
    if (meaningIds.length === 0) {
      return new Map();
    }

    interface UtteranceRow {
      utterance_id: string;
      meaning_id: string;
      text: string;
      language: string;
      register: string | null;
      usage_notes: string | null;
      audio_url: string | null;
      row_num: number;
    }

    // Use window function to limit utterances per meaning
    const result = await this.pool.query<UtteranceRow>(
      `WITH ranked_utterances AS (
        SELECT
          au.id as utterance_id,
          au.meaning_id,
          au.text,
          au.language,
          au.register,
          au.usage_notes,
          au.audio_url,
          ROW_NUMBER() OVER (
            PARTITION BY au.meaning_id
            ORDER BY LENGTH(au.text) ASC, au.created_at ASC
          ) as row_num
        FROM approved_utterances au
        WHERE au.meaning_id = ANY($1)
      )
      SELECT * FROM ranked_utterances
      WHERE row_num <= $2
      ORDER BY meaning_id, row_num`,
      [meaningIds, limit]
    );

    const utterancesByMeaning = new Map<string, Utterance[]>();

    for (const row of result.rows) {
      const utterance: Utterance = {
        utteranceId: row.utterance_id,
        meaningId: row.meaning_id,
        text: row.text,
        language: row.language,
        register: row.register,
        usageNotes: row.usage_notes,
        audioUrl: row.audio_url,
      };

      if (!utterancesByMeaning.has(row.meaning_id)) {
        utterancesByMeaning.set(row.meaning_id, []);
      }

      utterancesByMeaning.get(row.meaning_id)!.push(utterance);
    }

    return utterancesByMeaning;
  }

  /**
   * Get meaning with its utterances
   */
  async getMeaningWithUtterances(
    meaningId: string,
    utteranceLimit: number = 5
  ): Promise<MeaningWithUtterances | null> {
    interface MeaningRow {
      meaning_id: string;
      level: string;
      tags: string[];
    }

    // Get meaning data
    const meaningResult = await this.pool.query<MeaningRow>(
      `SELECT
        id as meaning_id,
        level,
        tags
       FROM approved_meanings
       WHERE id = $1`,
      [meaningId]
    );

    if (meaningResult.rows.length === 0) {
      return null;
    }

    const meaning = meaningResult.rows[0];

    // Get utterances
    const utterances = await this.getUtterancesForMeaning(meaningId, utteranceLimit);

    return {
      meaningId: meaning.meaning_id,
      level: meaning.level,
      tags: meaning.tags,
      utterances,
    };
  }

  /**
   * Get a random utterance for a meaning (useful for quick examples)
   */
  async getRandomUtterance(meaningId: string): Promise<Utterance | null> {
    interface UtteranceRow {
      utterance_id: string;
      meaning_id: string;
      text: string;
      language: string;
      register: string | null;
      usage_notes: string | null;
      audio_url: string | null;
    }

    const result = await this.pool.query<UtteranceRow>(
      `SELECT
        au.id as utterance_id,
        au.meaning_id,
        au.text,
        au.language,
        au.register,
        au.usage_notes,
        au.audio_url
       FROM approved_utterances au
       WHERE au.meaning_id = $1
       ORDER BY RANDOM()
       LIMIT 1`,
      [meaningId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      utteranceId: row.utterance_id,
      meaningId: row.meaning_id,
      text: row.text,
      language: row.language,
      register: row.register,
      usageNotes: row.usage_notes,
      audioUrl: row.audio_url,
    };
  }

  /**
   * Get utterances filtered by language
   */
  async getUtterancesByLanguage(
    meaningId: string,
    language: string,
    limit: number = 5
  ): Promise<Utterance[]> {
    interface UtteranceRow {
      utterance_id: string;
      meaning_id: string;
      text: string;
      language: string;
      register: string | null;
      usage_notes: string | null;
      audio_url: string | null;
    }

    const result = await this.pool.query<UtteranceRow>(
      `SELECT
        au.id as utterance_id,
        au.meaning_id,
        au.text,
        au.language,
        au.register,
        au.usage_notes,
        au.audio_url
       FROM approved_utterances au
       WHERE au.meaning_id = $1
         AND au.language = $2
       ORDER BY
         LENGTH(au.text) ASC,
         au.created_at ASC
       LIMIT $3`,
      [meaningId, language, limit]
    );

    return result.rows.map((row) => ({
      utteranceId: row.utterance_id,
      meaningId: row.meaning_id,
      text: row.text,
      language: row.language,
      register: row.register,
      usageNotes: row.usage_notes,
      audioUrl: row.audio_url,
    }));
  }

  /**
   * Check if a meaning has utterances available
   */
  async hasUtterances(meaningId: string): Promise<boolean> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM approved_utterances
       WHERE meaning_id = $1`,
      [meaningId]
    );

    return parseInt(result.rows[0].count, 10) > 0;
  }

  /**
   * Get utterance count for a meaning
   */
  async getUtteranceCount(meaningId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM approved_utterances
       WHERE meaning_id = $1`,
      [meaningId]
    );

    return parseInt(result.rows[0].count, 10);
  }
}
