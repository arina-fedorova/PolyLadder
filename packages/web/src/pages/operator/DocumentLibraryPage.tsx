import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload,
  FileText,
  Trash2,
  RefreshCw,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  X,
} from 'lucide-react';
import api from '../../api/client';

interface Document {
  id: string;
  original_filename: string;
  language: string;
  target_level: string | null;
  document_type: string;
  status: 'pending' | 'extracting' | 'chunking' | 'ready' | 'error';
  total_pages: number | null;
  total_chunks: number | null;
  uploaded_at: string;
  error_message: string | null;
}

interface DocumentDetail extends Document {
  title: string | null;
  description: string | null;
}

interface Chunk {
  id: string;
  chunk_index: number;
  page_number: number | null;
  chunk_type: string;
  confidence_score: number | null;
  word_count: number;
}

interface ProcessingLog {
  id: string;
  step: string;
  status: string;
  message: string;
  duration_ms: number | null;
  created_at: string;
}

interface DocumentsResponse {
  documents: Document[];
  total: number;
}

interface DocumentDetailResponse {
  document: DocumentDetail;
  chunks: Chunk[];
  processingLog: ProcessingLog[];
}

const STATUS_CONFIG = {
  pending: { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-100', label: 'Pending' },
  extracting: { icon: RefreshCw, color: 'text-blue-500', bg: 'bg-blue-100', label: 'Extracting' },
  chunking: { icon: RefreshCw, color: 'text-yellow-500', bg: 'bg-yellow-100', label: 'Chunking' },
  ready: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100', label: 'Ready' },
  error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100', label: 'Error' },
};

const LANGUAGES = [
  { code: 'ES', name: 'Spanish' },
  { code: 'IT', name: 'Italian' },
  { code: 'PT', name: 'Portuguese' },
  { code: 'SL', name: 'Slovenian' },
];

const CEFR_LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const DOC_TYPES = [
  { value: 'textbook', label: 'Textbook' },
  { value: 'grammar_guide', label: 'Grammar Guide' },
  { value: 'vocabulary_list', label: 'Vocabulary List' },
  { value: 'dialogue_corpus', label: 'Dialogue Corpus' },
  { value: 'exercise_book', label: 'Exercise Book' },
  { value: 'other', label: 'Other' },
];

function UploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('ES');
  const [targetLevel, setTargetLevel] = useState('');
  const [documentType, setDocumentType] = useState('textbook');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append(
        'metadata',
        JSON.stringify({
          language,
          targetLevel: targetLevel || undefined,
          documentType,
          title: title || undefined,
          description: description || undefined,
        })
      );

      await api.upload('/operational/documents/upload', formData);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Upload Document</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">File (PDF or DOCX)</label>
            <input
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full border rounded p-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="input w-full"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Target Level</label>
              <select
                value={targetLevel}
                onChange={(e) => setTargetLevel(e.target.value)}
                className="input w-full"
              >
                <option value="">Any level</option>
                {CEFR_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Document Type</label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="input w-full"
            >
              {DOC_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input w-full"
              placeholder="e.g., Spanish Grammar Basics"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input w-full"
              rows={2}
              placeholder="Brief description of the document content"
            />
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              onClick={() => void handleUpload()}
              disabled={!file || uploading}
              className="btn btn-primary"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DocumentDetailModal({ documentId, onClose }: { documentId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<DocumentDetailResponse>({
    queryKey: ['document-detail', documentId],
    queryFn: () => api.get<DocumentDetailResponse>(`/operational/documents/${documentId}`),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold">Document Details</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">Loading...</div>
        ) : data ? (
          <div className="overflow-y-auto p-4 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="font-medium text-gray-500 text-sm">Filename</h3>
                <p>{data.document.original_filename}</p>
              </div>
              <div>
                <h3 className="font-medium text-gray-500 text-sm">Status</h3>
                <p className="capitalize">{data.document.status}</p>
              </div>
              <div>
                <h3 className="font-medium text-gray-500 text-sm">Language</h3>
                <p>{data.document.language}</p>
              </div>
              <div>
                <h3 className="font-medium text-gray-500 text-sm">Target Level</h3>
                <p>{data.document.target_level || 'Any'}</p>
              </div>
              <div>
                <h3 className="font-medium text-gray-500 text-sm">Pages</h3>
                <p>{data.document.total_pages || '-'}</p>
              </div>
              <div>
                <h3 className="font-medium text-gray-500 text-sm">Chunks</h3>
                <p>{data.document.total_chunks || '-'}</p>
              </div>
            </div>

            {data.document.error_message && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-red-900 mb-1">Processing Error</h3>
                    <p className="text-sm text-red-700 leading-relaxed">
                      {data.document.error_message}
                    </p>
                    <div className="mt-3 pt-3 border-t border-red-200">
                      <p className="text-xs text-red-600">
                        <strong>What to do:</strong> Verify the PDF file is valid, unencrypted, and
                        not password-protected. Try re-uploading the file or use a different PDF.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {data.processingLog.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Processing Log</h3>
                <div className="space-y-1">
                  {data.processingLog.map((log) => (
                    <div
                      key={log.id}
                      className="text-sm flex items-center gap-2 p-2 bg-gray-50 rounded"
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          log.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                        }`}
                      />
                      <span className="font-mono text-gray-500">{log.step}</span>
                      <span className="flex-1">{log.message}</span>
                      {log.duration_ms && (
                        <span className="text-gray-400">{log.duration_ms}ms</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.chunks.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Chunks ({data.chunks.length})</h3>
                <div className="max-h-64 overflow-y-auto border rounded">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left p-2">#</th>
                        <th className="text-left p-2">Page</th>
                        <th className="text-left p-2">Type</th>
                        <th className="text-left p-2">Confidence</th>
                        <th className="text-left p-2">Words</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.chunks.map((chunk) => (
                        <tr key={chunk.id} className="border-t">
                          <td className="p-2">{chunk.chunk_index}</td>
                          <td className="p-2">{chunk.page_number || '-'}</td>
                          <td className="p-2">
                            <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                              {chunk.chunk_type.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="p-2">
                            {chunk.confidence_score
                              ? `${Math.round(chunk.confidence_score * 100)}%`
                              : '-'}
                          </td>
                          <td className="p-2">{chunk.word_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DocumentLibraryPage() {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<DocumentsResponse>({
    queryKey: ['documents'],
    queryFn: () => api.get<DocumentsResponse>('/operational/documents'),
    refetchInterval: 5000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete<{ success?: boolean }>(`/operational/documents/${id}`);
      return response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (error) => {
      console.error('Failed to delete document:', error);
      alert(
        `Failed to delete document: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: (id: string) => api.post(`/operational/documents/${id}/reprocess`, {}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Document Library</h1>
        <button
          onClick={() => setUploadModalOpen(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Upload Document
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading documents...</div>
      ) : !data?.documents.length ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No documents yet</h3>
          <p className="text-gray-500 mt-1">Upload a PDF textbook to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.documents.map((doc) => {
            const statusConfig = STATUS_CONFIG[doc.status];
            const StatusIcon = statusConfig.icon;

            return (
              <div
                key={doc.id}
                className="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${statusConfig.bg}`}>
                    <FileText className={`w-6 h-6 ${statusConfig.color}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate">{doc.original_filename}</h3>
                      <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">
                        {doc.language}
                      </span>
                      {doc.target_level && (
                        <span className="text-xs px-2 py-0.5 bg-primary-100 text-primary-700 rounded">
                          {doc.target_level}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <StatusIcon
                          className={`w-4 h-4 ${statusConfig.color} ${
                            doc.status === 'extracting' || doc.status === 'chunking'
                              ? 'animate-spin'
                              : ''
                          }`}
                        />
                        {statusConfig.label}
                      </span>
                      {doc.total_pages && <span>{doc.total_pages} pages</span>}
                      {doc.total_chunks && <span>{doc.total_chunks} chunks</span>}
                      <span>{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                    </div>
                    {doc.error_message && (
                      <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-red-800">Processing Error</p>
                            <p className="text-sm text-red-700 mt-0.5">{doc.error_message}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedDoc(doc.id)}
                      className="p-2 hover:bg-gray-100 rounded"
                      title="View details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {(doc.status === 'error' || doc.status === 'ready') && (
                      <button
                        onClick={() => void reprocessMutation.mutate(doc.id)}
                        className="p-2 hover:bg-blue-100 text-blue-600 rounded"
                        title="Reprocess"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete document "${doc.original_filename}"? This action cannot be undone.`
                          )
                        ) {
                          void deleteMutation.mutate(doc.id);
                        }
                      }}
                      className="p-2 hover:bg-red-100 text-red-600 rounded"
                      title="Delete"
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {uploadModalOpen && (
        <UploadModal
          onClose={() => setUploadModalOpen(false)}
          onSuccess={() => {
            setUploadModalOpen(false);
            void queryClient.invalidateQueries({ queryKey: ['documents'] });
          }}
        />
      )}

      {selectedDoc && (
        <DocumentDetailModal documentId={selectedDoc} onClose={() => setSelectedDoc(null)} />
      )}
    </div>
  );
}
