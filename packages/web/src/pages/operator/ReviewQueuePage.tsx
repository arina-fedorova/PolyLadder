import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { CheckCircle, XCircle, Eye, Filter } from 'lucide-react';
import { ItemDetailModal } from '@/components/operational/ItemDetailModal';
import { FeedbackDialog } from '@/components/operational/FeedbackDialog';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';

interface ValidatedItem {
  id: string;
  contentType: 'vocabulary' | 'grammar' | 'orthography';
  dataType: 'meaning' | 'utterance' | 'rule' | 'exercise';
  languageCode: string;
  languageName: string;
  cefrLevel: string;
  validatedAt: string;
  content: Record<string, unknown>;
  validationResults: {
    gate: string;
    passed: boolean;
    score?: number;
  }[];
}

interface ReviewQueueResponse {
  items: ValidatedItem[];
  total: number;
  page: number;
  pageSize: number;
}

export function ReviewQueuePage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [detailModalItem, setDetailModalItem] = useState<ValidatedItem | null>(null);
  const [feedbackItem, setFeedbackItem] = useState<{
    id: string;
    type: 'draft' | 'candidate' | 'mapping';
  } | null>(null);

  const pageSize = 20;

  const { data, isLoading } = useQuery<ReviewQueueResponse>({
    queryKey: ['review-queue', page, selectedType],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        ...(selectedType !== 'all' && { contentType: selectedType }),
      });

      const response = await apiClient.get<ReviewQueueResponse>(
        `/operational/review-queue?${params}`
      );
      return response.data;
    },
  });

  const approveMutation = useMutation<void, Error, string, { previousData?: ReviewQueueResponse }>({
    mutationFn: async (itemId: string) => {
      const currentData = queryClient.getQueryData<ReviewQueueResponse>([
        'review-queue',
        page,
        selectedType,
      ]);
      const item = currentData?.items.find((i) => i.id === itemId);
      if (!item) {
        throw new Error('Item not found');
      }

      await apiClient.post(`/operational/approve/${itemId}`, { dataType: item.dataType });
    },
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: ['review-queue'] });

      const previousData = queryClient.getQueryData<ReviewQueueResponse>([
        'review-queue',
        page,
        selectedType,
      ]);

      if (previousData) {
        queryClient.setQueryData<ReviewQueueResponse>(['review-queue', page, selectedType], {
          ...previousData,
          items: previousData.items.filter((item) => item.id !== itemId),
          total: previousData.total - 1,
        });
      }

      return { previousData };
    },
    onError: (_err, _itemId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['review-queue', page, selectedType], context.previousData);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['pipeline-health'] });
    },
  });

  const rejectMutation = useMutation<
    void,
    Error,
    { itemId: string; reason: string },
    { previousData?: ReviewQueueResponse }
  >({
    mutationFn: async ({ itemId, reason }: { itemId: string; reason: string }) => {
      const currentData = queryClient.getQueryData<ReviewQueueResponse>([
        'review-queue',
        page,
        selectedType,
      ]);
      const item = currentData?.items.find((i) => i.id === itemId);
      if (!item) {
        throw new Error('Item not found');
      }

      await apiClient.post(`/operational/reject/${itemId}`, { dataType: item.dataType, reason });
    },
    onMutate: async ({ itemId }) => {
      await queryClient.cancelQueries({ queryKey: ['review-queue'] });

      const previousData = queryClient.getQueryData<ReviewQueueResponse>([
        'review-queue',
        page,
        selectedType,
      ]);

      if (previousData) {
        queryClient.setQueryData<ReviewQueueResponse>(['review-queue', page, selectedType], {
          ...previousData,
          items: previousData.items.filter((item) => item.id !== itemId),
          total: previousData.total - 1,
        });
      }

      return { previousData };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['review-queue', page, selectedType], context.previousData);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['pipeline-health'] });
    },
  });

  const safeString = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return '';
  };

  const getContentDisplay = (item: ValidatedItem): string => {
    if (item.contentType === 'vocabulary') {
      return safeString(
        item.content.word_text ?? item.content.wordText ?? item.content.translation
      );
    }
    if (item.contentType === 'grammar') {
      return safeString(item.content.topic);
    }
    return safeString(item.content.character);
  };

  const getContentSecondary = (item: ValidatedItem): string | null => {
    if (item.contentType === 'vocabulary') {
      const translation = safeString(item.content.translation);
      return translation || null;
    }
    return null;
  };

  const handleApprove = (itemId: string) => {
    if (confirm('Approve this item for publication?')) {
      approveMutation.mutate(itemId);
      selectedItems.delete(itemId);
      setSelectedItems(new Set(selectedItems));
    }
  };

  const handleReject = (itemId: string) => {
    const item = data?.items.find((i) => i.id === itemId);
    if (item) {
      const itemType: 'draft' | 'candidate' | 'mapping' =
        item.dataType === 'meaning' || item.dataType === 'utterance' ? 'candidate' : 'draft';
      setFeedbackItem({ id: itemId, type: itemType });
    }
  };

  const handleBulkApprove = () => {
    if (selectedItems.size === 0) return;

    if (confirm(`Approve ${selectedItems.size} selected items?`)) {
      selectedItems.forEach((itemId) => {
        approveMutation.mutate(itemId);
      });
      setSelectedItems(new Set());
    }
  };

  const handleBulkReject = () => {
    if (selectedItems.size === 0) return;

    const reason = prompt(`Reject ${selectedItems.size} items. Reason (required):`);
    if (reason && reason.trim()) {
      selectedItems.forEach((itemId) => {
        rejectMutation.mutate({ itemId, reason: reason.trim() });
      });
      setSelectedItems(new Set());
    }
  };

  const toggleSelection = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const toggleSelectAll = () => {
    const items = data?.items ?? [];
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map((item) => item.id)));
    }
  };

  useKeyboardShortcut('a', () => {
    if (detailModalItem) {
      handleApprove(detailModalItem.id);
      setDetailModalItem(null);
    }
  });

  useKeyboardShortcut('r', () => {
    if (detailModalItem) {
      handleReject(detailModalItem.id);
      setDetailModalItem(null);
    }
  });

  useKeyboardShortcut('Escape', () => {
    if (detailModalItem) {
      setDetailModalItem(null);
    }
  });

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Review Queue</h1>
          <p className="text-gray-600 mt-1">{data?.total || 0} items awaiting review</p>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Filter className="w-5 h-5 text-gray-500" />
            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setPage(1);
              }}
              className="input py-2"
            >
              <option value="all">All Types</option>
              <option value="vocabulary">Vocabulary</option>
              <option value="grammar">Grammar</option>
              <option value="orthography">Orthography</option>
            </select>
          </div>
        </div>
      </div>

      {selectedItems.size > 0 && (
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 flex items-center justify-between">
          <span className="text-primary-900 font-medium">
            {selectedItems.size} item{selectedItems.size > 1 ? 's' : ''} selected
          </span>
          <div className="space-x-2">
            <button onClick={handleBulkApprove} className="btn-primary inline-flex items-center">
              <CheckCircle className="w-4 h-4 mr-2" />
              Approve Selected
            </button>
            <button
              onClick={handleBulkReject}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 inline-flex items-center"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject Selected
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left">
                <input
                  type="checkbox"
                  checked={
                    selectedItems.size === (data?.items ?? []).length &&
                    (data?.items ?? []).length > 0
                  }
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Content
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Language
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Level
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Validated
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {(data?.items ?? []).map((item) => {
              const secondary = getContentSecondary(item);
              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.id)}
                      onChange={() => toggleSelection(item.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 capitalize">
                      {item.contentType}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">
                      {getContentDisplay(item)}
                    </div>
                    {secondary && <div className="text-sm text-gray-500">{secondary}</div>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.languageName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.cefrLevel}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(item.validatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2 flex items-center">
                    <button
                      onClick={() => setDetailModalItem(item)}
                      className="text-primary-600 hover:text-primary-700"
                      aria-label="View details"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleApprove(item.id)}
                      disabled={approveMutation.isPending}
                      className="text-green-600 hover:text-green-700 disabled:opacity-50"
                      aria-label="Approve"
                    >
                      <CheckCircle className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleReject(item.id)}
                      disabled={rejectMutation.isPending}
                      className="text-red-600 hover:text-red-700 disabled:opacity-50"
                      aria-label="Provide Feedback"
                      title="Provide Feedback"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {data && data.total > pageSize && (
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t">
            <div className="text-sm text-gray-700">
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, data.total)} of{' '}
              {data.total} results
            </div>
            <div className="space-x-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * pageSize >= data.total}
                className="btn-secondary disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {detailModalItem && (
        <ItemDetailModal
          item={detailModalItem}
          onClose={() => setDetailModalItem(null)}
          onApprove={() => {
            handleApprove(detailModalItem.id);
            setDetailModalItem(null);
          }}
          onReject={() => {
            handleReject(detailModalItem.id);
            setDetailModalItem(null);
          }}
        />
      )}

      {feedbackItem && (
        <FeedbackDialog
          itemId={feedbackItem.id}
          itemType={feedbackItem.type}
          onClose={() => setFeedbackItem(null)}
          onSubmit={() => {
            setFeedbackItem(null);
            void queryClient.invalidateQueries({ queryKey: ['review-queue'] });
            selectedItems.delete(feedbackItem.id);
            setSelectedItems(new Set(selectedItems));
          }}
        />
      )}
    </div>
  );
}
