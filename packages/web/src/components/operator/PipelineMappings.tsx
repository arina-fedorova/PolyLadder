import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, Tag, Percent, Loader2 } from 'lucide-react';
import { apiClient } from '@/api/client';

interface Mapping {
  id: string;
  chunk_id: string;
  topic_id: string;
  status: string;
  confidence_score: number;
  llm_reasoning: string;
  chunk_text: string;
  topic_name: string;
  topic_description: string;
  created_at: string;
}

interface MappingsResponse {
  mappings: Mapping[];
  stats: {
    total: number;
    autoMapped: number;
    confirmed: number;
    rejected: number;
  };
}

interface PipelineMappingsProps {
  pipelineId: string;
}

export function PipelineMappings({ pipelineId }: PipelineMappingsProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['pipeline-mappings', pipelineId],
    queryFn: async () => {
      const response = await apiClient.get<MappingsResponse>(
        `/operational/pipelines/${pipelineId}/mappings`
      );
      return response.data;
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async (mappingId: string) => {
      await apiClient.post(`/operational/pipelines/${pipelineId}/mappings/confirm`, {
        mappingId,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline-mappings', pipelineId] });
      void queryClient.invalidateQueries({ queryKey: ['pipeline', pipelineId] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (mappingId: string) => {
      await apiClient.post(`/operational/pipelines/${pipelineId}/mappings/reject`, {
        mappingId,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline-mappings', pipelineId] });
      void queryClient.invalidateQueries({ queryKey: ['pipeline', pipelineId] });
    },
  });

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary-500" />
        <p className="mt-2 text-gray-500">Loading mappings...</p>
      </div>
    );
  }

  if (!data || data.mappings.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-white">
        <Check className="w-12 h-12 mx-auto text-green-500 mb-4" />
        <h3 className="text-lg font-medium">No mappings found</h3>
        <p className="text-gray-500">This pipeline has no content-topic mappings.</p>
      </div>
    );
  }

  const pendingMappings = data.mappings.filter((m) => m.status === 'auto_mapped');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-blue-50 p-3 rounded">
            <div className="text-xs text-blue-600 font-medium">Total</div>
            <div className="text-2xl font-bold text-blue-700">{data.stats.total}</div>
          </div>
          <div className="bg-yellow-50 p-3 rounded">
            <div className="text-xs text-yellow-600 font-medium">Pending</div>
            <div className="text-2xl font-bold text-yellow-700">{data.stats.autoMapped}</div>
          </div>
          <div className="bg-green-50 p-3 rounded">
            <div className="text-xs text-green-600 font-medium">Confirmed</div>
            <div className="text-2xl font-bold text-green-700">{data.stats.confirmed}</div>
          </div>
          <div className="bg-red-50 p-3 rounded">
            <div className="text-xs text-red-600 font-medium">Rejected</div>
            <div className="text-2xl font-bold text-red-700">{data.stats.rejected}</div>
          </div>
        </div>
      </div>

      {pendingMappings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm text-yellow-800">
            {pendingMappings.length} mappings pending review
          </p>
        </div>
      )}

      <div className="space-y-3">
        {data.mappings.map((mapping) => (
          <MappingCard
            key={mapping.id}
            mapping={mapping}
            onConfirm={() => confirmMutation.mutate(mapping.id)}
            onReject={() => confirmMutation.mutate(mapping.id)}
            isConfirming={confirmMutation.isPending}
            isRejecting={rejectMutation.isPending}
          />
        ))}
      </div>
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

  const statusColor =
    mapping.status === 'confirmed'
      ? 'bg-green-100 text-green-700'
      : mapping.status === 'rejected'
        ? 'bg-red-100 text-red-700'
        : 'bg-yellow-100 text-yellow-700';

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <span className={`flex items-center gap-1 text-sm px-2 py-0.5 rounded ${statusColor}`}>
              {mapping.status}
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
              <div className="bg-gray-50 p-3 rounded text-sm max-h-32 overflow-y-auto">
                {mapping.chunk_text.substring(0, 300)}
                {mapping.chunk_text.length > 300 && '...'}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-1">Mapped Topic</h4>
              <div className="flex items-center gap-2 mb-2">
                <Tag className="w-4 h-4 text-primary-500" />
                <span className="font-medium">{mapping.topic_name}</span>
              </div>
              <div className="bg-gray-50 p-2 rounded text-xs text-gray-600 mb-2">
                {mapping.topic_description}
              </div>
              <div className="bg-blue-50 p-3 rounded text-sm text-blue-800">
                <strong>Reasoning:</strong> {mapping.llm_reasoning}
              </div>
            </div>
          </div>
        </div>

        {mapping.status === 'auto_mapped' && (
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
              {isRejecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <X className="w-4 h-4" />
              )}
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
