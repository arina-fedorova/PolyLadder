import { X } from 'lucide-react';

interface CorpusItem {
  id: string;
  contentType: string;
  language?: string;
  level: string;
  createdAt: string;
  content: Record<string, unknown>;
}

interface CorpusItemModalProps {
  item: CorpusItem;
  onClose: () => void;
}

export function CorpusItemModal({ item, onClose }: CorpusItemModalProps) {
  const safeString = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return '';
  };

  const renderContent = () => {
    const content = item.content;

    if (item.contentType === 'meaning') {
      return (
        <>
          <div className="bg-blue-50 rounded-lg p-6">
            <p className="text-sm text-blue-600 mb-2">Meaning ID</p>
            <p className="text-2xl font-bold text-blue-900">{safeString(content.id) || item.id}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-2">Level</p>
            <span className="px-3 py-1 text-sm font-medium rounded bg-green-100 text-green-800">
              {safeString(content.level) || item.level}
            </span>
          </div>
          {content.tags && (
            <div>
              <p className="text-sm text-gray-600 mb-2">Tags</p>
              <div className="flex flex-wrap gap-2">
                {(Array.isArray(content.tags) ? content.tags : []).map((tag, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700"
                  >
                    {safeString(tag)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      );
    }

    if (item.contentType === 'utterance') {
      return (
        <>
          <div className="bg-green-50 rounded-lg p-6">
            <p className="text-sm text-green-600 mb-2">Text</p>
            <p className="text-xl font-semibold text-green-900">{safeString(content.text)}</p>
          </div>
          {content.register && (
            <div>
              <p className="text-sm text-gray-600 mb-2">Register</p>
              <p className="text-gray-900">{safeString(content.register)}</p>
            </div>
          )}
          {content.usageNotes && (
            <div>
              <p className="text-sm text-gray-600 mb-2">Usage Notes</p>
              <p className="text-gray-700">{safeString(content.usageNotes)}</p>
            </div>
          )}
          {content.meaningId && (
            <div>
              <p className="text-sm text-gray-600 mb-2">Meaning ID</p>
              <p className="text-gray-900 font-mono">{safeString(content.meaningId)}</p>
            </div>
          )}
        </>
      );
    }

    if (item.contentType === 'rule') {
      return (
        <>
          <div className="bg-purple-50 rounded-lg p-6">
            <p className="text-sm text-purple-600 mb-2">Title</p>
            <p className="text-xl font-bold text-purple-900">{safeString(content.title)}</p>
          </div>
          {content.category && (
            <div>
              <p className="text-sm text-gray-600 mb-2">Category</p>
              <span className="px-3 py-1 text-sm font-medium rounded bg-purple-100 text-purple-800">
                {safeString(content.category)}
              </span>
            </div>
          )}
          {content.explanation && (
            <div>
              <p className="text-sm text-gray-600 mb-2">Explanation</p>
              <p className="text-gray-900 whitespace-pre-wrap">{safeString(content.explanation)}</p>
            </div>
          )}
          {content.examples && Array.isArray(content.examples) && content.examples.length > 0 && (
            <div>
              <p className="text-sm text-gray-600 mb-2">Examples</p>
              <ul className="list-disc list-inside space-y-1">
                {content.examples.map((example, i) => (
                  <li key={i} className="text-gray-900">
                    {safeString(example)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      );
    }

    if (item.contentType === 'exercise') {
      return (
        <>
          <div className="bg-orange-50 rounded-lg p-6">
            <p className="text-sm text-orange-600 mb-2">Prompt</p>
            <p className="text-lg text-orange-900">{safeString(content.prompt)}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">Type</p>
              <span className="px-3 py-1 text-sm font-medium rounded bg-orange-100 text-orange-800">
                {safeString(content.type)}
              </span>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-2">Correct Answer</p>
              <p className="text-gray-900 font-medium">{safeString(content.correctAnswer)}</p>
            </div>
          </div>
          {content.options && Array.isArray(content.options) && content.options.length > 0 && (
            <div>
              <p className="text-sm text-gray-600 mb-2">Options</p>
              <ul className="list-disc list-inside space-y-1">
                {content.options.map((option, i) => (
                  <li key={i} className="text-gray-900">
                    {safeString(option)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {content.languages && (
            <div>
              <p className="text-sm text-gray-600 mb-2">Languages</p>
              <p className="text-gray-900">{JSON.stringify(content.languages)}</p>
            </div>
          )}
        </>
      );
    }

    return null;
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="corpus-item-modal-title"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2
              id="corpus-item-modal-title"
              className="text-2xl font-bold text-gray-900 capitalize"
            >
              {item.contentType} Details
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {item.language ?? 'N/A'} · {item.level} · ID: {item.id.slice(0, 8)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">{renderContent()}</div>

        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Created: {new Date(item.createdAt).toLocaleString()}
            </div>
            <button onClick={onClose} className="btn-secondary">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
