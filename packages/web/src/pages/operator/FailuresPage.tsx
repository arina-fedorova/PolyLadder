import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { AlertCircle, RefreshCw, Eye, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { FailureDetailModal } from '@/components/operational/FailureDetailModal';

interface ValidationFailure {
  id: string;
  itemId: string;
  dataType: string;
  state: string;
  errorMessage: string;
  failedAt: string;
}

interface FailuresResponse {
  items: ValidationFailure[];
  total: number;
  limit: number;
  offset: number;
}

const DATA_TYPE_LABELS: Record<string, string> = {
  meaning: 'Vocabulary',
  utterance: 'Vocabulary',
  rule: 'Grammar',
  exercise: 'Orthography',
};

export function FailuresPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [dataTypeFilter, setDataTypeFilter] = useState<string>('all');
  const [timeRangeFilter, setTimeRangeFilter] = useState<string>('7d');
  const [selectedFailures, setSelectedFailures] = useState<Set<string>>(new Set());
  const [detailModalFailure, setDetailModalFailure] = useState<ValidationFailure | null>(null);

  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  const getTimeRangeDate = (range: string): string | undefined => {
    const now = new Date();
    switch (range) {
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      default:
        return undefined;
    }
  };

  const { data, isPending: isLoading } = useQuery<FailuresResponse>({
    queryKey: ['failures', page, dataTypeFilter, timeRangeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: offset.toString(),
      });

      if (dataTypeFilter !== 'all') {
        params.append('dataType', dataTypeFilter);
      }

      const since = getTimeRangeDate(timeRangeFilter);
      if (since) {
        params.append('since', since);
      }

      const response = await apiClient.get<FailuresResponse>(
        `/operational/failures?${params.toString()}`
      );
      return response.data;
    },
  });

  const bulkRetryMutation = useMutation({
    mutationFn: async (failureIds: string[]) => {
      await apiClient.post('/operational/failures/bulk-retry', { failureIds });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['failures'] });
      setSelectedFailures(new Set());
    },
  });

  const handleSelectAll = () => {
    if (!data) return;
    if (selectedFailures.size === data.items.length) {
      setSelectedFailures(new Set());
    } else {
      setSelectedFailures(new Set(data.items.map((f) => f.id)));
    }
  };

  const handleToggleSelect = (failureId: string) => {
    const newSelected = new Set(selectedFailures);
    if (newSelected.has(failureId)) {
      newSelected.delete(failureId);
    } else {
      newSelected.add(failureId);
    }
    setSelectedFailures(newSelected);
  };

  const handleBulkRetry = () => {
    if (selectedFailures.size === 0) return;

    if (window.confirm(`Retry ${selectedFailures.size} failed items?`)) {
      bulkRetryMutation.mutate(Array.from(selectedFailures));
    }
  };

  const totalPages = Math.ceil((data?.total ?? 0) / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Validation Failures</h1>
          <p className="mt-1 text-gray-600">{data?.total ?? 0} failed items</p>
        </div>

        {selectedFailures.size > 0 && (
          <button
            onClick={handleBulkRetry}
            disabled={bulkRetryMutation.isPending}
            className="btn-primary flex items-center gap-2"
          >
            <RefreshCw className={`w-5 h-5 ${bulkRetryMutation.isPending ? 'animate-spin' : ''}`} />
            Retry {selectedFailures.size} Selected
          </button>
        )}
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-4">
          <Filter className="w-5 h-5 text-gray-500" />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content Type</label>
            <select
              value={dataTypeFilter}
              onChange={(e) => {
                setDataTypeFilter(e.target.value);
                setPage(1);
              }}
              className="input py-2"
            >
              <option value="all">All Types</option>
              <option value="meaning">Meaning</option>
              <option value="utterance">Utterance</option>
              <option value="rule">Rule</option>
              <option value="exercise">Exercise</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time Range</label>
            <select
              value={timeRangeFilter}
              onChange={(e) => {
                setTimeRangeFilter(e.target.value);
                setPage(1);
              }}
              className="input py-2"
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
          <p className="text-lg font-medium">No validation failures found</p>
          <p className="mt-1">Great job! All content is passing validation.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedFailures.size === data.items.length && data.items.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Item ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  State
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Error
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Failed At
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.items.map((failure) => (
                <tr key={failure.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedFailures.has(failure.id)}
                      onChange={() => handleToggleSelect(failure.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                      {DATA_TYPE_LABELS[failure.dataType] ?? failure.dataType}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-mono text-gray-700">
                      {failure.itemId.slice(0, 8)}...
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-700 capitalize">{failure.state}</span>
                  </td>
                  <td className="px-6 py-4 max-w-md">
                    <p className="text-sm text-red-600 truncate">{failure.errorMessage}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(failure.failedAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={() => setDetailModalFailure(failure)}
                      className="text-primary-600 hover:text-primary-700"
                      aria-label="View details"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
              <div className="text-sm text-gray-700">
                Showing {offset + 1} to {Math.min(offset + pageSize, data.total)} of {data.total}{' '}
                failures
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-secondary disabled:opacity-50 p-2"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm text-gray-700">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn-secondary disabled:opacity-50 p-2"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {detailModalFailure && (
        <FailureDetailModal
          failure={detailModalFailure}
          onClose={() => setDetailModalFailure(null)}
          onRetry={() => {
            setDetailModalFailure(null);
            void queryClient.invalidateQueries({ queryKey: ['failures'] });
          }}
        />
      )}
    </div>
  );
}
