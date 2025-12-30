import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle, XCircle } from 'lucide-react';
import { apiClient } from '@/api/client';

interface Failure {
  id: string;
  candidateId: string;
  gateName: string;
  failureReason: string;
  failureDetails: Record<string, unknown>;
  dataType: string;
  normalizedData: Record<string, unknown>;
  createdAt: string;
}

interface FailuresResponse {
  failures: Failure[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    byGate: Record<string, number>;
    byDataType: Record<string, number>;
  };
}

interface PipelineFailuresProps {
  pipelineId: string;
}

export function PipelineFailures({ pipelineId }: PipelineFailuresProps) {
  const [page, setPage] = useState(1);
  const [selectedGate, setSelectedGate] = useState<string | null>(null);
  const [selectedDataType, setSelectedDataType] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['pipeline-failures', pipelineId, page, selectedGate, selectedDataType],
    queryFn: async () => {
      const params = new URLSearchParams({ page: page.toString(), pageSize: '20' });
      if (selectedGate) params.append('gateName', selectedGate);
      if (selectedDataType) params.append('dataType', selectedDataType);

      const response = await apiClient.get<FailuresResponse>(
        `/operational/pipelines/${pipelineId}/failures?${params.toString()}`
      );
      return response.data;
    },
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 0;

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary-500" />
        <p className="mt-2 text-gray-500">Loading failures...</p>
      </div>
    );
  }

  if (!data || data.failures.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-white">
        <XCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-medium">No failures found</h3>
        <p className="text-gray-500">All candidates from this pipeline passed quality gates.</p>
      </div>
    );
  }

  const gates = Object.keys(data.stats.byGate);
  const dataTypes = Object.keys(data.stats.byDataType);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-red-900 mb-2">Failures by Gate</h3>
          <div className="space-y-1">
            {gates.map((gate) => (
              <button
                key={gate}
                onClick={() => setSelectedGate(selectedGate === gate ? null : gate)}
                className={`w-full text-left px-3 py-1.5 rounded text-sm ${
                  selectedGate === gate
                    ? 'bg-red-600 text-white'
                    : 'bg-white text-red-800 hover:bg-red-100'
                }`}
              >
                {gate}: {data.stats.byGate[gate]}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 mb-2">Failures by Data Type</h3>
          <div className="space-y-1">
            {dataTypes.map((dataType) => (
              <button
                key={dataType}
                onClick={() => setSelectedDataType(selectedDataType === dataType ? null : dataType)}
                className={`w-full text-left px-3 py-1.5 rounded text-sm ${
                  selectedDataType === dataType
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-blue-800 hover:bg-blue-100'
                }`}
              >
                {dataType}: {data.stats.byDataType[dataType]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {data.failures.map((failure) => (
          <FailureCard key={failure.id} failure={failure} />
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

interface FailureCardProps {
  failure: Failure;
}

function FailureCard({ failure }: FailureCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-red-200 rounded-lg p-4 bg-red-50">
      <div className="flex items-start gap-4">
        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-medium text-red-900">{failure.gateName}</span>
            <span className="text-sm text-red-700">{failure.dataType}</span>
            <span className="text-xs text-red-600">
              {new Date(failure.createdAt).toLocaleString()}
            </span>
          </div>

          <p className="text-sm text-red-800 mb-3">{failure.failureReason}</p>

          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-red-700 hover:text-red-900 underline mb-2"
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>

          {expanded && (
            <div className="space-y-3 mt-3">
              <div>
                <h4 className="text-sm font-medium text-red-900 mb-1">Failure Details</h4>
                <div className="bg-white border border-red-200 rounded p-3 text-xs">
                  <pre className="whitespace-pre-wrap font-mono text-red-700">
                    {JSON.stringify(failure.failureDetails, null, 2)}
                  </pre>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-red-900 mb-1">Normalized Data</h4>
                <div className="bg-white border border-red-200 rounded p-3 text-xs">
                  <pre className="whitespace-pre-wrap font-mono text-red-700">
                    {JSON.stringify(failure.normalizedData, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
