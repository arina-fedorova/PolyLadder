import { Pool } from 'pg';
import {
  DailyStats,
  StreakInfo,
  TimeStats,
  AccuracyTrend,
  StudyPaceAnalysis,
  Badge,
  BadgeCriteria,
  ActivityHeatmapCell,
  StudyOverview,
  PeriodSummary,
} from './study-statistics.interface';

/**
 * Study Statistics Service
 *
 * Tracks and analyzes user study patterns, streaks, achievements.
 * Uses existing tables:
 * - user_review_sessions: Study session tracking
 * - srs_review_history: Individual review records
 * - badges / user_badges: Gamification
 */
export class StudyStatisticsService {
  constructor(private readonly pool: Pool) {}

  /**
   * Get comprehensive study overview
   */
  async getStudyOverview(userId: string, days: number = 30): Promise<StudyOverview> {
    const [streak, timeStats, recentActivity, accuracyTrends, paceAnalysis, badges, heatmap] =
      await Promise.all([
        this.calculateStreak(userId),
        this.getTimeStatistics(userId, days),
        this.getDailyActivity(userId, days),
        this.getAccuracyTrends(userId, days),
        this.analyzeStudyPace(userId, days),
        this.getBadges(userId),
        this.getActivityHeatmap(userId, days),
      ]);

    return {
      userId,
      streak,
      timeStats,
      recentActivity,
      accuracyTrends,
      paceAnalysis,
      badges,
      heatmap,
      analyzedAt: new Date(),
    };
  }

