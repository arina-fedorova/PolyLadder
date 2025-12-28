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
} from 'recharts';
import { apiClient } from '@/api/client';

interface TrendDataPoint {
  date: string;
  meaning: number;
  utterance: number;
  rule: number;
  exercise: number;
  total: number;
}

interface FailureTrendsResponse {
  trends: TrendDataPoint[];
  timeRange: string;
}

const DATA_TYPE_COLORS: Record<string, string> = {
  meaning: '#ef4444',
  utterance: '#f97316',
  rule: '#eab308',
  exercise: '#84cc16',
};

const DATA_TYPE_LABELS: Record<string, string> = {
  meaning: 'Meanings',
  utterance: 'Utterances',
  rule: 'Rules',
  exercise: 'Exercises',
};

export function FailureTrendsChart() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');

  const {
    data,
    isPending: isLoading,
    error,
  } = useQuery<FailureTrendsResponse>({
    queryKey: ['failure-trends', timeRange],
    queryFn: async () => {
      const response = await apiClient.get<FailureTrendsResponse>(
        `/operational/failures/trends?timeRange=${timeRange}`
      );
      return response.data;
    },
    refetchInterval: 60000,
  });

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Failure Trends</h2>

        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as '7d' | '30d' | '90d')}
          className="input text-sm py-2"
        >
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
        </select>
      </div>

      {isLoading ? (
        <div className="h-80 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : error ? (
        <div className="h-80 flex items-center justify-center text-red-600">
          Failed to load trends data
        </div>
      ) : !data || data.trends.length === 0 ? (
        <div className="h-80 flex items-center justify-center text-gray-500">
          No failure data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data.trends}>
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
              formatter={(value, name) => [value ?? 0, DATA_TYPE_LABELS[name as string] ?? name]}
            />
            <Legend formatter={(value: string) => DATA_TYPE_LABELS[value] ?? value} />
            {Object.keys(DATA_TYPE_COLORS).map((dataType) => (
              <Line
                key={dataType}
                type="monotone"
                dataKey={dataType}
                stroke={DATA_TYPE_COLORS[dataType]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      <div className="pt-4 border-t border-gray-200">
        <p className="text-sm text-gray-600">
          Track validation failure patterns to identify systematic issues and improve content
          quality.
        </p>
      </div>
    </div>
  );
}
