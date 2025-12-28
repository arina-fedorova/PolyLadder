import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Trash2,
  Eye,
  Filter,
  FileText,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Pipeline {
  id: string;
  document_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  current_stage: string;
  progress_percentage: number;
  error_message: string | null;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  original_filename: string;
  language: string;
  target_level: string;
  document_type: string;
  uploader_email: string;
}

interface PipelinesResponse {
  pipelines: Pipeline[];
  total: number;
  page: number;
  limit: number;
}

export function PipelinesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading, error } = useQuery<PipelinesResponse>({
    queryKey: ['pipelines', page, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      });
      if (statusFilter) params.append('status', statusFilter);

      const response = await apiClient.get<PipelinesResponse>(
        `/operational/pipelines?${params.toString()}`
      );
      return response.data;
    },
    refetchInterval: 10000, // Refresh every 10 seconds
    refetchIntervalInBackground: true,
  });

  const retryMutation = useMutation({
    mutationFn: async (pipelineId: string) => {
      const response = await apiClient.post<{
        success: boolean;
        retriedTasks: number;
        message?: string;
      }>(`/operational/pipelines/${pipelineId}/retry`, {
        force: false,
      });
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pipelines'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (pipelineId: string) => {
      const response = await apiClient.delete<{ success: boolean; message?: string }>(
        `/operational/pipelines/${pipelineId}`
      );
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pipelines'] });
    },
  });

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          icon: Clock,
          color: 'bg-gray-100 text-gray-800',
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
      case 'cancelled':
        return {
          icon: AlertCircle,
          color: 'bg-gray-100 text-gray-600',
          label: 'Cancelled',
        };
      default:
        return {
          icon: AlertCircle,
          color: 'bg-gray-100 text-gray-800',
          label: status,
        };
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Failed to load pipelines</p>
      </div>
    );
  }

  if (!data || data.pipelines.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Document Pipelines</h1>
            <p className="text-gray-600 mt-1">Track document processing from upload to approval</p>
          </div>
        </div>

        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">No pipelines found</p>
          <p className="text-sm text-gray-500 mt-1">Upload a document to create a pipeline</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document Pipelines</h1>
          <p className="text-gray-600 mt-1">
            Showing {data.pipelines.length} of {data.total} pipelines
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Processing</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">
                {data.pipelines.filter((p) => p.status === 'processing').length}
              </p>
            </div>
            <Loader2 className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-green-600 mt-1">
                {data.pipelines.filter((p) => p.status === 'completed').length}
              </p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Failed</p>
              <p className="text-2xl font-bold text-red-600 mt-1">
                {data.pipelines.filter((p) => p.status === 'failed').length}
              </p>
            </div>
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-gray-600 mt-1">
                {data.pipelines.filter((p) => p.status === 'pending').length}
              </p>
            </div>
            <Clock className="w-8 h-8 text-gray-500" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Filters:</span>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Document
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Stage
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Progress
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tasks
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.pipelines.map((pipeline) => {
                const statusConfig = getStatusConfig(pipeline.status);
                const Icon = statusConfig.icon;

                return (
                  <tr key={pipeline.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-start">
                        <FileText className="w-5 h-5 text-gray-400 mt-0.5 mr-3" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {pipeline.original_filename}
                          </p>
                          <p className="text-xs text-gray-500">
                            {pipeline.language} • {pipeline.target_level || 'A1'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}
                      >
                        <Icon className="w-3 h-3 mr-1" />
                        {statusConfig.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                      {pipeline.current_stage.replace('_', ' ')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-24 bg-gray-200 rounded-full h-2 mr-2">
                          <div
                            className="bg-primary-600 h-2 rounded-full"
                            style={{ width: `${pipeline.progress_percentage}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-600">
                          {pipeline.progress_percentage}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center gap-2">
                        <span className="text-green-600">{pipeline.completed_tasks}</span>
                        <span>/</span>
                        <span>{pipeline.total_tasks}</span>
                        {pipeline.failed_tasks > 0 && (
                          <span className="text-red-600">({pipeline.failed_tasks} failed)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(pipeline.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            void navigate(`/operator/pipelines/${pipeline.id}`);
                          }}
                          className="text-primary-600 hover:text-primary-900"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {pipeline.status === 'failed' && (
                          <button
                            onClick={() => {
                              if (window.confirm('Retry failed tasks in this pipeline?')) {
                                void retryMutation.mutate(pipeline.id);
                              }
                            }}
                            className="text-blue-600 hover:text-blue-900"
                            title="Retry pipeline"
                            disabled={retryMutation.isPending}
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                'Delete this pipeline and document? This action cannot be undone.'
                              )
                            ) {
                              void deleteMutation.mutate(pipeline.id);
                            }
                          }}
                          className="text-red-600 hover:text-red-900"
                          title="Delete pipeline"
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {data.total > data.limit && (
          <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-t border-gray-200">
            <div className="text-sm text-gray-700">
              Showing {(page - 1) * data.limit + 1} to {Math.min(page * data.limit, data.total)} of{' '}
              {data.total} pipelines
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * data.limit >= data.total}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
