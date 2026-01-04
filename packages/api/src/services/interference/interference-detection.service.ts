import { Pool } from 'pg';
import {
  InterferencePattern,
  InterferenceDetectionResult,
  RemediationExercise,
  InterferenceSummary,
  InterferenceReduction,
  InterferenceType,
  InterferenceTrend,
} from './interference.interface';

const LANGUAGE_NAMES: Record<string, string> = {
  EN: 'English',
  RU: 'Russian',
  DE: 'German',
  FR: 'French',
  ES: 'Spanish',
  IT: 'Italian',
  PT: 'Portuguese',
  ZH: 'Chinese',
  JA: 'Japanese',
  AR: 'Arabic',
  SL: 'Slovenian',
};

interface PatternRow {
  id: string;
  user_id: string;
  target_language: string;
  source_language: string;
  target_item_id: string;
  target_text: string;
  interfering_item_id: string;
  interfering_text: string;
  interference_type: string;
  confidence_score: string;
  occurrence_count: string;
  last_occurrence: string;
  remediation_completed: boolean;
  created_at: string;
}

/**
 * InterferenceDetectionService detects linguistic interference by analyzing
 * incorrect user answers and comparing them against vocabulary/grammar
 * from other languages the user is studying.
 */
export class InterferenceDetectionService {
  private readonly INTERFERENCE_THRESHOLD = 0.8;

  constructor(private readonly pool: Pool) {}

  /**
   * Analyze an incorrect answer for potential interference from other languages
   */
  async analyzeForInterference(
    userId: string,
    targetLanguage: string,
    correctText: string,
    userAnswer: string,
    itemId: string,
    itemType: InterferenceType
  ): Promise<InterferenceDetectionResult> {
    // Get all other languages user is studying
    interface LanguageRow {
      language: string;
    }

    const otherLanguagesResult = await this.pool.query<LanguageRow>(
      `SELECT language
       FROM user_language_progress
       WHERE user_id = $1
         AND language != $2
         AND is_active = true`,
      [userId, targetLanguage]
    );

    const otherLanguages = otherLanguagesResult.rows.map((r) => r.language);

    if (otherLanguages.length === 0) {
      return {
        isInterference: false,
        confidenceScore: 0,
        pattern: null,
        explanation: 'User is not studying other languages',
      };
    }

    // Search for similar words in other languages
    let bestMatch: {
      language: string;
      itemId: string;
      matchedText: string;
      similarity: number;
    } | null = null;

    for (const language of otherLanguages) {
      const match = await this.findSimilarInLanguage(userId, language, userAnswer, itemType);

      if (match && (!bestMatch || match.similarity > bestMatch.similarity)) {
        bestMatch = { language, ...match };
      }
    }

    if (bestMatch && bestMatch.similarity >= this.INTERFERENCE_THRESHOLD) {
      // Check if pattern already exists
      const existingPatternResult = await this.pool.query<{ id: string }>(
        `SELECT id FROM interference_patterns
         WHERE user_id = $1
           AND target_language = $2
           AND source_language = $3
           AND target_item_id = $4
           AND interfering_item_id = $5`,
        [userId, targetLanguage, bestMatch.language, itemId, bestMatch.itemId]
      );

      let pattern: InterferencePattern;

      if (existingPatternResult.rows.length > 0) {
        // Update existing pattern
        const updateResult = await this.pool.query<PatternRow>(
          `UPDATE interference_patterns
           SET occurrence_count = occurrence_count + 1,
               last_occurrence = NOW()
           WHERE id = $1
           RETURNING *`,
          [existingPatternResult.rows[0].id]
        );
        pattern = this.mapRowToPattern(updateResult.rows[0]);
      } else {
        // Create new pattern
        const insertResult = await this.pool.query<PatternRow>(
          `INSERT INTO interference_patterns (
             user_id, target_language, source_language,
             target_item_id, target_text,
             interfering_item_id, interfering_text,
             interference_type, confidence_score,
             occurrence_count, last_occurrence, remediation_completed
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NOW(), false)
           RETURNING *`,
          [
            userId,
            targetLanguage,
            bestMatch.language,
            itemId,
            correctText,
            bestMatch.itemId,
            bestMatch.matchedText,
            itemType,
            bestMatch.similarity,
          ]
        );
        pattern = this.mapRowToPattern(insertResult.rows[0]);
      }

      return {
        isInterference: true,
        confidenceScore: bestMatch.similarity,
        pattern,
        explanation: this.generateExplanation(
          targetLanguage,
          correctText,
          bestMatch.language,
          bestMatch.matchedText
        ),
      };
    }

    return {
      isInterference: false,
      confidenceScore: bestMatch?.similarity || 0,
      pattern: null,
      explanation: 'No strong interference pattern detected',
    };
  }

