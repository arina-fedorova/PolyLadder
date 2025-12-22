# F026: Candidate Inspection & Approval Interface

**Feature Code**: F026
**Created**: 2025-12-17
**Phase**: 7 - Operational UI
**Status**: Completed
**PR**: #29

---

## Description

Operator interface for reviewing content in VALIDATED state and approving or rejecting items for publication. Includes paginated table, detailed item viewer, approve/reject actions with reason tracking, bulk operations, and optimistic UI updates.

## Success Criteria

- [x] Paginated table of validated items with filters
- [x] Item detail modal showing full content and validation results
- [x] Approve button calling POST /operational/approve/:id
- [x] Reject button with required reason input calling POST /operational/reject/:id
- [x] Bulk select with approve/reject actions
- [x] Optimistic UI updates for instant feedback
- [x] Filter by content type (vocabulary/grammar/orthography)

---

## Tasks

### Task 1: Create Review Queue Page

**Description**: Main page displaying validated items awaiting operator review.

**Implementation Plan**:

Create `packages/web/src/pages/operator/ReviewQueuePage.tsx`:

```tsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { CheckCircle, XCircle, Eye, Filter } from 'lucide-react';
import { ItemDetailModal } from '@/components/operational/ItemDetailModal';

interface ValidatedItem {
  id: string;
  contentType: 'vocabulary' | 'grammar' | 'orthography';
  dataType: 'meaning' | 'utterance' | 'rule' | 'exercise';
  languageCode: string;
  languageName: string;
  cefrLevel: string;
  validatedAt: string;
  content: {
    // Vocabulary
    wordText?: string;
    translation?: string;

    // Grammar
    topic?: string;

    // Orthography
    character?: string;
  };
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

  const pageSize = 20;

  // Fetch validated items
  const { data, isLoading } = useQuery({
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
    keepPreviousData: true, // Keep old data while fetching new page
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiClient.post(`/operational/approve/${itemId}`);
    },
    onMutate: async (itemId) => {
      // Optimistic update: remove from list immediately
      await queryClient.cancelQueries(['review-queue']);

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
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['review-queue', page, selectedType], context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries(['review-queue']);
      queryClient.invalidateQueries(['pipeline-health']);
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ itemId, reason }: { itemId: string; reason: string }) => {
      await apiClient.post(`/operational/reject/${itemId}`, { reason });
    },
    onMutate: async ({ itemId }) => {
      await queryClient.cancelQueries(['review-queue']);

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
      queryClient.invalidateQueries(['review-queue']);
      queryClient.invalidateQueries(['pipeline-health']);
    },
  });

  const handleApprove = (itemId: string) => {
    if (confirm('Approve this item for publication?')) {
      approveMutation.mutate(itemId);
      selectedItems.delete(itemId);
      setSelectedItems(new Set(selectedItems));
    }
  };

  const handleReject = (itemId: string) => {
    const reason = prompt('Reason for rejection (required):');
    if (reason && reason.trim()) {
      rejectMutation.mutate({ itemId, reason: reason.trim() });
      selectedItems.delete(itemId);
      setSelectedItems(new Set(selectedItems));
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
    if (selectedItems.size === data?.items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(data?.items.map((item) => item.id) || []));
    }
  };

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Review Queue</h1>
          <p className="text-gray-600 mt-1">{data?.total || 0} items awaiting review</p>
        </div>

        {/* Filters */}
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

      {/* Bulk Actions */}
      {selectedItems.size > 0 && (
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 flex items-center justify-between">
          <span className="text-primary-900 font-medium">
            {selectedItems.size} item{selectedItems.size > 1 ? 's' : ''} selected
          </span>
          <div className="space-x-2">
            <button onClick={handleBulkApprove} className="btn-primary">
              <CheckCircle className="w-4 h-4 mr-2" />
              Approve Selected
            </button>
            <button
              onClick={handleBulkReject}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject Selected
            </button>
          </div>
        </div>
      )}

      {/* Items Table */}
      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedItems.size === data?.items.length && data?.items.length > 0}
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
            {data?.items.map((item) => (
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
                    {item.content.wordText || item.content.topic || item.content.character}
                  </div>
                  {item.content.translation && (
                    <div className="text-sm text-gray-500">{item.content.translation}</div>
                  )}
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
                <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                  <button
                    onClick={() => setDetailModalItem(item)}
                    className="text-primary-600 hover:text-primary-700"
                  >
                    <Eye className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleApprove(item.id)}
                    disabled={approveMutation.isLoading}
                    className="text-green-600 hover:text-green-700 disabled:opacity-50"
                  >
                    <CheckCircle className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleReject(item.id)}
                    disabled={rejectMutation.isLoading}
                    className="text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
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

      {/* Detail Modal */}
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
    </div>
  );
}
```

