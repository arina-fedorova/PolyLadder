import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';
import { StudyStatisticsService } from '../../services/analytics';

// Query schemas
const OverviewQuerySchema = Type.Object({
  days: Type.Optional(Type.Number({ minimum: 1, maximum: 365, default: 30 })),
});

type OverviewQuery = Static<typeof OverviewQuerySchema>;

const HeatmapQuerySchema = Type.Object({
  days: Type.Optional(Type.Number({ minimum: 7, maximum: 365, default: 90 })),
});

type HeatmapQuery = Static<typeof HeatmapQuerySchema>;

const PeriodQuerySchema = Type.Object({
  period: Type.Union([Type.Literal('week'), Type.Literal('month')]),
});

type PeriodQuery = Static<typeof PeriodQuerySchema>;

// Response schemas
const StreakInfoSchema = Type.Object({
  currentStreak: Type.Number(),
  longestStreak: Type.Number(),
  lastStudyDate: Type.Union([Type.String(), Type.Null()]),
  streakStartDate: Type.Union([Type.String(), Type.Null()]),
  isActiveToday: Type.Boolean(),
});

const TimeStatsSchema = Type.Object({
  totalMinutes: Type.Number(),
  averageSessionMinutes: Type.Number(),
  totalSessions: Type.Number(),
  dailyAverage: Type.Number(),
  weeklyTotal: Type.Number(),
  monthlyTotal: Type.Number(),
});

const DailyStatsSchema = Type.Object({
  date: Type.String(),
  sessionsCompleted: Type.Number(),
  totalMinutes: Type.Number(),
  itemsReviewed: Type.Number(),
  accuracy: Type.Number(),
  languagesStudied: Type.Array(Type.String()),
});

const AccuracyTrendSchema = Type.Object({
  date: Type.String(),
  accuracy: Type.Number(),
  movingAverage7Day: Type.Number(),
  movingAverage30Day: Type.Number(),
  itemsReviewed: Type.Number(),
});

const StudyTimeDistributionSchema = Type.Object({
  morning: Type.Number(),
  afternoon: Type.Number(),
  evening: Type.Number(),
  night: Type.Number(),
});

const StudyPaceAnalysisSchema = Type.Object({
  pattern: Type.Union([
    Type.Literal('consistent'),
    Type.Literal('bursty'),
    Type.Literal('irregular'),
  ]),
  activeDaysPerWeek: Type.Number(),
  averageSessionsPerActiveDay: Type.Number(),
  longestGapDays: Type.Number(),
  studyTimeDistribution: StudyTimeDistributionSchema,
});

const BadgeSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.String(),
  iconUrl: Type.Union([Type.String(), Type.Null()]),
  category: Type.Union([
    Type.Literal('streak'),
    Type.Literal('volume'),
    Type.Literal('accuracy'),
    Type.Literal('milestone'),
  ]),
  unlockedAt: Type.Optional(Type.String()),
  progress: Type.Optional(Type.Number()),
  target: Type.Optional(Type.Number()),
});

const ActivityHeatmapCellSchema = Type.Object({
  date: Type.String(),
  itemsReviewed: Type.Number(),
  totalMinutes: Type.Number(),
  intensity: Type.Number(),
});

const StudyOverviewResponseSchema = Type.Object({
  userId: Type.String(),
  streak: StreakInfoSchema,
  timeStats: TimeStatsSchema,
  recentActivity: Type.Array(DailyStatsSchema),
  accuracyTrends: Type.Array(AccuracyTrendSchema),
  paceAnalysis: StudyPaceAnalysisSchema,
  badges: Type.Array(BadgeSchema),
  heatmap: Type.Array(ActivityHeatmapCellSchema),
  analyzedAt: Type.String(),
});

const StreakResponseSchema = Type.Object({
  streak: StreakInfoSchema,
});

const TimeStatsResponseSchema = Type.Object({
  timeStats: TimeStatsSchema,
});

const ActivityResponseSchema = Type.Object({
  activity: Type.Array(DailyStatsSchema),
});

const AccuracyTrendsResponseSchema = Type.Object({
  trends: Type.Array(AccuracyTrendSchema),
});

const PaceAnalysisResponseSchema = Type.Object({
  paceAnalysis: StudyPaceAnalysisSchema,
});

const BadgesResponseSchema = Type.Object({
  badges: Type.Array(BadgeSchema),
});

const HeatmapResponseSchema = Type.Object({
  heatmap: Type.Array(ActivityHeatmapCellSchema),
});

const PeriodSummaryResponseSchema = Type.Object({
  period: Type.Union([Type.Literal('week'), Type.Literal('month')]),
  startDate: Type.String(),
  endDate: Type.String(),
  totalMinutes: Type.Number(),
  totalSessions: Type.Number(),
  totalItemsReviewed: Type.Number(),
  averageAccuracy: Type.Number(),
  activeDays: Type.Number(),
  newBadges: Type.Array(BadgeSchema),
});

const BadgeUnlocksResponseSchema = Type.Object({
  unlockedBadges: Type.Array(BadgeSchema),
});

