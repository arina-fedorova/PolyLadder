import { Pool } from 'pg';

/**
 * A single cloze exercise for fill-in-the-blank practice
 */
export interface ClozeExercise {
  exerciseId: string;
  sentenceWithBlank: string;
  correctAnswer: string;
  alternativeAnswers: string[];
  hint: {
    firstLetter: string;
    wordLength: number;
    partOfSpeech: string | null;
  };
  context: string | null;
  audioUrl: string | null;
  explanation: string;
  cefrLevel: string;
  meaningId: string | null;
}

/**
 * Result of validating a cloze answer
 */
export interface ClozeValidationResult {
  isCorrect: boolean;
  similarity: number;
  feedback: string;
  correctAnswer: string;
  partialCredit: number;
}

/**
 * ClozeExerciseService generates fill-in-the-blank exercises
 * from approved vocabulary and tracks results with SRS integration.
 */
export class ClozeExerciseService {
  private readonly MIN_EASE_FACTOR = 1.3;

  constructor(private readonly pool: Pool) {}

  /**
   * Get cloze exercises from approved_exercises or generate from vocabulary
   */
  async getClozeExercises(
    userId: string,
    language: string,
    limit: number = 10
  ): Promise<ClozeExercise[]> {
    // First try to get pre-stored cloze exercises
    const storedExercises = await this.getStoredClozeExercises(language, limit);

    if (storedExercises.length >= limit) {
      return storedExercises.slice(0, limit);
    }

    // If not enough stored exercises, generate from vocabulary SRS items
    const remainingLimit = limit - storedExercises.length;
    const generatedExercises = await this.generateClozeFromVocabulary(
      userId,
      language,
      remainingLimit
    );

    return [...storedExercises, ...generatedExercises];
  }

  /**
   * Get pre-stored cloze exercises from approved_exercises table
   */
  private async getStoredClozeExercises(language: string, limit: number): Promise<ClozeExercise[]> {
    interface StoredClozeRow {
      id: string;
      prompt: string;
      correct_answer: string;
      options: string[] | null;
      metadata: {
        hint?: {
          firstLetter?: string;
          wordLength?: number;
          partOfSpeech?: string;
        };
        context?: string;
        explanation?: string;
        meaningId?: string;
      } | null;
      level: string;
    }

    const result = await this.pool.query<StoredClozeRow>(
      `SELECT id, prompt, correct_answer, options, metadata, level
       FROM approved_exercises
       WHERE type = 'cloze'
         AND languages ? $1
       ORDER BY RANDOM()
       LIMIT $2`,
      [language, limit]
    );

    return result.rows.map((row) => {
      const metadata = row.metadata || {};
      const correctAnswer = row.correct_answer;

      return {
        exerciseId: `cloze_stored_${row.id}`,
        sentenceWithBlank: row.prompt,
        correctAnswer,
        alternativeAnswers: this.generateAlternatives(correctAnswer),
        hint: {
          firstLetter: metadata.hint?.firstLetter || correctAnswer[0] || '',
          wordLength: metadata.hint?.wordLength || correctAnswer.length,
          partOfSpeech: metadata.hint?.partOfSpeech || null,
        },
        context: metadata.context || null,
        audioUrl: null,
        explanation: metadata.explanation || '',
        cefrLevel: row.level,
        meaningId: metadata.meaningId || null,
      };
    });
  }

  /**
   * Generate cloze exercises from vocabulary in SRS queue
   */
  private async generateClozeFromVocabulary(
    userId: string,
    language: string,
    limit: number
  ): Promise<ClozeExercise[]> {
    interface VocabRow {
      meaning_id: string;
      word_text: string;
      usage_notes: string | null;
      audio_url: string | null;
      level: string;
    }

    // Get vocabulary items due for review
    const result = await this.pool.query<VocabRow>(
      `SELECT DISTINCT ON (usi.meaning_id)
         usi.meaning_id,
         au.text as word_text,
         au.usage_notes,
         au.audio_url,
         am.level
       FROM user_srs_items usi
       JOIN approved_meanings am ON usi.meaning_id = am.id
       LEFT JOIN approved_utterances au ON au.meaning_id = am.id AND au.language = $2
       WHERE usi.user_id = $1
         AND usi.language = $2
         AND usi.next_review_at <= current_timestamp
         AND au.text IS NOT NULL
         AND au.usage_notes IS NOT NULL
         AND LENGTH(au.usage_notes) > 10
       ORDER BY usi.meaning_id, usi.next_review_at ASC
       LIMIT $3`,
      [userId, language, limit]
    );

    const exercises: ClozeExercise[] = [];

    for (const row of result.rows) {
      const exercise = this.createClozeFromVocab(row);
      if (exercise) {
        exercises.push(exercise);
      }
    }

    return exercises;
  }

