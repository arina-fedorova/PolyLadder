import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, GripVertical, Trash2, Edit2, ChevronDown, ChevronRight, Upload } from 'lucide-react';
import { apiClient } from '../../api/client';

interface CurriculumLevel {
  id: string;
  language: string;
  cefrLevel: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

interface CurriculumTopic {
  id: string;
  levelId: string;
  name: string;
  slug: string;
  description: string | null;
  contentType: 'vocabulary' | 'grammar' | 'orthography' | 'mixed';
  sortOrder: number;
  estimatedItems: number;
  prerequisites: string[];
}

const LANGUAGES = [
  { code: 'ES', name: 'Spanish' },
  { code: 'IT', name: 'Italian' },
  { code: 'PT', name: 'Portuguese' },
  { code: 'SL', name: 'Slovenian' },
];

export function CurriculumPage() {
  const [selectedLanguage, setSelectedLanguage] = useState('ES');
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);
  const [editingTopic, setEditingTopic] = useState<CurriculumTopic | null>(null);
  const [bulkImportLevel, setBulkImportLevel] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: levels, isLoading: levelsLoading } = useQuery<{ levels: CurriculumLevel[] }>({
    queryKey: ['curriculum-levels', selectedLanguage],
    queryFn: async () => {
      const response = await apiClient.get<{ levels: CurriculumLevel[] }>(
        `/operational/curriculum/levels/${selectedLanguage}`
      );
      return response.data;
    },
  });

  const { data: topics } = useQuery<{ topics: CurriculumTopic[] }>({
    queryKey: ['curriculum-topics', expandedLevel],
    queryFn: async () => {
      const response = await apiClient.get<{ topics: CurriculumTopic[] }>(
        `/operational/curriculum/topics/${expandedLevel}`
      );
      return response.data;
    },
    enabled: !!expandedLevel,
  });

  const createTopicMutation = useMutation({
    mutationFn: (topic: Partial<CurriculumTopic>) =>
      apiClient.post('/operational/curriculum/topics', topic),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['curriculum-topics', expandedLevel] });
    },
  });

  const updateTopicMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<CurriculumTopic> }) =>
      apiClient.put(`/operational/curriculum/topics/${id}`, updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['curriculum-topics', expandedLevel] });
      setEditingTopic(null);
    },
  });

  const deleteTopicMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/operational/curriculum/topics/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['curriculum-topics', expandedLevel] });
    },
  });

  const bulkCreateTopicsMutation = useMutation({
    mutationFn: (topics: Partial<CurriculumTopic>[]) =>
      apiClient.post<{
        created: number;
        failed: number;
        topics: CurriculumTopic[];
        errors: string[];
      }>('/operational/curriculum/topics/bulk', { topics }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['curriculum-topics', expandedLevel] });
      setBulkImportLevel(null);
    },
  });

  const handleCreateTopic = (levelId: string) => {
    createTopicMutation.mutate({
      levelId,
      name: 'New Topic',
      contentType: 'vocabulary',
      estimatedItems: 0,
    });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Curriculum Structure</h1>
          <p className="text-gray-600 mt-1">Define topics and learning paths for each CEFR level</p>
        </div>
        <select
          value={selectedLanguage}
          onChange={(e) => {
            setSelectedLanguage(e.target.value);
            setExpandedLevel(null);
          }}
          className="input w-48"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>

      {levelsLoading ? (
        <div className="text-center py-8">Loading levels...</div>
      ) : (
        <div className="space-y-4">
          {levels?.levels.map((level: CurriculumLevel) => (
            <div key={level.id} className="border rounded-lg overflow-hidden bg-white shadow-sm">
              <button
                onClick={() => setExpandedLevel(expandedLevel === level.id ? null : level.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {expandedLevel === level.id ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                  <span className="font-mono text-sm bg-primary-100 text-primary-700 px-2 py-1 rounded font-medium">
                    {level.cefrLevel}
                  </span>
                  <div className="text-left">
                    <span className="font-medium">{level.name}</span>
                    {level.description && (
                      <p className="text-sm text-gray-600 mt-0.5">{level.description}</p>
                    )}
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  {topics?.topics && expandedLevel === level.id
                    ? `${topics.topics.length} topics`
                    : ''}
                </div>
              </button>

              {expandedLevel === level.id && (
                <div className="p-4 border-t bg-gray-50">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-medium text-gray-900">Topics</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setBulkImportLevel(level.id)}
                        className="btn btn-secondary btn-sm flex items-center gap-1"
                      >
                        <Upload className="w-4 h-4" />
                        Bulk Import
                      </button>
                      <button
                        onClick={() => handleCreateTopic(level.id)}
                        disabled={createTopicMutation.isPending}
                        className="btn btn-primary btn-sm flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        {createTopicMutation.isPending ? 'Adding...' : 'Add Topic'}
                      </button>
                    </div>
                  </div>

                  {topics?.topics.length === 0 ? (
                    <div className="text-center py-8 bg-white border border-dashed border-gray-300 rounded-lg">
                      <p className="text-gray-500 mb-2">No topics defined yet</p>
                      <p className="text-sm text-gray-400">
                        Add topics to structure the curriculum for this level
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {topics?.topics.map((topic: CurriculumTopic) => (
                        <div
                          key={topic.id}
                          className="flex items-center gap-3 p-3 bg-white border rounded hover:shadow-sm transition-shadow"
                        >
                          <GripVertical className="w-4 h-4 text-gray-400 cursor-grab flex-shrink-0" />
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 ${
                              topic.contentType === 'vocabulary'
                                ? 'bg-blue-100 text-blue-700'
                                : topic.contentType === 'grammar'
                                  ? 'bg-purple-100 text-purple-700'
                                  : topic.contentType === 'orthography'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {topic.contentType}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{topic.name}</span>
                            {topic.description && (
                              <p className="text-sm text-gray-600 truncate mt-0.5">
                                {topic.description}
                              </p>
                            )}
                          </div>
                          <span className="text-sm text-gray-500 flex-shrink-0">
                            ~{topic.estimatedItems} items
                          </span>
                          <button
                            onClick={() => setEditingTopic(topic)}
                            className="p-1.5 hover:bg-gray-100 rounded flex-shrink-0"
                            title="Edit topic"
                          >
                            <Edit2 className="w-4 h-4 text-gray-600" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete "${topic.name}"?`)) {
                                deleteTopicMutation.mutate(topic.id);
                              }
                            }}
                            className="p-1.5 hover:bg-red-100 text-red-600 rounded flex-shrink-0"
                            title="Delete topic"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editingTopic && (
        <TopicEditModal
          topic={editingTopic}
          onClose={() => setEditingTopic(null)}
          onSave={(updates) => {
            updateTopicMutation.mutate({ id: editingTopic.id, updates });
          }}
        />
      )}

      {bulkImportLevel && (
        <BulkImportModal
          levelId={bulkImportLevel}
          onClose={() => setBulkImportLevel(null)}
          onImport={(topics) => {
            bulkCreateTopicsMutation.mutate(topics);
          }}
          isPending={bulkCreateTopicsMutation.isPending}
          result={bulkCreateTopicsMutation.data}
        />
      )}
    </div>
  );
}

interface TopicEditModalProps {
  topic: CurriculumTopic;
  onClose: () => void;
  onSave: (updates: Partial<CurriculumTopic>) => void;
}

function TopicEditModal({ topic, onClose, onSave }: TopicEditModalProps) {
  const [name, setName] = useState(topic.name);
  const [description, setDescription] = useState(topic.description || '');
  const [contentType, setContentType] = useState(topic.contentType);
  const [estimatedItems, setEstimatedItems] = useState(topic.estimatedItems);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      description,
      contentType,
      estimatedItems,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Edit Topic</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Topic Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input w-full"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Content Type</label>
            <select
              value={contentType}
              onChange={(e) => setContentType(e.target.value as CurriculumTopic['contentType'])}
              className="input w-full"
            >
              <option value="vocabulary">Vocabulary</option>
              <option value="grammar">Grammar</option>
              <option value="orthography">Orthography</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Estimated Items</label>
            <input
              type="number"
              value={estimatedItems}
              onChange={(e) => setEstimatedItems(parseInt(e.target.value, 10))}
              className="input w-full"
              min={0}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface BulkImportModalProps {
  levelId: string;
  onClose: () => void;
  onImport: (topics: Partial<CurriculumTopic>[]) => void;
  isPending: boolean;
  result?: { created: number; failed: number; topics: CurriculumTopic[]; errors: string[] };
}

function BulkImportModal({ levelId, onClose, onImport, isPending, result }: BulkImportModalProps) {
  const [jsonInput, setJsonInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const exampleJson = JSON.stringify(
    [
      {
        levelId,
        name: 'Greetings',
        description: 'Basic greeting phrases',
        contentType: 'vocabulary',
        estimatedItems: 10,
        prerequisites: [],
      },
      {
        levelId,
        name: 'Numbers 1-20',
        description: 'Learning numbers from one to twenty',
        contentType: 'vocabulary',
        estimatedItems: 20,
        prerequisites: [],
      },
    ],
    null,
    2
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content) as unknown;
        setJsonInput(JSON.stringify(parsed, null, 2));
        setError(null);
      } catch (err) {
        setError(`Invalid JSON file: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const parsed = JSON.parse(jsonInput) as unknown;
      if (!Array.isArray(parsed)) {
        setError('JSON must be an array of topics');
        return;
      }

      const topics: Partial<CurriculumTopic>[] = parsed.map((topic: unknown) => {
        const t = topic as Record<string, unknown>;
        return {
          ...t,
          levelId,
          contentType: (t.contentType as CurriculumTopic['contentType']) || 'vocabulary',
          estimatedItems: (t.estimatedItems as number) || 0,
          prerequisites: (t.prerequisites as string[]) || [],
        } as Partial<CurriculumTopic>;
      });

      onImport(topics);
    } catch (err) {
      setError(`Invalid JSON: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Bulk Import Topics</h2>

        {result && (
          <div
            className={`mb-4 p-4 rounded-lg ${
              result.failed === 0
                ? 'bg-green-50 border border-green-200'
                : 'bg-yellow-50 border border-yellow-200'
            }`}
          >
            <div className="font-medium mb-2">
              {result.failed === 0 ? '✅ Import Successful' : '⚠️ Partial Success'}
            </div>
            <div className="text-sm space-y-1">
              <div>Created: {result.created} topics</div>
              {result.failed > 0 && (
                <div className="text-red-600">Failed: {result.failed} topics</div>
              )}
              {result.errors.length > 0 && (
                <div className="mt-2">
                  <div className="font-medium text-red-600">Errors:</div>
                  <ul className="list-disc list-inside text-xs mt-1">
                    {result.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Upload JSON File</label>
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="input w-full"
              disabled={isPending}
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium">Or Paste JSON</label>
              <button
                type="button"
                onClick={() => setJsonInput(exampleJson)}
                className="text-sm text-primary-600 hover:text-primary-700"
                disabled={isPending}
              >
                Load Example
              </button>
            </div>
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              className="input w-full font-mono text-sm"
              rows={15}
              placeholder="Paste JSON array of topics here..."
              disabled={isPending}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
            <div className="font-medium mb-1">Required fields for each topic:</div>
            <ul className="list-disc list-inside space-y-0.5">
              <li>
                <code>name</code> (string, 1-200 chars)
              </li>
              <li>
                <code>contentType</code> (vocabulary | grammar | orthography | mixed)
              </li>
            </ul>
            <div className="font-medium mt-2 mb-1">Optional fields:</div>
            <ul className="list-disc list-inside space-y-0.5">
              <li>
                <code>description</code> (string)
              </li>
              <li>
                <code>estimatedItems</code> (number, default: 0)
              </li>
              <li>
                <code>prerequisites</code> (array of topic UUIDs, default: [])
              </li>
            </ul>
            <div className="mt-2">
              <code>levelId</code> will be automatically set to the current level.
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={isPending}
            >
              {result ? 'Close' : 'Cancel'}
            </button>
            {!result && (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isPending || !jsonInput.trim()}
              >
                {isPending ? 'Importing...' : 'Import Topics'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