  /**
   * Calculate study streak (consecutive days with ≥1 review)
   */
  async calculateStreak(userId: string): Promise<StreakInfo> {
    interface StreakRow {
      study_date: Date;
    }

    // Get all distinct study days
    const result = await this.pool.query<StreakRow>(
      `SELECT DISTINCT DATE(reviewed_at) as study_date
       FROM srs_review_history
       WHERE user_id = $1
       ORDER BY study_date DESC`,
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        lastStudyDate: null,
        streakStartDate: null,
        isActiveToday: false,
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const studyDays = result.rows.map((r) => {
      const d = new Date(r.study_date);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    });

    const lastStudyDate = new Date(studyDays[0]);
    const isActiveToday = studyDays[0] === today.getTime();

    // Calculate current streak
    let currentStreak = 0;
    let streakStartDate: Date | null = null;
    const oneDayMs = 24 * 60 * 60 * 1000;

    // Check if streak is active (studied today or yesterday)
    const yesterday = today.getTime() - oneDayMs;
    if (studyDays[0] >= yesterday) {
      let expectedDay = isActiveToday ? today.getTime() : yesterday;

      for (const dayTime of studyDays) {
        if (dayTime === expectedDay) {
          currentStreak++;
          streakStartDate = new Date(dayTime);
          expectedDay -= oneDayMs;
        } else if (dayTime < expectedDay) {
          break;
        }
      }
    }

    // Calculate longest streak
    let longestStreak = 0;
    let tempStreak = 1;

    for (let i = 1; i < studyDays.length; i++) {
      const diff = studyDays[i - 1] - studyDays[i];
      if (diff === oneDayMs) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak, currentStreak);

    return {
      currentStreak,
      longestStreak,
      lastStudyDate,
      streakStartDate,
      isActiveToday,
    };
  }

  /**
   * Get time statistics from review sessions
   */
  async getTimeStatistics(userId: string, days: number): Promise<TimeStats> {
    interface TimeRow {
      total_sessions: string;
      total_minutes: string;
      avg_session_minutes: string;
      week_minutes: string;
      month_minutes: string;
      active_days: string;
    }

    const result = await this.pool.query<TimeRow>(
      `WITH session_data AS (
        SELECT
          id,
          EXTRACT(EPOCH FROM (COALESCE(completed_at, last_activity_at) - started_at)) / 60 as duration_minutes,
          started_at
        FROM user_review_sessions
        WHERE user_id = $1
          AND started_at >= NOW() - INTERVAL '${days} days'
          AND status IN ('completed', 'active')
      )
      SELECT
        COUNT(*) as total_sessions,
        COALESCE(SUM(duration_minutes), 0) as total_minutes,
        COALESCE(AVG(duration_minutes), 0) as avg_session_minutes,
        COALESCE(SUM(CASE WHEN started_at >= NOW() - INTERVAL '7 days' THEN duration_minutes ELSE 0 END), 0) as week_minutes,
        COALESCE(SUM(CASE WHEN started_at >= NOW() - INTERVAL '30 days' THEN duration_minutes ELSE 0 END), 0) as month_minutes,
        COUNT(DISTINCT DATE(started_at)) as active_days
      FROM session_data`,
      [userId]
    );

    const row = result.rows[0];
    const totalMinutes = parseFloat(row.total_minutes);
    const activeDays = parseInt(row.active_days);

    return {
      totalMinutes: Math.round(totalMinutes),
      averageSessionMinutes: Math.round(parseFloat(row.avg_session_minutes) * 10) / 10,
      totalSessions: parseInt(row.total_sessions),
      dailyAverage: activeDays > 0 ? Math.round((totalMinutes / activeDays) * 10) / 10 : 0,
      weeklyTotal: Math.round(parseFloat(row.week_minutes)),
      monthlyTotal: Math.round(parseFloat(row.month_minutes)),
    };
  }

  /**
   * Get daily activity breakdown
   */
  async getDailyActivity(userId: string, days: number): Promise<DailyStats[]> {
    interface DailyRow {
      date: Date;
      sessions_completed: string;
      total_minutes: string;
      items_reviewed: string;
      accuracy: string;
      languages: string[];
    }

    const result = await this.pool.query<DailyRow>(
      `WITH daily_reviews AS (
        SELECT
          DATE(reviewed_at) as review_date,
          COUNT(*) as items_reviewed,
          AVG(CASE WHEN rating IN ('good', 'easy') THEN 1.0 ELSE 0.0 END) as accuracy,
          ARRAY_AGG(DISTINCT language) as languages
        FROM srs_review_history
        WHERE user_id = $1
          AND reviewed_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(reviewed_at)
      ),
      daily_sessions AS (
        SELECT
          DATE(started_at) as session_date,
          COUNT(*) as sessions,
          SUM(EXTRACT(EPOCH FROM (COALESCE(completed_at, last_activity_at) - started_at)) / 60) as total_minutes
        FROM user_review_sessions
        WHERE user_id = $1
          AND started_at >= NOW() - INTERVAL '${days} days'
          AND status IN ('completed', 'active')
        GROUP BY DATE(started_at)
      )
      SELECT
        COALESCE(dr.review_date, ds.session_date) as date,
        COALESCE(ds.sessions, 0)::text as sessions_completed,
        COALESCE(ds.total_minutes, 0)::text as total_minutes,
        COALESCE(dr.items_reviewed, 0)::text as items_reviewed,
        COALESCE(dr.accuracy, 0)::text as accuracy,
        COALESCE(dr.languages, ARRAY[]::varchar[]) as languages
      FROM daily_reviews dr
      FULL OUTER JOIN daily_sessions ds ON dr.review_date = ds.session_date
      ORDER BY date DESC`,
      [userId]
    );

    return result.rows.map((row) => ({
      date: new Date(row.date),
      sessionsCompleted: parseInt(row.sessions_completed),
      totalMinutes: Math.round(parseFloat(row.total_minutes)),
      itemsReviewed: parseInt(row.items_reviewed),
      accuracy: Math.round(parseFloat(row.accuracy) * 1000) / 10,
      languagesStudied: row.languages || [],
    }));
  }

  /**
   * Get accuracy trends with moving averages
   */
  async getAccuracyTrends(userId: string, days: number): Promise<AccuracyTrend[]> {
    interface TrendRow {
      date: Date;
      accuracy: string;
      items_reviewed: string;
      moving_avg_7: string;
      moving_avg_30: string;
    }

    const result = await this.pool.query<TrendRow>(
      `WITH daily_accuracy AS (
        SELECT
          DATE(reviewed_at) as date,
          AVG(CASE WHEN rating IN ('good', 'easy') THEN 1.0 ELSE 0.0 END) as accuracy,
          COUNT(*) as items_reviewed
        FROM srs_review_history
        WHERE user_id = $1
          AND reviewed_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(reviewed_at)
        ORDER BY date ASC
      )
      SELECT
        date,
        accuracy::text,
        items_reviewed::text,
        AVG(accuracy) OVER (
          ORDER BY date
          ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        )::text as moving_avg_7,
        AVG(accuracy) OVER (
          ORDER BY date
          ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
        )::text as moving_avg_30
      FROM daily_accuracy
      ORDER BY date ASC`,
      [userId]
    );

    return result.rows.map((row) => ({
      date: new Date(row.date),
      accuracy: Math.round(parseFloat(row.accuracy) * 1000) / 10,
      movingAverage7Day: Math.round(parseFloat(row.moving_avg_7) * 1000) / 10,
      movingAverage30Day: Math.round(parseFloat(row.moving_avg_30) * 1000) / 10,
      itemsReviewed: parseInt(row.items_reviewed),
    }));
  }

  /**
   * Analyze study pace patterns
   */
  async analyzeStudyPace(userId: string, days: number): Promise<StudyPaceAnalysis> {
    interface ActivityRow {
      active_days: string;
      avg_sessions_per_day: string;
      longest_gap: string | null;
    }

    interface TimeDistRow {
      morning: string;
      afternoon: string;
      evening: string;
      night: string;
    }

    const activityResult = await this.pool.query<ActivityRow>(
      `WITH active_days AS (
        SELECT
          DATE(started_at) as study_date,
          COUNT(*) as sessions_that_day
        FROM user_review_sessions
        WHERE user_id = $1
          AND started_at >= NOW() - INTERVAL '${days} days'
          AND status IN ('completed', 'active')
        GROUP BY DATE(started_at)
      ),
      gaps AS (
        SELECT
          study_date - LAG(study_date) OVER (ORDER BY study_date) as gap_days
        FROM active_days
      )
      SELECT
        COUNT(DISTINCT study_date)::text as active_days,
        AVG(sessions_that_day)::text as avg_sessions_per_day,
        MAX(gap_days)::text as longest_gap
      FROM active_days
      LEFT JOIN gaps ON true`,
      [userId]
    );

    const timeDistResult = await this.pool.query<TimeDistRow>(
      `WITH session_times AS (
        SELECT
          EXTRACT(HOUR FROM started_at) as hour,
          EXTRACT(EPOCH FROM (COALESCE(completed_at, last_activity_at) - started_at)) / 60 as duration
        FROM user_review_sessions
        WHERE user_id = $1
          AND started_at >= NOW() - INTERVAL '${days} days'
          AND status IN ('completed', 'active')
      )
      SELECT
        COALESCE(SUM(CASE WHEN hour >= 6 AND hour < 12 THEN duration ELSE 0 END), 0)::text as morning,
        COALESCE(SUM(CASE WHEN hour >= 12 AND hour < 18 THEN duration ELSE 0 END), 0)::text as afternoon,
        COALESCE(SUM(CASE WHEN hour >= 18 AND hour < 24 THEN duration ELSE 0 END), 0)::text as evening,
        COALESCE(SUM(CASE WHEN hour >= 0 AND hour < 6 THEN duration ELSE 0 END), 0)::text as night
      FROM session_times`,
      [userId]
    );

    const activeDays = parseInt(activityResult.rows[0]?.active_days || '0');
    const avgSessionsPerDay = parseFloat(activityResult.rows[0]?.avg_sessions_per_day || '0');
    const longestGap = parseInt(activityResult.rows[0]?.longest_gap || '0');
    const activeDaysPerWeek = (activeDays / days) * 7;

    // Determine pattern
    let pattern: 'consistent' | 'bursty' | 'irregular';
    if (activeDaysPerWeek >= 5 && avgSessionsPerDay <= 2) {
      pattern = 'consistent';
    } else if (activeDaysPerWeek < 3 && avgSessionsPerDay > 3) {
      pattern = 'bursty';
    } else {
      pattern = 'irregular';
    }

    return {
      pattern,
      activeDaysPerWeek: Math.round(activeDaysPerWeek * 10) / 10,
      averageSessionsPerActiveDay: Math.round(avgSessionsPerDay * 10) / 10,
      longestGapDays: longestGap,
      studyTimeDistribution: {
        morning: Math.round(parseFloat(timeDistResult.rows[0]?.morning || '0')),
        afternoon: Math.round(parseFloat(timeDistResult.rows[0]?.afternoon || '0')),
        evening: Math.round(parseFloat(timeDistResult.rows[0]?.evening || '0')),
        night: Math.round(parseFloat(timeDistResult.rows[0]?.night || '0')),
      },
    };
  }

  /**
   * Get user's badges (unlocked and in-progress)
   */
  async getBadges(userId: string): Promise<Badge[]> {
    interface UnlockedRow {
      id: string;
      name: string;
      description: string;
      icon_url: string | null;
      category: 'streak' | 'volume' | 'accuracy' | 'milestone';
      unlocked_at: Date;
    }

    interface AvailableRow {
      id: string;
      name: string;
      description: string;
      icon_url: string | null;
      category: 'streak' | 'volume' | 'accuracy' | 'milestone';
      criteria: BadgeCriteria;
    }

    // Get unlocked badges
    const unlockedResult = await this.pool.query<UnlockedRow>(
      `SELECT b.id, b.name, b.description, b.icon_url, b.category, ub.unlocked_at
       FROM user_badges ub
       JOIN badges b ON b.id = ub.badge_id
       WHERE ub.user_id = $1
       ORDER BY ub.unlocked_at DESC`,
      [userId]
    );

    const unlocked: Badge[] = unlockedResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      iconUrl: row.icon_url,
      category: row.category,
      unlockedAt: new Date(row.unlocked_at),
    }));

    // Get available (not yet unlocked) badges
    const availableResult = await this.pool.query<AvailableRow>(
      `SELECT id, name, description, icon_url, category, criteria
       FROM badges
       WHERE id NOT IN (SELECT badge_id FROM user_badges WHERE user_id = $1)`,
      [userId]
    );

    // Calculate progress for each available badge
    const available: Badge[] = await Promise.all(
      availableResult.rows.map(async (row) => {
        const { current, target } = await this.calculateBadgeProgress(userId, row.criteria);
        return {
          id: row.id,
          name: row.name,
          description: row.description,
          iconUrl: row.icon_url,
          category: row.category,
          progress: current,
          target,
        };
      })
    );

    return [...unlocked, ...available];
  }

  /**
   * Calculate progress toward a badge
   */
  private async calculateBadgeProgress(
    userId: string,
    criteria: BadgeCriteria
  ): Promise<{ current: number; target: number }> {
    let current = 0;
    const { type, target } = criteria;

    switch (type) {
      case 'streak': {
        const streakInfo = await this.calculateStreak(userId);
        current = streakInfo.currentStreak;
        break;
      }
      case 'words_learned': {
        const wordsResult = await this.pool.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM user_word_state WHERE user_id = $1 AND state = 'known'`,
          [userId]
        );
        current = parseInt(wordsResult.rows[0]?.count || '0');
        break;
      }
      case 'total_reviews': {
        const reviewsResult = await this.pool.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM srs_review_history WHERE user_id = $1`,
          [userId]
        );
        current = parseInt(reviewsResult.rows[0]?.count || '0');
        break;
      }
      case 'perfect_sessions': {
        const perfectResult = await this.pool.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM user_review_sessions
           WHERE user_id = $1 AND items_reviewed > 0
           AND correct_count = items_reviewed`,
          [userId]
        );
        current = parseInt(perfectResult.rows[0]?.count || '0');
        break;
      }
    }

    return { current, target };
  }

  /**
   * Get activity heatmap data
   */
  async getActivityHeatmap(userId: string, days: number): Promise<ActivityHeatmapCell[]> {
    interface HeatmapRow {
      date: Date;
      items_reviewed: string;
      total_minutes: string;
    }

    const result = await this.pool.query<HeatmapRow>(
      `WITH daily_data AS (
        SELECT
          DATE(reviewed_at) as date,
          COUNT(*) as items_reviewed
        FROM srs_review_history
        WHERE user_id = $1
          AND reviewed_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(reviewed_at)
      ),
      session_data AS (
        SELECT
          DATE(started_at) as date,
          SUM(EXTRACT(EPOCH FROM (COALESCE(completed_at, last_activity_at) - started_at)) / 60) as total_minutes
        FROM user_review_sessions
        WHERE user_id = $1
          AND started_at >= NOW() - INTERVAL '${days} days'
          AND status IN ('completed', 'active')
        GROUP BY DATE(started_at)
      )
      SELECT
        COALESCE(d.date, s.date) as date,
        COALESCE(d.items_reviewed, 0)::text as items_reviewed,
        COALESCE(s.total_minutes, 0)::text as total_minutes
      FROM daily_data d
      FULL OUTER JOIN session_data s ON d.date = s.date
      ORDER BY date ASC`,
      [userId]
    );

    // Calculate max values for intensity normalization
    const maxItems = Math.max(...result.rows.map((r) => parseInt(r.items_reviewed)), 1);

    return result.rows.map((row) => {
      const itemsReviewed = parseInt(row.items_reviewed);
      return {
        date: new Date(row.date),
        itemsReviewed,
        totalMinutes: Math.round(parseFloat(row.total_minutes)),
        intensity: Math.min(itemsReviewed / maxItems, 1),
      };
    });
  }

  /**
   * Get weekly or monthly summary
   */
  async getPeriodSummary(userId: string, period: 'week' | 'month'): Promise<PeriodSummary> {
    const days = period === 'week' ? 7 : 30;
    const overview = await this.getStudyOverview(userId, days);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const newBadges = overview.badges.filter((b) => b.unlockedAt && b.unlockedAt >= startDate);

    const totalItemsReviewed = overview.recentActivity.reduce(
      (sum, day) => sum + day.itemsReviewed,
      0
    );

    const accuracySum = overview.recentActivity.reduce(
      (sum, day) => sum + (day.itemsReviewed > 0 ? day.accuracy : 0),
      0
    );
    const daysWithActivity = overview.recentActivity.filter((day) => day.itemsReviewed > 0).length;

    return {
      period,
      startDate,
      endDate,
      totalMinutes:
        period === 'week' ? overview.timeStats.weeklyTotal : overview.timeStats.monthlyTotal,
      totalSessions: overview.timeStats.totalSessions,
      totalItemsReviewed,
      averageAccuracy:
        daysWithActivity > 0 ? Math.round((accuracySum / daysWithActivity) * 10) / 10 : 0,
      activeDays: daysWithActivity,
      newBadges,
    };
  }

  /**
   * Check and unlock eligible badges after activity
   */
  async checkBadgeUnlocks(userId: string): Promise<Badge[]> {
    const badges = await this.getBadges(userId);
    const newlyUnlocked: Badge[] = [];

    for (const badge of badges) {
      if (
        !badge.unlockedAt &&
        badge.progress !== undefined &&
        badge.target !== undefined &&
        badge.progress >= badge.target
      ) {
        // Unlock badge
        await this.pool.query(
          `INSERT INTO user_badges (user_id, badge_id, unlocked_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (user_id, badge_id) DO NOTHING`,
          [userId, badge.id]
        );
        newlyUnlocked.push({
          ...badge,
          unlockedAt: new Date(),
        });
      }
    }

    return newlyUnlocked;
  }
}
