import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, ChevronLeft, ChevronRight, FileText, Tag, Percent, Loader2 } from 'lucide-react';
import api from '../../api/client';

interface Mapping {
  id: string;
  chunk_id: string;
  topic_id: string;
  confidence_score: number;
  status: string;
  llm_reasoning: string;
  chunk_text: string;
  chunk_type: string;
  topic_name: string;
  topic_type: string;
  document_name: string;
}

interface MappingsResponse {
  mappings: Mapping[];
  total: number;
  page: number;
  limit: number;
}

export function MappingReviewPage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['mappings-review', page],
    queryFn: () => api.get<MappingsResponse>(`/operational/mappings/review?page=${page}&limit=10`),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) => api.post(`/operational/mappings/${id}/confirm`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mappings-review'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.post(`/operational/mappings/${id}/reject`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mappings-review'] }),
  });

  const bulkConfirmMutation = useMutation({
    mutationFn: (ids: string[]) => api.post('/operational/mappings/bulk-confirm', { ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mappings-review'] }),
  });

  const highConfidenceMappings =
    data?.mappings?.filter((m: Mapping) => m.confidence_score >= 0.8) || [];

  const totalPages = data ? Math.ceil(data.total / 10) : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Review Content Mappings</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{data?.total || 0} pending review</span>
          {highConfidenceMappings.length > 0 && (
            <button
              onClick={() => bulkConfirmMutation.mutate(highConfidenceMappings.map((m) => m.id))}
              disabled={bulkConfirmMutation.isPending}
              className="btn btn-secondary flex items-center gap-2"
            >
              {bulkConfirmMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirm All High Confidence ({highConfidenceMappings.length})
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8">
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary-500" />
          <p className="mt-2 text-gray-500">Loading mappings...</p>
        </div>
      ) : data?.mappings?.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-white">
          <Check className="w-12 h-12 mx-auto text-green-500 mb-4" />
          <h3 className="text-lg font-medium">All mappings reviewed!</h3>
          <p className="text-gray-500">No pending mappings to review.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data?.mappings?.map((mapping: Mapping) => (
            <MappingCard
              key={mapping.id}
              mapping={mapping}
              onConfirm={() => confirmMutation.mutate(mapping.id)}
              onReject={() => rejectMutation.mutate(mapping.id)}
              isConfirming={confirmMutation.isPending}
              isRejecting={rejectMutation.isPending}
            />
          ))}
        </div>
      )}

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

interface MappingCardProps {
  mapping: Mapping;
  onConfirm: () => void;
  onReject: () => void;
  isConfirming: boolean;
  isRejecting: boolean;
}

function MappingCard({
  mapping,
  onConfirm,
  onReject,
  isConfirming,
  isRejecting,
}: MappingCardProps) {
  const confidenceColor =
    mapping.confidence_score >= 0.8
      ? 'bg-green-100 text-green-700'
      : mapping.confidence_score >= 0.5
        ? 'bg-yellow-100 text-yellow-700'
        : 'bg-red-100 text-red-700';

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex items-center gap-1 text-sm text-gray-500">
              <FileText className="w-4 h-4" />
              {mapping.document_name}
            </span>
            <span
              className={`flex items-center gap-1 text-sm px-2 py-0.5 rounded ${confidenceColor}`}
            >
              <Percent className="w-3 h-3" />
              {Math.round(mapping.confidence_score * 100)}%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-1">Source Chunk</h4>
              <div className="bg-gray-50 p-3 rounded text-sm max-h-40 overflow-y-auto">
                {mapping.chunk_text.substring(0, 500)}
                {mapping.chunk_text.length > 500 && '...'}
              </div>
              <span className="text-xs text-gray-400 mt-1 block">Type: {mapping.chunk_type}</span>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-1">Mapped Topic</h4>
              <div className="flex items-center gap-2 mb-2">
                <Tag className="w-4 h-4 text-primary-500" />
                <span className="font-medium">{mapping.topic_name}</span>
                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                  {mapping.topic_type}
                </span>
              </div>
              <div className="bg-blue-50 p-3 rounded text-sm text-blue-800">
                <strong>AI Reasoning:</strong> {mapping.llm_reasoning}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onConfirm}
            className="btn btn-success flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            disabled={isConfirming}
          >
            {isConfirming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Confirm
          </button>
          <button
            onClick={onReject}
            className="btn btn-danger flex items-center gap-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
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
