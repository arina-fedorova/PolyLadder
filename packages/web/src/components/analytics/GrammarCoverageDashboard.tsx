import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { BookOpen, Target, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { grammarAnalyticsApi } from '@/api/analytics';

const CEFR_COLORS: Record<string, string> = {
  A0: '#E5E7EB',
  A1: '#93c5fd',
  A2: '#60a5fa',
  B1: '#3b82f6',
  B2: '#2563eb',
  C1: '#1d4ed8',
  C2: '#1e3a8a',
};

const PRIORITY_STYLES = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-blue-100 text-blue-800 border-blue-200',
};

interface GrammarCoverageDashboardProps {
  language?: string;
}

export function GrammarCoverageDashboard({ language }: GrammarCoverageDashboardProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<string | undefined>(language);
  const [trendDays, setTrendDays] = useState<7 | 14 | 30>(30);

  const {
    data: coverage,
    isLoading: coverageLoading,
    error: coverageError,
  } = useQuery({
    queryKey: ['grammar-coverage', selectedLanguage],
    queryFn: () => grammarAnalyticsApi.getCoverage(selectedLanguage),
    refetchInterval: 60000,
  });

  const { data: recommendations } = useQuery({
    queryKey: ['grammar-recommendations', selectedLanguage],
    queryFn: () =>
      selectedLanguage
        ? grammarAnalyticsApi.getRecommendations(selectedLanguage, 5)
        : Promise.resolve({ recommendations: [] }),
    enabled: !!selectedLanguage,
    refetchInterval: 60000,
  });

  const { data: trends } = useQuery({
    queryKey: ['grammar-trends', selectedLanguage, trendDays],
    queryFn: () => grammarAnalyticsApi.getTrends(selectedLanguage, trendDays),
    refetchInterval: 60000,
  });

  if (coverageLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (coverageError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Failed to load grammar analytics</p>
      </div>
    );
  }

  if (!coverage) {
    return null;
  }

  const gapsRemaining = coverage.totalConcepts - coverage.completedConcepts;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Grammar Coverage</h1>
        <p className="text-gray-600 mt-1">Track your grammar learning progress</p>
      </div>

      {/* Language Filter */}
      {coverage.byLanguage.length > 0 && !language && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedLanguage(undefined)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              !selectedLanguage
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            All Languages
          </button>
          {coverage.byLanguage.map((lang) => (
            <button
              key={lang.language}
              onClick={() => setSelectedLanguage(lang.language)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedLanguage === lang.language
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {lang.language}
            </button>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Concepts</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{coverage.totalConcepts}</p>
            </div>
            <BookOpen className="w-8 h-8 text-primary-600" />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{coverage.completedConcepts}</p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <p className="text-xs text-gray-500 mt-2">{coverage.coveragePercentage}% complete</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Gaps</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">{gapsRemaining}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-orange-600" />
          </div>
          <p className="text-xs text-gray-500 mt-2">Concepts to learn</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Recently Completed</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {coverage.recentlyCompleted.length}
              </p>
            </div>
            <Target className="w-8 h-8 text-primary-600" />
          </div>
          <p className="text-xs text-gray-500 mt-2">Last 30 days</p>
        </div>
      </div>

      {/* CEFR Coverage Chart */}
      {coverage.byCEFR.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Coverage by CEFR Level</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={coverage.byCEFR}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="level" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value, name) => [value, name === 'completed' ? 'Completed' : 'Total']}
              />
              <Legend formatter={(value) => (value === 'completed' ? 'Completed' : 'Total')} />
              <Bar dataKey="total" fill="#E5E7EB" name="total" />
              <Bar dataKey="completed" fill="#22c55e" name="completed" />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 flex flex-wrap gap-4 justify-center">
            {coverage.byCEFR.map((level) => (
              <div key={level.level} className="text-center">
                <span
                  className="inline-block px-3 py-1 rounded text-sm font-medium"
                  style={{ backgroundColor: CEFR_COLORS[level.level] || '#E5E7EB' }}
                >
                  {level.level}
                </span>
                <p className="text-sm text-gray-600 mt-1">{level.percentage}%</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category Progress */}
      {coverage.byCategory.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Coverage by Category</h2>
          <div className="space-y-4">
            {coverage.byCategory.slice(0, 10).map((cat) => (
              <div key={cat.category}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">{cat.category}</span>
                  <span className="text-sm text-gray-600">
                    {cat.completed}/{cat.total} ({cat.percentage}%)
                  </span>
                </div>
                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all duration-300"
                    style={{ width: `${cat.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {selectedLanguage && recommendations && recommendations.recommendations.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Recommended Next Steps</h2>
          <div className="space-y-3">
            {recommendations.recommendations.map((rec) => (
              <div
                key={rec.conceptId}
                className="flex items-start justify-between p-4 border border-gray-200 rounded-lg hover:border-primary-300 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{rec.title}</h3>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium border ${PRIORITY_STYLES[rec.priority]}`}
                    >
                      {rec.priority}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{rec.reason}</p>
                  <span className="text-xs text-gray-500">CEFR: {rec.cefrLevel}</span>
                </div>
                <button className="ml-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm">
                  Practice
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mastery Trends */}
      {trends && trends.trends.length > 0 && (
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
              <YAxis tick={{ fontSize: 12 }} yAxisId="left" />
              <YAxis tick={{ fontSize: 12 }} yAxisId="right" orientation="right" />
              <Tooltip
                labelFormatter={(value: string) => new Date(value).toLocaleDateString()}
                formatter={(value, name) => [
                  name === 'averageMastery' ? `${String(value)}%` : value,
                  name === 'conceptsCompleted' ? 'Completed' : 'Avg Mastery',
                ]}
              />
              <Legend
                formatter={(value) =>
                  value === 'conceptsCompleted' ? 'Concepts Completed' : 'Avg Mastery'
                }
              />
              <Line
                type="monotone"
                dataKey="conceptsCompleted"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3 }}
                yAxisId="left"
              />
              <Line
                type="monotone"
                dataKey="averageMastery"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ r: 3 }}
                yAxisId="right"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Gaps (Uncompleted) */}
      {coverage.gaps.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Concepts to Learn ({coverage.gaps.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {coverage.gaps.slice(0, 12).map((gap) => (
              <div key={gap.id} className="p-4 border border-orange-200 bg-orange-50 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-1">{gap.title}</h3>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">{gap.category}</span>
                  <span
                    className="px-2 py-0.5 rounded font-medium"
                    style={{ backgroundColor: CEFR_COLORS[gap.cefrLevel] || '#E5E7EB' }}
                  >
                    {gap.cefrLevel}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {coverage.gaps.length > 12 && (
            <p className="mt-4 text-center text-sm text-gray-600">
              + {coverage.gaps.length - 12} more concepts to learn
            </p>
          )}
        </div>
      )}

      {/* Recently Completed */}
      {coverage.recentlyCompleted.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Recently Completed</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {coverage.recentlyCompleted.map((concept) => (
              <div key={concept.id} className="p-4 border border-green-200 bg-green-50 rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">{concept.title}</h3>
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span
                    className="px-2 py-0.5 rounded font-medium"
                    style={{ backgroundColor: CEFR_COLORS[concept.cefrLevel] || '#E5E7EB' }}
                  >
                    {concept.cefrLevel}
                  </span>
                  <span className="text-gray-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(concept.lastPracticed).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {coverage.totalConcepts === 0 && (
        <div className="card p-12 text-center">
          <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Grammar Concepts Yet</h3>
          <p className="text-gray-600">Start learning grammar to see your progress here.</p>
        </div>
      )}
    </div>
  );
}
