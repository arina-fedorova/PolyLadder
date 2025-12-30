import { useState } from 'react';
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
import { PipelineReviewQueue } from '@/components/operator/PipelineReviewQueue';
import { PipelineFailures } from '@/components/operator/PipelineFailures';
import { PipelineDraftReview } from '@/components/operator/PipelineDraftReview';

interface PipelineDetail {
  pipeline: {
    id: string;
    document_id: string;
    status: string;
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
    document_status: string;
    uploader_email: string;
  };
  tasks: Array<{
    id: string;
    pipeline_id: string | null;
    item_id: string;
    item_type: string;
    data_type: string;
    task_type: string | null;
    current_status: string;
    current_stage: string;
    document_name: string | null;
    topic_name: string | null;
    error_message: string | null;
    retry_count: number;
    created_at: string;
    updated_at: string;
  }>;
  events: Array<{
    id: string;
    task_id: string | null;
    item_id: string;
    item_type: string;
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
    task_type: string | null;
  }>;
  contentStats: {
    draft: number;
    candidate: number;
    validated: number;
    approved: number;
    total: number;
  };
}

export function PipelineDetailPage() {
  const { pipelineId } = useParams<{ pipelineId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'drafts' | 'review' | 'failures'>(
    'overview'
  );

  const { data, isLoading, error } = useQuery<PipelineDetail>({
    queryKey: ['pipeline', pipelineId],
    queryFn: async () => {
      const response = await apiClient.get<PipelineDetail>(`/operational/pipelines/${pipelineId}`);
      return response.data;
    },
    refetchInterval: 5000, // Refresh every 5 seconds
    enabled: !!pipelineId,
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<{
        success: boolean;
        retriedTasks: number;
        message?: string;
      }>(`/operational/pipelines/${pipelineId}/retry`, {});
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline', pipelineId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.delete<{ success: boolean; message?: string }>(
        `/operational/pipelines/${pipelineId}`
      );
      return response.data;
    },
    onSuccess: () => {
      void navigate('/operator/pipelines');
    },
    onError: (error) => {
      console.error('Failed to delete pipeline:', error);
      alert(
        `Failed to delete pipeline: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    },
  });

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'pending':
        return { icon: Clock, color: 'text-gray-600', bgColor: 'bg-gray-50' };
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

  const getTaskTypeColor = (taskType: string) => {
    const colors: Record<string, string> = {
      // Document processing task types
      extract: 'bg-purple-100 text-purple-800',
      chunk: 'bg-blue-100 text-blue-800',
      map: 'bg-yellow-100 text-yellow-800',
      transform: 'bg-green-100 text-green-800',
      validate: 'bg-indigo-100 text-indigo-800',
      approve: 'bg-pink-100 text-pink-800',
      // Content lifecycle item types
      draft: 'bg-gray-100 text-gray-800',
      candidate: 'bg-blue-100 text-blue-800',
      validated: 'bg-yellow-100 text-yellow-800',
    };
    return colors[taskType] || 'bg-gray-100 text-gray-800';
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
        <p className="text-red-700">Failed to load pipeline details</p>
      </div>
    );
  }

  const { pipeline, tasks, events, contentStats } = data;
  const statusConfig = getStatusConfig(pipeline.status);
  const StatusIcon = statusConfig.icon;

  // Determine if pipeline is waiting for content approval
  const isWaitingForApproval =
    pipeline.status === 'completed' &&
    contentStats.total > 0 &&
    contentStats.approved < contentStats.total;

  // Calculate content approval percentage
  const contentApprovalPercentage =
    contentStats.total > 0 ? Math.round((contentStats.approved / contentStats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              void navigate('/operator/pipelines');
            }}
            className="text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pipeline Details</h1>
            <p className="text-gray-600 mt-1">{pipeline.original_filename}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pipeline.status === 'failed' && (
            <button
              onClick={() => {
                if (window.confirm('Retry all failed tasks in this pipeline?')) {
                  void retryMutation.mutate();
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              disabled={retryMutation.isPending}
            >
              <RefreshCw className="w-4 h-4" />
              Retry Failed
            </button>
          )}
          <button
            onClick={() => {
              if (window.confirm('Delete this pipeline and document? This cannot be undone.')) {
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pipeline Status</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-gray-500">Status</dt>
              <dd className="mt-1">
                <span
                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${statusConfig.bgColor} ${statusConfig.color}`}
                >
                  <StatusIcon className="w-4 h-4" />
                  {pipeline.status}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Current Stage</dt>
              <dd className="mt-1 text-sm text-gray-900 capitalize">
                {pipeline.current_stage.replace('_', ' ')}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Progress</dt>
              <dd className="mt-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full transition-all"
                      style={{ width: `${pipeline.progress_percentage}%` }}
                    ></div>
                  </div>
                  <span className="text-sm text-gray-600 min-w-[3rem] text-right">
                    {pipeline.progress_percentage}%
                  </span>
                </div>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Tasks</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {pipeline.completed_tasks} / {pipeline.total_tasks} completed
                {pipeline.failed_tasks > 0 && (
                  <span className="text-red-600 ml-2">({pipeline.failed_tasks} failed)</span>
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Document Info</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-gray-500">Language</dt>
              <dd className="mt-1 text-sm text-gray-900">{pipeline.language}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Target Level</dt>
              <dd className="mt-1 text-sm text-gray-900">{pipeline.target_level || 'A1'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Document Type</dt>
              <dd className="mt-1 text-sm text-gray-900 capitalize">
                {pipeline.document_type.replace('_', ' ')}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Uploaded By</dt>
              <dd className="mt-1 text-sm text-gray-900">{pipeline.uploader_email}</dd>
            </div>
          </dl>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-gray-500">Created</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {new Date(pipeline.created_at).toLocaleString()}
              </dd>
            </div>
            {pipeline.started_at && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Started</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(pipeline.started_at).toLocaleString()}
                </dd>
              </div>
            )}
            {pipeline.completed_at && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Completed</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(pipeline.completed_at).toLocaleString()}
                </dd>
              </div>
            )}
            {pipeline.started_at && pipeline.completed_at && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Duration</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {Math.round(
                    (new Date(pipeline.completed_at).getTime() -
                      new Date(pipeline.started_at).getTime()) /
                      1000 /
                      60
                  )}{' '}
                  minutes
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {contentStats.total > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Content Lifecycle Progress</h2>
            <span className="text-sm text-gray-600">
              {contentStats.approved} / {contentStats.total} Approved ({contentApprovalPercentage}%)
            </span>
          </div>

          {isWaitingForApproval && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-900">
                    Document Processing Complete - Awaiting Content Approval
                  </p>
                  <p className="text-sm text-blue-700 mt-1">
                    All document processing tasks have completed successfully. The pipeline will
                    complete once all extracted content ({contentStats.total} items) reaches the
                    APPROVED stage.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all"
                  style={{ width: `${contentApprovalPercentage}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-300 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Draft
                </span>
                <span
                  className={`text-2xl font-bold ${contentStats.draft > 0 ? 'text-gray-700' : 'text-gray-400'}`}
                >
                  {contentStats.draft}
                </span>
              </div>
              <div className="text-xs text-gray-500">Initial content extraction</div>
              {contentStats.draft > 0 && (
                <div className="mt-2 h-1 bg-gray-300 rounded-full animate-pulse"></div>
              )}
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                  Candidate
                </span>
                <span
                  className={`text-2xl font-bold ${contentStats.candidate > 0 ? 'text-blue-700' : 'text-blue-400'}`}
                >
                  {contentStats.candidate}
                </span>
              </div>
              <div className="text-xs text-blue-600">Normalized & ready for validation</div>
              {contentStats.candidate > 0 && (
                <div className="mt-2 h-1 bg-blue-400 rounded-full animate-pulse"></div>
              )}
            </div>

            <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-2 border-yellow-300 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-yellow-700 uppercase tracking-wide">
                  Validated
                </span>
                <span
                  className={`text-2xl font-bold ${contentStats.validated > 0 ? 'text-yellow-700' : 'text-yellow-400'}`}
                >
                  {contentStats.validated}
                </span>
              </div>
              <div className="text-xs text-yellow-700">Passed quality gates</div>
              {contentStats.validated > 0 && (
                <div className="mt-2 h-1 bg-yellow-400 rounded-full animate-pulse"></div>
              )}
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                  Approved
                </span>
                <span
                  className={`text-2xl font-bold ${contentStats.approved > 0 ? 'text-green-700' : 'text-green-400'}`}
                >
                  {contentStats.approved}
                </span>
              </div>
              <div className="text-xs text-green-700">Ready for production</div>
              {contentStats.approved > 0 && (
                <div className="mt-2 h-1 bg-green-500 rounded-full"></div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 mt-4 text-gray-400">
            <span className="text-xs">DRAFT</span>
            <span>→</span>
            <span className="text-xs">CANDIDATE</span>
            <span>→</span>
            <span className="text-xs">VALIDATED</span>
            <span>→</span>
            <span className="text-xs">APPROVED</span>
          </div>
        </div>
      )}

      {pipeline.error_message && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-medium text-red-800">Pipeline Error</p>
          <p className="text-sm text-red-700 mt-1">{pipeline.error_message}</p>
        </div>
      )}

      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('drafts')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'drafts'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Drafts
            {contentStats.draft > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-full">
                {contentStats.draft}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('review')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'review'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Review Queue
            {contentStats.validated > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full">
                {contentStats.validated}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('failures')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'failures'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Failures
          </button>
        </nav>
      </div>

      {activeTab === 'drafts' && pipelineId && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Draft Review</h2>
          <p className="text-sm text-gray-600 mb-4">
            Review semantic splits from LLM. Approve to promote to candidates, reject to discard, or
            re-run with feedback.
          </p>
          <PipelineDraftReview pipelineId={pipelineId} />
        </div>
      )}

      {activeTab === 'review' && pipelineId && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Review Queue</h2>
          <PipelineReviewQueue pipelineId={pipelineId} />
        </div>
      )}

      {activeTab === 'failures' && pipelineId && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quality Gate Failures</h2>
          <PipelineFailures pipelineId={pipelineId} />
        </div>
      )}

      {activeTab === 'overview' && (
        <>
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Tasks ({tasks.length})</h2>
            {tasks.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No tasks created yet</p>
            ) : (
              <div className="space-y-3">
                {tasks.map((task, index) => {
                  const taskStatusConfig = getStatusConfig(task.current_status);
                  const TaskStatusIcon = taskStatusConfig.icon;

                  return (
                    <div
                      key={task.id}
                      className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                    >
                      <div className="flex-shrink-0 w-8 h-8 bg-white border-2 border-gray-300 rounded-full flex items-center justify-center">
                        <span className="text-xs font-medium text-gray-600">{index + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getTaskTypeColor(task.task_type || task.item_type)}`}
                          >
                            {task.task_type || task.item_type}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${taskStatusConfig.bgColor} ${taskStatusConfig.color}`}
                          >
                            <TaskStatusIcon className="w-3 h-3" />
                            {task.current_status}
                          </span>
                          <span className="text-xs text-gray-500 capitalize">
                            {task.current_stage}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {task.data_type} • Created {new Date(task.created_at).toLocaleString()}
                        </p>
                        {task.error_message && (
                          <p className="text-sm text-red-600 mt-1 bg-red-50 p-2 rounded">
                            {task.error_message}
                          </p>
                        )}
                        {task.retry_count > 0 && (
                          <p className="text-xs text-gray-500 mt-1">Retries: {task.retry_count}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Event Timeline ({events.length})
            </h2>
            {events.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No events recorded</p>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                <div className="space-y-6">
                  {events.map((event) => (
                    <div key={event.id} className="relative pl-12">
                      <div
                        className={`absolute left-0 top-1 w-8 h-8 rounded-full flex items-center justify-center ${
                          event.success
                            ? 'bg-green-100 border-2 border-green-500'
                            : 'bg-red-100 border-2 border-red-500'
                        }`}
                      >
                        {event.success ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
                        )}
                      </div>
                      <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-gray-900">{event.event_type}</span>
                          <span className="text-xs text-gray-500">
                            {new Date(event.created_at).toLocaleString()}
                          </span>
                        </div>
                        {event.stage && (
                          <p className="text-sm text-gray-600 capitalize">
                            Stage: {event.stage.replace('_', ' ')}
                          </p>
                        )}
                        {event.error_message && (
                          <p className="text-sm text-red-600 bg-red-50 p-2 rounded mt-2">
                            {event.error_message}
                          </p>
                        )}
                        {event.duration_ms && (
                          <p className="text-xs text-gray-500 mt-1">
                            Duration: {event.duration_ms}ms
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
