import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Search, Download, Eye, Filter, ChevronLeft, ChevronRight, Database } from 'lucide-react';
import { CorpusItemModal } from '@/components/operational/CorpusItemModal';
import { CorpusStatistics } from '@/components/operational/CorpusStatistics';

interface CorpusItem {
  id: string;
  contentType: string;
  language?: string;
  level: string;
  createdAt: string;
  content: Record<string, unknown>;
}

interface CorpusSearchResponse {
  items: CorpusItem[];
  total: number;
  limit: number;
  offset: number;
}

interface LanguagesResponse {
  languages: string[];
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  meaning: 'Meaning',
  utterance: 'Utterance',
  rule: 'Grammar Rule',
  exercise: 'Exercise',
};

const CONTENT_TYPE_COLORS: Record<string, string> = {
  meaning: 'bg-blue-100 text-blue-800',
  utterance: 'bg-green-100 text-green-800',
  rule: 'bg-purple-100 text-purple-800',
  exercise: 'bg-orange-100 text-orange-800',
};

export function CorpusExplorerPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [contentTypeFilter, setContentTypeFilter] = useState<string>('all');
  const [languageFilter, setLanguageFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [detailModalItem, setDetailModalItem] = useState<CorpusItem | null>(null);
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');
  const [showStats, setShowStats] = useState(false);

  const offset = (page - 1) * pageSize;

  const { data, isPending: isLoading } = useQuery<CorpusSearchResponse>({
    queryKey: [
      'corpus-search',
      page,
      pageSize,
      contentTypeFilter,
      languageFilter,
      levelFilter,
      searchText,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: offset.toString(),
      });

      if (contentTypeFilter !== 'all') {
        params.append('contentType', contentTypeFilter);
      }
      if (languageFilter !== 'all') {
        params.append('language', languageFilter);
      }
      if (levelFilter !== 'all') {
        params.append('level', levelFilter);
      }
      if (searchText.trim()) {
        params.append('search', searchText.trim());
      }

      const response = await apiClient.get<CorpusSearchResponse>(
        `/operational/corpus/search?${params.toString()}`
      );
      return response.data;
    },
  });

  const { data: languagesData } = useQuery<LanguagesResponse>({
    queryKey: ['corpus-languages'],
    queryFn: async () => {
      const response = await apiClient.get<LanguagesResponse>('/operational/corpus/languages');
      return response.data;
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchText(searchInput);
    setPage(1);
  };

  const handleSelectAll = () => {
    if (!data) return;
    if (selectedItems.size === data.items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(data.items.map((item) => item.id)));
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

  const handleExport = () => {
    if (selectedItems.size === 0 || contentTypeFilter === 'all') {
      return;
    }

    void (async () => {
      try {
        const response = await apiClient.post(
          '/operational/corpus/export',
          {
            itemIds: Array.from(selectedItems),
            contentType: contentTypeFilter,
            format: exportFormat,
          },
          { responseType: 'blob' }
        );

        const blob = new Blob([response.data as BlobPart], {
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
      } catch (_error) {
        void _error;
      }
    })();
  };

  const getContentDisplay = (item: CorpusItem): string => {
    const content = item.content;
    const safeString = (val: unknown): string => {
      if (typeof val === 'string') return val;
      if (typeof val === 'number') return String(val);
      return '';
    };

    if (item.contentType === 'meaning') {
      return safeString(content.id) || item.id;
    }
    if (item.contentType === 'utterance') {
      return safeString(content.text);
    }
    if (item.contentType === 'rule') {
      return safeString(content.title);
    }
    if (item.contentType === 'exercise') {
      const prompt = safeString(content.prompt);
      return prompt.length > 50 ? prompt.slice(0, 50) + '...' : prompt;
    }
    return item.id.slice(0, 8);
  };

  const totalPages = Math.ceil((data?.total ?? 0) / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Approved Corpus Explorer</h1>
          <p className="mt-1 text-gray-600">{data?.total ?? 0} items in corpus</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowStats(!showStats)}
            className={`btn-secondary flex items-center gap-2 ${showStats ? 'bg-primary-100' : ''}`}
          >
            <Database className="w-5 h-5" />
            {showStats ? 'Hide Stats' : 'Show Stats'}
          </button>

          {selectedItems.size > 0 && contentTypeFilter !== 'all' && (
            <>
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as 'json' | 'csv')}
                className="input py-2"
              >
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
              </select>
              <button onClick={handleExport} className="btn-primary flex items-center gap-2">
                <Download className="w-5 h-5" />
                Export {selectedItems.size} ({exportFormat.toUpperCase()})
              </button>
            </>
          )}
        </div>
      </div>

      {showStats && <CorpusStatistics />}

      <div className="card p-6 space-y-4">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search text, titles, prompts..."
                className="input pl-10 w-full"
              />
            </div>
            <button type="submit" className="btn-primary px-6">
              Search
            </button>
          </div>

          <div className="flex items-center gap-4">
            <Filter className="w-5 h-5 text-gray-500" />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Content Type</label>
              <select
                value={contentTypeFilter}
                onChange={(e) => {
                  setContentTypeFilter(e.target.value);
                  setPage(1);
                  setSelectedItems(new Set());
                }}
                className="input py-2"
              >
                <option value="all">All Types</option>
                <option value="meaning">Meaning</option>
                <option value="utterance">Utterance</option>
                <option value="rule">Grammar Rule</option>
                <option value="exercise">Exercise</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
              <select
                value={languageFilter}
                onChange={(e) => {
                  setLanguageFilter(e.target.value);
                  setPage(1);
                }}
                className="input py-2"
              >
                <option value="all">All Languages</option>
                {languagesData?.languages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CEFR Level</label>
              <select
                value={levelFilter}
                onChange={(e) => {
                  setLevelFilter(e.target.value);
                  setPage(1);
                }}
                className="input py-2"
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Per Page</label>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="input py-2"
              >
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>
        </form>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          <Database className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-lg font-medium">No items found</p>
          <p className="mt-1">Try adjusting your search or filters</p>
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
                    disabled={contentTypeFilter === 'all'}
                    title={
                      contentTypeFilter === 'all' ? 'Select a content type to enable selection' : ''
                    }
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
                  Created
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
                      disabled={contentTypeFilter === 'all'}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${CONTENT_TYPE_COLORS[item.contentType] ?? 'bg-gray-100 text-gray-800'}`}
                    >
                      {CONTENT_TYPE_LABELS[item.contentType] ?? item.contentType}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.language ?? '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800">
                      {item.level}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-md truncate">
                      {getContentDisplay(item)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={() => setDetailModalItem(item)}
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
                Showing {offset + 1} to {Math.min(offset + pageSize, data.total)} of{' '}
                {data.total.toLocaleString()} items
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

      {detailModalItem && (
        <CorpusItemModal item={detailModalItem} onClose={() => setDetailModalItem(null)} />
      )}
    </div>
  );
}