export const statisticsRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();
  const statisticsService = new StudyStatisticsService(fastify.db);

  /**
   * GET /analytics/statistics/overview
   * Get comprehensive study statistics overview
   */
  fastify.get<{ Querystring: OverviewQuery }>(
    '/statistics/overview',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: OverviewQuerySchema,
        response: {
          200: StudyOverviewResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { days = 30 } = request.query;

      const overview = await statisticsService.getStudyOverview(userId, days);

      return reply.code(200).send({
        ...overview,
        streak: {
          ...overview.streak,
          lastStudyDate: overview.streak.lastStudyDate?.toISOString() || null,
          streakStartDate: overview.streak.streakStartDate?.toISOString() || null,
        },
        recentActivity: overview.recentActivity.map((a) => ({
          ...a,
          date: a.date.toISOString(),
        })),
        accuracyTrends: overview.accuracyTrends.map((t) => ({
          ...t,
          date: t.date.toISOString(),
        })),
        badges: overview.badges.map((b) => ({
          ...b,
          unlockedAt: b.unlockedAt?.toISOString(),
        })),
        heatmap: overview.heatmap.map((h) => ({
          ...h,
          date: h.date.toISOString(),
        })),
        analyzedAt: overview.analyzedAt.toISOString(),
      });
    }
  );

  /**
   * GET /analytics/statistics/streak
   * Get current streak information
   */
  fastify.get(
    '/statistics/streak',
    {
      preHandler: [authMiddleware],
      schema: {
        response: {
          200: StreakResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;

      const streak = await statisticsService.calculateStreak(userId);

      return reply.code(200).send({
        streak: {
          ...streak,
          lastStudyDate: streak.lastStudyDate?.toISOString() || null,
          streakStartDate: streak.streakStartDate?.toISOString() || null,
        },
      });
    }
  );

  /**
   * GET /analytics/statistics/time
   * Get time statistics
   */
  fastify.get<{ Querystring: OverviewQuery }>(
    '/statistics/time',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: OverviewQuerySchema,
        response: {
          200: TimeStatsResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { days = 30 } = request.query;

      const timeStats = await statisticsService.getTimeStatistics(userId, days);

      return reply.code(200).send({ timeStats });
    }
  );

  /**
   * GET /analytics/statistics/activity
   * Get daily activity breakdown
   */
  fastify.get<{ Querystring: OverviewQuery }>(
    '/statistics/activity',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: OverviewQuerySchema,
        response: {
          200: ActivityResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { days = 30 } = request.query;

      const activity = await statisticsService.getDailyActivity(userId, days);

      return reply.code(200).send({
        activity: activity.map((a) => ({
          ...a,
          date: a.date.toISOString(),
        })),
      });
    }
  );

  /**
   * GET /analytics/statistics/accuracy
   * Get accuracy trends with moving averages
   */
  fastify.get<{ Querystring: OverviewQuery }>(
    '/statistics/accuracy',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: OverviewQuerySchema,
        response: {
          200: AccuracyTrendsResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { days = 30 } = request.query;

      const trends = await statisticsService.getAccuracyTrends(userId, days);

      return reply.code(200).send({
        trends: trends.map((t) => ({
          ...t,
          date: t.date.toISOString(),
        })),
      });
    }
  );

  /**
   * GET /analytics/statistics/pace
   * Get study pace analysis
   */
  fastify.get<{ Querystring: OverviewQuery }>(
    '/statistics/pace',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: OverviewQuerySchema,
        response: {
          200: PaceAnalysisResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { days = 30 } = request.query;

      const paceAnalysis = await statisticsService.analyzeStudyPace(userId, days);

      return reply.code(200).send({ paceAnalysis });
    }
  );

  /**
   * GET /analytics/statistics/badges
   * Get user badges (unlocked and in-progress)
   */
  fastify.get(
    '/statistics/badges',
    {
      preHandler: [authMiddleware],
      schema: {
        response: {
          200: BadgesResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;

      const badges = await statisticsService.getBadges(userId);

      return reply.code(200).send({
        badges: badges.map((b) => ({
          ...b,
          unlockedAt: b.unlockedAt?.toISOString(),
        })),
      });
    }
  );

  /**
   * GET /analytics/statistics/heatmap
   * Get activity heatmap data
   */
  fastify.get<{ Querystring: HeatmapQuery }>(
    '/statistics/heatmap',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: HeatmapQuerySchema,
        response: {
          200: HeatmapResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { days = 90 } = request.query;

      const heatmap = await statisticsService.getActivityHeatmap(userId, days);

      return reply.code(200).send({
        heatmap: heatmap.map((h) => ({
          ...h,
          date: h.date.toISOString(),
        })),
      });
    }
  );

  /**
   * GET /analytics/statistics/summary
   * Get weekly or monthly summary
   */
  fastify.get<{ Querystring: PeriodQuery }>(
    '/statistics/summary',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: PeriodQuerySchema,
        response: {
          200: PeriodSummaryResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { period } = request.query;

      const summary = await statisticsService.getPeriodSummary(userId, period);

      return reply.code(200).send({
        ...summary,
        startDate: summary.startDate.toISOString(),
        endDate: summary.endDate.toISOString(),
        newBadges: summary.newBadges.map((b) => ({
          ...b,
          unlockedAt: b.unlockedAt?.toISOString(),
        })),
      });
    }
  );

  /**
   * POST /analytics/statistics/badges/check
   * Check and unlock any new badges
   */
  fastify.post(
    '/statistics/badges/check',
    {
      preHandler: [authMiddleware],
      schema: {
        response: {
          200: BadgeUnlocksResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;

      const unlockedBadges = await statisticsService.checkBadgeUnlocks(userId);

      return reply.code(200).send({
        unlockedBadges: unlockedBadges.map((b) => ({
          ...b,
          unlockedAt: b.unlockedAt?.toISOString(),
        })),
      });
    }
  );
};

export default statisticsRoutes;
