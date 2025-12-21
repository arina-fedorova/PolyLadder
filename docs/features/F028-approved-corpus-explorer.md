# F028: Approved Corpus Explorer

**Feature Code**: F028
**Created**: 2025-12-17
**Phase**: 7 - Operational UI
**Status**: Completed
**PR**: #31

---

## Description

Operators need read-only access to the approved corpus for content audits, quality checks, and planning new content. This feature provides a comprehensive search interface with advanced filtering, detailed viewing, export capabilities, and statistics dashboards showing corpus coverage across languages and CEFR levels.

## Success Criteria

- [x] Search approved data with filters (language, CEFR level, content type, text search)
- [x] Browse approved vocabulary, grammar, orthography, and curriculum items
- [x] Export capabilities (JSON, CSV) with bulk selection
- [x] Statistics dashboard showing counts by language, level, and content type
- [x] Detail view for inspecting individual items
- [x] Performance optimized for large corpus (10,000+ items)

---

## Tasks

### Task 1: Corpus Explorer Page Component

**File**: `packages/web/src/pages/operator/CorpusExplorerPage.tsx`

Create search interface with advanced filtering and results display.

**Implementation Plan**:

```typescript
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

interface ApprovedItem {
  id: string;
  contentType: 'vocabulary' | 'grammar' | 'orthography' | 'curriculum';
  language: string;
  cefrLevel: 'A0' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  approvedAt: string;
  metadata: {
    wordText?: string;
    translation?: string;
    topic?: string;
    character?: string;
    lessonName?: string;
  };
}

interface CorpusSearchResponse {
  items: ApprovedItem[];
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

export function CorpusExplorerPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [contentTypeFilter, setContentTypeFilter] = useState<string>('all');
  const [languageFilter, setLanguageFilter] = useState<string>('all');
  const [cefrLevelFilter, setCefrLevelFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [detailModalItem, setDetailModalItem] = useState<ApprovedItem | null>(null);
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');

  // Fetch corpus search results
  const { data, isLoading, error } = useQuery({
    queryKey: ['corpus-search', page, pageSize, contentTypeFilter, languageFilter, cefrLevelFilter, searchText],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });

      if (contentTypeFilter !== 'all') params.append('contentType', contentTypeFilter);
      if (languageFilter !== 'all') params.append('language', languageFilter);
      if (cefrLevelFilter !== 'all') params.append('cefrLevel', cefrLevelFilter);
      if (searchText.trim()) params.append('search', searchText.trim());

      const response = await apiClient.get<CorpusSearchResponse>(
        `/operational/corpus/search?${params.toString()}`
      );
      return response.data;
    },
    keepPreviousData: true,
  });

  // Fetch available languages
  const { data: languagesData } = useQuery({
    queryKey: ['corpus-languages'],
    queryFn: async () => {
      const response = await apiClient.get<{ languages: string[] }>('/operational/corpus/languages');
      return response.data;
    },
  });

  const handleSelectAll = () => {
    if (selectedItems.size === data?.items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(data?.items.map(item => item.id) || []));
    }
  };

  const handleToggleSelect = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleExport = async () => {
    if (selectedItems.size === 0) {
      alert('Please select items to export');
      return;
    }

    try {
      const response = await apiClient.post(
        '/operational/corpus/export',
        { itemIds: Array.from(selectedItems), format: exportFormat },
        { responseType: 'blob' }
      );

      // Create download link
      const blob = new Blob([response.data], {
        type: exportFormat === 'json' ? 'application/json' : 'text/csv',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `corpus-export-${Date.now()}.${exportFormat}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Export failed');
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1); // Reset to first page on new search
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Approved Corpus Explorer</h1>

        {selectedItems.size > 0 && (
          <div className="flex items-center gap-3">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as 'json' | 'csv')}
              className="input text-sm"
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
            <button
              onClick={handleExport}
              className="btn-primary flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export {selectedItems.size} Selected ({exportFormat.toUpperCase()})
            </button>
          </div>
        )}
      </div>

      {/* Search and Filters */}
      <div className="card p-6 space-y-4">
        <form onSubmit={handleSearch} className="space-y-4">
          {/* Text Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search Text
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search in word text, translations, topics..."
                className="input flex-1"
              />
              <button type="submit" className="btn-primary px-6">
                Search
              </button>
            </div>
          </div>

          {/* Filters Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

            {/* Language Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Language
              </label>
              <select
                value={languageFilter}
                onChange={(e) => setLanguageFilter(e.target.value)}
                className="input w-full"
              >
                <option value="all">All Languages</option>
                {languagesData?.languages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>

            {/* CEFR Level Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                CEFR Level
              </label>
              <select
                value={cefrLevelFilter}
                onChange={(e) => setCefrLevelFilter(e.target.value)}
                className="input w-full"
              >
                <option value="all">All Levels</option>
                <option value="A0">A0</option>
                <option value="A1">A1</option>
                <option value="A2">A2</option>
                <option value="B1">B1</option>
                <option value="B2">B2</option>
                <option value="C1">C1</option>
                <option value="C2">C2</option>
              </select>
            </div>

            {/* Page Size */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Items Per Page
              </label>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="input w-full"
              >
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
              </select>
            </div>
          </div>
        </form>
      </div>

      {/* Results Table */}
      {isLoading ? (
        <div className="card p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : error ? (
        <div className="card p-6 bg-red-50 border-red-200">
          <p className="text-red-800">Failed to load corpus: {error.message}</p>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          No items found matching your search criteria.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedItems.size === data.items.length && data.items.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Language
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Level
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Content
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Approved At
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.id)}
                      onChange={() => handleToggleSelect(item.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      {CONTENT_TYPE_LABELS[item.contentType]}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.language}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800">
                      {item.cefrLevel}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">
                      {item.metadata.wordText || item.metadata.topic ||
                       item.metadata.character || item.metadata.lessonName ||
                       `ID: ${item.id.slice(0, 8)}`}
                    </div>
                    {item.metadata.translation && (
                      <div className="text-sm text-gray-500">
                        {item.metadata.translation}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(item.approvedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => setDetailModalItem(item)}
                      className="text-blue-600 hover:text-blue-900"
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
              of <span className="font-medium">{data.total.toLocaleString()}</span> items
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-sm text-gray-700">
                Page {page} of {Math.ceil(data.total / pageSize)}
              </span>
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
      {detailModalItem && (
        <ItemDetailModal
          item={detailModalItem}
          onClose={() => setDetailModalItem(null)}
        />
      )}
    </div>
  );
}
```

**Dependencies**: TanStack Query, API client (F018), Protected routes (F024)

---

### Task 2: Item Detail Modal Component

**File**: `packages/web/src/components/operational/ItemDetailModal.tsx`

Create modal showing full content details for approved items.

**Implementation Plan**:

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

interface ApprovedItem {
  id: string;
  contentType: 'vocabulary' | 'grammar' | 'orthography' | 'curriculum';
  language: string;
  cefrLevel: string;
  approvedAt: string;
  metadata: Record<string, any>;
}

interface ItemDetailModalProps {
  item: ApprovedItem;
  onClose: () => void;
}

export function ItemDetailModal({ item, onClose }: ItemDetailModalProps) {
  // Fetch full item details
  const { data: fullItem, isLoading } = useQuery({
    queryKey: ['corpus-item-detail', item.id, item.contentType],
    queryFn: async () => {
      const response = await apiClient.get(
        `/operational/corpus/${item.contentType}/${item.id}`
      );
      return response.data;
    },
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {item.contentType.charAt(0).toUpperCase() + item.contentType.slice(1)} Details
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {item.language} · {item.cefrLevel} · ID: {item.id.slice(0, 8)}
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
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* Metadata */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Metadata</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="card bg-gray-50 p-4">
                    <p className="text-sm text-gray-600">Language</p>
                    <p className="font-medium text-gray-900">{fullItem.language}</p>
                  </div>
                  <div className="card bg-gray-50 p-4">
                    <p className="text-sm text-gray-600">CEFR Level</p>
                    <p className="font-medium text-gray-900">{fullItem.cefr_level}</p>
                  </div>
                  <div className="card bg-gray-50 p-4">
                    <p className="text-sm text-gray-600">Approved At</p>
                    <p className="font-medium text-gray-900">
                      {new Date(fullItem.approved_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="card bg-gray-50 p-4">
                    <p className="text-sm text-gray-600">Content Type</p>
                    <p className="font-medium text-gray-900">
                      {item.contentType.charAt(0).toUpperCase() + item.contentType.slice(1)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Full Content */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Full Content</h3>
                <div className="card">
                  <pre className="p-4 text-sm text-gray-900 whitespace-pre-wrap bg-gray-50 rounded overflow-x-auto">
                    {JSON.stringify(fullItem, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Content-Specific Sections */}
              {item.contentType === 'vocabulary' && fullItem.word_text && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Vocabulary Details</h3>
                  <div className="space-y-3">
                    <div className="card bg-blue-50 p-4">
                      <p className="text-sm text-blue-600 mb-1">Word</p>
                      <p className="text-2xl font-bold text-blue-900">{fullItem.word_text}</p>
                    </div>
                    {fullItem.translation && (
                      <div className="card bg-green-50 p-4">
                        <p className="text-sm text-green-600 mb-1">Translation</p>
                        <p className="text-xl font-semibold text-green-900">{fullItem.translation}</p>
                      </div>
                    )}
                    {fullItem.example_sentence && (
                      <div className="card p-4">
                        <p className="text-sm text-gray-600 mb-1">Example Sentence</p>
                        <p className="text-gray-900">{fullItem.example_sentence}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {item.contentType === 'grammar' && fullItem.topic && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Grammar Lesson Details</h3>
                  <div className="space-y-3">
                    <div className="card bg-purple-50 p-4">
                      <p className="text-sm text-purple-600 mb-1">Topic</p>
                      <p className="text-xl font-bold text-purple-900">{fullItem.topic}</p>
                    </div>
                    {fullItem.explanation && (
                      <div className="card p-4">
                        <p className="text-sm text-gray-600 mb-2">Explanation</p>
                        <p className="text-gray-900 whitespace-pre-wrap">{fullItem.explanation}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {item.contentType === 'orthography' && fullItem.character && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Orthography Details</h3>
                  <div className="card bg-indigo-50 p-6 text-center">
                    <p className="text-sm text-indigo-600 mb-2">Character</p>
                    <p className="text-6xl font-bold text-indigo-900">{fullItem.character}</p>
                    {fullItem.pronunciation && (
                      <p className="text-xl text-indigo-700 mt-4">[{fullItem.pronunciation}]</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Dependencies**: TanStack Query, API client (F018)

---

### Task 3: API Endpoints for Corpus Search

**File**: `packages/api/src/routes/operational/corpus.ts`

Create endpoints for searching, viewing, and exporting approved corpus.

**Implementation Plan**:

```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';

const CorpusSearchSchema = z.object({
  page: z.string().transform(Number).default('1'),
  pageSize: z.string().transform(Number).default('50'),
  contentType: z.enum(['vocabulary', 'grammar', 'orthography', 'curriculum']).optional(),
  language: z.string().optional(),
  cefrLevel: z.enum(['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional(),
  search: z.string().optional(),
});

const ExportSchema = z.object({
  itemIds: z.array(z.string().uuid()),
  format: z.enum(['json', 'csv']),
});

export default async function corpusRoutes(fastify: FastifyInstance) {
  // GET /operational/corpus/search - Search approved corpus
  fastify.get('/operational/corpus/search', {
    onRequest: [fastify.authenticate, fastify.requireRole('operator')],
    schema: {
      querystring: CorpusSearchSchema,
    },
    handler: async (request, reply) => {
      const { page, pageSize, contentType, language, cefrLevel, search } = request.query as z.infer<
        typeof CorpusSearchSchema
      >;
      const offset = (page - 1) * pageSize;

      // Build filter conditions
      const contentTypeFilter = contentType ? `AND content_type = '${contentType}'` : '';
      const languageFilter = language ? `AND language = '${language}'` : '';
      const cefrLevelFilter = cefrLevel ? `AND cefr_level = '${cefrLevel}'` : '';

      // Build search condition (searches across multiple fields)
      let searchFilter = '';
      if (search) {
        searchFilter = `AND (
          word_text ILIKE '%${search}%' OR
          translation ILIKE '%${search}%' OR
          topic ILIKE '%${search}%' OR
          character ILIKE '%${search}%' OR
          lesson_name ILIKE '%${search}%'
        )`;
      }

      // Union query across all approved tables
      const query = `
        WITH all_approved AS (
          SELECT
            id,
            'vocabulary' as content_type,
            language,
            cefr_level,
            approved_at,
            jsonb_build_object('wordText', word_text, 'translation', translation) as metadata
          FROM approved_vocabulary
          WHERE 1=1
            ${contentType === 'vocabulary' || !contentType ? '' : 'AND FALSE'}
            ${languageFilter}
            ${cefrLevelFilter}
            ${search ? `AND (word_text ILIKE '%${search}%' OR translation ILIKE '%${search}%')` : ''}

          UNION ALL

          SELECT
            id,
            'grammar' as content_type,
            language,
            cefr_level,
            approved_at,
            jsonb_build_object('topic', topic) as metadata
          FROM approved_grammar_lessons
          WHERE 1=1
            ${contentType === 'grammar' || !contentType ? '' : 'AND FALSE'}
            ${languageFilter}
            ${cefrLevelFilter}
            ${search ? `AND topic ILIKE '%${search}%'` : ''}

          UNION ALL

          SELECT
            id,
            'orthography' as content_type,
            language,
            cefr_level,
            approved_at,
            jsonb_build_object('character', character) as metadata
          FROM approved_orthography
          WHERE 1=1
            ${contentType === 'orthography' || !contentType ? '' : 'AND FALSE'}
            ${languageFilter}
            ${cefrLevelFilter}
            ${search ? `AND character ILIKE '%${search}%'` : ''}

          UNION ALL

          SELECT
            id,
            'curriculum' as content_type,
            language,
            cefr_level,
            approved_at,
            jsonb_build_object('lessonName', lesson_name) as metadata
          FROM approved_curriculum_lessons
          WHERE 1=1
            ${contentType === 'curriculum' || !contentType ? '' : 'AND FALSE'}
            ${languageFilter}
            ${cefrLevelFilter}
            ${search ? `AND lesson_name ILIKE '%${search}%'` : ''}
        )
        SELECT * FROM all_approved
        ORDER BY approved_at DESC
        LIMIT $1 OFFSET $2
      `;

      const countQuery = `
        WITH all_approved AS (
          SELECT id FROM approved_vocabulary WHERE 1=1
            ${contentType === 'vocabulary' || !contentType ? '' : 'AND FALSE'}
            ${languageFilter}
            ${cefrLevelFilter}
            ${search ? `AND (word_text ILIKE '%${search}%' OR translation ILIKE '%${search}%')` : ''}
          UNION ALL
          SELECT id FROM approved_grammar_lessons WHERE 1=1
            ${contentType === 'grammar' || !contentType ? '' : 'AND FALSE'}
            ${languageFilter}
            ${cefrLevelFilter}
            ${search ? `AND topic ILIKE '%${search}%'` : ''}
          UNION ALL
          SELECT id FROM approved_orthography WHERE 1=1
            ${contentType === 'orthography' || !contentType ? '' : 'AND FALSE'}
            ${languageFilter}
            ${cefrLevelFilter}
            ${search ? `AND character ILIKE '%${search}%'` : ''}
          UNION ALL
          SELECT id FROM approved_curriculum_lessons WHERE 1=1
            ${contentType === 'curriculum' || !contentType ? '' : 'AND FALSE'}
            ${languageFilter}
            ${cefrLevelFilter}
            ${search ? `AND lesson_name ILIKE '%${search}%'` : ''}
        )
        SELECT COUNT(*) as total FROM all_approved
      `;

      const [itemsResult, countResult] = await Promise.all([
        fastify.pg.query(query, [pageSize, offset]),
        fastify.pg.query(countQuery),
      ]);

      return reply.code(200).send({
        items: itemsResult.rows,
        total: parseInt(countResult.rows[0].total, 10),
        page,
        pageSize,
      });
    },
  });

  // GET /operational/corpus/languages - Get list of available languages
  fastify.get('/operational/corpus/languages', {
    onRequest: [fastify.authenticate, fastify.requireRole('operator')],
    handler: async (request, reply) => {
      const query = `
        SELECT DISTINCT language
        FROM (
          SELECT language FROM approved_vocabulary
          UNION
          SELECT language FROM approved_grammar_lessons
          UNION
          SELECT language FROM approved_orthography
          UNION
          SELECT language FROM approved_curriculum_lessons
        ) languages
        ORDER BY language ASC
      `;

      const result = await fastify.pg.query(query);

      return reply.code(200).send({
        languages: result.rows.map((row) => row.language),
      });
    },
  });

  // GET /operational/corpus/:contentType/:id - Get single item details
  fastify.get('/operational/corpus/:contentType/:id', {
    onRequest: [fastify.authenticate, fastify.requireRole('operator')],
    schema: {
      params: z.object({
        contentType: z.enum(['vocabulary', 'grammar', 'orthography', 'curriculum']),
        id: z.string().uuid(),
      }),
    },
    handler: async (request, reply) => {
      const { contentType, id } = request.params as { contentType: string; id: string };

      const table = `approved_${contentType === 'curriculum' ? 'curriculum_lessons' : contentType === 'grammar' ? 'grammar_lessons' : contentType}`;

      const result = await fastify.pg.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Item not found' });
      }

      return reply.code(200).send(result.rows[0]);
    },
  });

  // POST /operational/corpus/export - Export selected items
  fastify.post('/operational/corpus/export', {
    onRequest: [fastify.authenticate, fastify.requireRole('operator')],
    schema: {
      body: ExportSchema,
    },
    handler: async (request, reply) => {
      const { itemIds, format } = request.body as z.infer<typeof ExportSchema>;

      if (itemIds.length === 0) {
        return reply.code(400).send({ error: 'No items selected' });
      }

      if (itemIds.length > 1000) {
        return reply.code(400).send({ error: 'Export limit is 1000 items' });
      }

      // Fetch all items
      const query = `
        SELECT * FROM (
          SELECT 'vocabulary' as content_type, * FROM approved_vocabulary WHERE id = ANY($1)
          UNION ALL
          SELECT 'grammar' as content_type, * FROM approved_grammar_lessons WHERE id = ANY($1)
          UNION ALL
          SELECT 'orthography' as content_type, * FROM approved_orthography WHERE id = ANY($1)
          UNION ALL
          SELECT 'curriculum' as content_type, * FROM approved_curriculum_lessons WHERE id = ANY($1)
        ) items
      `;

      const result = await fastify.pg.query(query, [itemIds]);
      const items = result.rows;

      if (format === 'json') {
        return reply
          .header('Content-Type', 'application/json')
          .header('Content-Disposition', `attachment; filename="corpus-export-${Date.now()}.json"`)
          .send(JSON.stringify(items, null, 2));
      } else if (format === 'csv') {
        // Generate CSV
        if (items.length === 0) {
          return reply.code(400).send({ error: 'No items found' });
        }

        const headers = Object.keys(items[0]).join(',');
        const rows = items.map((item) =>
          Object.values(item)
            .map((val) => (typeof val === 'object' ? JSON.stringify(val) : String(val)))
            .join(',')
        );

        const csv = [headers, ...rows].join('\n');

        return reply
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', `attachment; filename="corpus-export-${Date.now()}.csv"`)
          .send(csv);
      }
    },
  });
}
```

**Dependencies**: Fastify, Zod, PostgreSQL plugin (F018), Auth middleware (F019)

---

### Task 4: Corpus Statistics Dashboard Component

**File**: `packages/web/src/components/operational/CorpusStatistics.tsx`

Create statistics dashboard showing corpus coverage.

**Implementation Plan**:

```typescript
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { apiClient } from '../../api/client';

interface CorpusStats {
  totalItems: number;
  byContentType: Record<string, number>;
  byLanguage: Record<string, number>;
  byCefrLevel: Record<string, number>;
  byLanguageAndLevel: Array<{
    language: string;
    A0: number;
    A1: number;
    A2: number;
    B1: number;
    B2: number;
    C1: number;
    C2: number;
  }>;
}

export function CorpusStatistics() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['corpus-statistics'],
    queryFn: async () => {
      const response = await apiClient.get<CorpusStats>('/operational/corpus/statistics');
      return response.data;
    },
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  if (isLoading) {
    return (
      <div className="card p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-6 bg-red-50 border-red-200">
        <p className="text-red-800">Failed to load statistics</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6">
          <p className="text-blue-100 text-sm font-medium">Total Items</p>
          <p className="text-4xl font-bold mt-2">{data.totalItems.toLocaleString()}</p>
        </div>

        <div className="card bg-gradient-to-br from-green-500 to-green-600 text-white p-6">
          <p className="text-green-100 text-sm font-medium">Languages</p>
          <p className="text-4xl font-bold mt-2">{Object.keys(data.byLanguage).length}</p>
        </div>

        <div className="card bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6">
          <p className="text-purple-100 text-sm font-medium">Vocabulary</p>
          <p className="text-4xl font-bold mt-2">{data.byContentType.vocabulary?.toLocaleString() || 0}</p>
        </div>

        <div className="card bg-gradient-to-br from-orange-500 to-orange-600 text-white p-6">
          <p className="text-orange-100 text-sm font-medium">Grammar Lessons</p>
          <p className="text-4xl font-bold mt-2">{data.byContentType.grammar?.toLocaleString() || 0}</p>
        </div>
      </div>

      {/* Coverage by Language and CEFR Level */}
      <div className="card p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Coverage by Language and CEFR Level</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data.byLanguageAndLevel}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="language" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="A0" fill="#ef4444" stackId="a" />
            <Bar dataKey="A1" fill="#f97316" stackId="a" />
            <Bar dataKey="A2" fill="#eab308" stackId="a" />
            <Bar dataKey="B1" fill="#84cc16" stackId="a" />
            <Bar dataKey="B2" fill="#22c55e" stackId="a" />
            <Bar dataKey="C1" fill="#06b6d4" stackId="a" />
            <Bar dataKey="C2" fill="#3b82f6" stackId="a" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Content Type Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">By Content Type</h3>
          <div className="space-y-3">
            {Object.entries(data.byContentType).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 capitalize">{type}</span>
                <span className="text-lg font-bold text-gray-900">{count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">By CEFR Level</h3>
          <div className="space-y-3">
            {Object.entries(data.byCefrLevel).sort().map(([level, count]) => (
              <div key={level} className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{level}</span>
                <span className="text-lg font-bold text-gray-900">{count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Dependencies**: recharts, TanStack Query, API client (F018)

---

### Task 5: API Endpoint for Corpus Statistics

**File**: `packages/api/src/routes/operational/corpus-statistics.ts`

Create endpoint to aggregate corpus statistics.

**Implementation Plan**:

```typescript
import { FastifyInstance } from 'fastify';

export default async function corpusStatisticsRoutes(fastify: FastifyInstance) {
  fastify.get('/operational/corpus/statistics', {
    onRequest: [fastify.authenticate, fastify.requireRole('operator')],
    handler: async (request, reply) => {
      // Get total counts by content type
      const byContentTypeQuery = `
        SELECT 'vocabulary' as content_type, COUNT(*) as count FROM approved_vocabulary
        UNION ALL
        SELECT 'grammar', COUNT(*) FROM approved_grammar_lessons
        UNION ALL
        SELECT 'orthography', COUNT(*) FROM approved_orthography
        UNION ALL
        SELECT 'curriculum', COUNT(*) FROM approved_curriculum_lessons
      `;

      // Get counts by language
      const byLanguageQuery = `
        SELECT language, COUNT(*) as count
        FROM (
          SELECT language FROM approved_vocabulary
          UNION ALL
          SELECT language FROM approved_grammar_lessons
          UNION ALL
          SELECT language FROM approved_orthography
          UNION ALL
          SELECT language FROM approved_curriculum_lessons
        ) all_items
        GROUP BY language
        ORDER BY count DESC
      `;

      // Get counts by CEFR level
      const byCefrLevelQuery = `
        SELECT cefr_level, COUNT(*) as count
        FROM (
          SELECT cefr_level FROM approved_vocabulary
          UNION ALL
          SELECT cefr_level FROM approved_grammar_lessons
          UNION ALL
          SELECT cefr_level FROM approved_orthography
          UNION ALL
          SELECT cefr_level FROM approved_curriculum_lessons
        ) all_items
        GROUP BY cefr_level
        ORDER BY cefr_level ASC
      `;

      // Get counts by language AND CEFR level (for chart)
      const byLanguageAndLevelQuery = `
        SELECT
          language,
          COUNT(CASE WHEN cefr_level = 'A0' THEN 1 END) as "A0",
          COUNT(CASE WHEN cefr_level = 'A1' THEN 1 END) as "A1",
          COUNT(CASE WHEN cefr_level = 'A2' THEN 1 END) as "A2",
          COUNT(CASE WHEN cefr_level = 'B1' THEN 1 END) as "B1",
          COUNT(CASE WHEN cefr_level = 'B2' THEN 1 END) as "B2",
          COUNT(CASE WHEN cefr_level = 'C1' THEN 1 END) as "C1",
          COUNT(CASE WHEN cefr_level = 'C2' THEN 1 END) as "C2"
        FROM (
          SELECT language, cefr_level FROM approved_vocabulary
          UNION ALL
          SELECT language, cefr_level FROM approved_grammar_lessons
          UNION ALL
          SELECT language, cefr_level FROM approved_orthography
          UNION ALL
          SELECT language, cefr_level FROM approved_curriculum_lessons
        ) all_items
        GROUP BY language
        ORDER BY language ASC
      `;

      const [byContentTypeResult, byLanguageResult, byCefrLevelResult, byLanguageAndLevelResult] =
        await Promise.all([
          fastify.pg.query(byContentTypeQuery),
          fastify.pg.query(byLanguageQuery),
          fastify.pg.query(byCefrLevelQuery),
          fastify.pg.query(byLanguageAndLevelQuery),
        ]);

      // Transform results
      const byContentType = Object.fromEntries(
        byContentTypeResult.rows.map((row) => [row.content_type, parseInt(row.count, 10)])
      );

      const byLanguage = Object.fromEntries(
        byLanguageResult.rows.map((row) => [row.language, parseInt(row.count, 10)])
      );

      const byCefrLevel = Object.fromEntries(
        byCefrLevelResult.rows.map((row) => [row.cefr_level, parseInt(row.count, 10)])
      );

      const totalItems = Object.values(byContentType).reduce((sum, count) => sum + count, 0);

      return reply.code(200).send({
        totalItems,
        byContentType,
        byLanguage,
        byCefrLevel,
        byLanguageAndLevel: byLanguageAndLevelResult.rows.map((row) => ({
          language: row.language,
          A0: parseInt(row.A0, 10),
          A1: parseInt(row.A1, 10),
          A2: parseInt(row.A2, 10),
          B1: parseInt(row.B1, 10),
          B2: parseInt(row.B2, 10),
          C1: parseInt(row.C1, 10),
          C2: parseInt(row.C2, 10),
        })),
      });
    },
  });
}
```

**Dependencies**: Fastify, PostgreSQL plugin (F018), Auth middleware (F019)

---

### Task 6: Route Registration and Dashboard Tab

**File**: `packages/web/src/App.tsx`

Add CorpusExplorerPage route to application.

**Implementation Plan**:

```typescript
// Add import
import { CorpusExplorerPage } from './pages/operator/CorpusExplorerPage';

// In operator routes section
<Route
  path="/operator/corpus"
  element={
    <ProtectedRoute requiredRole="operator">
      <CorpusExplorerPage />
    </ProtectedRoute>
  }
/>
```

**File**: `packages/web/src/components/layout/Header.tsx`

Add corpus explorer link to operator navigation.

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
    <NavLink to="/operator/corpus">Corpus</NavLink>
  </>
)}
```

**File**: `packages/web/src/pages/operator/DashboardPage.tsx`

Add corpus statistics to dashboard.

**Implementation Plan**:

```typescript
// Add import
import { CorpusStatistics } from '../../components/operational/CorpusStatistics';

// Add after existing dashboard sections
<div className="mt-6">
  <h2 className="text-2xl font-bold text-gray-900 mb-4">Corpus Statistics</h2>
  <CorpusStatistics />
</div>
```

**File**: `packages/api/src/app.ts`

Register corpus routes plugin.

**Implementation Plan**:

```typescript
// Add imports
import corpusRoutes from './routes/operational/corpus';
import corpusStatisticsRoutes from './routes/operational/corpus-statistics';

// Register routes
await app.register(corpusRoutes);
await app.register(corpusStatisticsRoutes);
```

**Dependencies**: All previous tasks, routing setup (F024), dashboard (F025)

---

## Open Questions

### Question 1: Text Search Implementation

**Context**: The search functionality uses ILIKE for text search across multiple fields. For large corpora (>50,000 items), this may become slow.

**Options**:

1. **Keep ILIKE** (current approach)
   - Pros: Simple, no additional setup
   - Cons: Slow for large datasets
2. **Add PostgreSQL full-text search** (tsvector + GIN index)
   - Pros: Much faster, supports stemming and ranking
   - Cons: More complex queries, additional indexes
3. **Integrate Elasticsearch** or similar search engine
   - Pros: Best performance, advanced features (fuzzy search, facets)
   - Cons: Additional infrastructure, sync complexity

**Decision Needed**: Choose search strategy based on expected corpus size.

**Temporary Plan**: Use ILIKE for MVP. Monitor performance and add full-text search if needed.

---

### Question 2: Export Limits

**Context**: Current implementation limits exports to 1000 items to prevent memory issues and long response times.

**Options**:

1. **Keep 1000-item limit** with warning message
   - Pros: Prevents server overload
   - Cons: Users may need multiple exports for full corpus
2. **Implement async export** for large datasets (background job + download link)
   - Pros: No size limits, better UX for large exports
   - Cons: Requires job queue system (BullMQ, etc.)
3. **Stream export response** for unlimited size
   - Pros: No memory issues, one download
   - Cons: More complex implementation

**Decision Needed**: Choose export strategy based on expected use cases.

**Temporary Plan**: Keep 1000-item limit for MVP. Add async export in Phase 2 if operators request it.

---

### Question 3: Corpus Versioning

**Context**: The corpus explorer shows the current approved corpus. If items are updated or removed, there's no historical view.

**Options**:

1. **No versioning** (current state only)
   - Pros: Simpler implementation
   - Cons: Can't audit changes over time
2. **Add version history** to approved tables
   - Pros: Full audit trail, can view corpus at any point in time
   - Cons: Storage overhead, complex queries
3. **Snapshot exports** (operators manually export periodically)
   - Pros: No automatic versioning needed
   - Cons: Manual process, gaps in history

**Decision Needed**: Determine if corpus versioning is required for compliance or auditing.

**Temporary Plan**: No automatic versioning for MVP. Operators can manually export snapshots if needed.

---

## Dependencies

**Blocks**:

- None (terminal for Phase 7 - Operational UI)

**Depends on**:

- F020: Operational Endpoints (API infrastructure)
- F024: Protected Routes & Navigation (routing, layout)
- F025: Data Health Dashboard (dashboard integration)

**Optional**:

- Recharts library for visualization
- Full-text search setup (PostgreSQL tsvector or Elasticsearch)

---

## Notes

### Implementation Priority

1. Start with corpus search endpoint and page (Tasks 1, 3)
2. Add item detail modal (Task 2)
3. Implement export functionality (Task 3 extension)
4. Add statistics dashboard (Tasks 4, 5)
5. Integrate into existing UI (Task 6)

### Performance Considerations

- Add database indexes on `approved_*` tables:
  - `(language, cefr_level)` for filtering
  - `(approved_at)` for sorting
  - Full-text indexes if text search becomes slow
- Consider materialized view for statistics (refresh every 5 minutes)
- Use pagination with large page sizes (50-200) for efficiency

### Security Considerations

- Operator role required for all endpoints
- Sanitize search input to prevent SQL injection (use parameterized queries)
- Limit export size to prevent DoS attacks

### UX Enhancements (Future)

- Saved search filters (persist in localStorage)
- Column sorting in results table
- Quick filters (e.g., "Recently approved", "High-frequency words")
- Comparison mode (diff between two versions of same item)
- Bulk delete from approved corpus (with confirmation)
