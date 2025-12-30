import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import styles from './DraftReviewPage.module.css';

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

export function DraftReviewPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterLevel, setFilterLevel] = useState<string>('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [pendingRejectId, setPendingRejectId] = useState<string | null>(null);
  const limit = 20;

  const { data, isLoading, error } = useQuery<DraftsResponse>({
    queryKey: ['drafts-review', page, filterLevel],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', String(limit));
      if (filterLevel) params.append('level', filterLevel);
      return api.get<DraftsResponse>(`/operational/drafts/review?${params}`);
    },
  });

  const { data: stats } = useQuery<DraftStats>({
    queryKey: ['drafts-stats'],
    queryFn: () => api.get<DraftStats>('/operational/drafts/stats'),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<{ success: boolean; candidateId?: string }>(`/operational/drafts/${id}/approve`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drafts-review'] });
      void queryClient.invalidateQueries({ queryKey: ['drafts-stats'] });
    },
    onError: (err) => {
      alert(`Failed to approve: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.post<{ success: boolean }>(`/operational/drafts/${id}/reject`, { reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drafts-review'] });
      void queryClient.invalidateQueries({ queryKey: ['drafts-stats'] });
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
      api.post<{ success: boolean; chunkId?: string }>(`/operational/drafts/${id}/rerun`, {
        comment,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drafts-review'] });
      void queryClient.invalidateQueries({ queryKey: ['drafts-stats'] });
    },
    onError: (err) => {
      alert(`Failed to rerun: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ approved: number; total: number; errors: string[] }>(
        '/operational/drafts/bulk-approve',
        { ids }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drafts-review'] });
      void queryClient.invalidateQueries({ queryKey: ['drafts-stats'] });
      setSelectedIds(new Set());
    },
    onError: (err) => {
      alert(`Bulk approve failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
  });

  const bulkRejectMutation = useMutation({
    mutationFn: ({ ids, reason }: { ids: string[]; reason?: string }) =>
      api.post<{ rejected: number; total: number; errors: string[] }>(
        '/operational/drafts/bulk-reject',
        { ids, reason }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drafts-review'] });
      void queryClient.invalidateQueries({ queryKey: ['drafts-stats'] });
      setSelectedIds(new Set());
      setShowRejectModal(false);
      setRejectReason('');
    },
    onError: (err) => {
      alert(`Bulk reject failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
  });

  const handleSelectAll = () => {
    if (!data?.drafts) return;
    if (selectedIds.size === data.drafts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.drafts.map((d) => d.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleRejectClick = (id: string | null) => {
    setPendingRejectId(id);
    setShowRejectModal(true);
  };

  const handleConfirmReject = () => {
    if (pendingRejectId) {
      rejectMutation.mutate({ id: pendingRejectId, reason: rejectReason });
    } else if (selectedIds.size > 0) {
      bulkRejectMutation.mutate({ ids: Array.from(selectedIds), reason: rejectReason });
    }
  };

  if (!user || (user as { role?: string }).role !== 'operator') {
    return <div className={styles.accessDenied}>Access denied. Operator role required.</div>;
  }

  if (isLoading) {
    return <div className={styles.loading}>Loading drafts...</div>;
  }

  if (error) {
    return <div className={styles.error}>Error loading drafts: {String(error)}</div>;
  }

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Draft Review</h1>
        <p className={styles.subtitle}>Review and approve semantic splits from documents</p>
      </header>

      <section className={styles.statsBar}>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{stats?.pending ?? 0}</span>
          <span className={styles.statLabel}>Pending</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{stats?.approved ?? 0}</span>
          <span className={styles.statLabel}>Approved</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{stats?.rejected ?? 0}</span>
          <span className={styles.statLabel}>Rejected</span>
        </div>
      </section>

      <section className={styles.controls}>
        <div className={styles.filters}>
          <select
            value={filterLevel}
            onChange={(e) => {
              setFilterLevel(e.target.value);
              setPage(1);
            }}
            className={styles.filterSelect}
          >
            <option value="">All Levels</option>
            <option value="A0">A0</option>
            <option value="A1">A1</option>
            <option value="A2">A2</option>
            <option value="B1">B1</option>
            <option value="B2">B2</option>
            <option value="C1">C1</option>
            <option value="C2">C2</option>
          </select>
        </div>

        {selectedIds.size > 0 && (
          <div className={styles.bulkActions}>
            <span className={styles.selectedCount}>{selectedIds.size} selected</span>
            <button
              className={styles.bulkApprove}
              onClick={() => bulkApproveMutation.mutate(Array.from(selectedIds))}
              disabled={bulkApproveMutation.isPending}
            >
              Approve All
            </button>
            <button
              className={styles.bulkReject}
              onClick={() => handleRejectClick(null)}
              disabled={bulkRejectMutation.isPending}
            >
              Reject All
            </button>
          </div>
        )}
      </section>

      <section className={styles.draftsList}>
        {data?.drafts && data.drafts.length > 0 ? (
          <>
            <div className={styles.listHeader}>
              <label className={styles.selectAllLabel}>
                <input
                  type="checkbox"
                  checked={selectedIds.size === data.drafts.length && data.drafts.length > 0}
                  onChange={handleSelectAll}
                />
                Select All
              </label>
            </div>

            {data.drafts.map((draft) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                isSelected={selectedIds.has(draft.id)}
                onToggleSelect={() => handleToggleSelect(draft.id)}
                onApprove={() => approveMutation.mutate(draft.id)}
                onReject={() => handleRejectClick(draft.id)}
                onRerun={(comment) => rerunMutation.mutate({ id: draft.id, comment })}
                isApproving={approveMutation.isPending}
                isRejecting={rejectMutation.isPending}
                isRerunning={rerunMutation.isPending}
              />
            ))}
          </>
        ) : (
          <div className={styles.emptyState}>
            <p>No drafts pending review</p>
          </div>
        )}
      </section>

      {totalPages > 1 && (
        <section className={styles.pagination}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className={styles.pageButton}
          >
            Previous
          </button>
          <span className={styles.pageInfo}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className={styles.pageButton}
          >
            Next
          </button>
        </section>
      )}

      {showRejectModal && (
        <div className={styles.modalOverlay} onClick={() => setShowRejectModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>Reject {pendingRejectId ? 'Draft' : `${selectedIds.size} Drafts`}</h3>
            <textarea
              placeholder="Reason for rejection (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className={styles.rejectReasonInput}
            />
            <div className={styles.modalActions}>
              <button
                className={styles.cancelButton}
                onClick={() => {
                  setShowRejectModal(false);
                  setPendingRejectId(null);
                  setRejectReason('');
                }}
              >
                Cancel
              </button>
              <button
                className={styles.confirmReject}
                onClick={handleConfirmReject}
                disabled={rejectMutation.isPending || bulkRejectMutation.isPending}
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
  isSelected: boolean;
  onToggleSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRerun: (comment?: string) => void;
  isApproving: boolean;
  isRejecting: boolean;
  isRerunning: boolean;
}

function DraftCard({
  draft,
  isSelected,
  onToggleSelect,
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

  const formatContent = (content: string) => {
    if (content.length > 300) {
      return content.substring(0, 300) + '...';
    }
    return content;
  };

  return (
    <article className={styles.draftCard}>
      <div className={styles.cardHeader}>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={isSelected} onChange={onToggleSelect} />
        </label>
        <div className={styles.cardMeta}>
          <span className={styles.dataType}>{draft.data_type}</span>
          <span className={styles.level}>{draft.suggested_level}</span>
          <span className={styles.contentType}>{draft.content_type}</span>
        </div>
        <span className={styles.documentName}>{draft.document_name}</span>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.topicInfo}>
          <strong>Suggested Topic:</strong> {draft.suggested_topic_name || 'Not mapped'}
        </div>
        <div className={styles.originalContent}>
          <strong>Original Content:</strong>
          <pre>{formatContent(draft.original_content)}</pre>
        </div>
        {draft.llm_reasoning && (
          <div className={styles.reasoning}>
            <strong>LLM Reasoning:</strong> {draft.llm_reasoning}
          </div>
        )}
      </div>

      <div className={styles.cardActions}>
        <button className={styles.approveButton} onClick={onApprove} disabled={isApproving}>
          {isApproving ? 'Approving...' : 'Approve'}
        </button>
        <button className={styles.rejectButton} onClick={onReject} disabled={isRejecting}>
          Reject
        </button>
        <button
          className={styles.rerunButton}
          onClick={() => setShowRerunInput(!showRerunInput)}
          disabled={isRerunning}
        >
          Re-run
        </button>
      </div>

      {showRerunInput && (
        <div className={styles.rerunInput}>
          <textarea
            placeholder="Optional: Describe what to change..."
            value={rerunComment}
            onChange={(e) => setRerunComment(e.target.value)}
          />
          <button onClick={handleRerun} disabled={isRerunning}>
            {isRerunning ? 'Re-running...' : 'Confirm Re-run'}
          </button>
        </div>
      )}
    </article>
  );
}