  /**
   * Create a cloze exercise from vocabulary data
   * Uses usage_notes as context and blanks out the word
   */
  private createClozeFromVocab(vocab: {
    meaning_id: string;
    word_text: string;
    usage_notes: string | null;
    audio_url: string | null;
    level: string;
  }): ClozeExercise | null {
    const { meaning_id, word_text, usage_notes, audio_url, level } = vocab;

    if (!usage_notes || !word_text) {
      return null;
    }

    // Try to find the word in usage notes and create a blank
    const wordRegex = new RegExp(`\\b${this.escapeRegex(word_text)}\\b`, 'gi');
    const match = usage_notes.match(wordRegex);

    let sentenceWithBlank: string;
    let actualWord: string;

    if (match && match[0]) {
      // Word found in usage notes - create blank
      actualWord = match[0];
      sentenceWithBlank = usage_notes.replace(wordRegex, '_____');
    } else {
      // Word not in usage notes - create a definition-based cloze
      actualWord = word_text;
      sentenceWithBlank = `The word that means "${usage_notes}" is: _____`;
    }

    return {
      exerciseId: `cloze_vocab_${meaning_id}_${Date.now()}`,
      sentenceWithBlank,
      correctAnswer: actualWord,
      alternativeAnswers: this.generateAlternatives(actualWord),
      hint: {
        firstLetter: actualWord[0] || '',
        wordLength: actualWord.length,
        partOfSpeech: null,
      },
      context: usage_notes.includes(actualWord) ? null : usage_notes,
      audioUrl: audio_url,
      explanation: usage_notes,
      cefrLevel: level,
      meaningId: meaning_id,
    };
  }

  /**
   * Validate user answer with fuzzy matching
   */
  async validateClozeAnswer(
    userId: string,
    exerciseId: string,
    userAnswer: string,
    correctAnswer: string,
    alternativeAnswers: string[],
    meaningId: string | null,
    timeSpentMs: number
  ): Promise<ClozeValidationResult> {
    const trimmedAnswer = userAnswer.trim();

    // Exact match (case-insensitive)
    if (trimmedAnswer.toLowerCase() === correctAnswer.toLowerCase()) {
      await this.recordResult(userId, exerciseId, meaningId, true, 5, timeSpentMs);
      return {
        isCorrect: true,
        similarity: 1.0,
        feedback: 'Perfect!',
        correctAnswer,
        partialCredit: 1.0,
      };
    }

    // Check alternatives
    const matchesAlternative = alternativeAnswers.some(
      (alt) => alt.toLowerCase() === trimmedAnswer.toLowerCase()
    );

    if (matchesAlternative) {
      await this.recordResult(userId, exerciseId, meaningId, true, 5, timeSpentMs);
      return {
        isCorrect: true,
        similarity: 1.0,
        feedback: 'Correct!',
        correctAnswer,
        partialCredit: 1.0,
      };
    }

    // Fuzzy matching - check similarity
    const similarity = this.calculateSimilarity(trimmedAnswer, correctAnswer);

    if (similarity >= 0.9) {
      // Very close - accept with note about spelling
      await this.recordResult(userId, exerciseId, meaningId, true, 4, timeSpentMs);
      return {
        isCorrect: true,
        similarity,
        feedback: 'Correct! (minor spelling difference)',
        correctAnswer,
        partialCredit: 0.9,
      };
    } else if (similarity >= 0.7) {
      // Close but not quite
      await this.recordResult(userId, exerciseId, meaningId, false, 2, timeSpentMs);
      return {
        isCorrect: false,
        similarity,
        feedback: `Close! The correct answer is "${correctAnswer}".`,
        correctAnswer,
        partialCredit: 0.5,
      };
    } else {
      // Wrong answer
      await this.recordResult(userId, exerciseId, meaningId, false, 0, timeSpentMs);
      return {
        isCorrect: false,
        similarity,
        feedback: `Incorrect. The correct answer is "${correctAnswer}".`,
        correctAnswer,
        partialCredit: 0.0,
      };
    }
  }

