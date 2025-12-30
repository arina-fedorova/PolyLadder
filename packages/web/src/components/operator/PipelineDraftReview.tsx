import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/api/client';
import { CheckCircle, XCircle, RefreshCw, Loader2 } from 'lucide-react';

interface Draft {
  id: string;
  data_type: string;
  original_content: string;
  suggested_topic_id: string;
  suggested_topic_name: string;
  suggested_level: string;
  content_type: string;
  llm_reasoning: string;
  document_name: string;
  document_id: string;
  pipeline_id: string | null;
  created_at: string;
  approval_status: string;
}

interface DraftsResponse {
  drafts: Draft[];
  total: number;
  page: number;
  limit: number;
}

interface DraftStats {
  pending: number;
  approved: number;
  rejected: number;
}

interface PipelineDraftReviewProps {
  pipelineId: string;
}

export function PipelineDraftReview({ pipelineId }: PipelineDraftReviewProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [pendingRejectId, setPendingRejectId] = useState<string | null>(null);
  const limit = 20;

  const { data, isLoading, error } = useQuery<DraftsResponse>({
    queryKey: ['pipeline-drafts', pipelineId, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', String(limit));
      params.append('pipeline_id', pipelineId);
      return api.get<DraftsResponse>(`/operational/drafts/review?${params}`);
    },
  });

  const { data: stats } = useQuery<DraftStats>({
    queryKey: ['pipeline-drafts-stats', pipelineId],
    queryFn: () => api.get<DraftStats>(`/operational/drafts/stats?pipeline_id=${pipelineId}`),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<{ success: boolean }>(`/operational/drafts/${id}/approve`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline-drafts', pipelineId] });
      void queryClient.invalidateQueries({ queryKey: ['pipeline-drafts-stats', pipelineId] });
      void queryClient.invalidateQueries({ queryKey: ['pipeline', pipelineId] });
    },
    onError: (err) => {
      alert(`Failed to approve: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.post<{ success: boolean }>(`/operational/drafts/${id}/reject`, { reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline-drafts', pipelineId] });
      void queryClient.invalidateQueries({ queryKey: ['pipeline-drafts-stats', pipelineId] });
      void queryClient.invalidateQueries({ queryKey: ['pipeline', pipelineId] });
      setShowRejectModal(false);
      setPendingRejectId(null);
      setRejectReason('');
    },
    onError: (err) => {
      alert(`Failed to reject: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
  });

  const rerunMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      api.post<{ success: boolean }>(`/operational/drafts/${id}/rerun`, { comment }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline-drafts', pipelineId] });
      void queryClient.invalidateQueries({ queryKey: ['pipeline-drafts-stats', pipelineId] });
      void queryClient.invalidateQueries({ queryKey: ['pipeline', pipelineId] });
    },
    onError: (err) => {
      alert(`Failed to rerun: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: () => {
      const pendingDraftIds =
        data?.drafts.filter((d) => d.approval_status === 'pending').map((d) => d.id) || [];
      return api.post<{ approved: number }>('/operational/drafts/bulk-approve', {
        ids: pendingDraftIds,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline-drafts', pipelineId] });
      void queryClient.invalidateQueries({ queryKey: ['pipeline-drafts-stats', pipelineId] });
      void queryClient.invalidateQueries({ queryKey: ['pipeline', pipelineId] });
    },
    onError: (err) => {
      alert(`Bulk approve failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
  });

  const handleRejectClick = (id: string | null) => {
    setPendingRejectId(id);
    setShowRejectModal(true);
  };

  const handleConfirmReject = () => {
    if (pendingRejectId) {
      rejectMutation.mutate({ id: pendingRejectId, reason: rejectReason });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
        <span className="ml-2 text-gray-600">Loading drafts...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-600">
        Error loading drafts: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-sm">
          <span className="px-3 py-1 bg-gray-100 rounded-full">
            Pending: <strong>{stats?.pending ?? 0}</strong>
          </span>
          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full">
            Approved: <strong>{stats?.approved ?? 0}</strong>
          </span>
          <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full">
            Rejected: <strong>{stats?.rejected ?? 0}</strong>
          </span>
        </div>

        {stats && stats.pending > 0 && (
          <button
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
            onClick={() => bulkApproveMutation.mutate()}
            disabled={bulkApproveMutation.isPending}
          >
            {bulkApproveMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Approving...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Approve All ({stats.pending})
              </>
            )}
          </button>
        )}
      </div>

      {data?.drafts && data.drafts.length > 0 ? (
        <div className="space-y-3">
          {data.drafts.map((draft) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              onApprove={() => approveMutation.mutate(draft.id)}
              onReject={() => handleRejectClick(draft.id)}
              onRerun={(comment) => rerunMutation.mutate({ id: draft.id, comment })}
              isApproving={approveMutation.isPending && approveMutation.variables === draft.id}
              isRejecting={rejectMutation.isPending && rejectMutation.variables?.id === draft.id}
              isRerunning={rerunMutation.isPending && rerunMutation.variables?.id === draft.id}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <p>No drafts pending review for this pipeline</p>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {showRejectModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowRejectModal(false)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">Reject Draft</h3>
            <textarea
              placeholder="Reason for rejection (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full border rounded p-2 mb-4 h-24"
            />
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 border rounded hover:bg-gray-50"
                onClick={() => {
                  setShowRejectModal(false);
                  setPendingRejectId(null);
                  setRejectReason('');
                }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                onClick={handleConfirmReject}
                disabled={rejectMutation.isPending}
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface DraftCardProps {
  draft: Draft;
  onApprove: () => void;
  onReject: () => void;
  onRerun: (comment?: string) => void;
  isApproving: boolean;
  isRejecting: boolean;
  isRerunning: boolean;
}

function DraftCard({
  draft,
  onApprove,
  onReject,
  onRerun,
  isApproving,
  isRejecting,
  isRerunning,
}: DraftCardProps) {
  const [showRerunInput, setShowRerunInput] = useState(false);
  const [rerunComment, setRerunComment] = useState('');

  const handleRerun = () => {
    onRerun(rerunComment || undefined);
    setShowRerunInput(false);
    setRerunComment('');
  };

  return (
    <div className="border rounded-lg p-4 bg-white hover:shadow-sm transition">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium">
              {draft.data_type}
            </span>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
              {draft.suggested_level || '?'}
            </span>
            <span className="text-xs text-gray-500">
              {draft.suggested_topic_name || 'No topic'}
            </span>
          </div>

          <div className="text-sm text-gray-800 mb-2">
            <pre className="whitespace-pre-wrap font-sans bg-gray-50 p-2 rounded text-xs max-h-32 overflow-y-auto">
              {draft.original_content
                ? draft.original_content.length > 500
                  ? draft.original_content.substring(0, 500) + '...'
                  : draft.original_content
                : '(no content)'}
            </pre>
          </div>

          {draft.llm_reasoning && (
            <div className="text-xs text-gray-500 mb-2">
              <strong>LLM:</strong> {draft.llm_reasoning}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onApprove}
              disabled={isApproving}
              className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              {isApproving ? 'Approving...' : 'Approve'}
            </button>
            <button
              onClick={onReject}
              disabled={isRejecting}
              className="flex items-center gap-1 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
            <button
              onClick={() => setShowRerunInput(!showRerunInput)}
              disabled={isRerunning}
              className="flex items-center gap-1 px-3 py-1 border text-sm rounded hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              Re-run
            </button>
          </div>

          {showRerunInput && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                placeholder="Comment for re-run (optional)"
                value={rerunComment}
                onChange={(e) => setRerunComment(e.target.value)}
                className="flex-1 border rounded px-2 py-1 text-sm"
              />
              <button
                onClick={handleRerun}
                disabled={isRerunning}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                {isRerunning ? 'Running...' : 'Confirm'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
