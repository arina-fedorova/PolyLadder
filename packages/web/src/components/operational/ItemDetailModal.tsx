import { X, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface ItemDetailModalProps {
  item: {
    id: string;
    contentType: 'vocabulary' | 'grammar' | 'orthography';
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
  };
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}

export function ItemDetailModal({ item, onClose, onApprove, onReject }: ItemDetailModalProps) {
  const renderContent = () => {
    const safeString = (value: unknown): string => {
      if (typeof value === 'string') return value;
      if (typeof value === 'number') return String(value);
      return '';
    };

    if (item.contentType === 'vocabulary') {
      const wordText = safeString(item.content.wordText ?? item.content.word_text);
      const translation = safeString(item.content.translation);
      const exampleSentence = safeString(item.content.exampleSentence);
      const notes = safeString(item.content.notes);

      return (
        <>
          <div>
            <span className="text-sm font-medium text-gray-600">Word:</span>
            <p className="text-lg font-semibold text-gray-900">{wordText}</p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-600">Translation:</span>
            <p className="text-gray-900">{translation}</p>
          </div>
          {exampleSentence && (
            <div>
              <span className="text-sm font-medium text-gray-600">Example:</span>
              <p className="text-gray-900 italic">{exampleSentence}</p>
            </div>
          )}
          {notes && (
            <div>
              <span className="text-sm font-medium text-gray-600">Notes:</span>
              <p className="text-gray-700">{notes}</p>
            </div>
          )}
        </>
      );
    }

    if (item.contentType === 'grammar') {
      const topic = safeString(item.content.topic ?? item.content.title ?? 'Untitled Grammar Rule');
      const explanation = safeString(item.content.explanation);

      return (
        <>
          <div>
            <span className="text-sm font-medium text-gray-600">Topic:</span>
            <p className="text-lg font-semibold text-gray-900">{topic}</p>
          </div>
          {explanation && (
            <div>
              <span className="text-sm font-medium text-gray-600">Explanation:</span>
              <p className="text-gray-900">{explanation}</p>
            </div>
          )}
          {item.content.examples && Array.isArray(item.content.examples) && (
            <div>
              <span className="text-sm font-medium text-gray-600">Examples:</span>
              <ul className="list-disc list-inside text-gray-900 space-y-2">
                {item.content.examples.map((ex, i) => {
                  if (typeof ex === 'object' && ex !== null) {
                    const exampleObj = ex as {
                      correct?: string;
                      incorrect?: string;
                      note?: string;
                    };
                    return (
                      <li key={i} className="ml-4">
                        <div>
                          <span className="font-medium text-green-700">
                            ✓ {safeString(exampleObj.correct)}
                          </span>
                          {exampleObj.incorrect && (
                            <div className="text-red-600 line-through ml-2">
                              ✗ {safeString(exampleObj.incorrect)}
                            </div>
                          )}
                          {exampleObj.note && (
                            <div className="text-sm text-gray-600 italic ml-4">
                              {safeString(exampleObj.note)}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  }
                  return <li key={i}>{safeString(ex)}</li>;
                })}
              </ul>
            </div>
          )}
        </>
      );
    }

    if (item.contentType === 'orthography') {
      const character = safeString(item.content.character);
      const pronunciation = safeString(item.content.pronunciation);
      const notes = safeString(item.content.notes);

      return (
        <>
          <div>
            <span className="text-sm font-medium text-gray-600">Character:</span>
            <p className="text-2xl font-bold text-gray-900">{character}</p>
          </div>
          {pronunciation && (
            <div>
              <span className="text-sm font-medium text-gray-600">Pronunciation:</span>
              <p className="text-gray-900">{pronunciation}</p>
            </div>
          )}
          {notes && (
            <div>
              <span className="text-sm font-medium text-gray-600">Notes:</span>
              <p className="text-gray-700">{notes}</p>
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
      aria-labelledby="modal-title"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 id="modal-title" className="text-2xl font-bold text-gray-900 capitalize">
              {item.contentType} Review
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {item.languageName} • {item.cefrLevel}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close modal"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Content</h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">{renderContent()}</div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Validation Results</h3>
            <div className="space-y-2">
              {item.validationResults.map((result, index) => {
                const Icon = result.passed
                  ? CheckCircle
                  : result.score !== undefined
                    ? AlertCircle
                    : XCircle;
                const colorClass = result.passed
                  ? 'bg-green-50 border-green-200'
                  : result.score !== undefined
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-red-50 border-red-200';
                const iconColor = result.passed
                  ? 'text-green-600'
                  : result.score !== undefined
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
                        <span className="font-medium text-gray-700 mr-2">
                          Score: {result.score}%
                        </span>
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

        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-xs text-gray-500 text-center mb-3">
            Shortcuts: <kbd className="px-2 py-1 bg-gray-100 rounded">A</kbd> Approve •{' '}
            <kbd className="px-2 py-1 bg-gray-100 rounded">R</kbd> Reject •{' '}
            <kbd className="px-2 py-1 bg-gray-100 rounded">ESC</kbd> Close
          </div>
          <div className="flex items-center justify-end space-x-3">
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
    </div>
  );
}
