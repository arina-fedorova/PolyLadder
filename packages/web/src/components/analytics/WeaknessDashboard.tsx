import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import {
  weaknessAnalyticsApi,
  WeaknessAnalysisResponse,
  WeaknessRecommendationsResponse,
  ImprovementsResponse,
  WeaknessRecommendation,
} from '../../api/analytics';

const CEFR_LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const PRIORITY_COLORS = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#fbbf24',
  low: '#a3a3a3',
};

const TYPE_COLORS = ['#3b82f6', '#8b5cf6'];

export const WeaknessDashboard: React.FC = () => {
  const [selectedLanguage, setSelectedLanguage] = useState<string | undefined>(undefined);
  const [selectedCEFR, setSelectedCEFR] = useState<string | undefined>(undefined);

  // Fetch weakness analysis
  const { data: analysis, isLoading } = useQuery<WeaknessAnalysisResponse>({
    queryKey: ['weakness-analysis', selectedLanguage, selectedCEFR],
    queryFn: () => weaknessAnalyticsApi.getAnalysis(selectedLanguage, selectedCEFR),
  });

  // Fetch recommendations
  const { data: recommendationsData } = useQuery<WeaknessRecommendationsResponse>({
    queryKey: ['weakness-recommendations', selectedLanguage],
    queryFn: () => weaknessAnalyticsApi.getRecommendations(selectedLanguage, 10),
  });

  // Fetch improvements
  const { data: improvementsData } = useQuery<ImprovementsResponse>({
    queryKey: ['weakness-improvements', selectedLanguage],
    queryFn: () => weaknessAnalyticsApi.getImprovements(selectedLanguage, 14),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Analyzing weaknesses...</div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">No weakness data available</div>
      </div>
    );
  }

  // Prepare chart data
  const typeChartData = [
    { name: 'Vocabulary', value: analysis.weaknessesByType.vocabulary },
    { name: 'Grammar', value: analysis.weaknessesByType.grammar },
  ].filter((d) => d.value > 0);

  const cefrChartData = CEFR_LEVELS.map((level) => ({
    level,
    count: analysis.weaknessesByCEFR[level] || 0,
  })).filter((d) => d.count > 0);

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      critical: 'bg-red-100 text-red-800',
      high: 'bg-orange-100 text-orange-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-gray-100 text-gray-800',
    };
    return colors[priority] || colors.low;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'improving':
        return 'text-green-600';
      case 'regressing':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'improving':
        return String.fromCodePoint(0x2191); // Up arrow
      case 'regressing':
        return String.fromCodePoint(0x2193); // Down arrow
      default:
        return String.fromCodePoint(0x2192); // Right arrow
    }
  };

  const getPriorityColor = (priority: string) => {
    return PRIORITY_COLORS[priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.low;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Weakness Identification</h1>
            <p className="mt-1 text-sm text-gray-600">Identify and improve your weak areas</p>
          </div>

          {/* Filters */}
          <div className="flex gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
              <select
                value={selectedLanguage || ''}
                onChange={(e) => setSelectedLanguage(e.target.value || undefined)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Languages</option>
                <option value="ES">Spanish</option>
                <option value="IT">Italian</option>
                <option value="PT">Portuguese</option>
                <option value="SL">Slovenian</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CEFR Level</label>
              <select
                value={selectedCEFR || ''}
                onChange={(e) => setSelectedCEFR(e.target.value || undefined)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Levels</option>
                {CEFR_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Total Weaknesses</div>
            <div className="mt-2 text-4xl font-bold text-red-600">{analysis.totalWeaknesses}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Vocabulary Issues</div>
            <div className="mt-2 text-4xl font-bold text-blue-600">
              {analysis.weaknessesByType.vocabulary}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Grammar Issues</div>
            <div className="mt-2 text-4xl font-bold text-purple-600">
              {analysis.weaknessesByType.grammar}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Last Analyzed</div>
            <div className="mt-2 text-lg font-semibold text-gray-900">
              {new Date(analysis.analyzedAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Weaknesses by Type */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Weaknesses by Type</h2>
            {typeChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={typeChartData} dataKey="value" nameKey="name" outerRadius={80} label>
                    {typeChartData.map((_, index) => (
                      <Cell
                        key={`cell-${String(index)}`}
                        fill={TYPE_COLORS[index % TYPE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                No weaknesses found
              </div>
            )}
          </div>

          {/* Weaknesses by CEFR Level */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Weaknesses by CEFR Level</h2>
            {cefrChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={cefrChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="level" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                No data available
              </div>
            )}
          </div>
        </div>

        {/* Top Weaknesses Table */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Top 20 Weaknesses</h2>
          {analysis.topWeaknesses.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Item
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      CEFR
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Accuracy
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Attempts
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Failures
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Severity
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Potential
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {analysis.topWeaknesses.slice(0, 20).map((weakness, idx) => (
                    <tr key={weakness.itemId} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {weakness.itemText}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{weakness.itemType}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{weakness.cefrLevel}</td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`font-semibold ${weakness.accuracy < 50 ? 'text-red-600' : 'text-orange-600'}`}
                        >
                          {weakness.accuracy.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{weakness.totalAttempts}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className="text-red-600 font-semibold">{weakness.failureCount}</span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${Math.min(weakness.severityScore, 100)}%`,
                              backgroundColor:
                                weakness.severityScore >= 80
                                  ? '#ef4444'
                                  : weakness.severityScore >= 60
                                    ? '#f97316'
                                    : '#fbbf24',
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">
                          {weakness.severityScore.toFixed(0)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {weakness.improvementPotential}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">No weaknesses identified</div>
          )}
        </div>

        {/* Practice Recommendations */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Practice Recommendations</h2>
          {recommendationsData?.recommendations &&
          recommendationsData.recommendations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recommendationsData.recommendations.map((rec: WeaknessRecommendation) => (
                <div
                  key={rec.itemId}
                  className="border-2 rounded-lg p-4 hover:shadow-md transition-shadow"
                  style={{ borderColor: getPriorityColor(rec.priority) }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-semibold text-gray-900">{rec.itemText}</div>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityBadge(rec.priority)}`}
                    >
                      {rec.priority}
                    </span>
                  </div>

                  <div className="text-sm text-gray-600 mb-3">{rec.reason}</div>

                  <div className="flex items-center justify-between text-sm">
                    <div className="text-gray-700">
                      <span className="font-medium">Practice type:</span> {rec.practiceType}
                    </div>
                    <div className="text-gray-500">~{rec.estimatedPracticeTime} min</div>
                  </div>

                  <button className="mt-3 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    Start Practice
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">No recommendations available</div>
          )}
        </div>

        {/* Improvement Tracking */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Improvement Tracking (Last 14 Days)
          </h2>
          {improvementsData?.improvements && improvementsData.improvements.length > 0 ? (
            <div className="space-y-3">
              {improvementsData.improvements.slice(0, 10).map((improvement) => (
                <div key={improvement.itemId} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">{improvement.itemText}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        {improvement.practiceSessionsCompleted} practice sessions completed
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`text-2xl font-bold ${getStatusColor(improvement.status)}`}>
                        {getStatusIcon(improvement.status)}{' '}
                        {improvement.improvementPercentage > 0 ? '+' : ''}
                        {improvement.improvementPercentage.toFixed(1)}%
                      </div>
                      <div className="text-sm text-gray-500">
                        {improvement.beforeAccuracy.toFixed(1)}% {String.fromCodePoint(0x2192)}{' '}
                        {improvement.afterAccuracy.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              No improvement data available yet. Keep practicing!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