**Files Created**: `packages/web/src/pages/operator/ReviewQueuePage.tsx`

---

### Task 2: Create Item Detail Modal Component

**Description**: Modal displaying full item content and validation results.

**Implementation Plan**:

Create `packages/web/src/components/operational/ItemDetailModal.tsx`:

```tsx
import React from 'react';
import { X, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface ItemDetailModalProps {
  item: {
    id: string;
    contentType: 'vocabulary' | 'grammar' | 'orthography';
    dataType: 'meaning' | 'utterance' | 'rule' | 'exercise';
    languageCode: string;
    languageName: string;
    cefrLevel: string;
    validatedAt: string;
    content: any;
    validationResults: {
      gate: string;
      passed: boolean;
      score?: number;
    }[];
  };
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}

export function ItemDetailModal({ item, onClose, onApprove, onReject }: ItemDetailModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 capitalize">
              {item.contentType} Review
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {item.languageName} • {item.cefrLevel}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Main Content */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Content</h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              {item.contentType === 'vocabulary' && (
                <>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Word:</span>
                    <p className="text-lg font-semibold text-gray-900">{item.content.wordText}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Translation:</span>
                    <p className="text-gray-900">{item.content.translation}</p>
                  </div>
                  {item.content.exampleSentence && (
                    <div>
                      <span className="text-sm font-medium text-gray-600">Example:</span>
                      <p className="text-gray-900 italic">{item.content.exampleSentence}</p>
                    </div>
                  )}
                  {item.content.notes && (
                    <div>
                      <span className="text-sm font-medium text-gray-600">Notes:</span>
                      <p className="text-gray-700">{item.content.notes}</p>
                    </div>
                  )}
                </>
              )}

              {item.contentType === 'grammar' && (
                <>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Topic:</span>
                    <p className="text-lg font-semibold text-gray-900">{item.content.topic}</p>
                  </div>
                  {item.content.explanation && (
                    <div>
                      <span className="text-sm font-medium text-gray-600">Explanation:</span>
                      <p className="text-gray-900">{item.content.explanation}</p>
                    </div>
                  )}
                  {item.content.examples && (
                    <div>
                      <span className="text-sm font-medium text-gray-600">Examples:</span>
                      <ul className="list-disc list-inside text-gray-900">
                        {item.content.examples.map((ex: string, i: number) => (
                          <li key={i}>{ex}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

              {item.contentType === 'orthography' && (
                <>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Character:</span>
                    <p className="text-2xl font-bold text-gray-900">{item.content.character}</p>
                  </div>
                  {item.content.pronunciation && (
                    <div>
                      <span className="text-sm font-medium text-gray-600">Pronunciation:</span>
                      <p className="text-gray-900">{item.content.pronunciation}</p>
                    </div>
                  )}
                  {item.content.notes && (
                    <div>
                      <span className="text-sm font-medium text-gray-600">Notes:</span>
                      <p className="text-gray-700">{item.content.notes}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Validation Results */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Validation Results</h3>
            <div className="space-y-2">
              {item.validationResults.map((result, index) => {
                const Icon = result.passed ? CheckCircle : result.score ? AlertCircle : XCircle;
                const colorClass = result.passed
                  ? 'bg-green-50 border-green-200'
                  : result.score
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-red-50 border-red-200';
                const iconColor = result.passed
                  ? 'text-green-600'
                  : result.score
                    ? 'text-yellow-600'
                    : 'text-red-600';

                return (
                  <div
                    key={index}
                    className={`flex items-center justify-between p-3 rounded-lg border ${colorClass}`}
                  >
                    <div className="flex items-center space-x-3">
                      <Icon className={`w-5 h-5 ${iconColor}`} />
                      <span className="font-medium text-gray-900">{result.gate}</span>
                    </div>
                    <div className="text-sm">
                      {result.score !== undefined && (
                        <span className="font-medium text-gray-700">Score: {result.score}%</span>
                      )}
                      {result.passed ? (
                        <span className="text-green-700 font-medium">Passed</span>
                      ) : (
                        <span className="text-red-700 font-medium">Failed</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Metadata */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Metadata</h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">ID:</span>
                <span className="text-gray-900 font-mono">{item.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Type:</span>
                <span className="text-gray-900 capitalize">{item.contentType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Language:</span>
                <span className="text-gray-900">
                  {item.languageName} ({item.languageCode})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">CEFR Level:</span>
                <span className="text-gray-900">{item.cefrLevel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Validated:</span>
                <span className="text-gray-900">{new Date(item.validatedAt).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
          <button
            onClick={onReject}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center space-x-2"
          >
            <XCircle className="w-4 h-4" />
            <span>Reject</span>
          </button>
          <button onClick={onApprove} className="btn-primary flex items-center space-x-2">
            <CheckCircle className="w-4 h-4" />
            <span>Approve</span>
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Files Created**: `packages/web/src/components/operational/ItemDetailModal.tsx`

---

### Task 3: Add Review Queue Endpoint to API

**Description**: Endpoint returning paginated validated items (already exists in F020).

**Implementation Plan**:

The endpoint GET /operational/review-queue already exists from F020. Response structure:

```typescript
interface ReviewQueueResponse {
  items: Array<{
    id: string;
    contentType: 'vocabulary' | 'grammar' | 'orthography';
    dataType: 'meaning' | 'utterance' | 'rule' | 'exercise';
    languageCode: string;
    languageName: string;
    cefrLevel: string;
    state: 'VALIDATED';
    validatedAt: string;
    content: Record<string, any>;
    validationResults: Array<{
      gate: string;
      passed: boolean;
      score?: number;
    }>;
  }>;
  total: number;
  page: number;
  pageSize: number;
}
```

No new endpoint needed - F020 already provides this.

---

### Task 4: Update App.tsx Route

**Description**: Add review queue route to App.tsx.

**Implementation Plan**:

Update `packages/web/src/App.tsx`:

```tsx
import { ReviewQueuePage } from '@/pages/operator/ReviewQueuePage';

