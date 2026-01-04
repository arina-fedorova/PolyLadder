import { Pool } from 'pg';

/**
 * Vocabulary hint for difficult words in a passage
 */
export interface VocabularyHint {
  word: string;
  definition: string;
  position: number;
}

/**
 * A comprehension question for a reading passage
 */
export interface ComprehensionQuestion {
  id: string;
  questionText: string;
  questionType: 'factual' | 'inferential' | 'vocabulary' | 'main_idea';
  options: string[];
  correctAnswerIndex: number;
  explanation: string | null;
}

/**
 * A reading passage with questions and vocabulary hints
 */
export interface ReadingPassage {
  id: string;
  title: string;
  text: string;
  language: string;
  cefrLevel: string;
  wordCount: number;
  audioUrl: string | null;
  source: string | null;
  vocabularyHints: VocabularyHint[];
  questions: ComprehensionQuestion[];
  srsItemId: string | null;
}

/**
 * User's answer to a question
 */
export interface UserAnswer {
  questionId: string;
  answerIndex: number;
}

/**
 * Result of validating a single answer
 */
export interface AnswerResult {
  questionId: string;
  userAnswerIndex: number;
  correctAnswerIndex: number;
  isCorrect: boolean;
  explanation: string | null;
}

/**
 * Result of validating all answers for a passage
 */
export interface ReadingResult {
  passageId: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  qualityRating: number;
  answers: AnswerResult[];
}

/**
 * ReadingComprehensionService handles reading passage exercises
 * with multiple-choice comprehension questions.
 */
export class ReadingComprehensionService {
  private readonly MIN_EASE_FACTOR = 1.3;

  constructor(private readonly pool: Pool) {}

  /**
   * Get reading passages for a user based on their SRS queue
   */
  async getReadingPassages(
    userId: string,
    language: string,
    cefrLevel?: string,
    limit: number = 5
  ): Promise<ReadingPassage[]> {
    interface PassageRow {
      id: string;
      title: string;
      text: string;
      language: string;
      cefr_level: string;
      word_count: number;
      audio_url: string | null;
      source: string | null;
      srs_item_id: string | null;
    }

    // If user has SRS items for reading passages, prioritize those
    const srsResult = await this.pool.query<PassageRow>(
      `SELECT
         rp.id,
         rp.title,
         rp.text,
         rp.language,
         rp.cefr_level,
         rp.word_count,
         rp.audio_url,
         rp.source,
         usi.id AS srs_item_id
       FROM user_srs_items usi
       JOIN approved_reading_passages rp ON usi.reading_passage_id = rp.id
       WHERE usi.user_id = $1
         AND rp.language = $2
         ${cefrLevel ? 'AND rp.cefr_level = $4' : ''}
         AND usi.next_review_at <= current_timestamp
       ORDER BY usi.next_review_at ASC
       LIMIT $3`,
      cefrLevel ? [userId, language, limit, cefrLevel] : [userId, language, limit]
    );

    // If no SRS items, get new passages for the user
    let passages: PassageRow[];
    if (srsResult.rows.length === 0) {
      const newResult = await this.pool.query<PassageRow>(
        `SELECT
           rp.id,
           rp.title,
           rp.text,
           rp.language,
           rp.cefr_level,
           rp.word_count,
           rp.audio_url,
           rp.source,
           NULL AS srs_item_id
         FROM approved_reading_passages rp
         WHERE rp.language = $1
           ${cefrLevel ? 'AND rp.cefr_level = $3' : ''}
           AND rp.id NOT IN (
             SELECT reading_passage_id FROM user_srs_items
             WHERE user_id = $2 AND reading_passage_id IS NOT NULL
           )
         ORDER BY rp.created_at ASC
         LIMIT $4`,
        cefrLevel ? [language, userId, cefrLevel, limit] : [language, userId, limit]
      );
      passages = newResult.rows;
    } else {
      passages = srsResult.rows;
    }

    // Fetch vocabulary hints and questions for each passage
    const result: ReadingPassage[] = [];
    for (const row of passages) {
      const vocabularyHints = await this.getVocabularyHints(row.id);
      const questions = await this.getComprehensionQuestions(row.id);

      result.push({
        id: row.id,
        title: row.title,
        text: row.text,
        language: row.language,
        cefrLevel: row.cefr_level,
        wordCount: row.word_count,
        audioUrl: row.audio_url,
        source: row.source,
        vocabularyHints,
        questions,
        srsItemId: row.srs_item_id,
      });
    }

    return result;
  }