  /**
   * Record exercise result and update SRS if applicable
   */
  private async recordResult(
    userId: string,
    exerciseId: string,
    meaningId: string | null,
    isCorrect: boolean,
    quality: number,
    timeSpentMs: number
  ): Promise<void> {
    // Extract the actual exercise UUID if it's a stored exercise
    const uuidMatch = exerciseId.match(
      /cloze_stored_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
    );
    const actualExerciseId = uuidMatch ? uuidMatch[1] : exerciseId;

    // Record in user_exercise_results
    await this.pool.query(
      `INSERT INTO user_exercise_results
       (user_id, exercise_id, language, exercise_type, correct, time_spent_ms, user_answer, submitted_at)
       VALUES ($1, $2::uuid, 'XX', 'cloze', $3, $4, $5, NOW())
       ON CONFLICT DO NOTHING`,
      [
        userId,
        actualExerciseId.includes('-') ? actualExerciseId : '00000000-0000-0000-0000-000000000000',
        isCorrect,
        timeSpentMs,
        JSON.stringify({ quality, meaningId }),
      ]
    );

    // Update SRS if meaningId is provided
    if (meaningId) {
      await this.updateSRS(userId, meaningId, quality);
    }
  }

  /**
   * Update SRS based on answer quality using SM-2 algorithm
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
      return; // No SRS item to update
    }

    const current = srsResult.rows[0];

    // Calculate new values using SM-2
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
   * Get cloze practice statistics
   */
  async getStats(userId: string, language: string) {
    interface StatsRow {
      total_exercises: string;
      correct_count: string;
      avg_time_ms: string | null;
    }

    const result = await this.pool.query<StatsRow>(
      `SELECT
        COUNT(*) as total_exercises,
        COUNT(*) FILTER (WHERE correct = true) as correct_count,
        AVG(time_spent_ms) as avg_time_ms
       FROM user_exercise_results
       WHERE user_id = $1
         AND language = $2
         AND exercise_type = 'cloze'
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
      avgTimeMs: row.avg_time_ms ? Math.round(parseFloat(row.avg_time_ms)) : null,
    };
  }

  /**
   * Generate acceptable alternative answers
   * (different capitalization, with/without accents)
   */
  private generateAlternatives(word: string): string[] {
    const alternatives = new Set<string>();

    // Add lowercase version
    alternatives.add(word.toLowerCase());

    // Add capitalized version
    alternatives.add(word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

    // Add uppercase version
    alternatives.add(word.toUpperCase());

    // Add version without accents
    const withoutAccents = word
      .replace(/[áàäâã]/gi, 'a')
      .replace(/[éèëê]/gi, 'e')
      .replace(/[íìïî]/gi, 'i')
      .replace(/[óòöôõ]/gi, 'o')
      .replace(/[úùüû]/gi, 'u')
      .replace(/[ñ]/gi, 'n')
      .replace(/[ç]/gi, 'c');

    alternatives.add(withoutAccents);
    alternatives.add(withoutAccents.toLowerCase());

    // Remove the original word from alternatives
    alternatives.delete(word);

    return Array.from(alternatives);
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateSimilarity(a: string, b: string): number {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[áàäâã]/g, 'a')
        .replace(/[éèëê]/g, 'e')
        .replace(/[íìïî]/g, 'i')
        .replace(/[óòöôõ]/g, 'o')
        .replace(/[úùüû]/g, 'u')
        .replace(/[ñ]/g, 'n')
        .replace(/[ç]/g, 'c');

    const normA = normalize(a);
    const normB = normalize(b);

    if (normA === normB) return 1.0;

    const distance = this.levenshteinDistance(normA, normB);
    const maxLength = Math.max(normA.length, normB.length);

    return maxLength > 0 ? 1 - distance / maxLength : 0;
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
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