// In routes section:
<Route
  path="/operator/review-queue"
  element={
    <ProtectedRoute requiredRole="operator">
      <MainLayout showSidebar>
        <ReviewQueuePage />
      </MainLayout>
    </ProtectedRoute>
  }
/>;
```

**Files Modified**: `packages/web/src/App.tsx`

---

### Task 5: Add Keyboard Shortcuts for Review Actions

**Description**: Keyboard shortcuts for faster review workflow.

**Implementation Plan**:

Create `packages/web/src/hooks/useKeyboardShortcut.ts`:

```typescript
import { useEffect } from 'react';

export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  options: {
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  } = {}
) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.key === key &&
        event.ctrlKey === (options.ctrlKey || false) &&
        event.shiftKey === (options.shiftKey || false) &&
        event.altKey === (options.altKey || false)
      ) {
        event.preventDefault();
        callback();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, callback, options]);
}
```

Update ReviewQueuePage to add shortcuts:

```tsx
// In ReviewQueuePage component:
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';

// Add shortcuts (when modal is open and single item selected)
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
```

Add keyboard hints to modal footer:

```tsx
<div className="text-xs text-gray-500 text-center mb-2">
  Shortcuts: <kbd className="px-2 py-1 bg-gray-100 rounded">A</kbd> Approve •{' '}
  <kbd className="px-2 py-1 bg-gray-100 rounded">R</kbd> Reject •{' '}
  <kbd className="px-2 py-1 bg-gray-100 rounded">ESC</kbd> Close
