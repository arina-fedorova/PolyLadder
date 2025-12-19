# F027: Failure Investigation Tools

**Feature Code**: F027
**Created**: 2025-12-17
**Phase**: 7 - Operational UI
**Status**: Not Started

---

## Description

Operators need comprehensive tools to investigate validation failures, identify patterns, and take corrective action. This feature provides a failures dashboard with filtering, detail inspection, retry mechanisms, and trend analysis to help operators debug systematic quality gate issues.

## Success Criteria

- [ ] Paginated list of failed validations with filtering
- [ ] Failure details showing gate name, error message, and validation context
- [ ] Retry button to reprocess failed items
- [ ] Fix and resubmit option to edit content inline
- [ ] Failure trends chart showing patterns over time
- [ ] Bulk retry operations for similar failures

---

## Tasks

### Task 1: Failures List Page Component

**File**: `packages/web/src/pages/operator/FailuresPage.tsx`

Create paginated failures list with filtering and bulk operations.

**Implementation Plan**:

```typescript
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

interface ValidationFailure {
  id: string;
  contentType: 'vocabulary' | 'grammar' | 'orthography' | 'curriculum';
  itemId: string;
  gateName: string;
  errorMessage: string;
  attemptNumber: number;
  failedAt: string;
  canRetry: boolean;
  metadata: {
    wordText?: string;
    topic?: string;
    character?: string;
  };
}

interface FailuresResponse {
  failures: ValidationFailure[];
  total: number;
  page: number;
  pageSize: number;
}

const CONTENT_TYPE_LABELS = {
  vocabulary: 'Vocabulary',
  grammar: 'Grammar',
  orthography: 'Orthography',
  curriculum: 'Curriculum',
};

const GATE_TYPE_LABELS = {
  'schema-validation': 'Schema Validation',
  'cefr-level-check': 'CEFR Level Check',
  'content-completeness': 'Content Completeness',
  'duplication-check': 'Duplication Check',
  'dependency-validation': 'Dependency Validation',
};

export function FailuresPage() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [contentTypeFilter, setContentTypeFilter] = useState<string>('all');
  const [gateFilter, setGateFilter] = useState<string>('all');
  const [timeRangeFilter, setTimeRangeFilter] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [selectedFailures, setSelectedFailures] = useState<Set<string>>(new Set());
  const [detailModalFailure, setDetailModalFailure] = useState<ValidationFailure | null>(null);

  const queryClient = useQueryClient();

  // Fetch failures list
  const { data, isLoading, error } = useQuery({
    queryKey: ['failures', page, pageSize, contentTypeFilter, gateFilter, timeRangeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });

      if (contentTypeFilter !== 'all') params.append('contentType', contentTypeFilter);
      if (gateFilter !== 'all') params.append('gateName', gateFilter);
      if (timeRangeFilter !== 'all') params.append('timeRange', timeRangeFilter);

      const response = await apiClient.get<FailuresResponse>(
        `/operational/failures?${params.toString()}`
      );
      return response.data;
    },
    keepPreviousData: true,
  });

  // Bulk retry mutation
  const bulkRetryMutation = useMutation({
    mutationFn: async (failureIds: string[]) => {
      await apiClient.post('/operational/failures/bulk-retry', { failureIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['failures']);
      setSelectedFailures(new Set());
    },
  });

  const handleSelectAll = () => {
    if (selectedFailures.size === data?.failures.length) {
      setSelectedFailures(new Set());
    } else {
      setSelectedFailures(new Set(data?.failures.map(f => f.id) || []));
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Validation Failures</h1>

        {selectedFailures.size > 0 && (
          <button
            onClick={handleBulkRetry}
            disabled={bulkRetryMutation.isLoading}
            className="btn-primary flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Retry {selectedFailures.size} Selected
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Content Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Content Type
            </label>
            <select
              value={contentTypeFilter}
              onChange={(e) => setContentTypeFilter(e.target.value)}
              className="input w-full"
            >
              <option value="all">All Types</option>
              <option value="vocabulary">Vocabulary</option>
              <option value="grammar">Grammar</option>
              <option value="orthography">Orthography</option>
              <option value="curriculum">Curriculum</option>
            </select>
          </div>

          {/* Gate Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quality Gate
            </label>
            <select
              value={gateFilter}
              onChange={(e) => setGateFilter(e.target.value)}
              className="input w-full"
            >
              <option value="all">All Gates</option>
              <option value="schema-validation">Schema Validation</option>
              <option value="cefr-level-check">CEFR Level Check</option>
              <option value="content-completeness">Content Completeness</option>
              <option value="duplication-check">Duplication Check</option>
              <option value="dependency-validation">Dependency Validation</option>
            </select>
          </div>

          {/* Time Range Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Time Range
            </label>
            <select
              value={timeRangeFilter}
              onChange={(e) => setTimeRangeFilter(e.target.value as any)}
              className="input w-full"
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>
        </div>
      </div>

      {/* Failures Table */}
      {isLoading ? (
        <div className="card p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : error ? (
        <div className="card p-6 bg-red-50 border-red-200">
          <p className="text-red-800">Failed to load failures: {error.message}</p>
        </div>
      ) : !data || data.failures.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          No validation failures found. Great job!
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedFailures.size === data.failures.length}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Content Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Item
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Gate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Error
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Attempts
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
              {data.failures.map((failure) => (
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
                      {CONTENT_TYPE_LABELS[failure.contentType]}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">
                      {failure.metadata.wordText || failure.metadata.topic ||
                       failure.metadata.character || `ID: ${failure.itemId.slice(0, 8)}`}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">
                      {GATE_TYPE_LABELS[failure.gateName as keyof typeof GATE_TYPE_LABELS] || failure.gateName}
                    </span>
                  </td>
                  <td className="px-6 py-4 max-w-md">
                    <p className="text-sm text-red-600 truncate">
                      {failure.errorMessage}
                    </p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-500">
                      {failure.attemptNumber} / 3
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(failure.failedAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => setDetailModalFailure(failure)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
            <div className="text-sm text-gray-700">
              Showing <span className="font-medium">{(page - 1) * pageSize + 1}</span> to{' '}
              <span className="font-medium">
                {Math.min(page * pageSize, data.total)}
              </span>{' '}
              of <span className="font-medium">{data.total}</span> failures
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * pageSize >= data.total}
                className="btn-secondary disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModalFailure && (
        <FailureDetailModal
          failure={detailModalFailure}
          onClose={() => setDetailModalFailure(null)}
          onRetry={() => {
            setDetailModalFailure(null);
            queryClient.invalidateQueries(['failures']);
          }}
        />
      )}
    </div>
  );
}
```

