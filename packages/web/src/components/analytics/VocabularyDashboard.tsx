import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { BookOpen, TrendingUp, TrendingDown, Minus, Clock, Award, Target } from 'lucide-react';
import { analyticsApi } from '@/api/analytics';

const STATE_COLORS = {
  unknown: '#9ca3af',
  learning: '#f59e0b',
  known: '#22c55e',
};

const CEFR_COLORS = ['#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a'];

interface VocabularyDashboardProps {
  language?: string;
}

export function VocabularyDashboard({ language }: VocabularyDashboardProps) {
  const [trendDays, setTrendDays] = useState<7 | 14 | 30>(30);

  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery({
    queryKey: ['vocabulary-stats', language],
    queryFn: () => analyticsApi.getVocabularyStats(language),
    refetchInterval: 60000,
  });

  const {
    data: trends,
    isLoading: trendsLoading,
    error: trendsError,
  } = useQuery({
    queryKey: ['vocabulary-trends', language, trendDays],
    queryFn: () => analyticsApi.getVocabularyTrends(language, trendDays),
    refetchInterval: 60000,
  });

  const {
    data: velocity,
    isLoading: velocityLoading,
    error: velocityError,
  } = useQuery({
    queryKey: ['vocabulary-velocity', language],
    queryFn: () => analyticsApi.getLearningVelocity(language),
    refetchInterval: 60000,
  });

  if (statsLoading || trendsLoading || velocityLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (statsError || trendsError || velocityError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Failed to load vocabulary analytics</p>
      </div>
    );
  }

  if (!stats || !trends || !velocity) {
    return null;
  }

  const stateData = [
    { name: 'Unknown', value: stats.byState.unknown, color: STATE_COLORS.unknown },
    { name: 'Learning', value: stats.byState.learning, color: STATE_COLORS.learning },
    { name: 'Known', value: stats.byState.known, color: STATE_COLORS.known },
  ];

  const TrendIcon =
    velocity.trend === 'increasing'
      ? TrendingUp
      : velocity.trend === 'decreasing'
        ? TrendingDown
        : Minus;

  const trendColor =
    velocity.trend === 'increasing'
      ? 'text-green-600'
      : velocity.trend === 'decreasing'
        ? 'text-red-600'
        : 'text-gray-600';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Vocabulary Progress</h1>
        <p className="text-gray-600 mt-1">Track your vocabulary learning journey</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Words</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalWords}</p>
            </div>
            <BookOpen className="w-8 h-8 text-primary-600" />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Known Words</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{stats.byState.known}</p>
            </div>
            <Award className="w-8 h-8 text-green-600" />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {stats.totalWords > 0
              ? `${Math.round((stats.byState.known / stats.totalWords) * 100)}% mastered`
              : '0% mastered'}
          </p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Learning</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{stats.byState.learning}</p>
            </div>
            <Target className="w-8 h-8 text-amber-600" />
          </div>
          <p className="text-xs text-gray-500 mt-2">In progress</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Weekly Pace</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{velocity.wordsPerWeek}</p>
            </div>
            <TrendIcon className={`w-8 h-8 ${trendColor}`} />
          </div>
          <p className="text-xs text-gray-500 mt-2 capitalize">{velocity.trend}</p>
        </div>
      </div>

      {/* State Distribution & Velocity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* State Distribution */}
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Word States</h2>
          <div className="flex items-center">
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie
                  data={stateData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {stateData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [value, 'Words']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              {stateData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  ></div>
                  <span className="text-sm text-gray-600">{item.name}:</span>
                  <span className="font-semibold">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Learning Velocity */}
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Learning Velocity</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Daily Average</p>
              <p className="text-2xl font-bold text-gray-900">{velocity.wordsPerDay}</p>
              <p className="text-xs text-gray-500">words/day</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Weekly Average</p>
              <p className="text-2xl font-bold text-gray-900">{velocity.wordsPerWeek}</p>
              <p className="text-xs text-gray-500">words/week</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">This Week</p>
              <p className="text-2xl font-bold text-green-600">{velocity.wordsThisWeek}</p>
              <p className="text-xs text-gray-500">new words</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Last Week</p>
              <p className="text-2xl font-bold text-gray-600">{velocity.wordsLastWeek}</p>
              <p className="text-xs text-gray-500">words learned</p>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Progress Over Time</h2>
          <select
            value={trendDays}
            onChange={(e) => setTrendDays(Number(e.target.value) as 7 | 14 | 30)}
            className="input text-sm py-2"
          >
            <option value={7}>Last 7 Days</option>
            <option value={14}>Last 14 Days</option>
            <option value={30}>Last 30 Days</option>
          </select>
        </div>
        {trends.trends.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trends.trends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickFormatter={(value: string) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                labelFormatter={(value: string) => new Date(value).toLocaleDateString()}
                formatter={(value, name) => [
                  value,
                  name === 'totalWords' ? 'Total' : name === 'learning' ? 'Learning' : 'Known',
                ]}
              />
              <Legend
                formatter={(value: string) =>
                  value === 'totalWords' ? 'Total' : value === 'learning' ? 'Learning' : 'Known'
                }
              />
              <Line
                type="monotone"
                dataKey="totalWords"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="learning"
                stroke={STATE_COLORS.learning}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="known"
                stroke={STATE_COLORS.known}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-500">
            No trend data available yet. Start learning to see your progress!
          </div>
        )}
      </div>

      {/* CEFR Distribution */}
      {stats.byCEFR.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">CEFR Level Distribution</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.byCEFR}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="level" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => [value, 'Words']} />
              <Bar dataKey="count" fill="#3b82f6">
                {stats.byCEFR.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={CEFR_COLORS[index % CEFR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-Language Breakdown */}
      {stats.byLanguage.length > 1 && (
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">By Language</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                    Language
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Total</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">
                    Unknown
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">
                    Learning
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Known</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">
                    Mastery
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.byLanguage.map((lang) => (
                  <tr key={lang.language} className="border-b border-gray-100">
                    <td className="py-3 px-4 font-medium">{lang.language}</td>
                    <td className="text-right py-3 px-4">{lang.totalWords}</td>
                    <td className="text-right py-3 px-4 text-gray-500">{lang.unknown}</td>
                    <td className="text-right py-3 px-4 text-amber-600">{lang.learning}</td>
                    <td className="text-right py-3 px-4 text-green-600">{lang.known}</td>
                    <td className="text-right py-3 px-4">
                      <span className="text-sm font-medium">
                        {lang.totalWords > 0
                          ? `${Math.round((lang.known / lang.totalWords) * 100)}%`
                          : '0%'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recently Learned */}
      {stats.recentlyLearned.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Recently Learned</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {stats.recentlyLearned.slice(0, 20).map((word) => (
              <div
                key={word.meaningId}
                className="p-3 bg-green-50 rounded-lg border border-green-200"
              >
                <p className="font-medium text-gray-900">{word.text}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">{word.language}</span>
                  <Clock className="w-3 h-3 text-gray-400" />
                  <span className="text-xs text-gray-500">
                    {new Date(word.learnedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
