import { Pool } from 'pg';
import {
  FocusModeSettings,
  FocusModeStats,
  FocusModeHistoryEntry,
  FocusModeAction,
} from './focus-mode.interface';

/**
 * Error thrown when focus mode operations fail
 */
export class FocusModeError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'FocusModeError';
    this.statusCode = statusCode;
  }
}

/**
 * FocusModeService manages focus mode settings for intensive single-language practice
 */
export class FocusModeService {
  constructor(private readonly pool: Pool) {}

  /**
   * Get focus mode settings for user
   */
  async getFocusModeSettings(userId: string): Promise<FocusModeSettings> {
    interface PreferencesRow {
      focus_mode_enabled: boolean;
      focus_language: string | null;
      focus_activated_at: Date | null;
      focus_last_toggled: Date | null;
    }

    const result = await this.pool.query<PreferencesRow>(
      `SELECT
         focus_mode_enabled,
         focus_language,
         focus_activated_at,
         focus_last_toggled
       FROM user_preferences
       WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new FocusModeError('User preferences not found', 404);
    }

    const row = result.rows[0];

    return {
      userId,
      enabled: row.focus_mode_enabled || false,
      focusLanguage: row.focus_language || null,
      activatedAt: row.focus_activated_at ? new Date(row.focus_activated_at) : null,
      lastToggled: row.focus_last_toggled ? new Date(row.focus_last_toggled) : null,
    };
  }

  /**
   * Enable focus mode for a specific language
   */
  async enableFocusMode(userId: string, language: string): Promise<FocusModeSettings> {
    // Verify user is learning this language
    const languageCheck = await this.pool.query<{ language: string }>(
      `SELECT language FROM user_languages
       WHERE user_id = $1 AND language = $2`,
      [userId, language]
    );

    if (languageCheck.rows.length === 0) {
      throw new FocusModeError(`User is not learning ${language}`);
    }

    interface UpdateRow {
      focus_mode_enabled: boolean;
      focus_language: string | null;
      focus_activated_at: Date;
      focus_last_toggled: Date;
    }

    // Enable focus mode
    const result = await this.pool.query<UpdateRow>(
      `UPDATE user_preferences
       SET
         focus_mode_enabled = true,
         focus_language = $2,
         focus_activated_at = NOW(),
         focus_last_toggled = NOW()
       WHERE user_id = $1
       RETURNING
         focus_mode_enabled,
         focus_language,
         focus_activated_at,
         focus_last_toggled`,
      [userId, language]
    );

    if (result.rows.length === 0) {
      throw new FocusModeError('User preferences not found', 404);
    }

    const row = result.rows[0];

    // Log focus mode activation
    await this.logFocusModeAction(userId, language, 'enabled');

    return {
      userId,
      enabled: row.focus_mode_enabled,
      focusLanguage: row.focus_language,
      activatedAt: new Date(row.focus_activated_at),
      lastToggled: new Date(row.focus_last_toggled),
    };
  }

  /**
   * Disable focus mode (return to parallel learning)
   */
  async disableFocusMode(userId: string): Promise<FocusModeSettings> {
    interface UpdateRow {
      focus_mode_enabled: boolean;
      focus_language: string | null;
      focus_activated_at: Date | null;
      focus_last_toggled: Date;
    }

    const result = await this.pool.query<UpdateRow>(
      `UPDATE user_preferences
       SET
         focus_mode_enabled = false,
         focus_last_toggled = NOW()
       WHERE user_id = $1
       RETURNING
         focus_mode_enabled,
         focus_language,
         focus_activated_at,
         focus_last_toggled`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new FocusModeError('User preferences not found', 404);
    }

    const row = result.rows[0];

    // Log focus mode deactivation
    if (row.focus_language) {
      await this.logFocusModeAction(userId, row.focus_language, 'disabled');
    }

    return {
      userId,
      enabled: row.focus_mode_enabled,
      focusLanguage: row.focus_language,
      activatedAt: row.focus_activated_at ? new Date(row.focus_activated_at) : null,
      lastToggled: new Date(row.focus_last_toggled),
    };
  }

  /**
   * Switch focus language (keeps focus mode enabled)
   */
  async switchFocusLanguage(userId: string, newLanguage: string): Promise<FocusModeSettings> {
    // Verify user is learning the new language
    const languageCheck = await this.pool.query<{ language: string }>(
      `SELECT language FROM user_languages
       WHERE user_id = $1 AND language = $2`,
      [userId, newLanguage]
    );

    if (languageCheck.rows.length === 0) {
      throw new FocusModeError(`User is not learning ${newLanguage}`);
    }

    // Get current focus language for history
    const currentSettings = await this.getFocusModeSettings(userId);

    if (!currentSettings.enabled) {
      throw new FocusModeError('Focus mode is not enabled');
    }

    interface UpdateRow {
      focus_mode_enabled: boolean;
      focus_language: string | null;
      focus_activated_at: Date;
      focus_last_toggled: Date;
    }

    // Update focus language
    const result = await this.pool.query<UpdateRow>(
      `UPDATE user_preferences
       SET
         focus_language = $2,
         focus_activated_at = NOW(),
         focus_last_toggled = NOW()
       WHERE user_id = $1
       RETURNING
         focus_mode_enabled,
         focus_language,
         focus_activated_at,
         focus_last_toggled`,
      [userId, newLanguage]
    );

    const row = result.rows[0];

    // Log language switch with previous language in metadata
    await this.logFocusModeAction(userId, newLanguage, 'switched', {
      from: currentSettings.focusLanguage || undefined,
    });

    return {
      userId,
      enabled: row.focus_mode_enabled,
      focusLanguage: row.focus_language,
      activatedAt: new Date(row.focus_activated_at),
      lastToggled: new Date(row.focus_last_toggled),
    };
  }

  /**
   * Apply focus mode filter to a language list
   * Returns filtered list if focus mode is enabled, otherwise returns original list
   */
  async applyFocusFilter(userId: string, languages: string[]): Promise<string[]> {
    const settings = await this.getFocusModeSettings(userId);

    if (!settings.enabled || !settings.focusLanguage) {
      return languages;
    }

    // Filter to only focus language if it's in the list
    if (languages.includes(settings.focusLanguage)) {
      return [settings.focusLanguage];
    }

    // Focus language not in provided list - return empty
    return [];
  }

  /**
   * Get focus mode statistics
   */
  async getFocusModeStats(userId: string): Promise<FocusModeStats> {
    // Total focus sessions (distinct days with enabled action)
    interface CountRow {
      total: string;
    }

    const totalSessionsResult = await this.pool.query<CountRow>(
      `SELECT COUNT(DISTINCT DATE(created_at)) as total
       FROM focus_mode_history
       WHERE user_id = $1 AND action = 'enabled'`,
      [userId]
    );

    // Current streak (consecutive days with focus mode enabled)
    interface StreakRow {
      current_streak: string;
    }

    const streakResult = await this.pool.query<StreakRow>(
      `WITH focus_days AS (
         SELECT DISTINCT DATE(created_at) as focus_date
         FROM focus_mode_history
         WHERE user_id = $1 AND action = 'enabled'
         ORDER BY focus_date DESC
       ),
       streaks AS (
         SELECT
           focus_date,
           focus_date - (ROW_NUMBER() OVER (ORDER BY focus_date))::int AS streak_group
         FROM focus_days
       )
       SELECT COUNT(*) as current_streak
       FROM streaks
       WHERE streak_group = (
         SELECT streak_group FROM streaks ORDER BY focus_date DESC LIMIT 1
       )`,
      [userId]
    );

    // Longest streak
    interface LongestStreakRow {
      longest_streak: string;
    }

    const longestStreakResult = await this.pool.query<LongestStreakRow>(
      `WITH focus_days AS (
         SELECT DISTINCT DATE(created_at) as focus_date
         FROM focus_mode_history
         WHERE user_id = $1 AND action = 'enabled'
         ORDER BY focus_date
       ),
       streaks AS (
         SELECT
           focus_date,
           focus_date - (ROW_NUMBER() OVER (ORDER BY focus_date))::int AS streak_group
         FROM focus_days
       ),
       streak_counts AS (
         SELECT streak_group, COUNT(*) as streak_length
         FROM streaks
         GROUP BY streak_group
       )
       SELECT COALESCE(MAX(streak_length), 0) as longest_streak
       FROM streak_counts`,
      [userId]
    );

    // Total focused minutes (approximation based on exercise results during focus mode)
    interface MinutesRow {
      total_minutes: string;
    }

    const focusedMinutesResult = await this.pool.query<MinutesRow>(
      `SELECT COALESCE(SUM(time_spent_ms), 0) / 60000 as total_minutes
       FROM user_exercise_results uer
       WHERE uer.user_id = $1
         AND EXISTS (
           SELECT 1 FROM user_preferences up
           WHERE up.user_id = uer.user_id
             AND up.focus_mode_enabled = true
             AND uer.submitted_at >= up.focus_activated_at
         )`,
      [userId]
    );

    // Language breakdown
    interface LanguageBreakdownRow {
      language: string;
      sessions_count: string;
      minutes_practiced: string;
    }

    const languageBreakdownResult = await this.pool.query<LanguageBreakdownRow>(
      `SELECT
         fmh.language,
         COUNT(DISTINCT DATE(fmh.created_at)) as sessions_count,
         COALESCE(SUM(uer.time_spent_ms), 0) / 60000 as minutes_practiced
       FROM focus_mode_history fmh
       LEFT JOIN user_exercise_results uer ON uer.user_id = fmh.user_id
         AND uer.language = fmh.language
         AND uer.submitted_at >= fmh.created_at
         AND uer.submitted_at < COALESCE(
           (SELECT created_at FROM focus_mode_history
            WHERE user_id = fmh.user_id
              AND created_at > fmh.created_at
              AND action IN ('disabled', 'switched')
            ORDER BY created_at ASC
            LIMIT 1),
           NOW()
         )
       WHERE fmh.user_id = $1 AND fmh.action = 'enabled'
       GROUP BY fmh.language
       ORDER BY sessions_count DESC`,
      [userId]
    );

    return {
      totalFocusSessions: parseInt(totalSessionsResult.rows[0]?.total || '0'),
      currentStreak: parseInt(streakResult.rows[0]?.current_streak || '0'),
      longestStreak: parseInt(longestStreakResult.rows[0]?.longest_streak || '0'),
      totalFocusedMinutes: parseFloat(focusedMinutesResult.rows[0]?.total_minutes || '0'),
      languageBreakdown: languageBreakdownResult.rows.map((r) => ({
        language: r.language,
        sessionsCount: parseInt(r.sessions_count),
        minutesPracticed: parseFloat(r.minutes_practiced),
      })),
    };
  }

  /**
   * Get focus mode history
   */
  async getFocusModeHistory(userId: string, limit: number = 30): Promise<FocusModeHistoryEntry[]> {
    interface HistoryRow {
      language: string;
      action: FocusModeAction;
      created_at: Date;
      metadata: Record<string, unknown> | null;
    }

    const result = await this.pool.query<HistoryRow>(
      `SELECT language, action, created_at, metadata
       FROM focus_mode_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map((r) => ({
      language: r.language,
      action: r.action,
      timestamp: new Date(r.created_at),
      metadata: r.metadata || undefined,
    }));
  }

  /**
   * Check if focus mode is enabled for user
   */
  async isFocusModeEnabled(userId: string): Promise<boolean> {
    const settings = await this.getFocusModeSettings(userId);
    return settings.enabled;
  }

  /**
   * Get current focus language (or null if not in focus mode)
   */
  async getCurrentFocusLanguage(userId: string): Promise<string | null> {
    const settings = await this.getFocusModeSettings(userId);
    return settings.enabled ? settings.focusLanguage : null;
  }

  /**
   * Log focus mode action to history
   */
  private async logFocusModeAction(
    userId: string,
    language: string,
    action: FocusModeAction,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO focus_mode_history (user_id, language, action, metadata, created_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [userId, language, action, metadata ? JSON.stringify(metadata) : null]
    );
  }
}