  /**
   * Find similar words in a specific language using text matching
   */
  private async findSimilarInLanguage(
    userId: string,
    language: string,
    userAnswer: string,
    itemType: InterferenceType
  ): Promise<{ itemId: string; matchedText: string; similarity: number } | null> {
    const normalizedAnswer = userAnswer.toLowerCase().trim();

    if (itemType === 'vocabulary') {
      // Search in user's vocabulary for this language
      interface VocabRow {
        meaning_id: string;
        text: string;
      }

      const result = await this.pool.query<VocabRow>(
        `SELECT DISTINCT usi.meaning_id, au.text
         FROM user_srs_items usi
         JOIN approved_utterances au ON au.meaning_id = usi.meaning_id
         WHERE usi.user_id = $1
           AND usi.language = $2
           AND au.text IS NOT NULL
         LIMIT 100`,
        [userId, language]
      );

      let bestMatch: { itemId: string; matchedText: string; similarity: number } | null = null;

      for (const row of result.rows) {
        const similarity = this.calculateSimilarity(normalizedAnswer, row.text.toLowerCase());
        if (similarity >= this.INTERFERENCE_THRESHOLD) {
          if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = {
              itemId: row.meaning_id,
              matchedText: row.text,
              similarity,
            };
          }
        }
      }

      return bestMatch;
    } else {
      // For grammar, search in grammar rules
      interface GrammarRow {
        id: string;
        title: string;
      }

      const result = await this.pool.query<GrammarRow>(
        `SELECT agr.id, agr.title
         FROM approved_grammar_rules agr
         WHERE agr.language = $1
         LIMIT 50`,
        [language]
      );

      let bestMatch: { itemId: string; matchedText: string; similarity: number } | null = null;

      for (const row of result.rows) {
        const similarity = this.calculateSimilarity(normalizedAnswer, row.title.toLowerCase());
        if (similarity >= this.INTERFERENCE_THRESHOLD) {
          if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = {
              itemId: row.id,
              matchedText: row.title,
              similarity,
            };
          }
        }
      }

