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
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PipelineTask {
  id: string;
  item_id: string;
  item_type: string;
  data_type: string;
  current_status: string;
  current_stage: string;
  source: string | null;
  document_name: string | null;
  topic_name: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
  event_count: number;
  last_event_at: string | null;
}

interface PipelineTasksResponse {
  tasks: PipelineTask[];
  total: number;
  page: number;
  limit: number;
}

interface PipelineTasksListProps {
  filters?: {
    status?: string;
    stage?: string;
    dataType?: string;
  };
}

export function PipelineTasksList({ filters = {} }: PipelineTasksListProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState(filters.status || '');
  const [stageFilter, setStageFilter] = useState(filters.stage || '');
  const [dataTypeFilter, setDataTypeFilter] = useState(filters.dataType || '');

  const { data, isLoading, error } = useQuery<PipelineTasksResponse>({
    queryKey: ['pipeline-tasks', page, statusFilter, stageFilter, dataTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      });
      if (statusFilter) params.append('status', statusFilter);
      if (stageFilter) params.append('stage', stageFilter);
      if (dataTypeFilter) params.append('dataType', dataTypeFilter);

      const response = await apiClient.get<PipelineTasksResponse>(
        `/operational/pipeline-tasks?${params.toString()}`
      );
      return response.data;
    },
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
  });

  const retryMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const response = await apiClient.post<{ success: boolean; message: string; taskId: string }>(
        `/operational/pipeline-tasks/${taskId}/retry`,
        {
          force: false,
        }
      );
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline-tasks'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const response = await apiClient.delete<{
        success: boolean;
        message: string;
        taskId: string;
      }>(`/operational/pipeline-tasks/${taskId}`);
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline-tasks'] });
    },
  });

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

  const getStageConfig = (stage: string) => {
    const colors: Record<string, string> = {
      DRAFT: 'bg-purple-100 text-purple-800',
      CANDIDATE: 'bg-blue-100 text-blue-800',
      VALIDATED: 'bg-green-100 text-green-800',
      APPROVED: 'bg-emerald-100 text-emerald-800',
    };
    return colors[stage] || 'bg-gray-100 text-gray-800';
  };

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
        <p className="text-red-700">Failed to load pipeline tasks</p>
      </div>
    );
  }

  if (!data || data.tasks.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No pipeline tasks found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
        <select
          value={stageFilter}
          onChange={(e) => {
            setStageFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">All Stages</option>
          <option value="DRAFT">DRAFT</option>
          <option value="CANDIDATE">CANDIDATE</option>
          <option value="VALIDATED">VALIDATED</option>
          <option value="APPROVED">APPROVED</option>
        </select>
        <select
          value={dataTypeFilter}
          onChange={(e) => {
            setDataTypeFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">All Types</option>
          <option value="rule">Rule</option>
          <option value="meaning">Meaning</option>
          <option value="exercise">Exercise</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Stage
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Document
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Topic
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Events
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Retries
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
            {data.tasks.map((task) => {
              const statusConfig = getStatusConfig(task.current_status);
              return (
                <tr key={task.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}
                    >
                      <statusConfig.icon className="w-3 h-3 mr-1" />
                      {statusConfig.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStageConfig(task.current_stage)}`}
                    >
                      {task.current_stage}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                    {task.data_type}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{task.document_name || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{task.topic_name || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {task.event_count}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {task.retry_count}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(task.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          void navigate(`/operator/pipeline/tasks/${task.id}`);
                        }}
                        className="text-primary-600 hover:text-primary-900"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {task.current_status === 'failed' && (
                        <button
                          onClick={() => {
                            if (window.confirm('Retry this task?')) {
                              retryMutation.mutate(task.id);
                            }
                          }}
                          className="text-blue-600 hover:text-blue-900"
                          title="Retry task"
                          disabled={retryMutation.isPending}
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (window.confirm('Delete this task? This action cannot be undone.')) {
                            deleteMutation.mutate(task.id);
                          }
                        }}
                        className="text-red-600 hover:text-red-900"
                        title="Delete task"
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
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
          <div className="text-sm text-gray-700">
            Showing {(page - 1) * data.limit + 1} to {Math.min(page * data.limit, data.total)} of{' '}
            {data.total} tasks
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * data.limit >= data.total}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