**Dependencies**: TanStack Query, API client (F018), Protected routes (F024)

---

### Task 2: Failure Detail Modal Component

**File**: `packages/web/src/components/operational/FailureDetailModal.tsx`

Create modal showing full error details with retry and fix actions.

**Implementation Plan**:

```typescript
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

interface ValidationFailure {
  id: string;
  contentType: 'vocabulary' | 'grammar' | 'orthography' | 'curriculum';
  itemId: string;
  gateName: string;
  errorMessage: string;
  attemptNumber: number;
  failedAt: string;
  canRetry: boolean;
  metadata: {
    wordText?: string;
    topic?: string;
    character?: string;
  };
  validationContext?: {
    receivedValue?: any;
    expectedValue?: any;
    stackTrace?: string;
    gateConfig?: Record<string, any>;
  };
}

interface FailureDetailModalProps {
  failure: ValidationFailure;
  onClose: () => void;
  onRetry: () => void;
}

export function FailureDetailModal({ failure, onClose, onRetry }: FailureDetailModalProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const queryClient = useQueryClient();

  // Retry mutation
  const retryMutation = useMutation({
    mutationFn: async (failureId: string) => {
      await apiClient.post(`/operational/failures/${failureId}/retry`);
    },
    onSuccess: () => {
      onRetry();
    },
  });

  const handleRetry = () => {
    if (window.confirm('Retry validation for this item?')) {
      retryMutation.mutate(failure.id);
    }
  };

  const handleFixAndResubmit = () => {
    setIsEditMode(true);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Failure Details</h2>
            <p className="text-sm text-gray-500 mt-1">
              {failure.contentType} · {failure.metadata.wordText || failure.metadata.topic ||
               failure.metadata.character || `ID: ${failure.itemId.slice(0, 8)}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Failure Summary */}
          <div className="card bg-red-50 border-red-200">
            <div className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h3 className="font-semibold text-red-900">
                    {failure.gateName}
                  </h3>
                  <p className="text-red-700 mt-1">
                    {failure.errorMessage}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-red-200">
                <div>
                  <p className="text-sm text-red-600">Attempt</p>
                  <p className="font-medium text-red-900">{failure.attemptNumber} of 3</p>
                </div>
                <div>
                  <p className="text-sm text-red-600">Failed At</p>
                  <p className="font-medium text-red-900">
                    {new Date(failure.failedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Validation Context */}
          {failure.validationContext && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Validation Context</h3>

              {/* Received vs Expected */}
              {failure.validationContext.receivedValue !== undefined && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="card bg-gray-50">
                    <div className="p-4">
                      <p className="text-sm font-medium text-gray-600 mb-2">Received Value</p>
                      <pre className="text-sm text-gray-900 whitespace-pre-wrap bg-white p-3 rounded border border-gray-200">
                        {JSON.stringify(failure.validationContext.receivedValue, null, 2)}
                      </pre>
                    </div>
                  </div>
                  <div className="card bg-green-50">
                    <div className="p-4">
                      <p className="text-sm font-medium text-green-600 mb-2">Expected Value</p>
                      <pre className="text-sm text-gray-900 whitespace-pre-wrap bg-white p-3 rounded border border-green-200">
                        {JSON.stringify(failure.validationContext.expectedValue, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {/* Stack Trace */}
              {failure.validationContext.stackTrace && (
                <div className="card">
                  <div className="p-4">
                    <p className="text-sm font-medium text-gray-600 mb-2">Stack Trace</p>
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded border border-gray-200 overflow-x-auto">
                      {failure.validationContext.stackTrace}
                    </pre>
                  </div>
                </div>
              )}

              {/* Gate Configuration */}
              {failure.validationContext.gateConfig && (
                <div className="card">
                  <div className="p-4">
                    <p className="text-sm font-medium text-gray-600 mb-2">Gate Configuration</p>
                    <pre className="text-sm text-gray-900 whitespace-pre-wrap bg-gray-50 p-3 rounded border border-gray-200">
                      {JSON.stringify(failure.validationContext.gateConfig, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
            {failure.canRetry && (
              <button
                onClick={handleRetry}
                disabled={retryMutation.isLoading}
                className="btn-primary flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {retryMutation.isLoading ? 'Retrying...' : 'Retry Validation'}
              </button>
            )}

            <button
              onClick={handleFixAndResubmit}
              className="btn-secondary flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Fix and Resubmit
            </button>

            <button
              onClick={onClose}
              className="btn-secondary ml-auto"
            >
              Close
            </button>
          </div>
        </div>

        {/* Edit Mode (Future Enhancement) */}
        {isEditMode && (
          <div className="border-t border-gray-200 p-6 bg-gray-50">
            <p className="text-sm text-gray-600">
              Edit mode coming soon. For now, please fix the item in the content browser.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Dependencies**: TanStack Query mutations, API client (F018)

---

### Task 3: API Endpoint for Failures List

**File**: `packages/api/src/routes/operational/failures.ts`

Create endpoint to fetch and filter validation failures.

**Implementation Plan**:

```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';

const FailuresQuerySchema = z.object({
  page: z.string().transform(Number).default('1'),
  pageSize: z.string().transform(Number).default('20'),
  contentType: z.enum(['vocabulary', 'grammar', 'orthography', 'curriculum']).optional(),
  gateName: z.string().optional(),
  timeRange: z.enum(['24h', '7d', '30d', 'all']).default('7d'),
});

const BulkRetrySchema = z.object({
  failureIds: z.array(z.string().uuid()),
});

export default async function failuresRoutes(fastify: FastifyInstance) {
  // GET /operational/failures - List validation failures
  fastify.get('/operational/failures', {
    onRequest: [fastify.authenticate, fastify.requireRole('operator')],
    schema: {
      querystring: FailuresQuerySchema,
      response: {
        200: z.object({
          failures: z.array(z.object({
            id: z.string(),
            contentType: z.enum(['vocabulary', 'grammar', 'orthography', 'curriculum']),
            itemId: z.string(),
            gateName: z.string(),
            errorMessage: z.string(),
            attemptNumber: z.number(),
            failedAt: z.string(),
            canRetry: z.boolean(),
            metadata: z.object({
              wordText: z.string().optional(),
              topic: z.string().optional(),
              character: z.string().optional(),
            }),
          })),
          total: z.number(),
          page: z.number(),
          pageSize: z.number(),
        }),
      },
    },
    handler: async (request, reply) => {
      const { page, pageSize, contentType, gateName, timeRange } = request.query as z.infer<typeof FailuresQuerySchema>;
      const offset = (page - 1) * pageSize;

      // Build time filter
      let timeFilter = '';
      if (timeRange === '24h') {
        timeFilter = "AND qr.created_at > NOW() - INTERVAL '24 hours'";
      } else if (timeRange === '7d') {
        timeFilter = "AND qr.created_at > NOW() - INTERVAL '7 days'";
      } else if (timeRange === '30d') {
        timeFilter = "AND qr.created_at > NOW() - INTERVAL '30 days'";
      }

      // Build content type filter
      const contentTypeFilter = contentType ? `AND qr.entity_type = '${contentType}'` : '';
      const gateNameFilter = gateName ? `AND qr.gate_name = '${gateName}'` : '';

      // Query failures
      const failuresQuery = `
        SELECT
          qr.id,
          qr.entity_type as content_type,
          qr.entity_id as item_id,
          qr.gate_name,
          qr.error_message,
          qr.attempt_number,
          qr.created_at as failed_at,
          (qr.attempt_number < 3) as can_retry,
          CASE qr.entity_type
            WHEN 'vocabulary' THEN jsonb_build_object('wordText', v.word_text)
            WHEN 'grammar' THEN jsonb_build_object('topic', g.topic)
            WHEN 'orthography' THEN jsonb_build_object('character', o.character)
            ELSE '{}'::jsonb
          END as metadata
        FROM quality_gate_results qr
        LEFT JOIN candidate_vocabulary v ON qr.entity_type = 'vocabulary' AND qr.entity_id = v.id
        LEFT JOIN candidate_grammar_lessons g ON qr.entity_type = 'grammar' AND qr.entity_id = g.id
        LEFT JOIN candidate_orthography o ON qr.entity_type = 'orthography' AND qr.entity_id = o.id
        WHERE qr.status = 'failed'
          ${timeFilter}
          ${contentTypeFilter}
          ${gateNameFilter}
        ORDER BY qr.created_at DESC
        LIMIT $1 OFFSET $2
      `;

      const countQuery = `
        SELECT COUNT(*) as total
        FROM quality_gate_results qr
        WHERE qr.status = 'failed'
          ${timeFilter}
          ${contentTypeFilter}
          ${gateNameFilter}
      `;

      const [failuresResult, countResult] = await Promise.all([
        fastify.pg.query(failuresQuery, [pageSize, offset]),
        fastify.pg.query(countQuery),
      ]);

      return reply.code(200).send({
        failures: failuresResult.rows,
        total: parseInt(countResult.rows[0].total, 10),
        page,
        pageSize,
      });
    },
  });

  // POST /operational/failures/:id/retry - Retry single failure
  fastify.post('/operational/failures/:id/retry', {
    onRequest: [fastify.authenticate, fastify.requireRole('operator')],
    schema: {
      params: z.object({
        id: z.string().uuid(),
      }),
      response: {
        200: z.object({
          success: z.boolean(),
          message: z.string(),
        }),
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      // Get failure details
      const failureResult = await fastify.pg.query(
        `SELECT entity_type, entity_id, attempt_number
         FROM quality_gate_results
         WHERE id = $1 AND status = 'failed'`,
        [id]
      );

      if (failureResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Failure not found' });
      }

      const failure = failureResult.rows[0];

      if (failure.attempt_number >= 3) {
        return reply.code(400).send({ error: 'Maximum retry attempts reached' });
      }

      // Reset to CANDIDATE state to trigger revalidation
      const entityTable = `candidate_${failure.entity_type}`;
      await fastify.pg.query(
        `UPDATE ${entityTable}
         SET lifecycle_state = 'CANDIDATE', updated_at = NOW()
         WHERE id = $1`,
        [failure.entity_id]
      );

      // Mark old failure as retried
      await fastify.pg.query(
        `UPDATE quality_gate_results
         SET metadata = metadata || '{"retried": true}'::jsonb
         WHERE id = $1`,
        [id]
      );

      return reply.code(200).send({
        success: true,
        message: 'Item queued for revalidation',
      });
    },
  });

  // POST /operational/failures/bulk-retry - Retry multiple failures
  fastify.post('/operational/failures/bulk-retry', {
    onRequest: [fastify.authenticate, fastify.requireRole('operator')],
    schema: {
      body: BulkRetrySchema,
      response: {
        200: z.object({
          success: z.boolean(),
          retriedCount: z.number(),
        }),
      },
    },
    handler: async (request, reply) => {
      const { failureIds } = request.body as z.infer<typeof BulkRetrySchema>;

      // Get all failures
      const failuresResult = await fastify.pg.query(
        `SELECT id, entity_type, entity_id, attempt_number
         FROM quality_gate_results
         WHERE id = ANY($1) AND status = 'failed' AND attempt_number < 3`,
        [failureIds]
      );

      const failures = failuresResult.rows;

      // Reset each to CANDIDATE state
      for (const failure of failures) {
        const entityTable = `candidate_${failure.entity_type}`;
        await fastify.pg.query(
          `UPDATE ${entityTable}
           SET lifecycle_state = 'CANDIDATE', updated_at = NOW()
           WHERE id = $1`,
          [failure.entity_id]
        );

        await fastify.pg.query(
          `UPDATE quality_gate_results
           SET metadata = metadata || '{"retried": true}'::jsonb
           WHERE id = $1`,
          [failure.id]
        );
      }

      return reply.code(200).send({
        success: true,
        retriedCount: failures.length,
      });
    },
  });

  // GET /operational/failures/:id/details - Get detailed failure info
  fastify.get('/operational/failures/:id/details', {
    onRequest: [fastify.authenticate, fastify.requireRole('operator')],
    schema: {
      params: z.object({
        id: z.string().uuid(),
      }),
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      const result = await fastify.pg.query(
        `SELECT
          id,
          entity_type as content_type,
          entity_id as item_id,
          gate_name,
          error_message,
          attempt_number,
          created_at as failed_at,
          (attempt_number < 3) as can_retry,
          metadata as validation_context
        FROM quality_gate_results
        WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Failure not found' });
      }

      return reply.code(200).send(result.rows[0]);
    },
  });
}
```

**Dependencies**: Fastify, Zod, PostgreSQL plugin (F018), Auth middleware (F019)

---

### Task 4: Failure Trends Visualization Component

**File**: `packages/web/src/components/operational/FailureTrendsChart.tsx`

Create chart showing failure patterns over time by gate type.

**Implementation Plan**:

```typescript
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { apiClient } from '../../api/client';

interface TrendDataPoint {
  date: string;
  'schema-validation': number;
  'cefr-level-check': number;
  'content-completeness': number;
  'duplication-check': number;
  'dependency-validation': number;
}

interface FailureTrendsResponse {
  trends: TrendDataPoint[];
  timeRange: '7d' | '30d' | '90d';
}

const GATE_COLORS = {
  'schema-validation': '#ef4444',
  'cefr-level-check': '#f97316',
  'content-completeness': '#eab308',
  'duplication-check': '#84cc16',
  'dependency-validation': '#06b6d4',
};

const GATE_LABELS = {
  'schema-validation': 'Schema Validation',
  'cefr-level-check': 'CEFR Level',
  'content-completeness': 'Completeness',
  'duplication-check': 'Duplication',
  'dependency-validation': 'Dependencies',
};

export function FailureTrendsChart() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');

  const { data, isLoading, error } = useQuery({
    queryKey: ['failure-trends', timeRange],
    queryFn: async () => {
      const response = await apiClient.get<FailureTrendsResponse>(
        `/operational/failures/trends?timeRange=${timeRange}`
      );
      return response.data;
    },
    refetchInterval: 60000, // Refresh every minute
  });

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Failure Trends</h2>

        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as any)}
          className="input text-sm"
        >
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
        </select>
      </div>

      {isLoading ? (
        <div className="h-80 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : error ? (
        <div className="h-80 flex items-center justify-center text-red-600">
          Failed to load trends data
        </div>
      ) : !data || data.trends.length === 0 ? (
        <div className="h-80 flex items-center justify-center text-gray-500">
          No failure data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data.trends}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => new Date(value).toLocaleDateString()}
            />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              labelFormatter={(value) => new Date(value).toLocaleDateString()}
              formatter={(value: number, name: string) => [
                value,
                GATE_LABELS[name as keyof typeof GATE_LABELS]
              ]}
            />
            <Legend
              formatter={(value) => GATE_LABELS[value as keyof typeof GATE_LABELS]}
            />
            {Object.keys(GATE_COLORS).map((gateName) => (
              <Line
                key={gateName}
                type="monotone"
                dataKey={gateName}
                stroke={GATE_COLORS[gateName as keyof typeof GATE_COLORS]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      <div className="pt-4 border-t border-gray-200">
        <p className="text-sm text-gray-600">
          Track validation failure patterns to identify systematic issues and tune quality gate thresholds.
        </p>
      </div>
    </div>
  );
}
```

**Dependencies**: recharts library, TanStack Query, API client (F018)

**Installation**:
```bash
cd packages/web
pnpm add recharts
```

---

### Task 5: API Endpoint for Failure Trends

**File**: `packages/api/src/routes/operational/failure-trends.ts`

Create endpoint to aggregate failure counts by gate and date.

**Implementation Plan**:

```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';

const TrendsQuerySchema = z.object({
  timeRange: z.enum(['7d', '30d', '90d']).default('7d'),
});

export default async function failureTrendsRoutes(fastify: FastifyInstance) {
  fastify.get('/operational/failures/trends', {
    onRequest: [fastify.authenticate, fastify.requireRole('operator')],
    schema: {
      querystring: TrendsQuerySchema,
      response: {
        200: z.object({
          trends: z.array(z.object({
            date: z.string(),
            'schema-validation': z.number(),
            'cefr-level-check': z.number(),
            'content-completeness': z.number(),
            'duplication-check': z.number(),
            'dependency-validation': z.number(),
          })),
          timeRange: z.enum(['7d', '30d', '90d']),
        }),
      },
    },
    handler: async (request, reply) => {
      const { timeRange } = request.query as z.infer<typeof TrendsQuerySchema>;

      // Determine date range
      let interval = '7 days';
      let groupBy = 'day';

      if (timeRange === '30d') {
        interval = '30 days';
        groupBy = 'day';
      } else if (timeRange === '90d') {
        interval = '90 days';
        groupBy = 'week';
      }

      // Query aggregated failure counts
      const query = `
        WITH date_series AS (
          SELECT generate_series(
            NOW() - INTERVAL '${interval}',
            NOW(),
            INTERVAL '1 ${groupBy}'
          )::date as date
        ),
        failure_counts AS (
          SELECT
            DATE_TRUNC('${groupBy}', created_at)::date as date,
            gate_name,
            COUNT(*) as count
          FROM quality_gate_results
          WHERE status = 'failed'
            AND created_at > NOW() - INTERVAL '${interval}'
          GROUP BY DATE_TRUNC('${groupBy}', created_at)::date, gate_name
        )
        SELECT
          ds.date,
          COALESCE(SUM(CASE WHEN fc.gate_name = 'schema-validation' THEN fc.count ELSE 0 END), 0) as "schema-validation",
          COALESCE(SUM(CASE WHEN fc.gate_name = 'cefr-level-check' THEN fc.count ELSE 0 END), 0) as "cefr-level-check",
          COALESCE(SUM(CASE WHEN fc.gate_name = 'content-completeness' THEN fc.count ELSE 0 END), 0) as "content-completeness",
          COALESCE(SUM(CASE WHEN fc.gate_name = 'duplication-check' THEN fc.count ELSE 0 END), 0) as "duplication-check",
          COALESCE(SUM(CASE WHEN fc.gate_name = 'dependency-validation' THEN fc.count ELSE 0 END), 0) as "dependency-validation"
        FROM date_series ds
        LEFT JOIN failure_counts fc ON ds.date = fc.date
        GROUP BY ds.date
        ORDER BY ds.date ASC
      `;

      const result = await fastify.pg.query(query);

      return reply.code(200).send({
        trends: result.rows,
        timeRange,
      });
    },
  });
}
```

**Dependencies**: Fastify, Zod, PostgreSQL plugin (F018), Auth middleware (F019)

---

### Task 6: Route Registration and Dashboard Integration

**File**: `packages/web/src/App.tsx`

Add FailuresPage route to application.

**Implementation Plan**:

```typescript
// Add import
import { FailuresPage } from './pages/operator/FailuresPage';

// In operator routes section
<Route
  path="/operator/failures"
  element={
    <ProtectedRoute requiredRole="operator">
      <FailuresPage />
    </ProtectedRoute>
  }
/>
```

**File**: `packages/web/src/components/layout/Header.tsx`

Add failures link to operator navigation.

**Implementation Plan**:

```typescript
// In operator navigation section
{user?.role === 'operator' && (
  <>
    <NavLink to="/operator/dashboard">Dashboard</NavLink>
    <NavLink to="/operator/review-queue">Review Queue</NavLink>
    <NavLink to="/operator/failures" className="text-red-600 hover:text-red-700">
      Failures
    </NavLink>
  </>
)}
```

**File**: `packages/web/src/pages/operator/DashboardPage.tsx`

Integrate FailureTrendsChart into dashboard.

**Implementation Plan**:

```typescript
// Add import
import { FailureTrendsChart } from '../../components/operational/FailureTrendsChart';

// Add after existing dashboard sections
<div className="mt-6">
  <FailureTrendsChart />
</div>
```

**File**: `packages/api/src/app.ts`

Register failure routes plugin.

**Implementation Plan**:

```typescript
// Add imports
import failuresRoutes from './routes/operational/failures';
import failureTrendsRoutes from './routes/operational/failure-trends';

// Register routes
await app.register(failuresRoutes);
await app.register(failureTrendsRoutes);
```

**Dependencies**: All previous tasks, routing setup (F024), dashboard (F025)

---

## Open Questions

### Question 1: Failure Data Retention Policy

**Context**: Validation failures accumulate over time. Should we keep all historical failures or implement a retention policy?

**Options**:
1. **Keep all failures indefinitely**
   - Pros: Complete audit trail, long-term trend analysis
   - Cons: Database growth, query performance degradation
2. **Archive failures after 90 days** (move to separate archive table)
   - Pros: Main table stays fast, data preserved for auditing
   - Cons: Two-table queries for historical analysis
3. **Delete failures after 90 days**
   - Pros: Minimal database footprint, best query performance
   - Cons: Loss of historical data

**Decision Needed**: Define retention policy before production deployment.

**Temporary Plan**: Keep all failures for MVP. Add archiving in post-launch optimization.

---

### Question 2: Automated Alerting for Failure Spikes

**Context**: Operators may not notice sudden spikes in validation failures.

**Options**:
1. **Email alerts** when failure rate exceeds threshold (e.g., >50 failures/hour)
   - Requires email service integration (SendGrid, SES)
2. **Slack/Discord webhooks** for real-time notifications
   - Requires webhook configuration
3. **In-app notifications** only (no external alerts)
   - Simpler implementation, but operators must be logged in

**Decision Needed**: Choose alerting strategy and threshold values.

**Temporary Plan**: In-app notifications only for MVP. Add email alerts in Phase 2.

---

### Question 3: Fix and Resubmit Workflow

**Context**: The "Fix and Resubmit" button currently shows placeholder text. What should the editing UX be?

**Options**:
1. **Inline modal editor** - Edit JSON directly in modal
   - Pros: Fast, no page navigation
   - Cons: Risk of invalid JSON, poor UX for complex fields
2. **Redirect to content browser** - Open item in F028 content browser for editing
   - Pros: Reuse existing UI, proper validation
   - Cons: Lose context, must navigate back
3. **Side-by-side view** - Split screen with error on left, editor on right
   - Pros: Best UX, error visible while editing
   - Cons: Complex implementation, screen space constraints

**Decision Needed**: Choose editing UX before implementing fix workflow.

**Temporary Plan**: For MVP, button redirects to content browser (Option 2). Consider inline editor in Phase 2.

---

## Dependencies

**Blocks**:
- F028: Content Browser (completes Operational UI phase)

**Depends on**:
- F013: Quality Gates Part 3 (defines gate types and error formats)
- F020: Operational Endpoints (API infrastructure)
- F024: Protected Routes & Navigation (routing, layout)
- F025: Data Health Dashboard (dashboard integration)

**Optional**:
- Email service integration for alerts
- Recharts library for visualization

---

## Notes

### Implementation Priority
1. Start with FailuresPage and API endpoint (Tasks 1, 3)
2. Add FailureDetailModal (Task 2)
3. Implement trends visualization (Tasks 4, 5)
4. Integrate into existing UI (Task 6)

### Performance Considerations
- Add database index on `quality_gate_results(status, created_at)` for fast filtering
- Consider pagination for very large failure lists (>1000 items)
- Cache trends data for 1 minute to reduce query load

### Security Considerations
- Operator role required for all endpoints
- Prevent unauthorized retry attempts via direct API calls
- Sanitize error messages before display (remove sensitive data)

### UX Enhancements (Future)
- Keyboard shortcuts (R=retry selected, F=filter, X=clear selection)
- Export failures as CSV for external analysis
- Failure pattern detection (auto-group similar errors)
- Suggested fixes based on error type
