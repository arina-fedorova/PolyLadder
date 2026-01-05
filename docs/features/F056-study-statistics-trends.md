# F056: Study Statistics & Trends

**Feature Code**: F056
**Created**: 2025-12-17
**Phase**: 15 - Progress Tracking & Analytics
**Status**: Completed

---

## Description

Implement comprehensive study statistics dashboard with charts showing daily/weekly/monthly trends, streak tracking, time-on-task analytics, and gamification elements including badges and milestones.

## Success Criteria

- [x] Daily study streak tracker with longest streak record
- [x] Time spent learning tracked per day/week/month
- [x] Items reviewed per session with daily/weekly trends
- [x] Accuracy trends over time with moving averages
- [x] Weekly/monthly summary reports
- [x] Gamification elements (badges, milestones, achievements)
- [x] Activity heatmap calendar view
- [x] Study pace analytics (consistent vs bursty learning patterns)

## Implementation Summary

### Commits

1. `e84d366` - Migration for badges and user_badges tables
2. `bddbb4c` - StudyStatisticsService with 22 unit tests
3. `5099eb5` - Statistics API routes with TypeBox schemas (10 endpoints)
4. `52a85a2` - StatisticsDashboard frontend component
5. `2b4cb66` - Integration tests (35 tests)

### Files Created/Modified

- `packages/db/src/migrations/047_create_badges.ts` - Badge tables
- `packages/api/src/services/analytics/study-statistics.interface.ts` - Type definitions
- `packages/api/src/services/analytics/study-statistics.service.ts` - Core service
- `packages/api/src/routes/analytics/statistics.ts` - REST API endpoints
- `packages/web/src/components/analytics/StatisticsDashboard.tsx` - Frontend dashboard
- `packages/web/src/api/analytics.ts` - API client functions
- `packages/api/tests/unit/services/analytics/study-statistics.service.test.ts` - Unit tests
- `packages/api/tests/integration/statistics-analytics.test.ts` - Integration tests

### API Endpoints

- `GET /analytics/statistics/overview` - Comprehensive study overview
- `GET /analytics/statistics/streak` - Current/longest streak info
- `GET /analytics/statistics/time` - Time statistics
- `GET /analytics/statistics/activity` - Daily activity breakdown
- `GET /analytics/statistics/accuracy` - Accuracy trends with moving averages
- `GET /analytics/statistics/pace` - Study pace analysis
- `GET /analytics/statistics/badges` - User badges (unlocked + in-progress)
- `GET /analytics/statistics/heatmap` - Activity heatmap data
- `GET /analytics/statistics/summary` - Weekly/monthly summary
- `POST /analytics/statistics/badges/check` - Check and unlock badges

---

## Tasks

### Task 1: Implement Study Statistics Service

**File**: `packages/api/src/services/analytics/study-statistics.service.ts`

Create a comprehensive service for tracking and analyzing study statistics, streaks, and achievements.