  /**
   * Get vocabulary hints for a passage
   */
  private async getVocabularyHints(passageId: string): Promise<VocabularyHint[]> {
    interface HintRow {
      word: string;
      definition: string;
      position: number;
    }

    const result = await this.pool.query<HintRow>(
      `SELECT word, definition, position
       FROM reading_vocabulary_hints
       WHERE reading_passage_id = $1
       ORDER BY position ASC`,
      [passageId]
    );

    return result.rows.map((row) => ({
      word: row.word,
      definition: row.definition,
      position: row.position,
    }));
  }

  /**
   * Get comprehension questions for a passage
   */
  private async getComprehensionQuestions(passageId: string): Promise<ComprehensionQuestion[]> {
    interface QuestionRow {
      id: string;
      question_text: string;
      question_type: 'factual' | 'inferential' | 'vocabulary' | 'main_idea';
      options: string[];
      correct_answer_index: number;
      explanation: string | null;
    }

    const result = await this.pool.query<QuestionRow>(
      `SELECT id, question_text, question_type, options, correct_answer_index, explanation
       FROM reading_comprehension_questions
       WHERE reading_passage_id = $1
       ORDER BY display_order ASC`,
      [passageId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      questionText: row.question_text,
      questionType: row.question_type,
      options: row.options,
      correctAnswerIndex: row.correct_answer_index,
      explanation: row.explanation,
    }));
  }

  /**
   * Submit answers for a reading passage and get results
   */
  async submitAnswers(
    userId: string,
    passageId: string,
    answers: UserAnswer[],
    timeSpentMs: number
  ): Promise<ReadingResult> {
    // Fetch correct answers
    const questions = await this.getComprehensionQuestions(passageId);

    const answerResults: AnswerResult[] = [];
    let correctCount = 0;

    for (const userAnswer of answers) {
      const question = questions.find((q) => q.id === userAnswer.questionId);
      if (!question) continue;

      const isCorrect = userAnswer.answerIndex === question.correctAnswerIndex;
      if (isCorrect) correctCount++;

      answerResults.push({
        questionId: userAnswer.questionId,
        userAnswerIndex: userAnswer.answerIndex,
        correctAnswerIndex: question.correctAnswerIndex,
        isCorrect,
        explanation: question.explanation,
      });
    }

    const totalQuestions = questions.length;
    const score = totalQuestions > 0 ? correctCount / totalQuestions : 0;
    const qualityRating = this.scoreToQuality(score);

    // Get or create SRS item for this passage
    const srsItemId = await this.ensureSrsItem(userId, passageId);

    // Update SRS scheduling
    await this.updateSRS(userId, srsItemId, qualityRating);

    // Record attempt
    await this.recordAttempt(userId, passageId, answers, score >= 0.7, score, timeSpentMs);

    return {
      passageId,
      score,
      totalQuestions,
      correctAnswers: correctCount,
      qualityRating,
      answers: answerResults,
    };
  }

  /**
   * Ensure an SRS item exists for this passage and user
   */
  private async ensureSrsItem(userId: string, passageId: string): Promise<string> {
    interface SrsItemRow {
      id: string;
    }

    // Check if SRS item exists
    const existing = await this.pool.query<SrsItemRow>(
      `SELECT id FROM user_srs_items
       WHERE user_id = $1 AND reading_passage_id = $2`,
      [userId, passageId]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0].id;
    }

    // Get passage language
    interface PassageRow {
      language: string;
    }
    const passageResult = await this.pool.query<PassageRow>(
      `SELECT language FROM approved_reading_passages WHERE id = $1`,
      [passageId]
    );

    const language = passageResult.rows[0]?.language || 'XX';

    // Create new SRS item
    const result = await this.pool.query<SrsItemRow>(
      `INSERT INTO user_srs_items
       (user_id, reading_passage_id, language, ease_factor, repetitions, interval, next_review_at)
       VALUES ($1, $2, $3, 2.5, 0, 0, current_timestamp)
       RETURNING id`,
      [userId, passageId, language]
    );

    return result.rows[0].id;
  }

  /**
   * Convert comprehension score to SRS quality rating (0-5)
   */
  private scoreToQuality(score: number): number {
    if (score >= 0.95) return 5; // Perfect
    if (score >= 0.8) return 4; // Good
    if (score >= 0.6) return 3; // Acceptable
    if (score >= 0.4) return 2; // Struggled
    if (score > 0) return 1; // Minimal
    return 0; // Complete failure
  }

  /**
   * Update SRS scheduling based on quality
   */
  private async updateSRS(userId: string, srsItemId: string, quality: number): Promise<void> {
    interface SRSRow {
      ease_factor: number;
      repetitions: number;
      interval: number;
    }

    const srsResult = await this.pool.query<SRSRow>(
      `SELECT ease_factor, repetitions, interval
       FROM user_srs_items
       WHERE id = $1 AND user_id = $2`,
      [srsItemId, userId]
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
       WHERE id = $5 AND user_id = $6`,
      [newEaseFactor, newRepetitions, newInterval, nextReviewAt, srsItemId, userId]
    );
  }

  /**
   * Record practice attempt
   */
  private async recordAttempt(
    userId: string,
    passageId: string,
    answers: UserAnswer[],
    isCorrect: boolean,
    accuracy: number,
    timeSpentMs: number
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_exercise_results
       (user_id, exercise_id, language, exercise_type, correct, time_spent_ms, user_answer, submitted_at)
       VALUES ($1, $2::uuid, 'XX', 'reading', $3, $4, $5, NOW())
       ON CONFLICT DO NOTHING`,
      [
        userId,
        '00000000-0000-0000-0000-000000000000',
        isCorrect,
        timeSpentMs,
        JSON.stringify({ passageId, answers, accuracy }),
      ]
    );
  }

  /**
   * Get reading practice statistics
   */
  async getStats(userId: string, language: string) {
    interface StatsRow {
      total_passages: string;
      correct_count: string;
      avg_accuracy: string | null;
    }

    const result = await this.pool.query<StatsRow>(
      `SELECT
        COUNT(*) as total_passages,
        COUNT(*) FILTER (WHERE correct = true) as correct_count,
        AVG((user_answer::jsonb->>'accuracy')::decimal) as avg_accuracy
       FROM user_exercise_results
       WHERE user_id = $1
         AND language = $2
         AND exercise_type = 'reading'
         AND submitted_at > current_timestamp - interval '7 days'`,
      [userId, language]
    );

    const row = result.rows[0];
    const total = parseInt(row.total_passages, 10);
    const correct = parseInt(row.correct_count, 10);

    return {
      totalPassagesRead: total,
      passagesWithGoodScore: correct,
      averageScore: row.avg_accuracy ? Math.round(parseFloat(row.avg_accuracy) * 100) : null,
    };
  }

  /**
   * Get sanitized passages (without correct answers) for client
   */
  sanitizePassagesForClient(passages: ReadingPassage[]): Array<
    Omit<ReadingPassage, 'questions'> & {
      questions: Array<Omit<ComprehensionQuestion, 'correctAnswerIndex' | 'explanation'>>;
    }
  > {
    return passages.map((passage) => ({
      ...passage,
      questions: passage.questions.map((q) => ({
        id: q.id,
        questionText: q.questionText,
        questionType: q.questionType,
        options: q.options,
      })),
    }));
  }
}
