import { Pool } from 'pg';
import {
  CEFRLevelData,
  CEFRAssessment,
  LevelProgression,
  LevelRequirements,
  CEFROverview,
} from './cefr-assessment.interface';

/**
 * CEFR Level Assessment Service
 *
 * Assesses user's current CEFR level based on:
 * 1. Vocabulary mastery (words marked as 'known' per CEFR level)
 * 2. Grammar concept completion per CEFR level
 *
 * Algorithm:
 * - A level is "completed" when user has mastered >=80% of its vocabulary
 *   AND completed >=70% of its grammar concepts
 * - Current CEFR level = highest completed level
 * - If current level has <95% completion, user is "progressing" within that level
 * - If current level has >=95% completion, user is "ready" for next level
 */
export class CEFRAssessmentService {
  private readonly CEFR_LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  private readonly VOCABULARY_COMPLETION_THRESHOLD = 80; // 80%
  private readonly GRAMMAR_COMPLETION_THRESHOLD = 70; // 70%
  private readonly READY_FOR_NEXT_THRESHOLD = 95; // 95%

  constructor(private readonly pool: Pool) {}

  /**
   * Assess user's current CEFR level for a language
   */
  async assessCEFRLevel(userId: string, language: string): Promise<CEFRAssessment> {
    // Get all CEFR level data
    const levelDetails = await this.calculateAllLevelData(userId, language);

    // Determine current level (highest completed)
    let currentLevel = 'A0';
    for (const level of levelDetails) {
      if (level.isCompleted) {
        currentLevel = level.level;
      } else {
        break; // Levels must be completed sequentially
      }
    }

    // Determine status and next level
    const currentLevelData = levelDetails.find((ld) => ld.level === currentLevel);
    const currentLevelIndex = this.CEFR_LEVELS.indexOf(currentLevel);
    const nextLevel =
      currentLevelIndex < this.CEFR_LEVELS.length - 1
        ? this.CEFR_LEVELS[currentLevelIndex + 1]
        : null;

    let status: 'progressing' | 'ready' | 'completed';
    if (!nextLevel) {
      status = 'completed';
    } else if (
      currentLevelData &&
      currentLevelData.overallPercentage >= this.READY_FOR_NEXT_THRESHOLD
    ) {
      status = 'ready';
    } else {
      status = 'progressing';
    }

    // Calculate progress to next level
    const nextLevelData = nextLevel ? levelDetails.find((ld) => ld.level === nextLevel) : null;
    const progressToNextLevel = nextLevelData ? nextLevelData.overallPercentage : 100;

    // Estimate days to next level
    const estimatedDaysToNextLevel = await this.estimateDaysToNextLevel(
      userId,
      language,
      nextLevel,
      progressToNextLevel
    );

    // Record assessment
    await this.recordAssessment(userId, language, currentLevel, levelDetails);

    return {
      userId,
      language,
      currentLevel,
      status,
      levelDetails,
      nextLevel,
      progressToNextLevel,
      estimatedDaysToNextLevel,
      assessedAt: new Date(),
    };
  }