      return bestMatch;
    }
  }

  /**
   * Calculate similarity between two strings using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    const longerLength = longer.length;
    if (longerLength === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longerLength - distance) / longerLength;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Generate human-readable explanation of interference
   */
  private generateExplanation(
    targetLanguage: string,
    targetText: string,
    sourceLanguage: string,
    interferingText: string
  ): string {
    const targetLangName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
    const sourceLangName = LANGUAGE_NAMES[sourceLanguage] || sourceLanguage;

    return `You used "${interferingText}" from ${sourceLangName}, but the correct ${targetLangName} answer is "${targetText}". This is a common interference pattern when studying multiple languages.`;
  }

  /**
   * Get all interference patterns for a user
   */
  async getUserInterferencePatterns(
    userId: string,
    includeRemediated: boolean = false
  ): Promise<InterferencePattern[]> {
    let query = `
      SELECT * FROM interference_patterns
      WHERE user_id = $1
    `;

    if (!includeRemediated) {
      query += ` AND remediation_completed = false`;
    }

    query += ` ORDER BY occurrence_count DESC, last_occurrence DESC`;

    const result = await this.pool.query<PatternRow>(query, [userId]);
    return result.rows.map((row) => this.mapRowToPattern(row));
  }

  /**
   * Generate remediation exercises for an interference pattern
   */
  async generateRemediationExercises(patternId: string): Promise<RemediationExercise[]> {
    // Get pattern details
    const patternResult = await this.pool.query<PatternRow>(
      `SELECT * FROM interference_patterns WHERE id = $1`,
      [patternId]
    );

    if (patternResult.rows.length === 0) {
      throw new Error('Pattern not found');
    }

    const pattern = this.mapRowToPattern(patternResult.rows[0]);
    const targetLangName = LANGUAGE_NAMES[pattern.targetLanguage] || pattern.targetLanguage;
    const sourceLangName = LANGUAGE_NAMES[pattern.sourceLanguage] || pattern.sourceLanguage;

    const exercises: RemediationExercise[] = [];

    // Exercise 1: Direct Contrast - which word is from target language?
    exercises.push({
      id: `${patternId}-contrast-1`,
      patternId,
      exerciseType: 'contrast',
      targetItem: {
        language: pattern.targetLanguage,
        text: pattern.targetText,
        translation: pattern.targetText,
      },
      interferingItem: {
        language: pattern.sourceLanguage,
        text: pattern.interferingText,
        translation: pattern.interferingText,
      },
      prompt: `Which word is from ${targetLangName}?`,
      correctAnswer: pattern.targetText,
      distractors: [pattern.interferingText],
    });

    // Exercise 2: Language identification for target
    exercises.push({
      id: `${patternId}-identify-target`,
      patternId,
      exerciseType: 'multiple_choice',
      targetItem: {
        language: pattern.targetLanguage,
        text: pattern.targetText,
        translation: pattern.targetText,
      },
      interferingItem: {
        language: pattern.sourceLanguage,
        text: pattern.interferingText,
        translation: pattern.interferingText,
      },
      prompt: `"${pattern.targetText}" is from which language?`,
      correctAnswer: targetLangName,
      distractors: [sourceLangName],
    });

    // Exercise 3: Language identification for interfering
    exercises.push({
      id: `${patternId}-identify-source`,
      patternId,
      exerciseType: 'multiple_choice',
      targetItem: {
        language: pattern.targetLanguage,
        text: pattern.targetText,
        translation: pattern.targetText,
      },
      interferingItem: {
        language: pattern.sourceLanguage,
        text: pattern.interferingText,
        translation: pattern.interferingText,
      },
      prompt: `"${pattern.interferingText}" is from which language?`,
      correctAnswer: sourceLangName,
      distractors: [targetLangName],
    });

    // Exercise 4: Recall correct word for target language
    exercises.push({
      id: `${patternId}-recall`,
      patternId,
      exerciseType: 'fill_blank',
      targetItem: {
        language: pattern.targetLanguage,
        text: pattern.targetText,
        translation: pattern.targetText,
      },
      interferingItem: {
        language: pattern.sourceLanguage,
        text: pattern.interferingText,
        translation: pattern.interferingText,
      },
      prompt: `Type the correct ${targetLangName} word (not the ${sourceLangName} word "${pattern.interferingText}"):`,
      correctAnswer: pattern.targetText,
      distractors: [pattern.interferingText],
    });

    // Store exercises in database for tracking
    for (const exercise of exercises) {
      await this.pool.query(
        `INSERT INTO remediation_exercises (id, pattern_id, exercise_type, prompt, correct_answer, distractors, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [
          exercise.id,
          patternId,
          exercise.exerciseType,
          exercise.prompt,
          exercise.correctAnswer,
          JSON.stringify(exercise.distractors),
          JSON.stringify({
            targetItem: exercise.targetItem,
            interferingItem: exercise.interferingItem,
          }),
        ]
      );
    }

    return exercises;
  }

  /**
   * Record a remediation attempt
   */
  async recordRemediationAttempt(
    exerciseId: string,
    userId: string,
    userAnswer: string,
    isCorrect: boolean,
    timeSpent: number
  ): Promise<{ success: boolean; shouldMarkRemediated: boolean }> {
    // Record the attempt
    await this.pool.query(
      `INSERT INTO remediation_attempts (exercise_id, user_id, user_answer, is_correct, time_spent)
       VALUES ($1, $2, $3, $4, $5)`,
      [exerciseId, userId, userAnswer, isCorrect, timeSpent]
    );

    // Check if we should mark pattern as remediated
    interface AttemptStats {
      pattern_id: string;
      correct_count: string;
    }

    const statsResult = await this.pool.query<AttemptStats>(
      `SELECT re.pattern_id, COUNT(*) FILTER (WHERE ra.is_correct) as correct_count
       FROM remediation_attempts ra
       JOIN remediation_exercises re ON re.id = ra.exercise_id
       WHERE ra.user_id = $1
         AND re.pattern_id = (
           SELECT pattern_id FROM remediation_exercises WHERE id = $2
         )
       GROUP BY re.pattern_id`,
      [userId, exerciseId]
    );

    const shouldMarkRemediated =
      statsResult.rows.length > 0 && parseInt(statsResult.rows[0].correct_count, 10) >= 3;

    if (shouldMarkRemediated) {
      await this.pool.query(
        `UPDATE interference_patterns
         SET remediation_completed = true
         WHERE id = $1`,
        [statsResult.rows[0].pattern_id]
      );
    }

    return { success: true, shouldMarkRemediated };
  }

  /**
   * Mark remediation as completed for a pattern
   */
  async markRemediationCompleted(patternId: string): Promise<void> {
    await this.pool.query(
      `UPDATE interference_patterns
       SET remediation_completed = true
       WHERE id = $1`,
      [patternId]
    );
  }

  /**
   * Get interference summary statistics
   */
  async getInterferenceSummary(userId: string): Promise<InterferenceSummary> {
    interface CountRow {
      count: string;
    }

    // Total patterns
    const totalResult = await this.pool.query<CountRow>(
      `SELECT COUNT(*) as count FROM interference_patterns WHERE user_id = $1`,
      [userId]
    );

    // Active patterns
    const activeResult = await this.pool.query<CountRow>(
      `SELECT COUNT(*) as count
       FROM interference_patterns
       WHERE user_id = $1 AND remediation_completed = false`,
      [userId]
    );

    // Remediated patterns
    const remediatedResult = await this.pool.query<CountRow>(
      `SELECT COUNT(*) as count
       FROM interference_patterns
       WHERE user_id = $1 AND remediation_completed = true`,
      [userId]
    );

    // Top interference language pairs
    interface PairRow {
      target_language: string;
      source_language: string;
      count: string;
    }

    const topPairsResult = await this.pool.query<PairRow>(
      `SELECT
         target_language,
         source_language,
         COUNT(*) as count
       FROM interference_patterns
       WHERE user_id = $1
       GROUP BY target_language, source_language
       ORDER BY count DESC
       LIMIT 5`,
      [userId]
    );

    // Recent patterns
    const recentResult = await this.pool.query<PatternRow>(
      `SELECT * FROM interference_patterns
       WHERE user_id = $1
       ORDER BY last_occurrence DESC
       LIMIT 10`,
      [userId]
    );

    return {
      totalPatterns: parseInt(totalResult.rows[0].count, 10),
      activePatterns: parseInt(activeResult.rows[0].count, 10),
      remediatedPatterns: parseInt(remediatedResult.rows[0].count, 10),
      topInterferenceLanguagePairs: topPairsResult.rows.map((r) => ({
        targetLanguage: r.target_language,
        sourceLanguage: r.source_language,
        count: parseInt(r.count, 10),
      })),
      recentPatterns: recentResult.rows.map((r) => this.mapRowToPattern(r)),
    };
  }

  /**
   * Calculate interference reduction rate over time
   */
  async calculateInterferenceReduction(
    userId: string,
    patternId: string,
    periodDays: number = 30
  ): Promise<InterferenceReduction> {
    // Get occurrence count at start and end of period
    interface OccurrenceRow {
      first_count: string;
      last_count: string;
    }

    const result = await this.pool.query<OccurrenceRow>(
      `SELECT
         (SELECT occurrence_count FROM interference_patterns WHERE id = $1) as last_count,
         COALESCE(
           (SELECT occurrence_count FROM interference_patterns
            WHERE id = $1 AND created_at <= NOW() - INTERVAL '${periodDays} days'),
           1
         ) as first_count`,
      [patternId]
    );

    const firstCount = parseInt(result.rows[0]?.first_count || '1', 10);
    const lastCount = parseInt(result.rows[0]?.last_count || '1', 10);

    // Calculate rate of change
    const diff = lastCount - firstCount;

    let trend: InterferenceTrend;
    if (diff < -1) {
      trend = 'improving';
    } else if (diff > 1) {
      trend = 'worsening';
    } else {
      trend = 'stable';
    }

    // Calculate reduction percentage (negative diff = positive reduction)
    const rate = firstCount > 0 ? (-diff / firstCount) * 100 : 0;

    return { rate: Math.max(-100, Math.min(100, rate)), trend };
  }

  /**
   * Get exercise details by ID
   */
  async getExerciseDetails(
    exerciseId: string
  ): Promise<{
    correctAnswer: string;
    patternId: string;
    targetText: string;
    interferingText: string;
  } | null> {
    interface ExerciseRow {
      correct_answer: string;
      pattern_id: string;
      target_text: string;
      interfering_text: string;
    }

    const result = await this.pool.query<ExerciseRow>(
      `SELECT re.correct_answer, re.pattern_id, ip.target_text, ip.interfering_text
       FROM remediation_exercises re
       JOIN interference_patterns ip ON ip.id = re.pattern_id
       WHERE re.id = $1`,
      [exerciseId]
    );

    if (result.rows.length === 0) return null;

    return {
      correctAnswer: result.rows[0].correct_answer,
      patternId: result.rows[0].pattern_id,
      targetText: result.rows[0].target_text,
      interferingText: result.rows[0].interfering_text,
    };
  }

  /**
   * Map database row to InterferencePattern
   */
  private mapRowToPattern(row: PatternRow): InterferencePattern {
    return {
      id: row.id,
      userId: row.user_id,
      targetLanguage: row.target_language,
      sourceLanguage: row.source_language,
      targetItemId: row.target_item_id,
      targetText: row.target_text,
      interferingItemId: row.interfering_item_id,
      interferingText: row.interfering_text,
      interferenceType: row.interference_type as InterferenceType,
      confidenceScore: parseFloat(row.confidence_score),
      occurrenceCount: parseInt(row.occurrence_count, 10),
      lastOccurrence: new Date(row.last_occurrence),
      remediationCompleted: row.remediation_completed,
      createdAt: new Date(row.created_at),
    };
  }
}
