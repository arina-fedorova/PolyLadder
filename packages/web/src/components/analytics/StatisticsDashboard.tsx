import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  statisticsApi,
  StudyOverviewResponse,
  PeriodSummaryResponse,
  Badge,
} from '../../api/analytics';

const PATTERN_LABELS = {
  consistent: 'Consistent',
  bursty: 'Bursty',
  irregular: 'Irregular',
};

const PATTERN_COLORS = {
  consistent: '#22c55e',
  bursty: '#f59e0b',
  irregular: '#ef4444',
};

const TIME_DISTRIBUTION_COLORS = ['#fbbf24', '#3b82f6', '#8b5cf6', '#1e293b'];

const CATEGORY_COLORS = {
  streak: '#f97316',
  volume: '#3b82f6',
  accuracy: '#22c55e',
  milestone: '#8b5cf6',
};

export const StatisticsDashboard: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month'>('week');
  const [heatmapDays, setHeatmapDays] = useState<number>(90);

  // Fetch overview
  const { data: overview, isLoading } = useQuery<StudyOverviewResponse>({
    queryKey: ['statistics-overview'],
    queryFn: () => statisticsApi.getOverview(30),
  });

  // Fetch period summary
  const { data: summary } = useQuery<PeriodSummaryResponse>({
    queryKey: ['statistics-summary', selectedPeriod],
    queryFn: () => statisticsApi.getSummary(selectedPeriod),
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

  // Prepare accuracy chart data
  const accuracyChartData = overview.accuracyTrends.slice(-14).map((trend) => ({
    date: new Date(trend.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    accuracy: Math.round(trend.accuracy * 100),
    movingAvg7: Math.round(trend.movingAverage7Day * 100),
    movingAvg30: Math.round(trend.movingAverage30Day * 100),
  }));

  // Prepare time distribution chart data
  const timeDistributionData = [
    { name: 'Morning', value: overview.paceAnalysis.studyTimeDistribution.morning },
    { name: 'Afternoon', value: overview.paceAnalysis.studyTimeDistribution.afternoon },
    { name: 'Evening', value: overview.paceAnalysis.studyTimeDistribution.evening },
    { name: 'Night', value: overview.paceAnalysis.studyTimeDistribution.night },
  ].filter((d) => d.value > 0);

  // Prepare activity chart data
  const activityChartData = overview.recentActivity.slice(-14).map((day) => ({
    date: new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }),
    items: day.itemsReviewed,
    minutes: day.totalMinutes,
  }));

  // Prepare heatmap
  const generateHeatmapCalendar = () => {
    const heatmapMap = new Map<string, { items: number; intensity: number }>();
    overview.heatmap.forEach((cell) => {
      const dateKey = new Date(cell.date).toISOString().split('T')[0];
      heatmapMap.set(dateKey, { items: cell.itemsReviewed, intensity: cell.intensity });
    });

    const weeks: Array<Array<{ date: Date; items: number; intensity: number } | null>> = [];
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - heatmapDays);

    // Align to start of week (Sunday)
    startDate.setDate(startDate.getDate() - startDate.getDay());

    let currentWeek: Array<{ date: Date; items: number; intensity: number } | null> = [];
    const current = new Date(startDate);

    while (current <= today) {
      const dateKey = current.toISOString().split('T')[0];
      const data = heatmapMap.get(dateKey);

      if (current > today) {
        currentWeek.push(null);
      } else {
        currentWeek.push({
          date: new Date(current),
          items: data?.items || 0,
          intensity: data?.intensity || 0,
        });
      }

      if (current.getDay() === 6) {
        weeks.push(currentWeek);
        currentWeek = [];
      }

      current.setDate(current.getDate() + 1);
    }

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    return weeks;
  };

  const heatmapCalendar = generateHeatmapCalendar();

  const getHeatmapColor = (intensity: number): string => {
    if (intensity === 0) return '#e5e7eb';
    if (intensity < 0.25) return '#bfdbfe';
    if (intensity < 0.5) return '#60a5fa';
    if (intensity < 0.75) return '#3b82f6';
    return '#1d4ed8';
  };

  const getBadgeCategoryColor = (category: Badge['category']): string => {
    return CATEGORY_COLORS[category] || '#6b7280';
  };

  const formatMinutes = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const unlockedBadges = overview.badges.filter((b) => b.unlockedAt);
  const inProgressBadges = overview.badges.filter((b) => !b.unlockedAt);

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

          {/* Period Selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedPeriod('week')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedPeriod === 'week'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => setSelectedPeriod('month')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedPeriod === 'month'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              This Month
            </button>
          </div>
        </div>

        {/* Streak and Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Current Streak */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{String.fromCodePoint(0x1f525)}</span>
              <div className="text-sm font-medium text-gray-600">Current Streak</div>
            </div>
            <div className="mt-2 text-4xl font-bold text-orange-600">
              {overview.streak.currentStreak}
              <span className="text-lg text-gray-500 ml-1">days</span>
            </div>
            <div className="mt-1 text-sm text-gray-500">
              Best: {overview.streak.longestStreak} days
            </div>
            {overview.streak.isActiveToday && (
              <div className="mt-2 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full inline-block">
                {String.fromCodePoint(0x2713)} Studied today
              </div>
            )}
          </div>

          {/* Time This Period */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{String.fromCodePoint(0x23f1)}</span>
              <div className="text-sm font-medium text-gray-600">Time ({selectedPeriod})</div>
            </div>
            <div className="mt-2 text-4xl font-bold text-blue-600">
              {formatMinutes(
                selectedPeriod === 'week'
                  ? overview.timeStats.weeklyTotal
                  : overview.timeStats.monthlyTotal
              )}
            </div>
            <div className="mt-1 text-sm text-gray-500">
              {overview.timeStats.totalSessions} total sessions
            </div>
          </div>

          {/* Items Reviewed */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{String.fromCodePoint(0x1f4da)}</span>
              <div className="text-sm font-medium text-gray-600">Items Reviewed</div>
            </div>
            <div className="mt-2 text-4xl font-bold text-purple-600">
              {summary?.totalItemsReviewed ?? 0}
            </div>
            <div className="mt-1 text-sm text-gray-500">
              Avg accuracy: {summary ? Math.round(summary.averageAccuracy * 100) : 0}%
            </div>
          </div>

          {/* Study Pattern */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{String.fromCodePoint(0x1f4c8)}</span>
              <div className="text-sm font-medium text-gray-600">Study Pattern</div>
            </div>
            <div
              className="mt-2 text-2xl font-bold"
              style={{ color: PATTERN_COLORS[overview.paceAnalysis.pattern] }}
            >
              {PATTERN_LABELS[overview.paceAnalysis.pattern]}
            </div>
            <div className="mt-1 text-sm text-gray-500">
              {overview.paceAnalysis.activeDaysPerWeek.toFixed(1)} days/week
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Accuracy Trends */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Accuracy Trends</h2>
            {accuracyChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={accuracyChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip formatter={(value) => `${String(value ?? 0)}%`} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    name="Daily"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="movingAvg7"
                    name="7-Day Avg"
                    stroke="#22c55e"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                No accuracy data available
              </div>
            )}
          </div>

          {/* Daily Activity */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Daily Activity</h2>
            {activityChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={activityChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" orientation="left" stroke="#3b82f6" />
                  <YAxis yAxisId="right" orientation="right" stroke="#22c55e" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="items" name="Items" fill="#3b82f6" />
                  <Bar yAxisId="right" dataKey="minutes" name="Minutes" fill="#22c55e" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                No activity data available
              </div>
            )}
          </div>
        </div>

        {/* Time Distribution and Heatmap */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Time Distribution */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Study Time Distribution</h2>
            {timeDistributionData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={timeDistributionData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {timeDistributionData.map((_, index) => (
                      <Cell
                        key={`cell-${String(index)}`}
                        fill={TIME_DISTRIBUTION_COLORS[index % TIME_DISTRIBUTION_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-gray-500">
                No time distribution data
              </div>
            )}
          </div>

          {/* Activity Heatmap */}
          <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Activity Heatmap</h2>
              <select
                value={heatmapDays}
                onChange={(e) => setHeatmapDays(parseInt(e.target.value))}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
              >
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
                <option value={180}>Last 180 days</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <div className="flex gap-1">
                {heatmapCalendar.map((week, weekIdx) => (
                  <div key={weekIdx} className="flex flex-col gap-1">
                    {week.map((day, dayIdx) => (
                      <div
                        key={dayIdx}
                        className="w-3 h-3 rounded-sm cursor-pointer"
                        style={{
                          backgroundColor: day ? getHeatmapColor(day.intensity) : 'transparent',
                        }}
                        title={day ? `${day.date.toLocaleDateString()}: ${day.items} items` : ''}
                      />
                    ))}
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-2 mt-3 text-sm text-gray-600">
                <span>Less</span>
                <div className="flex gap-1">
                  {[0, 0.25, 0.5, 0.75, 1].map((intensity) => (
                    <div
                      key={intensity}
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: getHeatmapColor(intensity) }}
                    />
                  ))}
                </div>
                <span>More</span>
              </div>
            </div>
          </div>
        </div>

        {/* Badges Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Badges & Achievements ({unlockedBadges.length}/{overview.badges.length})
          </h2>

          {/* Unlocked Badges */}
          {unlockedBadges.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-3">
                {String.fromCodePoint(0x1f3c6)} Unlocked
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {unlockedBadges.map((badge) => (
                  <div
                    key={badge.id}
                    className="border-2 rounded-lg p-4 text-center"
                    style={{ borderColor: getBadgeCategoryColor(badge.category) }}
                  >
                    <div className="text-4xl mb-2">
                      {badge.category === 'streak' && String.fromCodePoint(0x1f525)}
                      {badge.category === 'volume' && String.fromCodePoint(0x1f4da)}
                      {badge.category === 'accuracy' && String.fromCodePoint(0x1f3af)}
                      {badge.category === 'milestone' && String.fromCodePoint(0x2b50)}
                    </div>
                    <div className="font-semibold text-gray-900">{badge.name}</div>
                    <div className="text-xs text-gray-500 mt-1">{badge.description}</div>
                    {badge.unlockedAt && (
                      <div className="text-xs text-green-600 mt-2">
                        {new Date(badge.unlockedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* In-Progress Badges */}
          {inProgressBadges.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-700 mb-3">
                {String.fromCodePoint(0x1f3c3)} In Progress
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {inProgressBadges.slice(0, 5).map((badge) => (
                  <div
                    key={badge.id}
                    className="border border-gray-200 rounded-lg p-4 text-center opacity-75"
                  >
                    <div className="text-4xl mb-2 grayscale">
                      {badge.category === 'streak' && String.fromCodePoint(0x1f525)}
                      {badge.category === 'volume' && String.fromCodePoint(0x1f4da)}
                      {badge.category === 'accuracy' && String.fromCodePoint(0x1f3af)}
                      {badge.category === 'milestone' && String.fromCodePoint(0x2b50)}
                    </div>
                    <div className="font-semibold text-gray-700">{badge.name}</div>
                    <div className="text-xs text-gray-500 mt-1">{badge.description}</div>
                    {badge.progress !== undefined && badge.target !== undefined && (
                      <div className="mt-2">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${Math.min((badge.progress / badge.target) * 100, 100)}%`,
                              backgroundColor: getBadgeCategoryColor(badge.category),
                            }}
                          />
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {badge.progress} / {badge.target}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {overview.badges.length === 0 && (
            <div className="text-center text-gray-500 py-8">Start studying to earn badges!</div>
          )}
        </div>

        {/* Period Summary */}
        {summary && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {selectedPeriod === 'week' ? 'This Week' : 'This Month'} Summary
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-3xl font-bold text-blue-600">
                  {formatMinutes(summary.totalMinutes)}
                </div>
                <div className="text-sm text-gray-600">Time Spent</div>
              </div>

              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-3xl font-bold text-purple-600">{summary.totalSessions}</div>
                <div className="text-sm text-gray-600">Sessions</div>
              </div>

              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-3xl font-bold text-green-600">
                  {summary.totalItemsReviewed}
                </div>
                <div className="text-sm text-gray-600">Items Reviewed</div>
              </div>

              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-3xl font-bold text-orange-600">
                  {Math.round(summary.averageAccuracy * 100)}%
                </div>
                <div className="text-sm text-gray-600">Avg Accuracy</div>
              </div>

              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-3xl font-bold text-indigo-600">{summary.activeDays}</div>
                <div className="text-sm text-gray-600">Active Days</div>
              </div>
            </div>

            {summary.newBadges.length > 0 && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="font-semibold text-yellow-800 mb-2">
                  {String.fromCodePoint(0x1f389)} New Badges Earned!
                </div>
                <div className="flex gap-2 flex-wrap">
                  {summary.newBadges.map((badge) => (
                    <span
                      key={badge.id}
                      className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm"
                    >
                      {badge.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