```typescript
import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

/**
 * Study Statistics Service
 *
 * Tracks and analyzes:
 * 1. Daily study streaks (consecutive days with ≥1 review)
 * 2. Time spent learning (sum of session durations)
 * 3. Items reviewed (vocabulary + grammar + other)
 * 4. Accuracy trends (7-day and 30-day moving averages)
 * 5. Study pace patterns (consistent vs bursty)
 * 6. Achievements and badges (milestones)
 */

interface StudySession {
  sessionId: string;
  userId: string;
  language: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  itemsReviewed: number;
  correctAnswers: number;
  accuracy: number;
}

interface DailyStats {
  date: Date;
  sessionsCompleted: number;
  totalMinutes: number;
  itemsReviewed: number;
  accuracy: number;
  languagesStudied: string[];
}

interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: Date;
  streakStartDate: Date;
  isActiveToday: boolean;
}

interface TimeStats {
  totalMinutes: number;
  averageSessionMinutes: number;
  totalSessions: number;
  dailyAverage: number;
  weeklyTotal: number;
  monthlyTotal: number;
}

interface AccuracyTrend {
  date: Date;
  accuracy: number;
  movingAverage7Day: number;
  movingAverage30Day: number;
  itemsReviewed: number;
}

interface StudyPaceAnalysis {
  pattern: 'consistent' | 'bursty' | 'irregular';
  activeDaysPerWeek: number;
  averageSessionsPerActiveDay: number;
  longestGapDays: number;
  studyTimeDistribution: {
    morning: number; // 6-12
    afternoon: number; // 12-18
    evening: number; // 18-24
    night: number; // 0-6
  };
}

interface Badge {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  category: 'streak' | 'volume' | 'accuracy' | 'milestone';
  unlockedAt?: Date;
  progress?: number;
  target?: number;
}

interface StudyOverview {
  userId: string;
  streak: StreakInfo;
  timeStats: TimeStats;
  recentActivity: DailyStats[];
  accuracyTrends: AccuracyTrend[];
  paceAnalysis: StudyPaceAnalysis;
  badges: Badge[];
  analyzedAt: Date;
}

export class StudyStatisticsService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Get comprehensive study overview
   */
  async getStudyOverview(userId: string, days: number = 30): Promise<StudyOverview> {
    const client = await this.pool.connect();

    try {
      const [streak, timeStats, recentActivity, accuracyTrends, paceAnalysis, badges] =
        await Promise.all([
          this.calculateStreak(client, userId),
          this.getTimeStatistics(client, userId, days),
          this.getDailyActivity(client, userId, days),
          this.getAccuracyTrends(client, userId, days),
          this.analyzeStudyPace(client, userId, days),
          this.getBadges(client, userId),
        ]);

      return {
        userId,
        streak,
        timeStats,
        recentActivity,
        accuracyTrends,
        paceAnalysis,
        badges,
        analyzedAt: new Date(),
      };
    } finally {
      client.release();
    }
  }

  /**
   * Calculate study streak (consecutive days with ≥1 review)
   */
  private async calculateStreak(client: PoolClient, userId: string): Promise<StreakInfo> {
    const query = `
      WITH study_days AS (
        SELECT DISTINCT DATE(created_at) as study_date
        FROM srs_reviews
        WHERE user_id = $1
        ORDER BY study_date DESC
      ),
      streak_groups AS (
        SELECT
          study_date,
          study_date - (ROW_NUMBER() OVER (ORDER BY study_date))::int AS streak_group
        FROM study_days
      ),
      current_streak_calc AS (
        SELECT
          COUNT(*) as streak_length,
          MIN(study_date) as streak_start,
          MAX(study_date) as streak_end
        FROM streak_groups
        WHERE streak_group = (
          SELECT streak_group
          FROM streak_groups
          ORDER BY study_date DESC
          LIMIT 1
        )
      ),
      all_streaks AS (
        SELECT
          streak_group,
          COUNT(*) as streak_length,
          MIN(study_date) as streak_start,
          MAX(study_date) as streak_end
        FROM streak_groups
        GROUP BY streak_group
      )
      SELECT
        COALESCE(cs.streak_length, 0) as current_streak,
        COALESCE(cs.streak_start, NOW()::date) as streak_start_date,
        COALESCE(cs.streak_end, NOW()::date) as last_study_date,
        COALESCE(MAX(alls.streak_length), 0) as longest_streak
      FROM current_streak_calc cs
      CROSS JOIN all_streaks alls
      GROUP BY cs.streak_length, cs.streak_start, cs.streak_end
    `;

    const result = await client.query(query, [userId]);

    if (result.rows.length === 0) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        lastStudyDate: new Date(),
        streakStartDate: new Date(),
        isActiveToday: false,
      };
    }

    const row = result.rows[0];
    const lastStudyDate = new Date(row.last_study_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isActiveToday = lastStudyDate.toDateString() === today.toDateString();

    return {
      currentStreak: parseInt(row.current_streak),
      longestStreak: parseInt(row.longest_streak),
      lastStudyDate,
      streakStartDate: new Date(row.streak_start_date),
      isActiveToday,
    };
  }

  /**
   * Get time statistics for study sessions
   */
  private async getTimeStatistics(
    client: PoolClient,
    userId: string,
    days: number
  ): Promise<TimeStats> {
    const query = `
      WITH session_stats AS (
        SELECT
          COUNT(*) as total_sessions,
          SUM(duration_minutes) as total_minutes,
          AVG(duration_minutes) as avg_session_minutes,
          SUM(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN duration_minutes ELSE 0 END) as week_minutes,
          SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN duration_minutes ELSE 0 END) as month_minutes,
          COUNT(DISTINCT DATE(created_at)) as active_days
        FROM study_sessions
        WHERE user_id = $1
          AND created_at >= NOW() - INTERVAL '${days} days'
      )
      SELECT
        COALESCE(total_sessions, 0) as total_sessions,
        COALESCE(total_minutes, 0) as total_minutes,
        COALESCE(avg_session_minutes, 0) as avg_session_minutes,
        COALESCE(week_minutes, 0) as week_minutes,
        COALESCE(month_minutes, 0) as month_minutes,
        CASE WHEN active_days > 0 THEN total_minutes::float / active_days ELSE 0 END as daily_avg
      FROM session_stats
    `;

    const result = await client.query(query, [userId]);
    const row = result.rows[0];

    return {
      totalMinutes: parseFloat(row.total_minutes),
      averageSessionMinutes: Math.round(parseFloat(row.avg_session_minutes) * 10) / 10,
      totalSessions: parseInt(row.total_sessions),
      dailyAverage: Math.round(parseFloat(row.daily_avg) * 10) / 10,
      weeklyTotal: parseFloat(row.week_minutes),
      monthlyTotal: parseFloat(row.month_minutes),
    };
  }

  /**
   * Get daily activity breakdown
   */
  private async getDailyActivity(
    client: PoolClient,
    userId: string,
    days: number
  ): Promise<DailyStats[]> {
    const query = `
      WITH daily_reviews AS (
        SELECT
          DATE(sr.created_at) as review_date,
          COUNT(*) as items_reviewed,
          AVG(CASE WHEN sr.quality >= 3 THEN 1.0 ELSE 0.0 END) as accuracy,
          ARRAY_AGG(DISTINCT si.language) as languages
        FROM srs_reviews sr
        JOIN srs_items si ON si.item_id = sr.item_id AND si.user_id = sr.user_id
        WHERE sr.user_id = $1
          AND sr.created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(sr.created_at)
      ),
      daily_sessions AS (
        SELECT
          DATE(created_at) as session_date,
          COUNT(*) as sessions,
          SUM(duration_minutes) as total_minutes
        FROM study_sessions
        WHERE user_id = $1
          AND created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(created_at)
      )
      SELECT
        COALESCE(dr.review_date, ds.session_date) as date,
        COALESCE(ds.sessions, 0) as sessions_completed,
        COALESCE(ds.total_minutes, 0) as total_minutes,
        COALESCE(dr.items_reviewed, 0) as items_reviewed,
        COALESCE(dr.accuracy, 0) as accuracy,
        COALESCE(dr.languages, ARRAY[]::varchar[]) as languages_studied
      FROM daily_reviews dr
      FULL OUTER JOIN daily_sessions ds ON dr.review_date = ds.session_date
      ORDER BY date DESC
    `;

    const result = await client.query(query, [userId]);

    return result.rows.map((row) => ({
      date: new Date(row.date),
      sessionsCompleted: parseInt(row.sessions_completed),
      totalMinutes: parseFloat(row.total_minutes),
      itemsReviewed: parseInt(row.items_reviewed),
      accuracy: Math.round(parseFloat(row.accuracy) * 1000) / 10,
      languagesStudied: row.languages_studied,
    }));
  }

  /**
   * Get accuracy trends with moving averages
   */
  private async getAccuracyTrends(
    client: PoolClient,
    userId: string,
    days: number
  ): Promise<AccuracyTrend[]> {
    const query = `
      WITH daily_accuracy AS (
        SELECT
          DATE(created_at) as date,
          AVG(CASE WHEN quality >= 3 THEN 1.0 ELSE 0.0 END) as accuracy,
          COUNT(*) as items_reviewed
        FROM srs_reviews
        WHERE user_id = $1
          AND created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      )
      SELECT
        date,
        accuracy,
        items_reviewed,
        AVG(accuracy) OVER (
          ORDER BY date
          ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        ) as moving_avg_7,
        AVG(accuracy) OVER (
          ORDER BY date
          ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
        ) as moving_avg_30
      FROM daily_accuracy
      ORDER BY date ASC
    `;

    const result = await client.query(query, [userId]);

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
  private async analyzeStudyPace(
    client: PoolClient,
    userId: string,
    days: number
  ): Promise<StudyPaceAnalysis> {
    // Activity pattern query
    const activityQuery = `
      WITH active_days AS (
        SELECT
          DATE(created_at) as study_date,
          COUNT(*) as sessions_that_day
        FROM study_sessions
        WHERE user_id = $1
          AND created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(created_at)
      ),
      gaps AS (
        SELECT
          study_date,
          LAG(study_date) OVER (ORDER BY study_date) as prev_date,
          study_date - LAG(study_date) OVER (ORDER BY study_date) as gap_days
        FROM active_days
      )
      SELECT
        COUNT(DISTINCT study_date) as active_days,
        AVG(sessions_that_day) as avg_sessions_per_day,
        MAX(gap_days) as longest_gap
      FROM active_days
      LEFT JOIN gaps ON active_days.study_date = gaps.study_date
    `;

    // Time of day distribution
    const timeDistQuery = `
      SELECT
        SUM(CASE WHEN EXTRACT(HOUR FROM created_at) BETWEEN 6 AND 11 THEN duration_minutes ELSE 0 END) as morning,
        SUM(CASE WHEN EXTRACT(HOUR FROM created_at) BETWEEN 12 AND 17 THEN duration_minutes ELSE 0 END) as afternoon,
        SUM(CASE WHEN EXTRACT(HOUR FROM created_at) BETWEEN 18 AND 23 THEN duration_minutes ELSE 0 END) as evening,
        SUM(CASE WHEN EXTRACT(HOUR FROM created_at) BETWEEN 0 AND 5 THEN duration_minutes ELSE 0 END) as night
      FROM study_sessions
      WHERE user_id = $1
        AND created_at >= NOW() - INTERVAL '${days} days'
    `;

    const [activityResult, timeDistResult] = await Promise.all([
      client.query(activityQuery, [userId]),
      client.query(timeDistQuery, [userId]),
    ]);

    const activeDays = parseInt(activityResult.rows[0]?.active_days || '0');
    const avgSessionsPerDay = parseFloat(activityResult.rows[0]?.avg_sessions_per_day || '0');
    const longestGap = parseInt(activityResult.rows[0]?.longest_gap || '0');

    const activeDaysPerWeek = (activeDays / days) * 7;

    // Determine pattern
    let pattern: 'consistent' | 'bursty' | 'irregular';
    if (activeDaysPerWeek >= 5 && avgSessionsPerDay <= 2) {
      pattern = 'consistent'; // Study most days, reasonable sessions
    } else if (activeDaysPerWeek < 3 && avgSessionsPerDay > 3) {
      pattern = 'bursty'; // Study few days but intensely
    } else {
      pattern = 'irregular';
    }

    return {
      pattern,
      activeDaysPerWeek: Math.round(activeDaysPerWeek * 10) / 10,
      averageSessionsPerActiveDay: Math.round(avgSessionsPerDay * 10) / 10,
      longestGapDays: longestGap,
      studyTimeDistribution: {
        morning: parseFloat(timeDistResult.rows[0]?.morning || '0'),
        afternoon: parseFloat(timeDistResult.rows[0]?.afternoon || '0'),
        evening: parseFloat(timeDistResult.rows[0]?.evening || '0'),
        night: parseFloat(timeDistResult.rows[0]?.night || '0'),
      },
    };
  }

  /**
   * Get user's badges and achievements
   */
  private async getBadges(client: PoolClient, userId: string): Promise<Badge[]> {
    // Get unlocked badges
    const unlockedQuery = `
      SELECT
        b.id,
        b.name,
        b.description,
        b.icon_url,
        b.category,
        ub.unlocked_at
      FROM user_badges ub
      JOIN badges b ON b.id = ub.badge_id
      WHERE ub.user_id = $1
      ORDER BY ub.unlocked_at DESC
    `;

    const unlockedResult = await client.query(unlockedQuery, [userId]);
    const unlocked = unlockedResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      iconUrl: row.icon_url,
      category: row.category,
      unlockedAt: new Date(row.unlocked_at),
    }));

    // Get available badges with progress
    const availableQuery = `
      SELECT id, name, description, icon_url, category, criteria
      FROM badges
      WHERE id NOT IN (
        SELECT badge_id FROM user_badges WHERE user_id = $1
      )
    `;

    const availableResult = await client.query(availableQuery, [userId]);

    // Calculate progress for each available badge
    const available = await Promise.all(
      availableResult.rows.map(async (row) => {
        const progress = await this.calculateBadgeProgress(client, userId, row.criteria);

        return {
          id: row.id,
          name: row.name,
          description: row.description,
          iconUrl: row.icon_url,
          category: row.category,
          progress: progress.current,
          target: progress.target,
        };
      })
    );

    return [...unlocked, ...available];
  }

  /**
   * Calculate progress toward a badge
   */
  private async calculateBadgeProgress(
    client: PoolClient,
    userId: string,
    criteria: any
  ): Promise<{ current: number; target: number }> {
    const { type, target } = criteria;

    let current = 0;

    switch (type) {
      case 'streak':
        const streakInfo = await this.calculateStreak(client, userId);
        current = streakInfo.currentStreak;
        break;

      case 'words_learned':
        const wordsResult = await client.query(
          `SELECT COUNT(*) as count FROM word_states WHERE user_id = $1 AND state = 'known'`,
          [userId]
        );
        current = parseInt(wordsResult.rows[0]?.count || '0');
        break;

      case 'total_reviews':
        const reviewsResult = await client.query(
          `SELECT COUNT(*) as count FROM srs_reviews WHERE user_id = $1`,
          [userId]
        );
        current = parseInt(reviewsResult.rows[0]?.count || '0');
        break;

      case 'perfect_sessions':
        const perfectResult = await client.query(
          `SELECT COUNT(*) as count FROM study_sessions WHERE user_id = $1 AND accuracy >= 1.0`,
          [userId]
        );
        current = parseInt(perfectResult.rows[0]?.count || '0');
        break;

      default:
        current = 0;
    }

    return { current, target };
  }

  /**
   * Record a study session
   */
  async recordStudySession(session: Omit<StudySession, 'sessionId'>): Promise<string> {
    const sessionId = uuidv4();

    const query = `
      INSERT INTO study_sessions (
        id, user_id, language, start_time, end_time, duration_minutes,
        items_reviewed, correct_answers, accuracy, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING id
    `;

    const result = await this.pool.query(query, [
      sessionId,
      session.userId,
      session.language,
      session.startTime,
      session.endTime,
      session.durationMinutes,
      session.itemsReviewed,
      session.correctAnswers,
      session.accuracy,
    ]);

    // Check for badge unlocks
    await this.checkBadgeUnlocks(session.userId);

    return result.rows[0].id;
  }

  /**
   * Check and unlock eligible badges
   */
  private async checkBadgeUnlocks(userId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      const badges = await this.getBadges(client, userId);

      for (const badge of badges) {
        if (!badge.unlockedAt && badge.progress && badge.target && badge.progress >= badge.target) {
          // Unlock badge
          await client.query(
            `INSERT INTO user_badges (id, user_id, badge_id, unlocked_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT DO NOTHING`,
            [uuidv4(), userId, badge.id]
          );
        }
      }
    } finally {
      client.release();
    }
  }
}
```

**Database Schema**:

```sql
-- Study Sessions Table
CREATE TABLE IF NOT EXISTS study_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  language VARCHAR(20) NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  duration_minutes INT NOT NULL,
  items_reviewed INT DEFAULT 0,
  correct_answers INT DEFAULT 0,
  accuracy FLOAT DEFAULT 0.0,
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_study_sessions_user_date
  ON study_sessions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_study_sessions_language
  ON study_sessions(language);

-- Badges Table
CREATE TABLE IF NOT EXISTS badges (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  icon_url VARCHAR(500),
  category VARCHAR(20) NOT NULL CHECK (category IN ('streak', 'volume', 'accuracy', 'milestone')),
  criteria JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User Badges Table (Achievements)
CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  badge_id UUID NOT NULL,
  unlocked_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT fk_user_badge_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_badge_badge FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE,
  UNIQUE(user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user
  ON user_badges(user_id);

-- Insert default badges
INSERT INTO badges (id, name, description, icon_url, category, criteria) VALUES
  (gen_random_uuid(), 'First Steps', 'Complete your first study session', '/badges/first-steps.svg', 'milestone', '{"type": "total_reviews", "target": 1}'::jsonb),
  (gen_random_uuid(), '7-Day Streak', 'Study for 7 consecutive days', '/badges/7-day-streak.svg', 'streak', '{"type": "streak", "target": 7}'::jsonb),
  (gen_random_uuid(), '30-Day Streak', 'Study for 30 consecutive days', '/badges/30-day-streak.svg', 'streak', '{"type": "streak", "target": 30}'::jsonb),
  (gen_random_uuid(), '100-Day Streak', 'Study for 100 consecutive days', '/badges/100-day-streak.svg', 'streak', '{"type": "streak", "target": 100}'::jsonb),
  (gen_random_uuid(), 'Centurion', 'Learn 100 words', '/badges/centurion.svg', 'volume', '{"type": "words_learned", "target": 100}'::jsonb),
  (gen_random_uuid(), 'Polyglot', 'Learn 1000 words', '/badges/polyglot.svg', 'volume', '{"type": "words_learned", "target": 1000}'::jsonb),
  (gen_random_uuid(), 'Perfectionist', 'Complete 10 perfect sessions (100% accuracy)', '/badges/perfectionist.svg', 'accuracy', '{"type": "perfect_sessions", "target": 10}'::jsonb),
  (gen_random_uuid(), 'Dedicated Learner', 'Complete 100 reviews', '/badges/dedicated.svg', 'volume', '{"type": "total_reviews", "target": 100}'::jsonb),
  (gen_random_uuid(), 'Master Learner', 'Complete 1000 reviews', '/badges/master.svg', 'volume', '{"type": "total_reviews", "target": 1000}'::jsonb)
ON CONFLICT DO NOTHING;
```

---

### Task 2: Create Study Statistics API Endpoints

**File**: `packages/api/src/routes/analytics/statistics.routes.ts`

Create REST API endpoints for study statistics, streaks, and badges.

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { StudyStatisticsService } from '../../services/analytics/study-statistics.service.ts';
import { Pool } from 'pg';

// Request schemas
const overviewQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(365).optional().default(30),
});

