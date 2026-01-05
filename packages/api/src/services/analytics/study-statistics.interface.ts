/**
 * Study Statistics Service Interfaces
 *
 * Tracks and analyzes:
 * 1. Daily study streaks (consecutive days with ≥1 review)
 * 2. Time spent learning (sum of session durations)
 * 3. Items reviewed (vocabulary + grammar)
 * 4. Accuracy trends (7-day and 30-day moving averages)
 * 5. Study pace patterns (consistent vs bursty)
 * 6. Achievements and badges (milestones)
 */

/**
 * Daily activity summary
 */
export interface DailyStats {
  date: Date;
  sessionsCompleted: number;
  totalMinutes: number;
  itemsReviewed: number;
  accuracy: number;
  languagesStudied: string[];
}

/**
 * Streak information
 */
export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: Date | null;
  streakStartDate: Date | null;
  isActiveToday: boolean;
}

/**
 * Time statistics
 */
export interface TimeStats {
  totalMinutes: number;
  averageSessionMinutes: number;
  totalSessions: number;
  dailyAverage: number;
  weeklyTotal: number;
  monthlyTotal: number;
}

/**
 * Accuracy trend data point
 */
export interface AccuracyTrend {
  date: Date;
  accuracy: number;
  movingAverage7Day: number;
  movingAverage30Day: number;
  itemsReviewed: number;
}

/**
 * Study pace analysis
 */
export interface StudyPaceAnalysis {
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

/**
 * Badge information
 */
export interface Badge {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  category: 'streak' | 'volume' | 'accuracy' | 'milestone';
  unlockedAt?: Date;
  progress?: number;
  target?: number;
}

/**
 * Badge criteria from JSON
 */
export interface BadgeCriteria {
  type: 'streak' | 'words_learned' | 'total_reviews' | 'perfect_sessions';
  target: number;
}

/**
 * Activity heatmap cell
 */
export interface ActivityHeatmapCell {
  date: Date;
  itemsReviewed: number;
  totalMinutes: number;
  intensity: number; // 0-1 scale
}

/**
 * Complete study overview
 */
export interface StudyOverview {
  userId: string;
  streak: StreakInfo;
  timeStats: TimeStats;
  recentActivity: DailyStats[];
  accuracyTrends: AccuracyTrend[];
  paceAnalysis: StudyPaceAnalysis;
  badges: Badge[];
  heatmap: ActivityHeatmapCell[];
  analyzedAt: Date;
}

/**
 * Weekly/monthly summary
 */
export interface PeriodSummary {
  period: 'week' | 'month';
  startDate: Date;
  endDate: Date;
  totalMinutes: number;
  totalSessions: number;
  totalItemsReviewed: number;
  averageAccuracy: number;
  activeDays: number;
  newBadges: Badge[];
}