  /**
   * Calculate vocabulary and grammar completion for all CEFR levels
   */
  private async calculateAllLevelData(userId: string, language: string): Promise<CEFRLevelData[]> {
    const levelDataArray: CEFRLevelData[] = [];

    for (const level of this.CEFR_LEVELS) {
      // Vocabulary statistics - count meanings at this level for this language
      // approved_meanings has the level, approved_utterances links to language
      interface VocabRow {
        total: string;
        mastered: string;
      }

      const vocabQuery = `
        SELECT
          COUNT(DISTINCT am.id) as total,
          COUNT(DISTINCT CASE WHEN uws.state = 'known' THEN am.id END) as mastered
        FROM approved_meanings am
        INNER JOIN approved_utterances au ON au.meaning_id = am.id
        LEFT JOIN user_word_state uws ON uws.meaning_id = am.id AND uws.user_id = $1 AND uws.language = $2
        WHERE am.level = $3 AND au.language = $2
      `;

      const vocabResult = await this.pool.query<VocabRow>(vocabQuery, [userId, language, level]);
      const vocabTotal = parseInt(vocabResult.rows[0]?.total || '0');
      const vocabMastered = parseInt(vocabResult.rows[0]?.mastered || '0');
      const vocabPercentage = vocabTotal > 0 ? (vocabMastered / vocabTotal) * 100 : 0;

      // Grammar statistics
      interface GrammarRow {
        total: string;
        completed: string;
      }

      const grammarQuery = `
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN gp.is_completed = true THEN 1 END) as completed
        FROM approved_rules ar
        LEFT JOIN grammar_progress gp ON gp.grammar_id = ar.id AND gp.user_id = $1
        WHERE ar.language = $2 AND ar.level = $3
      `;

      const grammarResult = await this.pool.query<GrammarRow>(grammarQuery, [
        userId,
        language,
        level,
      ]);
      const grammarTotal = parseInt(grammarResult.rows[0]?.total || '0');
      const grammarCompleted = parseInt(grammarResult.rows[0]?.completed || '0');
      const grammarPercentage = grammarTotal > 0 ? (grammarCompleted / grammarTotal) * 100 : 0;

      // Overall percentage (weighted: 60% vocabulary, 40% grammar)
      const overallPercentage = vocabPercentage * 0.6 + grammarPercentage * 0.4;

      // Level is completed if vocabulary >=80% AND grammar >=70%
      const isCompleted =
        vocabPercentage >= this.VOCABULARY_COMPLETION_THRESHOLD &&
        grammarPercentage >= this.GRAMMAR_COMPLETION_THRESHOLD;

      levelDataArray.push({
        level,
        vocabularyTotal: vocabTotal,
        vocabularyMastered: vocabMastered,
        vocabularyPercentage: Math.round(vocabPercentage * 10) / 10,
        grammarTotal,
        grammarCompleted,
        grammarPercentage: Math.round(grammarPercentage * 10) / 10,
        overallPercentage: Math.round(overallPercentage * 10) / 10,
        isCompleted,
      });
    }

    return levelDataArray;
  }

  /**
   * Estimate days to complete next level based on learning velocity
   */
  private async estimateDaysToNextLevel(
    userId: string,
    language: string,
    nextLevel: string | null,
    currentProgress: number
  ): Promise<number | null> {
    if (!nextLevel || currentProgress >= 100) {
      return null;
    }

    // Calculate learning velocity (words learned per day over last 30 days)
    interface VelocityRow {
      avg_words_per_day: string | null;
    }

    const velocityQuery = `
      WITH recent_progress AS (
        SELECT
          DATE(marked_known_at) as learn_date,
          COUNT(DISTINCT meaning_id) as words_learned
        FROM user_word_state
        WHERE user_id = $1
          AND language = $2
          AND state = 'known'
          AND marked_known_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(marked_known_at)
      )
      SELECT AVG(words_learned) as avg_words_per_day
      FROM recent_progress
    `;

    const velocityResult = await this.pool.query<VelocityRow>(velocityQuery, [userId, language]);
    const avgWordsPerDay = parseFloat(velocityResult.rows[0]?.avg_words_per_day || '0');

    if (avgWordsPerDay === 0) {
      return null; // Cannot estimate without learning history
    }

    // Get total items needed for next level
    interface RequirementsRow {
      vocab_total: string;
      grammar_total: string;
    }

    const requirementsQuery = `
      SELECT
        (SELECT COUNT(DISTINCT am.id)
         FROM approved_meanings am
         INNER JOIN approved_utterances au ON au.meaning_id = am.id
         WHERE am.level = $2 AND au.language = $1) as vocab_total,
        (SELECT COUNT(*)
         FROM approved_rules ar
         WHERE ar.language = $1 AND ar.level = $2) as grammar_total
    `;

    const reqResult = await this.pool.query<RequirementsRow>(requirementsQuery, [
      language,
      nextLevel,
    ]);
    const totalItems =
      parseInt(reqResult.rows[0]?.vocab_total || '0') +
      parseInt(reqResult.rows[0]?.grammar_total || '0');

    const itemsRemaining = totalItems * (1 - currentProgress / 100);
    const estimatedDays = Math.ceil(itemsRemaining / avgWordsPerDay);

    return estimatedDays > 0 ? estimatedDays : null;
  }