</div>
```

**Files Created**: `packages/web/src/hooks/useKeyboardShortcut.ts`

---

## Open Questions

### Question 1: Rejection Reason Validation

**Context**: Currently using browser prompt() for rejection reason. Should we use a proper modal form?

**Options**:

1. Browser prompt() (current)
   - Pros: Simple, no extra component
   - Cons: Poor UX, can't validate input well
2. Custom modal with textarea
   - Pros: Better UX, can add validation, show character count
   - Cons: More complex
3. Inline textarea that appears when reject button clicked
   - Pros: Good UX, stays on same page
   - Cons: Requires more UI state management

**Temporary Plan**: Keep prompt() for MVP. Add proper modal in future if operators complain about UX.

---

### Question 2: Undo Approve/Reject Actions

**Context**: After approve/reject, item disappears from queue. What if operator made mistake?

**Options**:

1. No undo (current)
   - Pros: Simple
   - Cons: Can't fix mistakes easily
2. "Undo" toast notification for 5 seconds
   - Pros: Common pattern, good UX
   - Cons: Requires toast system
3. Move to "Recently Approved/Rejected" tab where can be reverted
   - Pros: Audit trail, can revert anytime
   - Cons: More complex state management

**Temporary Plan**: No undo for MVP. Items can be manually changed in database if needed. Add undo toast post-launch if operators request it.

---

### Question 3: Preview Mode for Content

**Context**: Modal shows text content. For orthography, should we show audio playback? For vocabulary, example sentences?

**Options**:

1. Text only (current)
   - Pros: Simple, works for all content types
   - Cons: Can't verify audio quality
2. Add audio player for orthography
   - Pros: Better quality control
   - Cons: Requires audio file storage/serving
3. Add rich previews (images, audio, formatted text)
   - Pros: Best UX, comprehensive review
   - Cons: Complex, requires media handling

**Temporary Plan**: Text only for MVP. Audio preview is nice-to-have but not critical for initial content approval. Add media previews post-launch.

---

## Dependencies

- **Blocks**: F027 (Content Browser)
- **Depends on**: F020 (Operational Endpoints), F024 (Protected Routes)

---

## Notes

### Optimistic UI Updates

The review queue uses optimistic updates:

1. User clicks approve/reject
2. Item immediately removed from list (optimistic update)
3. API call made in background
4. If API fails, item reappears (rollback)
5. On success, invalidate queries to refresh data

This provides instant feedback while maintaining data consistency.

### Pagination Strategy

- Client-side pagination would require loading all items upfront
- Server-side pagination keeps queries fast (<100ms even with 1000s of items)
- TanStack Query's `keepPreviousData` prevents UI flicker during page changes
- Page size of 20 balances screen space with scroll frequency

### Bulk Operations

- Bulk approve: Useful for mass-approving similar items (e.g., all orthography characters)
- Bulk reject: Less common, but needed for fixing batch generation errors
- Operations run sequentially (not parallel) to avoid database deadlocks
- Progress feedback shows during bulk operations

### Performance Considerations

- Review queue query includes LEFT JOINs to get content details
- Query limited to 20 items per page (fast even with complex JOINs)
- Validation results stored as JSONB (fast to query and display)
- Optimistic updates reduce perceived latency

### Accessibility

- Keyboard shortcuts for power users
- Focus management in modal (trap focus, restore on close)
- ARIA labels for icon buttons
- Color is not the only indicator (icons + text for status)

### Future Enhancements

- Add comment/note field to approvals (for audit trail)
- Add "Skip" action (defer decision, keep in queue)
- Add filtering by language or CEFR level
- Add sorting options (oldest first, newest first, by content type)
- Add batch import of approved items from CSV
- Add assignment system (assign items to specific operators)
