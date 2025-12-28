import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react';
import api from '../../api/client';

const COLORS = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#6b7280',
  '#14b8a6',
  '#f97316',
];

interface FeedbackStats {
  totalFeedback: number;
  byCategory: Record<string, number>;
  byOperator: Record<string, number>;
  retrySuccessRate: number;
}

export function FeedbackAnalytics() {
  const { data: stats, isLoading } = useQuery<FeedbackStats>({
    queryKey: ['feedback-stats'],
    queryFn: () => api.get('/operational/feedback/stats?days=30'),
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading analytics...</div>;
  }

  const categoryData = Object.entries(stats?.byCategory || {}).map(([name, count]) => ({
    name: name.replace(/_/g, ' '),
    count,
  }));

  const operatorData = Object.entries(stats?.byOperator || {}).map(([email, count]) => ({
    email: email.split('@')[0],
    count,
  }));

  const mostCommonIssue = categoryData[0]?.name || 'N/A';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <AlertTriangle className="w-4 h-4" />
            Total Feedback (30d)
          </div>
          <div className="text-2xl font-bold">{stats?.totalFeedback || 0}</div>
        </div>

        <div className="bg-white p-4 rounded-lg border">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <CheckCircle className="w-4 h-4" />
            Retry Success Rate
          </div>
          <div className="text-2xl font-bold">{(stats?.retrySuccessRate || 0).toFixed(1)}%</div>
        </div>

        <div className="bg-white p-4 rounded-lg border">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <TrendingUp className="w-4 h-4" />
            Most Common Issue
          </div>
          <div className="text-lg font-medium">{mostCommonIssue}</div>
        </div>

        <div className="bg-white p-4 rounded-lg border">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <TrendingDown className="w-4 h-4" />
            Active Reviewers
          </div>
          <div className="text-2xl font-bold">{Object.keys(stats?.byOperator || {}).length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded-lg border">
          <h3 className="font-medium mb-4">Feedback by Category</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={categoryData}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
              >
                {categoryData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-4 rounded-lg border">
          <h3 className="font-medium mb-4">Feedback by Reviewer</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={operatorData} layout="vertical">
              <XAxis type="number" />
              <YAxis type="category" dataKey="email" width={100} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg border">
        <h3 className="font-medium mb-4">Quality Improvement Insights</h3>
        <div className="space-y-3">
          {categoryData.slice(0, 3).map((cat, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-medium">
                {i + 1}
              </span>
              <span className="flex-1">{cat.name}</span>
              <span className="text-gray-500">{cat.count} issues</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-500 mt-4">
          Focus on reducing these common issues to improve content quality.
        </p>
      </div>
    </div>
  );
}
