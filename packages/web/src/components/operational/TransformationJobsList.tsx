import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Clock, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';

interface TransformationJob {
  id: string;
  status: string;
  mapping_id: string;
  chunk_id: string;
  topic_id: string;
  topic_name: string;
  topic_type: string;
  document_name: string;
  chunk_text: string;
  mapping_confidence: number;
  tokens_input: number | null;
  tokens_output: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

interface TransformationJobsResponse {
  jobs: TransformationJob[];
  total: number;
  page: number;
  limit: number;
}

export function TransformationJobsList() {
  const { data, isLoading, error } = useQuery<TransformationJobsResponse>({
    queryKey: ['transformation-jobs'],
    queryFn: async () => {
      const response = await apiClient.get<TransformationJobsResponse>(
        '/operational/transformation-jobs'
      );
      return response.data;
    },
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Failed to load transformation jobs</p>
      </div>
    );
  }

  if (!data || data.jobs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No transformation jobs found</p>
      </div>
    );
  }

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          icon: Clock,
          color: 'bg-yellow-100 text-yellow-800',
          label: 'Pending',
        };
      case 'processing':
        return {
          icon: Loader2,
          color: 'bg-blue-100 text-blue-800',
          label: 'Processing',
        };
      case 'completed':
        return {
          icon: CheckCircle,
          color: 'bg-green-100 text-green-800',
          label: 'Completed',
        };
      case 'failed':
        return {
          icon: XCircle,
          color: 'bg-red-100 text-red-800',
          label: 'Failed',
        };
      default:
        return {
          icon: AlertCircle,
          color: 'bg-gray-100 text-gray-800',
          label: status,
        };
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Transformation Jobs</h3>
        <span className="text-sm text-gray-500">Total: {data.total}</span>
      </div>

      <div className="space-y-3">
        {data.jobs.map((job) => {
          const statusConfig = getStatusConfig(job.status);
          const StatusIcon = statusConfig.icon;

          return (
            <div
              key={job.id}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}
                    >
                      <StatusIcon
                        className={`w-3 h-3 ${job.status === 'processing' ? 'animate-spin' : ''}`}
                      />
                      {statusConfig.label}
                    </div>
                    <span className="text-sm font-medium text-gray-900">{job.topic_name}</span>
                    <span className="text-xs text-gray-500">({job.topic_type})</span>
                    <span className="text-xs text-gray-400">
                      Confidence: {(job.mapping_confidence * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="text-sm text-gray-600 mb-2">
                    <span className="font-medium">Document:</span> {job.document_name}
                  </div>

                  <div className="text-xs text-gray-500 mb-2 line-clamp-2">
                    {job.chunk_text.substring(0, 200)}
                    {job.chunk_text.length > 200 ? '...' : ''}
                  </div>

                  {job.status === 'completed' && (
                    <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                      {job.tokens_input && job.tokens_output && (
                        <span>Tokens: {job.tokens_input + job.tokens_output}</span>
                      )}
                      {job.cost_usd && <span>Cost: ${parseFloat(job.cost_usd).toFixed(4)}</span>}
                      {job.duration_ms && (
                        <span>Duration: {(job.duration_ms / 1000).toFixed(2)}s</span>
                      )}
                    </div>
                  )}

                  {job.status === 'failed' && job.error_message && (
                    <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                      <strong>Error:</strong> {job.error_message}
                    </div>
                  )}

                  <div className="text-xs text-gray-400 mt-2">
                    Created: {new Date(job.created_at).toLocaleString()}
                    {job.completed_at && (
                      <span className="ml-4">
                        Completed: {new Date(job.completed_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
