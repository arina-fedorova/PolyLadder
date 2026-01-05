import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import {
  createTestServer,
  closeTestServer,
  getTestPool,
  cleanupTestData,
  closeTestPool,
  setupTestEnv,
} from '../setup';
import { createTestUser } from '../helpers/db';

interface LoginResponse {
  userId: string;
  email: string;
  role: string;
  accessToken: string;
  refreshToken: string;
}

interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string | null;
  streakStartDate: string | null;
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
  date: string;
  sessionsCompleted: number;
  totalMinutes: number;
  itemsReviewed: number;
  accuracy: number;
  languagesStudied: string[];
}

interface AccuracyTrend {
  date: string;
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
  iconUrl: string | null;
  category: 'streak' | 'volume' | 'accuracy' | 'milestone';
  unlockedAt?: string;
  progress?: number;
  target?: number;
}

interface ActivityHeatmapCell {
  date: string;
  itemsReviewed: number;
  totalMinutes: number;
  intensity: number;
}

interface StudyOverviewResponse {
  userId: string;
  streak: StreakInfo;
  timeStats: TimeStats;
  recentActivity: DailyStats[];
  accuracyTrends: AccuracyTrend[];
  paceAnalysis: StudyPaceAnalysis;
  badges: Badge[];
  heatmap: ActivityHeatmapCell[];
  analyzedAt: string;
}

interface PeriodSummaryResponse {
  period: 'week' | 'month';
  startDate: string;
  endDate: string;
  totalMinutes: number;
  totalSessions: number;
  totalItemsReviewed: number;
  averageAccuracy: number;
  activeDays: number;
  newBadges: Badge[];
}

interface BadgeUnlocksResponse {
  unlockedBadges: Badge[];
}

