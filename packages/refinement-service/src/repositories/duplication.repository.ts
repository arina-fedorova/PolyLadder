import { Pool } from 'pg';
import { DuplicationRepository } from '@polyladder/quality-gates';

export function createDuplicationRepository(pool: Pool): DuplicationRepository {
  return {
    async findExactMatch(
      text: string,
      language: string,
      contentType: string
    ): Promise<string | null> {
      // For rules, check by title+language+level (not text)
      if (contentType === 'rule') {
        const result = await pool.query<{ id: string }>(
          `SELECT id FROM approved_rules
           WHERE title = $1 AND language = $2
           LIMIT 1`,
          [text, language]
        );
        return result.rows[0]?.id ?? null;
      }

      // For other content types, check by text
      const tableMap: Record<string, string> = {
        meaning: 'approved_meanings',
        utterance: 'approved_utterances',
        exercise: 'approved_exercises',
      };

      const tableName = tableMap[contentType];
      if (!tableName) {
        return null;
      }

      if (contentType === 'utterance') {
        const result = await pool.query<{ id: string }>(
          `SELECT id FROM ${tableName}
           WHERE text = $1 AND language = $2
           LIMIT 1`,
          [text, language]
        );
        return result.rows[0]?.id ?? null;
      }

      return null;
    },

    async findSimilar(
      text: string,
      language: string,
      contentType: string,
      threshold: number
    ): Promise<Array<{ id: string; text: string; similarity: number }>> {
      // For rules, check similar titles using trigram similarity
      if (contentType === 'rule') {
        const result = await pool.query<{ id: string; title: string; similarity: number }>(
          `SELECT id, title, similarity(title, $1) as similarity
           FROM approved_rules
           WHERE language = $2
           AND similarity(title, $1) >= $3
           ORDER BY similarity DESC
           LIMIT 5`,
          [text, language, threshold]
        );

        return result.rows.map((row) => ({
          id: row.id,
          text: row.title,
          similarity: row.similarity,
        }));
      }

      // For utterances, check similar text
      if (contentType === 'utterance') {
        const result = await pool.query<{ id: string; text: string; similarity: number }>(
          `SELECT id, text, similarity(text, $1) as similarity
           FROM approved_utterances
           WHERE language = $2
           AND similarity(text, $1) >= $3
           ORDER BY similarity DESC
           LIMIT 5`,
          [text, language, threshold]
        );

        return result.rows;
      }

      return [];
    },
  };
}
