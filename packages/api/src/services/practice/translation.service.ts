import { Pool } from 'pg';

/**
 * A single translation exercise
 */
export interface TranslationExercise {
  exerciseId: string;
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
  acceptableTranslations: string[];
  hint: {
    firstWord: string;
    wordCount: number;
  };
  cefrLevel: string;
  meaningId: string;
}

/**
 * Result of validating a translation
 */
export interface TranslationResult {
  isCorrect: boolean;
  similarity: number;
  matchedTranslation: string | null;
  alternativeTranslations: string[];
  feedback: string;
  qualityRating: number;
}

/**
 * TranslationService handles translation exercises between studied languages.
 * Uses approved_meanings with utterances in different languages.
 */
export class TranslationService {
  private readonly MIN_EASE_FACTOR = 1.3;

  constructor(private readonly pool: Pool) {}

  /**
   * Get translation exercises for specified language pair.
   * Finds meanings that have utterances in both source and target languages.
   */
  async getTranslationExercises(
    userId: string,
    sourceLanguage: string,
    targetLanguage: string,
    limit: number = 10
  ): Promise<TranslationExercise[]> {
    if (sourceLanguage === targetLanguage) {
      throw new Error('Source and target languages must be different');
    }

    interface TranslationRow {
      meaning_id: string;
      source_text: string;
      level: string;
      target_texts: string[];
    }

    // Find meanings with utterances in both languages from user's SRS queue
    const result = await this.pool.query<TranslationRow>(
      `SELECT DISTINCT ON (usi.meaning_id)
         usi.meaning_id,
         source_utt.text AS source_text,
         am.level,
         ARRAY(
           SELECT au.text
           FROM approved_utterances au
           WHERE au.meaning_id = usi.meaning_id
             AND au.language = $3
             AND au.text IS NOT NULL
         ) AS target_texts
       FROM user_srs_items usi
       JOIN approved_meanings am ON usi.meaning_id = am.id
       JOIN approved_utterances source_utt ON source_utt.meaning_id = am.id
         AND source_utt.language = $2
       WHERE usi.user_id = $1
         AND usi.language = $2
         AND usi.next_review_at <= current_timestamp
         AND source_utt.text IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM approved_utterances au2
           WHERE au2.meaning_id = am.id
             AND au2.language = $3
             AND au2.text IS NOT NULL
         )
       ORDER BY usi.meaning_id, usi.next_review_at ASC
       LIMIT $4`,
      [userId, sourceLanguage, targetLanguage, limit]
    );

    return result.rows
      .filter((row) => row.target_texts && row.target_texts.length > 0)
      .map((row) => ({
        exerciseId: `translation_${row.meaning_id}_${Date.now()}`,
        sourceText: row.source_text,
        sourceLanguage,
        targetLanguage,
        acceptableTranslations: row.target_texts,
        hint: {
          firstWord: row.target_texts[0]?.split(' ')[0] || '',
          wordCount: row.target_texts[0]?.split(' ').length || 0,
        },
        cefrLevel: row.level,
        meaningId: row.meaning_id,
      }));
  }

  /**
   * Validate user's translation against acceptable answers
   */
  async validateTranslation(
    userId: string,
    meaningId: string,
    userTranslation: string,
    acceptableTranslations: string[],
    timeSpentMs: number
  ): Promise<TranslationResult> {
    const normalizedUser = this.normalizeText(userTranslation);

    let bestMatch: { translation: string; similarity: number } | null = null;

    // Compare against all acceptable translations
    for (const acceptable of acceptableTranslations) {
      const normalizedAcceptable = this.normalizeText(acceptable);
      const similarity = this.calculateSimilarity(normalizedUser, normalizedAcceptable);

      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { translation: acceptable, similarity };
      }

      // Early exit on exact match
      if (similarity >= 0.99) break;
    }

    const similarity = bestMatch?.similarity || 0;
    const isCorrect = similarity >= 0.85;

    // Calculate quality rating for SRS
    const qualityRating = this.similarityToQuality(similarity);

    // Update SRS
    await this.updateSRS(userId, meaningId, qualityRating);

    // Record attempt
    await this.recordAttempt(
      userId,
      meaningId,
      userTranslation,
      isCorrect,
      similarity,
      timeSpentMs
    );

    // Generate feedback
    const feedback = this.generateFeedback(similarity);

