import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import { StudyStatisticsService } from '../../../../src/services/analytics';

// Helper to create mock result
const mockResult = <T extends QueryResultRow>(rows: T[], rowCount?: number): QueryResult<T> =>
  ({
    rows,
    rowCount: rowCount ?? rows.length,
  }) as unknown as QueryResult<T>;

// Create date string for N days ago
const daysAgo = (n: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Today's date at midnight
const today = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

describe('StudyStatisticsService', () => {
  let service: StudyStatisticsService;
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery = vi.fn();
    const mockPool = { query: mockQuery } as unknown as Pool;
    service = new StudyStatisticsService(mockPool);
  });

  describe('calculateStreak', () => {
    it('should return zero streak when no study days exist', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await service.calculateStreak('user-123');

      expect(result.currentStreak).toBe(0);
      expect(result.longestStreak).toBe(0);
      expect(result.isActiveToday).toBe(false);
      expect(result.lastStudyDate).toBeNull();
    });

    it('should calculate current streak when studied today', async () => {
      mockQuery.mockResolvedValueOnce(
        mockResult([
          { study_date: today() },
          { study_date: daysAgo(1) },
          { study_date: daysAgo(2) },
        ])
      );

      const result = await service.calculateStreak('user-123');

      expect(result.currentStreak).toBe(3);
      expect(result.isActiveToday).toBe(true);
    });

    it('should calculate current streak when studied yesterday', async () => {
      mockQuery.mockResolvedValueOnce(
        mockResult([{ study_date: daysAgo(1) }, { study_date: daysAgo(2) }])
      );

      const result = await service.calculateStreak('user-123');

      expect(result.currentStreak).toBe(2);
      expect(result.isActiveToday).toBe(false);
    });

    it('should break streak when there is a gap', async () => {
      mockQuery.mockResolvedValueOnce(
        mockResult([
          { study_date: today() },
          { study_date: daysAgo(3) }, // Gap of 2 days
          { study_date: daysAgo(4) },
        ])
      );

      const result = await service.calculateStreak('user-123');

      expect(result.currentStreak).toBe(1);
      expect(result.longestStreak).toBe(2); // The older streak was longer
    });

    it('should track longest streak separately from current', async () => {
      mockQuery.mockResolvedValueOnce(
        mockResult([
          { study_date: today() },
          { study_date: daysAgo(5) }, // Gap breaks streak
          { study_date: daysAgo(6) },
          { study_date: daysAgo(7) },
          { study_date: daysAgo(8) },
          { study_date: daysAgo(9) },
        ])
      );

      const result = await service.calculateStreak('user-123');

      expect(result.currentStreak).toBe(1);
      expect(result.longestStreak).toBe(5); // Historical 5-day streak
    });
  });

  describe('getTimeStatistics', () => {
    it('should return time statistics', async () => {
      mockQuery.mockResolvedValueOnce(
        mockResult([
          {
            total_sessions: '10',
            total_minutes: '300',
            avg_session_minutes: '30',
            week_minutes: '120',
            month_minutes: '300',
            active_days: '15',
          },
        ])
      );

      const result = await service.getTimeStatistics('user-123', 30);

      expect(result.totalSessions).toBe(10);
      expect(result.totalMinutes).toBe(300);
      expect(result.averageSessionMinutes).toBe(30);
      expect(result.weeklyTotal).toBe(120);
      expect(result.monthlyTotal).toBe(300);
      expect(result.dailyAverage).toBe(20); // 300/15
    });

    it('should handle zero active days', async () => {
      mockQuery.mockResolvedValueOnce(
        mockResult([
          {
            total_sessions: '0',
            total_minutes: '0',
            avg_session_minutes: '0',
            week_minutes: '0',
            month_minutes: '0',
            active_days: '0',
          },
        ])
      );

      const result = await service.getTimeStatistics('user-123', 30);

      expect(result.dailyAverage).toBe(0);
    });
  });

  describe('getDailyActivity', () => {
    it('should return daily activity breakdown', async () => {
      mockQuery.mockResolvedValueOnce(
        mockResult([
          {
            date: today(),
            sessions_completed: '2',
            total_minutes: '45',
            items_reviewed: '30',
            accuracy: '0.85',
            languages: ['ES', 'IT'],
          },
          {
            date: daysAgo(1),
            sessions_completed: '1',
            total_minutes: '20',
            items_reviewed: '15',
            accuracy: '0.90',
            languages: ['ES'],
          },
        ])
      );

      const result = await service.getDailyActivity('user-123', 7);

      expect(result).toHaveLength(2);
      expect(result[0].sessionsCompleted).toBe(2);
      expect(result[0].totalMinutes).toBe(45);
      expect(result[0].itemsReviewed).toBe(30);
      expect(result[0].accuracy).toBe(85); // Converted to percentage
      expect(result[0].languagesStudied).toEqual(['ES', 'IT']);
    });

    it('should handle empty activity', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await service.getDailyActivity('user-123', 7);

      expect(result).toHaveLength(0);
    });
  });

  describe('getAccuracyTrends', () => {
    it('should return accuracy trends with moving averages', async () => {
      mockQuery.mockResolvedValueOnce(
        mockResult([
          {
            date: daysAgo(2),
            accuracy: '0.80',
            items_reviewed: '20',
            moving_avg_7: '0.80',
            moving_avg_30: '0.80',
          },
          {
            date: daysAgo(1),
            accuracy: '0.85',
            items_reviewed: '25',
            moving_avg_7: '0.825',
            moving_avg_30: '0.825',
          },
          {
            date: today(),
            accuracy: '0.90',
            items_reviewed: '30',
            moving_avg_7: '0.85',
            moving_avg_30: '0.85',
          },
        ])
      );

      const result = await service.getAccuracyTrends('user-123', 30);

      expect(result).toHaveLength(3);
      expect(result[2].accuracy).toBe(90);
      expect(result[2].movingAverage7Day).toBe(85);
      expect(result[2].itemsReviewed).toBe(30);
    });
  });

  describe('analyzeStudyPace', () => {
    it('should identify consistent pattern', async () => {
      // Mock activity query
      mockQuery.mockResolvedValueOnce(
        mockResult([
          {
            active_days: '25', // 25 days out of 30 = ~5.8/week
            avg_sessions_per_day: '1.5',
            longest_gap: '2',
          },
        ])
      );
      // Mock time distribution query
      mockQuery.mockResolvedValueOnce(
        mockResult([
          {
            morning: '120',
            afternoon: '180',
            evening: '200',
            night: '10',
          },
        ])
      );

      const result = await service.analyzeStudyPace('user-123', 30);

      expect(result.pattern).toBe('consistent');
      expect(result.activeDaysPerWeek).toBeGreaterThan(5);
      expect(result.averageSessionsPerActiveDay).toBeLessThanOrEqual(2);
    });

    it('should identify bursty pattern', async () => {
      mockQuery.mockResolvedValueOnce(
        mockResult([
          {
            active_days: '5', // 5 days out of 30 = ~1.2/week
            avg_sessions_per_day: '5', // Many sessions per day
            longest_gap: '7',
          },
        ])
      );
      mockQuery.mockResolvedValueOnce(
        mockResult([{ morning: '50', afternoon: '100', evening: '300', night: '50' }])
      );

      const result = await service.analyzeStudyPace('user-123', 30);

      expect(result.pattern).toBe('bursty');
    });

    it('should return time distribution', async () => {
      mockQuery.mockResolvedValueOnce(
        mockResult([{ active_days: '10', avg_sessions_per_day: '2', longest_gap: '3' }])
      );
      mockQuery.mockResolvedValueOnce(
        mockResult([{ morning: '60', afternoon: '120', evening: '180', night: '30' }])
      );

      const result = await service.analyzeStudyPace('user-123', 30);

      expect(result.studyTimeDistribution.morning).toBe(60);
      expect(result.studyTimeDistribution.afternoon).toBe(120);
      expect(result.studyTimeDistribution.evening).toBe(180);
      expect(result.studyTimeDistribution.night).toBe(30);
    });
  });

  describe('getBadges', () => {
    it('should return unlocked badges', async () => {
      // Unlocked badges query
      mockQuery.mockResolvedValueOnce(
        mockResult([
          {
            id: 'badge-1',
            name: '7-Day Streak',
            description: 'Study for 7 consecutive days',
            icon_url: '/badges/streak-7.svg',
            category: 'streak',
            unlocked_at: daysAgo(5),
          },
        ])
      );
      // Available badges query
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await service.getBadges('user-123');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('7-Day Streak');
      expect(result[0].unlockedAt).toBeDefined();
    });

    it('should return in-progress badges with progress', async () => {
      // Unlocked badges query
      mockQuery.mockResolvedValueOnce(mockResult([]));
      // Available badges query
      mockQuery.mockResolvedValueOnce(
        mockResult([
          {
            id: 'badge-2',
            name: '30-Day Streak',
            description: 'Study for 30 consecutive days',
            icon_url: '/badges/streak-30.svg',
            category: 'streak',
            criteria: { type: 'streak', target: 30 },
          },
        ])
      );
      // Streak calculation for progress (calculateStreak called)
      mockQuery.mockResolvedValueOnce(
        mockResult([
          { study_date: today() },
          { study_date: daysAgo(1) },
          { study_date: daysAgo(2) },
        ])
      );

      const result = await service.getBadges('user-123');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('30-Day Streak');
      expect(result[0].progress).toBe(3); // Current streak
      expect(result[0].target).toBe(30);
      expect(result[0].unlockedAt).toBeUndefined();
    });

    it('should calculate progress for words_learned badges', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([])); // Unlocked
      mockQuery.mockResolvedValueOnce(
        mockResult([
          {
            id: 'badge-3',
            name: 'Centurion',
            description: 'Learn 100 words',
            icon_url: '/badges/centurion.svg',
            category: 'volume',
            criteria: { type: 'words_learned', target: 100 },
          },
        ])
      );
      // Words learned count
      mockQuery.mockResolvedValueOnce(mockResult([{ count: '75' }]));

      const result = await service.getBadges('user-123');

      expect(result[0].progress).toBe(75);
      expect(result[0].target).toBe(100);
    });

    it('should calculate progress for total_reviews badges', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([])); // Unlocked
      mockQuery.mockResolvedValueOnce(
        mockResult([
          {
            id: 'badge-4',
            name: 'Dedicated Learner',
            description: 'Complete 100 reviews',
            icon_url: '/badges/dedicated.svg',
            category: 'volume',
            criteria: { type: 'total_reviews', target: 100 },
          },
        ])
      );
      // Total reviews count
      mockQuery.mockResolvedValueOnce(mockResult([{ count: '50' }]));

      const result = await service.getBadges('user-123');

      expect(result[0].progress).toBe(50);
    });
  });

  describe('getActivityHeatmap', () => {
    it('should return heatmap data with intensity', async () => {
      mockQuery.mockResolvedValueOnce(
        mockResult([
          { date: daysAgo(2), items_reviewed: '10', total_minutes: '15' },
          { date: daysAgo(1), items_reviewed: '25', total_minutes: '30' },
          { date: today(), items_reviewed: '50', total_minutes: '45' },
        ])
      );

      const result = await service.getActivityHeatmap('user-123', 7);

      expect(result).toHaveLength(3);
      // Intensity should be normalized (max is 50)
      expect(result[0].intensity).toBe(0.2); // 10/50
      expect(result[1].intensity).toBe(0.5); // 25/50
      expect(result[2].intensity).toBe(1); // 50/50
    });

    it('should handle empty heatmap', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await service.getActivityHeatmap('user-123', 7);

      expect(result).toHaveLength(0);
    });
  });

  describe('getStudyOverview', () => {
    it('should return comprehensive study overview', async () => {
      // Mock individual service methods to avoid Promise.all ordering issues
      const mockStreak = {
        currentStreak: 3,
        longestStreak: 5,
        lastStudyDate: today(),
        streakStartDate: daysAgo(2),
        isActiveToday: true,
      };
      const mockTimeStats = {
        totalMinutes: 150,
        averageSessionMinutes: 30,
        totalSessions: 5,
        dailyAverage: 30,
        weeklyTotal: 90,
        monthlyTotal: 150,
      };
      const mockActivity = [
        {
          date: today(),
          sessionsCompleted: 1,
          totalMinutes: 30,
          itemsReviewed: 20,
          accuracy: 0.9,
          languagesStudied: ['ES'],
        },
      ];
      const mockTrends = [
        {
          date: today(),
          accuracy: 0.9,
          movingAverage7Day: 0.9,
          movingAverage30Day: 0.9,
          itemsReviewed: 20,
        },
      ];
      const mockPace = {
        pattern: 'consistent' as const,
        activeDaysPerWeek: 5,
        averageSessionsPerActiveDay: 1,
        longestGapDays: 1,
        studyTimeDistribution: { morning: 20, afternoon: 40, evening: 40, night: 0 },
      };
      const mockBadges = [
        {
          id: 'badge-1',
          name: 'First Steps',
          description: 'Complete your first review',
          iconUrl: '/badges/first.svg',
          category: 'milestone' as const,
          unlockedAt: today(),
        },
      ];
      const mockHeatmap = [{ date: today(), itemsReviewed: 20, totalMinutes: 30, intensity: 1 }];

      vi.spyOn(service, 'calculateStreak').mockResolvedValue(mockStreak);
      vi.spyOn(service, 'getTimeStatistics').mockResolvedValue(mockTimeStats);
      vi.spyOn(service, 'getDailyActivity').mockResolvedValue(mockActivity);
      vi.spyOn(service, 'getAccuracyTrends').mockResolvedValue(mockTrends);
      vi.spyOn(service, 'analyzeStudyPace').mockResolvedValue(mockPace);
      vi.spyOn(service, 'getBadges').mockResolvedValue(mockBadges);
      vi.spyOn(service, 'getActivityHeatmap').mockResolvedValue(mockHeatmap);

      const result = await service.getStudyOverview('user-123', 30);

      expect(result.userId).toBe('user-123');
      expect(result.streak).toEqual(mockStreak);
      expect(result.timeStats).toEqual(mockTimeStats);
      expect(result.recentActivity).toEqual(mockActivity);
      expect(result.accuracyTrends).toEqual(mockTrends);
      expect(result.paceAnalysis).toEqual(mockPace);
      expect(result.badges).toEqual(mockBadges);
      expect(result.heatmap).toEqual(mockHeatmap);
      expect(result.analyzedAt).toBeDefined();
    });
  });

  describe('checkBadgeUnlocks', () => {
    it('should unlock eligible badges', async () => {
      // getBadges mocks
      mockQuery.mockResolvedValueOnce(mockResult([])); // Unlocked
      mockQuery.mockResolvedValueOnce(
        mockResult([
          {
            id: 'badge-1',
            name: 'First Steps',
            description: 'Complete your first review',
            icon_url: '/badges/first.svg',
            category: 'milestone',
            criteria: { type: 'total_reviews', target: 1 },
          },
        ])
      );
      // Progress check - total reviews = 5 >= 1
      mockQuery.mockResolvedValueOnce(mockResult([{ count: '5' }]));
      // Insert new badge unlock
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await service.checkBadgeUnlocks('user-123');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('First Steps');
      expect(result[0].unlockedAt).toBeDefined();
    });

    it('should not unlock badges that are not yet earned', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([])); // Unlocked
      mockQuery.mockResolvedValueOnce(
        mockResult([
          {
            id: 'badge-2',
            name: '100-Day Streak',
            description: 'Study for 100 consecutive days',
            icon_url: '/badges/100-streak.svg',
            category: 'streak',
            criteria: { type: 'streak', target: 100 },
          },
        ])
      );
      // Streak = 5 < 100
      mockQuery.mockResolvedValueOnce(
        mockResult([
          { study_date: today() },
          { study_date: daysAgo(1) },
          { study_date: daysAgo(2) },
          { study_date: daysAgo(3) },
          { study_date: daysAgo(4) },
        ])
      );

      const result = await service.checkBadgeUnlocks('user-123');

      expect(result).toHaveLength(0);
    });
  });
});
