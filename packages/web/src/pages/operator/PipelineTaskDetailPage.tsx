import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import {
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';

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
  topic_type: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

interface PipelineEvent {
  id: string;
  event_type: string;
  stage: string | null;
  status: string | null;
  from_stage: string | null;
  to_stage: string | null;
  from_status: string | null;
  to_status: string | null;
  success: boolean | null;
  error_message: string | null;
  duration_ms: number | null;
  payload: Record<string, unknown>;
  created_at: string;
}

interface PipelineTaskDetailResponse {
  task: PipelineTask;
  events: PipelineEvent[];
}

export function PipelineTaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<PipelineTaskDetailResponse>({
    queryKey: ['pipeline-task', taskId],
    queryFn: async () => {
      const response = await apiClient.get<PipelineTaskDetailResponse>(
        `/operational/pipeline-tasks/${taskId}`
      );
      return response.data;
    },
    refetchInterval: 5000,
    enabled: !!taskId,
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<{ success: boolean; message: string; taskId: string }>(
        `/operational/pipeline-tasks/${taskId}/retry`,
        {
          force: false,
        }
      );
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline-task', taskId] });
      void queryClient.invalidateQueries({ queryKey: ['pipeline-tasks'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.delete<{
        success: boolean;
        message: string;
        taskId: string;
      }>(`/operational/pipeline-tasks/${taskId}`);
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline-tasks'] });
      void navigate('/operator/pipeline');
    },
  });

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'pending':
        return { icon: Clock, color: 'text-yellow-600', bgColor: 'bg-yellow-50' };
      case 'processing':
        return { icon: Loader2, color: 'text-blue-600', bgColor: 'bg-blue-50' };
      case 'completed':
        return { icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-50' };
      case 'failed':
        return { icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-50' };
      default:
        return { icon: AlertCircle, color: 'text-gray-600', bgColor: 'bg-gray-50' };
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Failed to load task details</p>
      </div>
    );
  }

  const { task, events } = data;
  const statusConfig = getStatusConfig(task.current_status);
  const StatusIcon = statusConfig.icon;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              void navigate('/operator/pipeline');
            }}
            className="text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline Task Details</h1>
        </div>
        <div className="flex items-center gap-2">
          {task.current_status === 'failed' && (
            <button
              onClick={() => {
                if (window.confirm('Retry this task?')) {
                  void retryMutation.mutate();
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              disabled={retryMutation.isPending}
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          )}
          <button
            onClick={() => {
              if (window.confirm('Delete this task? This action cannot be undone.')) {
                void deleteMutation.mutate();
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Task Information</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-gray-500">Status</dt>
              <dd className="mt-1">
                <span
                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${statusConfig.bgColor} ${statusConfig.color}`}
                >
                  <StatusIcon className="w-4 h-4" />
                  {task.current_status}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Stage</dt>
              <dd className="mt-1 text-sm text-gray-900">{task.current_stage}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Type</dt>
              <dd className="mt-1 text-sm text-gray-900 capitalize">{task.data_type}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Source</dt>
              <dd className="mt-1 text-sm text-gray-900">{task.source || '-'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Document</dt>
              <dd className="mt-1 text-sm text-gray-900">{task.document_name || '-'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Topic</dt>
              <dd className="mt-1 text-sm text-gray-900">{task.topic_name || '-'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Retry Count</dt>
              <dd className="mt-1 text-sm text-gray-900">{task.retry_count}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Created At</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {new Date(task.created_at).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Updated At</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {new Date(task.updated_at).toLocaleString()}
              </dd>
            </div>
            {task.error_message && (
              <div>
                <dt className="text-sm font-medium text-red-500">Error Message</dt>
                <dd className="mt-1 text-sm text-red-700 bg-red-50 p-2 rounded">
                  {task.error_message}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Metadata</h2>
          <pre className="text-xs bg-gray-50 p-4 rounded-lg overflow-auto max-h-96">
            {JSON.stringify(task.metadata, null, 2)}
          </pre>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Event History ({events.length})
        </h2>
        <div className="space-y-4">
          {events.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No events recorded</p>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
              <div className="space-y-6">
                {events.map((event, index) => (
                  <div key={event.id} className="relative pl-12">
                    <div className="absolute left-0 top-1 w-8 h-8 bg-white border-2 border-gray-300 rounded-full flex items-center justify-center">
                      <span className="text-xs font-medium text-gray-600">{index + 1}</span>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{event.event_type}</span>
                          {event.success !== null && (
                            <span
                              className={`px-2 py-0.5 rounded text-xs ${
                                event.success
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {event.success ? 'Success' : 'Failed'}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(event.created_at).toLocaleString()}
                        </span>
                      </div>
                      {(event.from_stage || event.to_stage) && (
                        <div className="text-sm text-gray-600 mb-2">
                          {event.from_stage && event.to_stage && (
                            <span>
                              {event.from_stage} → {event.to_stage}
                            </span>
                          )}
                          {event.from_status && event.to_status && (
                            <span className="ml-2">
                              ({event.from_status} → {event.to_status})
                            </span>
                          )}
                        </div>
                      )}
                      {event.error_message && (
                        <div className="text-sm text-red-600 bg-red-50 p-2 rounded mt-2">
                          {event.error_message}
                        </div>
                      )}
                      {event.duration_ms && (
                        <div className="text-xs text-gray-500 mt-2">
                          Duration: {event.duration_ms}ms
                        </div>
                      )}
                      {Object.keys(event.payload || {}).length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-gray-500 cursor-pointer">
                            View payload
                          </summary>
                          <pre className="text-xs bg-gray-50 p-2 rounded mt-2 overflow-auto">
                            {JSON.stringify(event.payload, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