    return {
      isCorrect,
      similarity,
      matchedTranslation: bestMatch?.translation || null,
      alternativeTranslations: acceptableTranslations,
      feedback,
      qualityRating,
    };
  }

  /**
   * Get translation practice statistics
   */
  async getStats(userId: string, sourceLanguage: string, targetLanguage: string) {
    interface StatsRow {
      total_exercises: string;
      correct_count: string;
      avg_similarity: string | null;
    }

    const result = await this.pool.query<StatsRow>(
      `SELECT
        COUNT(*) as total_exercises,
        COUNT(*) FILTER (WHERE correct = true) as correct_count,
        AVG((user_answer::jsonb->>'similarity')::decimal) as avg_similarity
       FROM user_exercise_results
       WHERE user_id = $1
         AND exercise_type = 'translation'
         AND (user_answer::jsonb->>'sourceLanguage') = $2
         AND (user_answer::jsonb->>'targetLanguage') = $3
         AND submitted_at > current_timestamp - interval '7 days'`,
      [userId, sourceLanguage, targetLanguage]
    );

    const row = result.rows[0];
    const total = parseInt(row.total_exercises, 10);
    const correct = parseInt(row.correct_count, 10);

    return {
      totalExercises: total,
      correctCount: correct,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
      avgSimilarity: row.avg_similarity ? Math.round(parseFloat(row.avg_similarity) * 100) : null,
    };
  }

  /**
   * Generate hint at specified level
   */
  generateHint(acceptableTranslations: string[], hintLevel: number): string {
    const primaryTranslation = acceptableTranslations[0] || '';

    if (!primaryTranslation) {
      return 'No hint available';
    }

    const words = primaryTranslation.split(' ');

    switch (hintLevel) {
      case 1:
        return `First word: "${words[0]}"`;
      case 2:
        return `Word count: ${words.length} words`;
      case 3: {
        const halfLength = Math.ceil(words.length / 2);
        const partial = words.slice(0, halfLength).join(' ');
        return `Beginning: "${partial}..."`;
      }
      default:
        return 'No hint available';
    }
  }

  /**
   * Normalize text for comparison
   */
  private normalizeText(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.!?,;:]+/g, '')
      .replace(/["'«»""'']/g, '');
  }

  /**
   * Calculate similarity using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;

    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);

    if (maxLength === 0) return 1.0;

    return Math.max(0, 1 - distance / maxLength);
  }

  /**
   * Levenshtein distance algorithm
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Convert similarity to SRS quality rating
   */
  private similarityToQuality(similarity: number): number {
    if (similarity >= 0.95) return 5;
    if (similarity >= 0.85) return 4;
    if (similarity >= 0.7) return 3;
    if (similarity >= 0.5) return 2;
    return 0;
  }

  /**
   * Generate feedback based on similarity
   */
  private generateFeedback(similarity: number): string {
    if (similarity >= 0.95) return 'Perfect translation!';
    if (similarity >= 0.85) return 'Correct! Minor phrasing differences.';
    if (similarity >= 0.7) return 'Close, but not quite accurate.';
    if (similarity >= 0.5) return 'Partially correct, but significant errors.';
    return 'Incorrect translation.';
  }

  /**
   * Update SRS scheduling
   */
  private async updateSRS(userId: string, meaningId: string, quality: number): Promise<void> {
    interface SRSRow {
      ease_factor: number;
      repetitions: number;
      interval: number;
    }

    const srsResult = await this.pool.query<SRSRow>(
      `SELECT ease_factor, repetitions, interval
       FROM user_srs_items
       WHERE user_id = $1 AND meaning_id = $2`,
      [userId, meaningId]
    );

    if (srsResult.rows.length === 0) {
      return;
    }

    const current = srsResult.rows[0];

    let newEaseFactor = current.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

    if (newEaseFactor < this.MIN_EASE_FACTOR) {
      newEaseFactor = this.MIN_EASE_FACTOR;
    }

    let newRepetitions: number;
    let newInterval: number;

    if (quality < 3) {
      newRepetitions = 0;
      newInterval = 1;
    } else {
      newRepetitions = current.repetitions + 1;

      if (newRepetitions === 1) {
        newInterval = 1;
      } else if (newRepetitions === 2) {
        newInterval = 6;
      } else {
        newInterval = Math.round(current.interval * newEaseFactor);
      }
    }

    const nextReviewAt = new Date();
    nextReviewAt.setDate(nextReviewAt.getDate() + newInterval);

    await this.pool.query(
      `UPDATE user_srs_items
       SET ease_factor = $1,
           repetitions = $2,
           interval = $3,
           next_review_at = $4,
           last_reviewed_at = current_timestamp
       WHERE user_id = $5 AND meaning_id = $6`,
      [newEaseFactor, newRepetitions, newInterval, nextReviewAt, userId, meaningId]
    );
  }

  /**
   * Record practice attempt
   */
  private async recordAttempt(
    userId: string,
    meaningId: string,
    userTranslation: string,
    isCorrect: boolean,
    similarity: number,
    timeSpentMs: number
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_exercise_results
       (user_id, exercise_id, language, exercise_type, correct, time_spent_ms, user_answer, submitted_at)
       VALUES ($1, $2::uuid, 'XX', 'translation', $3, $4, $5, NOW())
       ON CONFLICT DO NOTHING`,
      [
        userId,
        '00000000-0000-0000-0000-000000000000',
        isCorrect,
        timeSpentMs,
        JSON.stringify({ translation: userTranslation, similarity, meaningId }),
      ]
    );
  }
}
