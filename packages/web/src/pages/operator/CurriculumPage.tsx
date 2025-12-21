import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, GripVertical, Trash2, Edit2, ChevronDown, ChevronRight } from 'lucide-react';
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
                    <button
                      onClick={() => handleCreateTopic(level.id)}
                      disabled={createTopicMutation.isPending}
                      className="btn btn-primary btn-sm flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      {createTopicMutation.isPending ? 'Adding...' : 'Add Topic'}
                    </button>
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
