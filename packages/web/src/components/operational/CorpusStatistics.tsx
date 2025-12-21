import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { apiClient } from '@/api/client';
import { Database, BookOpen, MessageSquare, FileText } from 'lucide-react';

interface CorpusStats {
  totalItems: number;
  byContentType: Record<string, number>;
  byLanguage: Record<string, number>;
  byLevel: Record<string, number>;
  byLanguageAndLevel: Array<{
    language: string;
    A0: number;
    A1: number;
    A2: number;
    B1: number;
    B2: number;
    C1: number;
    C2: number;
  }>;
}

const LEVEL_COLORS: Record<string, string> = {
  A0: '#ef4444',
  A1: '#f97316',
  A2: '#eab308',
  B1: '#84cc16',
  B2: '#22c55e',
  C1: '#06b6d4',
  C2: '#3b82f6',
};

export function CorpusStatistics() {
  const {
    data,
    isPending: isLoading,
    error,
  } = useQuery<CorpusStats>({
    queryKey: ['corpus-statistics'],
    queryFn: async () => {
      const response = await apiClient.get<CorpusStats>('/operational/corpus/statistics');
      return response.data;
    },
    refetchInterval: 300000,
  });

  if (isLoading) {
    return (
      <div className="card p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-6 bg-red-50 border-red-200">
        <p className="text-red-800">Failed to load statistics</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card bg-gradient-to-br from-primary-500 to-primary-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-primary-100 text-sm font-medium">Total Items</p>
              <p className="text-3xl font-bold mt-2">{data.totalItems.toLocaleString()}</p>
            </div>
            <Database className="w-10 h-10 text-primary-200" />
          </div>
        </div>

        <div className="card bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">Meanings</p>
              <p className="text-3xl font-bold mt-2">
                {(data.byContentType.meaning ?? 0).toLocaleString()}
              </p>
            </div>
            <BookOpen className="w-10 h-10 text-blue-200" />
          </div>
        </div>

        <div className="card bg-gradient-to-br from-green-500 to-green-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">Utterances</p>
              <p className="text-3xl font-bold mt-2">
                {(data.byContentType.utterance ?? 0).toLocaleString()}
              </p>
            </div>
            <MessageSquare className="w-10 h-10 text-green-200" />
          </div>
        </div>

        <div className="card bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm font-medium">Grammar Rules</p>
              <p className="text-3xl font-bold mt-2">
                {(data.byContentType.rule ?? 0).toLocaleString()}
              </p>
            </div>
            <FileText className="w-10 h-10 text-purple-200" />
          </div>
        </div>
      </div>

      {data.byLanguageAndLevel.length > 0 && (
        <div className="card p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">
            Coverage by Language and CEFR Level
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.byLanguageAndLevel}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="language" />
              <YAxis />
              <Tooltip />
              <Legend />
              {Object.keys(LEVEL_COLORS).map((level) => (
                <Bar key={level} dataKey={level} fill={LEVEL_COLORS[level]} stackId="a" />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">By Language</h3>
          {Object.keys(data.byLanguage).length === 0 ? (
            <p className="text-gray-500">No language data available</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(data.byLanguage)
                .sort((a, b) => b[1] - a[1])
                .map(([lang, count]) => (
                  <div key={lang} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{lang}</span>
                    <span className="text-lg font-bold text-gray-900">
                      {count.toLocaleString()}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">By CEFR Level</h3>
          {Object.keys(data.byLevel).length === 0 ? (
            <p className="text-gray-500">No level data available</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(data.byLevel)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([level, count]) => (
                  <div key={level} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{level}</span>
                    <span className="text-lg font-bold text-gray-900">
                      {count.toLocaleString()}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