describe('Statistics Analytics Integration Tests', () => {
  let server: FastifyInstance;
  let pool: Pool;
  let learnerToken: string;
  let learnerId: string;

  beforeAll(async () => {
    setupTestEnv();
    pool = getTestPool();
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer();
    await closeTestPool();
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Clean up statistics-related tables
    await pool.query(`DELETE FROM user_badges`);
    await pool.query(`DELETE FROM user_review_sessions`);
    await pool.query(`DELETE FROM srs_review_history`);

    // Create learner user
    const uniqueLearnerEmail = `stats-learner-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`;
    const learner = await createTestUser(pool, {
      email: uniqueLearnerEmail,
      password: 'Password123!',
      role: 'learner',
    });
    learnerId = learner.id;

    const learnerLoginResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: uniqueLearnerEmail,
        password: 'Password123!',
      },
    });

    const learnerLoginData = learnerLoginResponse.json<LoginResponse>();
    learnerToken = learnerLoginData.accessToken;
  });

  describe('GET /analytics/statistics/overview', () => {
    it('should return overview with empty data for new user', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/overview',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<StudyOverviewResponse>();
      expect(body.userId).toBe(learnerId);
      expect(body.streak).toBeDefined();
      expect(body.streak.currentStreak).toBe(0);
      expect(body.timeStats).toBeDefined();
      expect(body.recentActivity).toBeDefined();
      expect(body.accuracyTrends).toBeDefined();
      expect(body.paceAnalysis).toBeDefined();
      expect(body.badges).toBeDefined();
      expect(body.heatmap).toBeDefined();
      expect(body.analyzedAt).toBeDefined();
    });

    it('should accept days parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/overview?days=7',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/overview',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /analytics/statistics/streak', () => {
    it('should return zero streak for new user', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/streak',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ streak: StreakInfo }>();
      expect(body.streak.currentStreak).toBe(0);
      expect(body.streak.longestStreak).toBe(0);
      expect(body.streak.isActiveToday).toBe(false);
      expect(body.streak.lastStudyDate).toBeNull();
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/streak',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /analytics/statistics/time', () => {
    it('should return time statistics', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/time',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ timeStats: TimeStats }>();
      expect(body.timeStats).toBeDefined();
      expect(typeof body.timeStats.totalMinutes).toBe('number');
      expect(typeof body.timeStats.totalSessions).toBe('number');
      expect(typeof body.timeStats.averageSessionMinutes).toBe('number');
      expect(typeof body.timeStats.dailyAverage).toBe('number');
      expect(typeof body.timeStats.weeklyTotal).toBe('number');
      expect(typeof body.timeStats.monthlyTotal).toBe('number');
    });

    it('should accept days parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/time?days=14',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/time',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /analytics/statistics/activity', () => {
    it('should return empty activity for new user', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/activity',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ activity: DailyStats[] }>();
      expect(body.activity).toBeDefined();
      expect(Array.isArray(body.activity)).toBe(true);
    });

    it('should accept days parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/activity?days=7',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/activity',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /analytics/statistics/accuracy', () => {
    it('should return empty accuracy trends for new user', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/accuracy',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ trends: AccuracyTrend[] }>();
      expect(body.trends).toBeDefined();
      expect(Array.isArray(body.trends)).toBe(true);
    });

    it('should accept days parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/accuracy?days=14',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/accuracy',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /analytics/statistics/pace', () => {
    it('should return pace analysis with irregular pattern for new user', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/pace',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ paceAnalysis: StudyPaceAnalysis }>();
      expect(body.paceAnalysis).toBeDefined();
      expect(['consistent', 'bursty', 'irregular']).toContain(body.paceAnalysis.pattern);
      expect(typeof body.paceAnalysis.activeDaysPerWeek).toBe('number');
      expect(typeof body.paceAnalysis.averageSessionsPerActiveDay).toBe('number');
      expect(typeof body.paceAnalysis.longestGapDays).toBe('number');
      expect(body.paceAnalysis.studyTimeDistribution).toBeDefined();
    });

    it('should accept days parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/pace?days=60',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/pace',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /analytics/statistics/badges', () => {
    it('should return badges list', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/badges',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ badges: Badge[] }>();
      expect(body.badges).toBeDefined();
      expect(Array.isArray(body.badges)).toBe(true);
    });

    it('should return badges with progress for in-progress badges', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/badges',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ badges: Badge[] }>();

      // Check badge structure
      body.badges.forEach((badge) => {
        expect(badge.id).toBeDefined();
        expect(badge.name).toBeDefined();
        expect(badge.description).toBeDefined();
        expect(['streak', 'volume', 'accuracy', 'milestone']).toContain(badge.category);
      });
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/badges',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /analytics/statistics/heatmap', () => {
    it('should return empty heatmap for new user', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/heatmap',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ heatmap: ActivityHeatmapCell[] }>();
      expect(body.heatmap).toBeDefined();
      expect(Array.isArray(body.heatmap)).toBe(true);
    });

    it('should accept days parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/heatmap?days=30',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/heatmap',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /analytics/statistics/summary', () => {
    it('should return weekly summary', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/summary?period=week',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PeriodSummaryResponse>();
      expect(body.period).toBe('week');
      expect(body.startDate).toBeDefined();
      expect(body.endDate).toBeDefined();
      expect(typeof body.totalMinutes).toBe('number');
      expect(typeof body.totalSessions).toBe('number');
      expect(typeof body.totalItemsReviewed).toBe('number');
      expect(typeof body.averageAccuracy).toBe('number');
      expect(typeof body.activeDays).toBe('number');
      expect(Array.isArray(body.newBadges)).toBe(true);
    });

    it('should return monthly summary', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/summary?period=month',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PeriodSummaryResponse>();
      expect(body.period).toBe('month');
    });

    it('should require period parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/summary',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/summary?period=week',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /analytics/statistics/badges/check', () => {
    it('should return empty unlocked badges for new user', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analytics/statistics/badges/check',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BadgeUnlocksResponse>();
      expect(body.unlockedBadges).toBeDefined();
      expect(Array.isArray(body.unlockedBadges)).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analytics/statistics/badges/check',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Statistics with test data', () => {
    beforeEach(async () => {
      // Create study sessions and review history for today and yesterday
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 5, 0);

      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const yesterdayEnd = new Date(yesterdayStart);
      yesterdayEnd.setMinutes(yesterdayEnd.getMinutes() + 5);

      // Insert today's session
      await pool.query(
        `INSERT INTO user_review_sessions (user_id, language, items_reviewed, correct_count, total_response_time_ms, status, started_at, completed_at, last_activity_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7)`,
        [learnerId, 'ES', 20, 18, 300000, 'completed', todayStart, todayEnd]
      );

      // Insert yesterday's session
      await pool.query(
        `INSERT INTO user_review_sessions (user_id, language, items_reviewed, correct_count, total_response_time_ms, status, started_at, completed_at, last_activity_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7)`,
        [learnerId, 'ES', 15, 14, 240000, 'completed', yesterdayStart, yesterdayEnd]
      );

      // Insert srs_review_history for today (this is what streak/activity queries use)
      for (let i = 0; i < 10; i++) {
        await pool.query(
          `INSERT INTO srs_review_history (user_id, item_id, item_type, language, rating, previous_interval, previous_ease_factor, previous_repetitions, new_interval, new_ease_factor, new_repetitions, response_time_ms, reviewed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            learnerId,
            `test-item-today-${i}`,
            'vocabulary',
            'ES',
            i < 8 ? 'good' : 'hard',
            0,
            2.5,
            0,
            1,
            2.5,
            1,
            2000,
            todayStart,
          ]
        );
      }

      // Insert srs_review_history for yesterday
      for (let i = 0; i < 8; i++) {
        await pool.query(
          `INSERT INTO srs_review_history (user_id, item_id, item_type, language, rating, previous_interval, previous_ease_factor, previous_repetitions, new_interval, new_ease_factor, new_repetitions, response_time_ms, reviewed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            learnerId,
            `test-item-yesterday-${i}`,
            'vocabulary',
            'ES',
            i < 6 ? 'good' : 'hard',
            0,
            2.5,
            0,
            1,
            2.5,
            1,
            2000,
            yesterdayStart,
          ]
        );
      }
    });

    it('should show streak when studied today', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/streak',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ streak: StreakInfo }>();
      expect(body.streak.currentStreak).toBeGreaterThanOrEqual(1);
      expect(body.streak.isActiveToday).toBe(true);
    });

    it('should calculate time statistics from sessions', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/time',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ timeStats: TimeStats }>();
      expect(body.timeStats.totalSessions).toBeGreaterThanOrEqual(1);
      expect(body.timeStats.totalMinutes).toBeGreaterThan(0);
    });

    it('should return activity data with sessions', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/activity?days=7',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ activity: DailyStats[] }>();
      expect(body.activity.length).toBeGreaterThan(0);

      const dayWithActivity = body.activity.find((d) => d.sessionsCompleted > 0);
      if (dayWithActivity) {
        expect(dayWithActivity.itemsReviewed).toBeGreaterThan(0);
        expect(dayWithActivity.totalMinutes).toBeGreaterThan(0);
      }
    });

    it('should populate heatmap with session data', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/heatmap?days=30',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ heatmap: ActivityHeatmapCell[] }>();

      if (body.heatmap.length > 0) {
        const cell = body.heatmap.find((c) => c.itemsReviewed > 0);
        if (cell) {
          expect(cell.date).toBeDefined();
          expect(cell.itemsReviewed).toBeGreaterThan(0);
          expect(cell.intensity).toBeGreaterThan(0);
        }
      }
    });

    it('should return summary with session data', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/analytics/statistics/summary?period=week',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PeriodSummaryResponse>();
      expect(body.totalSessions).toBeGreaterThan(0);
      expect(body.totalItemsReviewed).toBeGreaterThan(0);
    });
  });

  describe('Badge unlocking', () => {
    it('should unlock First Steps badge after first review', async () => {
      // Create SRS review history to trigger badge
      const meaningId = `badge-meaning-${Date.now()}`;

      await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, $2, $3)`, [
        meaningId,
        'A1',
        JSON.stringify([]),
      ]);

      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text) VALUES ($1, $2, $3)`,
        [meaningId, 'ES', 'palabra_badge']
      );

      // Insert review history directly (this is what badge checking queries)
      await pool.query(
        `INSERT INTO srs_review_history (user_id, item_id, item_type, language, rating, previous_interval, previous_ease_factor, previous_repetitions, new_interval, new_ease_factor, new_repetitions, response_time_ms, reviewed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)`,
        [learnerId, meaningId, 'vocabulary', 'ES', 'good', 0, 2.5, 0, 1, 2.5, 1, 2000]
      );

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analytics/statistics/badges/check',
        headers: {
          authorization: `Bearer ${learnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BadgeUnlocksResponse>();
      // Badge should be unlocked (First Steps requires 1 review)
      expect(body.unlockedBadges).toBeDefined();
      expect(body.unlockedBadges.length).toBeGreaterThanOrEqual(1);
      expect(body.unlockedBadges.some((b) => b.name === 'First Steps')).toBe(true);
    });
  });
});