const recordSessionSchema = z.object({
  language: z.string().min(2).max(20),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  itemsReviewed: z.number().int().min(0),
  correctAnswers: z.number().int().min(0),
});

export async function statisticsRoutes(fastify: FastifyInstance) {
  const pool: Pool = fastify.db;
  const statsService = new StudyStatisticsService(pool);

  /**
   * GET /api/statistics/overview?days=30
   *
   * Get comprehensive study overview
   *
   * Response:
   * {
   *   userId: string,
   *   streak: StreakInfo,
   *   timeStats: TimeStats,
   *   recentActivity: DailyStats[],
   *   accuracyTrends: AccuracyTrend[],
   *   paceAnalysis: StudyPaceAnalysis,
   *   badges: Badge[],
   *   analyzedAt: Date
   * }
   */
  fastify.get(
    '/overview',
    {
      schema: {
        querystring: overviewQuerySchema,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { days } = overviewQuerySchema.parse(request.query);
        const userId = request.user.id;

        const overview = await statsService.getStudyOverview(userId, days);

        return reply.code(200).send(overview);
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'Failed to get study overview',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/statistics/session
   *
   * Record a completed study session
   *
   * Request:
   * {
   *   language: string,
   *   startTime: string (ISO),
   *   endTime: string (ISO),
   *   itemsReviewed: number,
   *   correctAnswers: number
   * }
   *
   * Response:
   * {
   *   sessionId: string
   * }
   */
  fastify.post(
    '/session',
    {
      schema: {
        body: recordSessionSchema,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = recordSessionSchema.parse(request.body);
        const userId = request.user.id;

        const startTime = new Date(body.startTime);
        const endTime = new Date(body.endTime);
        const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
        const accuracy = body.itemsReviewed > 0 ? body.correctAnswers / body.itemsReviewed : 0;

        const sessionId = await statsService.recordStudySession({
          userId,
          language: body.language,
          startTime,
          endTime,
          durationMinutes,
          itemsReviewed: body.itemsReviewed,
          correctAnswers: body.correctAnswers,
          accuracy,
        });

        return reply.code(201).send({ sessionId });
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'Failed to record session',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/statistics/badges
   *
   * Get user's badges (unlocked and in-progress)
   *
   * Response:
   * {
   *   unlocked: Badge[],
   *   inProgress: Badge[]
   * }
   */
  fastify.get('/badges', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user.id;
      const overview = await statsService.getStudyOverview(userId, 30);

      const unlocked = overview.badges.filter((b) => b.unlockedAt);
      const inProgress = overview.badges.filter((b) => !b.unlockedAt);

      return reply.code(200).send({ unlocked, inProgress });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to get badges',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
```

---

### Task 3: Create Statistics Dashboard Component

**File**: `packages/web/src/pages/StatisticsDashboard.tsx`

Create a comprehensive React dashboard displaying study statistics with charts and gamification elements.

```typescript
import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: Date;
  streakStartDate: Date;
  isActiveToday: boolean;
}

interface TimeStats {
  totalMinutes: number;
  averageSessionMinutes: number;
  totalSessions: number;
  dailyAverage: number;
  weeklyTotal: number;
  monthlyTotal: number;
}

interface DailyStats {
  date: Date;
  sessionsCompleted: number;
  totalMinutes: number;
  itemsReviewed: number;
  accuracy: number;
  languagesStudied: string[];
}

interface AccuracyTrend {
  date: Date;
  accuracy: number;
  movingAverage7Day: number;
  movingAverage30Day: number;
  itemsReviewed: number;
}

interface StudyPaceAnalysis {
  pattern: 'consistent' | 'bursty' | 'irregular';
  activeDaysPerWeek: number;
  averageSessionsPerActiveDay: number;
  longestGapDays: number;
  studyTimeDistribution: {
    morning: number;
    afternoon: number;
    evening: number;
    night: number;
  };
}

interface Badge {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  category: 'streak' | 'volume' | 'accuracy' | 'milestone';
  unlockedAt?: Date;
  progress?: number;
  target?: number;
}

interface StudyOverview {
  userId: string;
  streak: StreakInfo;
  timeStats: TimeStats;
  recentActivity: DailyStats[];
  accuracyTrends: AccuracyTrend[];
  paceAnalysis: StudyPaceAnalysis;
  badges: Badge[];
  analyzedAt: Date;
}

export const StatisticsDashboard: React.FC = () => {
  const [daysFilter, setDaysFilter] = useState<number>(30);

  // Fetch overview
  const { data: overview, isLoading } = useQuery<StudyOverview>({
    queryKey: ['study-overview', daysFilter],
    queryFn: async () => {
      const response = await fetch(`/api/statistics/overview?days=${daysFilter}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch overview');
      return response.json();
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading statistics...</div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">No statistics data available</div>
      </div>
    );
  }

  // Prepare chart data
  const activityChartData = overview.recentActivity.map(day => ({
    date: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    minutes: day.totalMinutes,
    items: day.itemsReviewed,
    accuracy: day.accuracy
  })).reverse();

  const accuracyChartData = overview.accuracyTrends.map(trend => ({
    date: new Date(trend.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    accuracy: trend.accuracy,
    '7-day avg': trend.movingAverage7Day,
    '30-day avg': trend.movingAverage30Day
  }));

  const timeDistChartData = [
    { name: 'Morning\n(6-12)', value: overview.paceAnalysis.studyTimeDistribution.morning },
    { name: 'Afternoon\n(12-18)', value: overview.paceAnalysis.studyTimeDistribution.afternoon },
    { name: 'Evening\n(18-24)', value: overview.paceAnalysis.studyTimeDistribution.evening },
    { name: 'Night\n(0-6)', value: overview.paceAnalysis.studyTimeDistribution.night }
  ];

  const COLORS = ['#fbbf24', '#3b82f6', '#8b5cf6', '#1f2937'];

  const getPatternBadge = (pattern: string) => {
    switch (pattern) {
      case 'consistent':
        return <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">Consistent</span>;
      case 'bursty':
        return <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs font-medium">Intensive</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-medium">Irregular</span>;
    }
  };

  const unlockedBadges = overview.badges.filter(b => b.unlockedAt);
  const inProgressBadges = overview.badges.filter(b => !b.unlockedAt);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Study Statistics</h1>
            <p className="mt-1 text-sm text-gray-600">
              Track your learning progress and achievements
            </p>
          </div>

          <select
            value={daysFilter}
            onChange={(e) => setDaysFilter(Number(e.target.value))}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        </div>

        {/* Streak and Time Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-lg shadow p-6">
            <div className="text-sm font-medium opacity-90">Current Streak</div>
            <div className="mt-2 flex items-baseline">
              <div className="text-5xl font-bold">{overview.streak.currentStreak}</div>
              <div className="ml-2 text-lg">days</div>
            </div>
            {overview.streak.isActiveToday && (
              <div className="mt-2 text-xs opacity-90">🔥 Active today!</div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Longest Streak</div>
            <div className="mt-2 text-4xl font-bold text-gray-900">
              {overview.streak.longestStreak}
            </div>
            <div className="mt-2 text-xs text-gray-500">days</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Total Study Time</div>
            <div className="mt-2 text-4xl font-bold text-blue-600">
              {Math.round(overview.timeStats.totalMinutes / 60)}h
            </div>
            <div className="mt-2 text-xs text-gray-500">
              {overview.timeStats.averageSessionMinutes} min/session avg
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Total Sessions</div>
            <div className="mt-2 text-4xl font-bold text-purple-600">
              {overview.timeStats.totalSessions}
            </div>
            <div className="mt-2 text-xs text-gray-500">
              {overview.timeStats.dailyAverage.toFixed(1)} min/day avg
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Daily Activity */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Daily Activity</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={activityChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="items" fill="#3b82f6" name="Items Reviewed" />
                <Bar yAxisId="right" dataKey="minutes" fill="#10b981" name="Minutes" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Accuracy Trends */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Accuracy Trends</h2>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={accuracyChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="7-day avg" stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="30-day avg" stroke="#10b981" strokeWidth={2} />
                <Line type="monotone" dataKey="accuracy" stroke="#e5e7eb" strokeWidth={1} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Study Pace Analysis */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pace Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Study Pace</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Pattern</span>
                {getPatternBadge(overview.paceAnalysis.pattern)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Active days per week</span>
                <span className="font-semibold text-gray-900">
                  {overview.paceAnalysis.activeDaysPerWeek.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Sessions per active day</span>
                <span className="font-semibold text-gray-900">
                  {overview.paceAnalysis.averageSessionsPerActiveDay.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Longest gap</span>
                <span className="font-semibold text-gray-900">
                  {overview.paceAnalysis.longestGapDays} days
                </span>
              </div>
            </div>
          </div>

          {/* Time Distribution */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Study Time Distribution</h2>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={timeDistChartData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={80}
                  label
                >
                  {timeDistChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Badges Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Achievements ({unlockedBadges.length} / {overview.badges.length})
          </h2>

          {/* Unlocked Badges */}
          {unlockedBadges.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Unlocked</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {unlockedBadges.map(badge => (
                  <div key={badge.id} className="text-center">
                    <div className="w-20 h-20 mx-auto bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center text-3xl shadow-lg">
                      🏆
                    </div>
                    <div className="mt-2 text-sm font-medium text-gray-900">{badge.name}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(badge.unlockedAt!).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* In Progress Badges */}
          {inProgressBadges.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">In Progress</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {inProgressBadges.map(badge => (
                  <div key={badge.id} className="border rounded-lg p-4">
                    <div className="flex items-start">
                      <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center text-xl opacity-50">
                        🏆
                      </div>
                      <div className="ml-3 flex-1">
                        <div className="font-medium text-gray-900">{badge.name}</div>
                        <div className="text-xs text-gray-600 mt-1">{badge.description}</div>
                        {badge.progress !== undefined && badge.target !== undefined && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                              <span>{badge.progress} / {badge.target}</span>
                              <span>{Math.round((badge.progress / badge.target) * 100)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full transition-all"
                                style={{ width: `${(badge.progress / badge.target) * 100}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Activity Calendar (Heatmap) */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Activity Calendar</h2>
          <div className="grid grid-cols-7 gap-2">
            {overview.recentActivity.slice(0, 35).reverse().map((day, idx) => {
              const intensity = Math.min(day.itemsReviewed / 50, 1);
              const bgColor = intensity === 0
                ? 'bg-gray-100'
                : intensity < 0.25
                ? 'bg-green-200'
                : intensity < 0.5
                ? 'bg-green-400'
                : intensity < 0.75
                ? 'bg-green-600'
                : 'bg-green-800';

              return (
                <div
                  key={idx}
                  className={`aspect-square rounded ${bgColor} flex items-center justify-center text-xs font-medium`}
                  title={`${new Date(day.date).toLocaleDateString()}: ${day.itemsReviewed} items, ${day.totalMinutes} min`}
                >
                  {new Date(day.date).getDate()}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-end space-x-2 text-xs text-gray-600">
            <span>Less</span>
            <div className="w-3 h-3 bg-gray-100 rounded"></div>
            <div className="w-3 h-3 bg-green-200 rounded"></div>
            <div className="w-3 h-3 bg-green-400 rounded"></div>
            <div className="w-3 h-3 bg-green-600 rounded"></div>
            <div className="w-3 h-3 bg-green-800 rounded"></div>
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  );
};
```

---

## Open Questions

### 1. Streak Calculation Rules

**Question**: How should we handle edge cases in streak calculation (timezone changes, missed days)?

**Current Approach**: Streak continues if user studies at least once per calendar day (based on UTC)

**Alternatives**:

1. **Grace Period**: Allow 1 "freeze day" per week where missing a day doesn't break the streak
2. **User Timezone**: Calculate streaks based on user's local timezone, not UTC
3. **Flexible Definition**: Require only 5 out of 7 days instead of consecutive days
4. **Streak Repair**: Allow users to "repair" broken streaks by completing extra reviews

**Recommendation**: Use user's local timezone for fairness across regions. Add optional "streak freeze" purchasable with earned points (1 freeze per 30-day streak) to handle emergencies without punishing dedicated users.

---

### 2. Badge Unlock Criteria

**Question**: What milestones should trigger badge unlocks, and should badges be retroactive?

**Current Approach**: Badges unlock when criteria met, checked after each session. Initial badges include streaks (7/30/100 days), volume (100/1000 words), perfect sessions.

**Alternatives**:

1. **Retroactive Unlocks**: Scan all user data on first login to unlock earned badges
2. **Hidden Badges**: Some badges are hidden until unlocked (surprise factor)
3. **Tiered Badges**: Bronze/Silver/Gold variants of same achievement
4. **Social Badges**: "Help a friend" or "Top 10% this week" comparative badges

**Recommendation**: Make badge unlocks retroactive on first visit to statistics page. Use tiered badges (bronze/silver/gold) for better progression feel. Avoid comparative/social badges to prevent discouragement and privacy concerns.

---

### 3. Study Session Recording Trigger

**Question**: When and how should study sessions be recorded?

**Current Approach**: API endpoint exists but requires manual call from client after session ends

**Alternatives**:

1. **Automatic Tracking**: Client sends session start, backend auto-creates session on first review
2. **Heartbeat System**: Client sends periodic heartbeats during session, backend calculates duration
3. **Review-Based**: Each SRS review auto-updates current session, session closes after 5min inactivity
4. **Manual Control**: User clicks "Start Session" and "End Session" buttons explicitly

**Recommendation**: Use automatic review-based tracking where first review of the day creates a session, subsequent reviews within 10 minutes update the session, and 10-minute inactivity auto-closes it. This requires no user action while providing accurate session data.

---
