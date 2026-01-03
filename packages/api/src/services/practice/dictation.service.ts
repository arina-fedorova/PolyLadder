import { Pool } from 'pg';

/**
 * A single dictation exercise
 */
export interface DictationExercise {
  exerciseId: string;
  audioUrl: string;
  correctTranscript: string;
  meaningId: string;
  cefrLevel: string;
  wordCount: number;
}

/**
 * Word-level diff types
 */
export type DiffType = 'correct' | 'substitution' | 'insertion' | 'deletion';

/**
 * Word-level difference for highlighting
 */
export interface WordDiff {
  type: DiffType;
  expected?: string;
  actual?: string;
  position: number;
}

/**
 * Result of validating a dictation
 */
export interface DictationResult {
  isCorrect: boolean;
  characterAccuracy: number;
  wordAccuracy: number;
  diff: WordDiff[];
  correctTranscript: string;
  qualityRating: number;
}

/**
 * DictationService handles audio transcription exercises
 * with fuzzy matching and word-level diff generation.
 */
export class DictationService {
  private readonly MIN_EASE_FACTOR = 1.3;

  constructor(private readonly pool: Pool) {}

  /**
   * Get dictation exercises from SRS items that have audio
   */
  async getDictationExercises(
    userId: string,
    language: string,
    limit: number = 10
  ): Promise<DictationExercise[]> {
    interface DictationRow {
      meaning_id: string;
      text: string;
      audio_url: string;
      level: string;
    }

    const result = await this.pool.query<DictationRow>(
      `SELECT DISTINCT ON (usi.meaning_id)
         usi.meaning_id,
         au.text,
         au.audio_url,
         am.level
       FROM user_srs_items usi
       JOIN approved_meanings am ON usi.meaning_id = am.id
       JOIN approved_utterances au ON au.meaning_id = am.id AND au.language = $2
       WHERE usi.user_id = $1
         AND usi.language = $2
         AND usi.next_review_at <= current_timestamp
         AND au.audio_url IS NOT NULL
         AND au.text IS NOT NULL
         AND LENGTH(au.text) >= 3
       ORDER BY usi.meaning_id, usi.next_review_at ASC
       LIMIT $3`,
      [userId, language, limit]
    );

    return result.rows.map((row) => ({
      exerciseId: `dictation_${row.meaning_id}_${Date.now()}`,
      audioUrl: row.audio_url,
      correctTranscript: row.text,
      meaningId: row.meaning_id,
      cefrLevel: row.level,
      wordCount: this.countWords(row.text),
    }));
  }

  /**
   * Validate user's dictation against correct transcript
   */
  async validateDictation(
    userId: string,
    meaningId: string,
    userTranscript: string,
    correctTranscript: string,
    timeSpentMs: number
  ): Promise<DictationResult> {
    const normalizedUser = this.normalizeText(userTranscript);
    const normalizedCorrect = this.normalizeText(correctTranscript);

    // Calculate character-level accuracy
    const characterAccuracy = this.calculateCharacterAccuracy(normalizedUser, normalizedCorrect);

    // Calculate word-level accuracy with diff
    const { wordAccuracy, diff } = this.calculateWordDiff(normalizedUser, normalizedCorrect);

    // Determine SRS quality rating
    const qualityRating = this.accuracyToQuality(characterAccuracy);

    // Update SRS
    await this.updateSRS(userId, meaningId, qualityRating);

    // Record attempt
    await this.recordAttempt(
      userId,
      meaningId,
      userTranscript,
      characterAccuracy >= 0.9,
      characterAccuracy,
      timeSpentMs
    );

    return {
      isCorrect: characterAccuracy >= 0.9,
      characterAccuracy,
      wordAccuracy,
      diff,
      correctTranscript,
      qualityRating,
    };
  }

