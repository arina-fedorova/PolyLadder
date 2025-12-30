import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, ChevronLeft, ChevronRight, Loader2, CheckCircle } from 'lucide-react';
import { apiClient } from '@/api/client';

interface ValidationResult {
  gate: string;
  passed: boolean;
  score?: number;
}

interface ReviewQueueItem {
  id: string;
  contentType: 'vocabulary' | 'grammar' | 'orthography';
  dataType: 'meaning' | 'utterance' | 'rule' | 'exercise';
  languageCode: string;
  languageName: string;
  cefrLevel: string;
  validatedAt: string;
  content: Record<string, unknown>;
  validationResults: ValidationResult[];
}

interface ReviewQueueResponse {
  items: ReviewQueueItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface PipelineReviewQueueProps {
  pipelineId: string;
}

export function PipelineReviewQueue({ pipelineId }: PipelineReviewQueueProps) {
  const [page, setPage] = useState(1);
  const [selectedTab, setSelectedTab] = useState<'all' | 'vocabulary' | 'grammar' | 'orthography'>(
    'all'
  );
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['pipeline-review-queue', pipelineId, page, selectedTab],
    queryFn: async () => {
      const contentType = selectedTab === 'all' ? '' : `&contentType=${selectedTab}`;
      const response = await apiClient.get<ReviewQueueResponse>(
        `/operational/pipelines/${pipelineId}/review-queue?page=${page}&pageSize=20${contentType}`
      );
      return response.data;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (item: { id: string; dataType: string }) => {
      const response = await apiClient.post<{ success: boolean; message?: string }>(
        `/operational/approve/${item.id}`,
        {
          dataType: item.dataType,
          notes: 'Approved from pipeline view',
        }
      );
      return response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline-review-queue', pipelineId] });
      void queryClient.invalidateQueries({ queryKey: ['pipeline', pipelineId] });
    },
    onError: (error, variables) => {
      console.error('Failed to approve item:', variables.id, error);
      alert(`Failed to approve: ${error instanceof Error ? error.message : 'Unknown error'}`);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (item: { id: string; dataType: string }) => {
      const response = await apiClient.post<{ success: boolean; message?: string }>(
        `/operational/reject/${item.id}`,
        {
          dataType: item.dataType,
          reason: 'Rejected from pipeline view - did not meet quality standards',
        }
      );
      return response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline-review-queue', pipelineId] });
      void queryClient.invalidateQueries({ queryKey: ['pipeline', pipelineId] });
    },
    onError: (error, variables) => {
      console.error('Failed to reject item:', variables.id, error);
      alert(`Failed to reject: ${error instanceof Error ? error.message : 'Unknown error'}`);
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<{ approved: number; failed: number; errors: string[] }>(
        '/operational/review-queue/bulk-approve',
        { pipelineId }
      );
      return response.data;
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline-review-queue', pipelineId] });
      void queryClient.invalidateQueries({ queryKey: ['pipeline', pipelineId] });
      void queryClient.invalidateQueries({ queryKey: ['curriculum-topics'] });
      if (result.failed > 0) {
        alert(`Approved ${result.approved}, failed ${result.failed}`);
      }
    },
    onError: (error) => {
      console.error('Bulk approve failed:', error);
      alert(`Bulk approve failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    },
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 0;

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary-500" />
        <p className="mt-2 text-gray-500">Loading review queue...</p>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-white">
        <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-4" />
        <h3 className="text-lg font-medium">No items pending review</h3>
        <p className="text-gray-500">All validated items from this pipeline have been reviewed.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedTab('all')}
            className={`px-4 py-2 rounded ${selectedTab === 'all' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            All ({data.total})
          </button>
          <button
            onClick={() => setSelectedTab('vocabulary')}
            className={`px-4 py-2 rounded ${selectedTab === 'vocabulary' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Vocabulary
          </button>
          <button
            onClick={() => setSelectedTab('grammar')}
            className={`px-4 py-2 rounded ${selectedTab === 'grammar' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Grammar
          </button>
          <button
            onClick={() => setSelectedTab('orthography')}
            className={`px-4 py-2 rounded ${selectedTab === 'orthography' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Orthography
          </button>
        </div>

        {data.total > 0 && (
          <button
            onClick={() => bulkApproveMutation.mutate()}
            disabled={bulkApproveMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {bulkApproveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Approve All ({data.total})
          </button>
        )}
      </div>

      <div className="space-y-3">
        {data.items.map((item) => (
          <ReviewQueueCard
            key={item.id}
            item={item}
            onApprove={() => approveMutation.mutate({ id: item.id, dataType: item.dataType })}
            onReject={() => rejectMutation.mutate({ id: item.id, dataType: item.dataType })}
            isApproving={approveMutation.isPending}
            isRejecting={rejectMutation.isPending}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 hover:bg-gray-100 rounded disabled:opacity-50"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
            className="p-2 hover:bg-gray-100 rounded disabled:opacity-50"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}

interface ReviewQueueCardProps {
  item: ReviewQueueItem;
  onApprove: () => void;
  onReject: () => void;
  isApproving: boolean;
  isRejecting: boolean;
}

function ReviewQueueCard({
  item,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
}: ReviewQueueCardProps) {
  const getContentTypeColor = (type: string) => {
    switch (type) {
      case 'vocabulary':
        return 'bg-blue-100 text-blue-700';
      case 'grammar':
        return 'bg-purple-100 text-purple-700';
      case 'orthography':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <span
              className={`text-sm px-2 py-0.5 rounded ${getContentTypeColor(item.contentType)}`}
            >
              {item.contentType}
            </span>
            <span className="text-sm text-gray-500">{item.dataType}</span>
            <span className="text-sm text-gray-500">{item.cefrLevel}</span>
          </div>

          <div className="bg-gray-50 p-3 rounded text-sm mb-3">
            <pre className="whitespace-pre-wrap font-sans">
              {JSON.stringify(item.content, null, 2)}
            </pre>
          </div>

          <div className="flex flex-wrap gap-2">
            {item.validationResults.map((result, idx) => (
              <span
                key={idx}
                className={`text-xs px-2 py-1 rounded ${result.passed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
              >
                {result.gate}: {result.passed ? '✓' : '✗'}
                {result.score !== undefined && ` (${result.score.toFixed(2)})`}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onApprove}
            className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            disabled={isApproving}
          >
            {isApproving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Approve
          </button>
          <button
            onClick={onReject}
            className="flex items-center gap-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            disabled={isRejecting}
          >
            {isRejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