  /**
   * Record assessment in history table
   */
  private async recordAssessment(
    userId: string,
    language: string,
    currentLevel: string,
    levelDetails: CEFRLevelData[]
  ): Promise<void> {
    const currentLevelData = levelDetails.find((ld) => ld.level === currentLevel);

    if (!currentLevelData) return;

    const insertQuery = `
      INSERT INTO cefr_level_history (
        user_id, language, cefr_level,
        vocabulary_percentage, grammar_percentage, overall_percentage,
        assessed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `;

    await this.pool.query(insertQuery, [
      userId,
      language,
      currentLevel,
      currentLevelData.vocabularyPercentage,
      currentLevelData.grammarPercentage,
      currentLevelData.overallPercentage,
    ]);
  }

  /**
   * Get CEFR level progression over time
   */
  async getLevelProgression(
    userId: string,
    language: string,
    days: number = 90
  ): Promise<LevelProgression[]> {
    interface ProgressionRow {
      date: Date;
      level: string;
      vocabulary_percentage: string;
      grammar_percentage: string;
      overall_percentage: string;
    }

    const query = `
      SELECT
        assessed_at as date,
        cefr_level as level,
        vocabulary_percentage,
        grammar_percentage,
        overall_percentage
      FROM cefr_level_history
      WHERE user_id = $1 AND language = $2
        AND assessed_at >= NOW() - ($3 || ' days')::interval
      ORDER BY assessed_at ASC
    `;

    const result = await this.pool.query<ProgressionRow>(query, [userId, language, days]);

    return result.rows.map((row) => ({
      date: new Date(row.date),
      level: row.level,
      vocabularyPercentage: parseFloat(row.vocabulary_percentage),
      grammarPercentage: parseFloat(row.grammar_percentage),
      overallPercentage: parseFloat(row.overall_percentage),
    }));
  }

  /**
   * Get requirements for next CEFR level
   */
  async getLevelRequirements(
    userId: string,
    language: string,
    targetLevel?: string
  ): Promise<LevelRequirements | null> {
    // If no target level specified, use next level
    if (!targetLevel) {
      const assessment = await this.assessCEFRLevel(userId, language);
      targetLevel = assessment.nextLevel || '';

      if (!targetLevel) {
        return null; // Already at max level
      }
    }

    // Get vocabulary gaps
    interface VocabGapRow {
      id: string;
      text: string;
    }

    const vocabGapQuery = `
      SELECT DISTINCT am.id, au.text
      FROM approved_meanings am
      INNER JOIN approved_utterances au ON au.meaning_id = am.id
      LEFT JOIN user_word_state uws ON uws.meaning_id = am.id AND uws.user_id = $1 AND uws.language = $2
      WHERE am.level = $3 AND au.language = $2
        AND (uws.state IS NULL OR uws.state != 'known')
      ORDER BY au.text ASC
      LIMIT 20
    `;

    const vocabGapResult = await this.pool.query<VocabGapRow>(vocabGapQuery, [
      userId,
      language,
      targetLevel,
    ]);
    const vocabularyGap = vocabGapResult.rows.map((r) => r.text);

    // Get total vocabulary gap count
    interface VocabCountRow {
      count: string;
    }

    const vocabCountQuery = `
      SELECT COUNT(DISTINCT am.id) as count
      FROM approved_meanings am
      INNER JOIN approved_utterances au ON au.meaning_id = am.id
      LEFT JOIN user_word_state uws ON uws.meaning_id = am.id AND uws.user_id = $1 AND uws.language = $2
      WHERE am.level = $3 AND au.language = $2
        AND (uws.state IS NULL OR uws.state != 'known')
    `;

    const vocabCountResult = await this.pool.query<VocabCountRow>(vocabCountQuery, [
      userId,
      language,
      targetLevel,
    ]);
    const vocabularyNeeded = parseInt(vocabCountResult.rows[0]?.count || '0');

    // Get grammar gaps
    interface GrammarGapRow {
      id: string;
      title: string;
    }

    const grammarGapQuery = `
      SELECT ar.id, ar.title
      FROM approved_rules ar
      LEFT JOIN grammar_progress gp ON gp.grammar_id = ar.id AND gp.user_id = $1
      WHERE ar.language = $2 AND ar.level = $3
        AND (gp.is_completed IS NULL OR gp.is_completed = false)
      ORDER BY ar.title ASC
      LIMIT 20
    `;

    const grammarGapResult = await this.pool.query<GrammarGapRow>(grammarGapQuery, [
      userId,
      language,
      targetLevel,
    ]);
    const grammarGap = grammarGapResult.rows.map((r) => r.title);

    // Get total grammar gap count
    interface GrammarCountRow {
      count: string;
    }

    const grammarCountQuery = `
      SELECT COUNT(*) as count
      FROM approved_rules ar
      LEFT JOIN grammar_progress gp ON gp.grammar_id = ar.id AND gp.user_id = $1
      WHERE ar.language = $2 AND ar.level = $3
        AND (gp.is_completed IS NULL OR gp.is_completed = false)
    `;

    const grammarCountResult = await this.pool.query<GrammarCountRow>(grammarCountQuery, [
      userId,
      language,
      targetLevel,
    ]);
    const grammarNeeded = parseInt(grammarCountResult.rows[0]?.count || '0');

    // Estimate practice hours (assume 10 words/hour, 5 grammar concepts/hour)
    const estimatedPracticeHours = Math.ceil(vocabularyNeeded / 10 + grammarNeeded / 5);

    return {
      level: targetLevel,
      vocabularyNeeded,
      grammarNeeded,
      vocabularyGap,
      grammarGap,
      estimatedPracticeHours,
    };
  }