  /**
   * Get dictation practice statistics
   */
  async getStats(userId: string, language: string) {
    interface StatsRow {
      total_exercises: string;
      correct_count: string;
      avg_accuracy: string | null;
    }

    const result = await this.pool.query<StatsRow>(
      `SELECT
        COUNT(*) as total_exercises,
        COUNT(*) FILTER (WHERE correct = true) as correct_count,
        AVG((user_answer::jsonb->>'accuracy')::decimal) as avg_accuracy
       FROM user_exercise_results
       WHERE user_id = $1
         AND language = $2
         AND exercise_type = 'dictation'
         AND submitted_at > current_timestamp - interval '7 days'`,
      [userId, language]
    );

    const row = result.rows[0];
    const total = parseInt(row.total_exercises, 10);
    const correct = parseInt(row.correct_count, 10);

    return {
      totalExercises: total,
      correctCount: correct,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
      avgCharacterAccuracy: row.avg_accuracy
        ? Math.round(parseFloat(row.avg_accuracy) * 100)
        : null,
    };
  }

  /**
   * Normalize text for comparison
   */
  private normalizeText(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"')
      .replace(/([.!?,;:]+)\s*/g, '$1 ')
      .trim();
  }

  /**
   * Calculate character-level accuracy using Levenshtein distance
   */
  private calculateCharacterAccuracy(user: string, correct: string): number {
    const distance = this.levenshteinDistance(user, correct);
    const maxLength = Math.max(user.length, correct.length);

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
   * Calculate word-level accuracy and generate diff
   */
  private calculateWordDiff(
    user: string,
    correct: string
  ): { wordAccuracy: number; diff: WordDiff[] } {
    const userWords = user.split(' ').filter((w) => w.length > 0);
    const correctWords = correct.split(' ').filter((w) => w.length > 0);

    const m = userWords.length;
    const n = correctWords.length;

    // DP matrix for edit distance
    const dp: number[][] = [];
    for (let i = 0; i <= m; i++) {
      dp[i] = new Array<number>(n + 1).fill(0);
    }

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (userWords[i - 1] === correctWords[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const editDistance = dp[m][n];
    const maxWords = Math.max(m, n);
    const wordAccuracy = maxWords === 0 ? 1.0 : Math.max(0, 1 - editDistance / maxWords);

    // Backtrack to generate diff
    const diff: WordDiff[] = [];
    let i = m,
      j = n;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && userWords[i - 1] === correctWords[j - 1]) {
        diff.unshift({
          type: 'correct',
          expected: correctWords[j - 1],
          actual: userWords[i - 1],
          position: j - 1,
        });
        i--;
        j--;
      } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
        diff.unshift({
          type: 'substitution',
          expected: correctWords[j - 1],
          actual: userWords[i - 1],
          position: j - 1,
        });
        i--;
        j--;
      } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
        diff.unshift({
          type: 'insertion',
          actual: userWords[i - 1],
          position: j,
        });
        i--;
      } else if (j > 0) {
        diff.unshift({
          type: 'deletion',
          expected: correctWords[j - 1],
          position: j - 1,
        });
        j--;
      }
    }

    return { wordAccuracy, diff };
  }

  /**
   * Convert accuracy to SRS quality rating
   */
  private accuracyToQuality(accuracy: number): number {
    if (accuracy >= 0.95) return 5;
    if (accuracy >= 0.85) return 4;
    if (accuracy >= 0.7) return 3;
    if (accuracy >= 0.5) return 2;
    return 0;
  }

  /**
   * Update SRS scheduling based on quality
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

    // SM-2 algorithm
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
    userTranscript: string,
    isCorrect: boolean,
    accuracy: number,
    timeSpentMs: number
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_exercise_results
       (user_id, exercise_id, language, exercise_type, correct, time_spent_ms, user_answer, submitted_at)
       VALUES ($1, $2::uuid, 'XX', 'dictation', $3, $4, $5, NOW())
       ON CONFLICT DO NOTHING`,
      [
        userId,
        '00000000-0000-0000-0000-000000000000',
        isCorrect,
        timeSpentMs,
        JSON.stringify({ transcript: userTranscript, accuracy, meaningId }),
      ]
    );
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
  }
}