  /**
   * Get CEFR overview for all languages
   */
  async getAllLanguagesOverview(userId: string): Promise<CEFROverview[]> {
    // Get all active languages for user
    interface LanguageRow {
      language: string;
    }

    const languagesQuery = `
      SELECT language
      FROM user_languages
      WHERE user_id = $1
    `;

    const languagesResult = await this.pool.query<LanguageRow>(languagesQuery, [userId]);
    const languages = languagesResult.rows.map((r) => r.language);

    const overviews: CEFROverview[] = [];

    for (const language of languages) {
      // Get latest assessment from history
      interface HistoryRow {
        cefr_level: string;
        overall_percentage: string;
        assessed_at: Date;
      }

      const historyQuery = `
        SELECT cefr_level, overall_percentage, assessed_at
        FROM cefr_level_history
        WHERE user_id = $1 AND language = $2
        ORDER BY assessed_at DESC
        LIMIT 1
      `;

      const historyResult = await this.pool.query<HistoryRow>(historyQuery, [userId, language]);

      if (historyResult.rows.length > 0) {
        const row = historyResult.rows[0];
        const currentLevelIndex = this.CEFR_LEVELS.indexOf(row.cefr_level);
        const nextLevel =
          currentLevelIndex < this.CEFR_LEVELS.length - 1
            ? this.CEFR_LEVELS[currentLevelIndex + 1]
            : null;

        // Get progress to next level from level details
        const levelDetails = await this.calculateAllLevelData(userId, language);
        const nextLevelData = nextLevel ? levelDetails.find((ld) => ld.level === nextLevel) : null;
        const progressToNextLevel = nextLevelData ? nextLevelData.overallPercentage : 100;

        const currentLevelData = levelDetails.find((ld) => ld.level === row.cefr_level);
        let status = 'progressing';
        if (!nextLevel) {
          status = 'completed';
        } else if (
          currentLevelData &&
          currentLevelData.overallPercentage >= this.READY_FOR_NEXT_THRESHOLD
        ) {
          status = 'ready';
        }

        overviews.push({
          language,
          currentLevel: row.cefr_level,
          status,
          progressToNextLevel,
          lastAssessed: new Date(row.assessed_at),
        });
      } else {
        // No assessment yet - calculate fresh
        const assessment = await this.assessCEFRLevel(userId, language);
        overviews.push({
          language,
          currentLevel: assessment.currentLevel,
          status: assessment.status,
          progressToNextLevel: assessment.progressToNextLevel,
          lastAssessed: assessment.assessedAt,
        });
      }
    }

    return overviews;
  }
}
