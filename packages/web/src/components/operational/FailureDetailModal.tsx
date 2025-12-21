import React from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { X, RefreshCw, AlertCircle } from 'lucide-react';

interface ValidationFailure {
  id: string;
  itemId: string;
  dataType: string;
  state: string;
  errorMessage: string;
  failedAt: string;
}

interface FailureDetailModalProps {
  failure: ValidationFailure;
  onClose: () => void;
  onRetry: () => void;
}

const DATA_TYPE_LABELS: Record<string, string> = {
  meaning: 'Vocabulary (Meaning)',
  utterance: 'Vocabulary (Utterance)',
  rule: 'Grammar (Rule)',
  exercise: 'Orthography (Exercise)',
};

export function FailureDetailModal({ failure, onClose, onRetry }: FailureDetailModalProps) {
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

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="failure-modal-title"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 id="failure-modal-title" className="text-2xl font-bold text-gray-900">
              Failure Details
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {DATA_TYPE_LABELS[failure.dataType] ?? failure.dataType} · ID:{' '}
              {failure.itemId.slice(0, 8)}
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

        <div className="p-6 space-y-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900">Validation Error</h3>
                <p className="text-red-700 mt-1">{failure.errorMessage}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 mt-4 border-t border-red-200">
              <div>
                <p className="text-sm text-red-600">State</p>
                <p className="font-medium text-red-900 capitalize">{failure.state}</p>
              </div>
              <div>
                <p className="text-sm text-red-600">Failed At</p>
                <p className="font-medium text-red-900">
                  {new Date(failure.failedAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Item Details</h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Item ID:</span>
                <span className="text-gray-900 font-mono">{failure.itemId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Data Type:</span>
                <span className="text-gray-900 capitalize">{failure.dataType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Failed At:</span>
                <span className="text-gray-900">{new Date(failure.failedAt).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              <strong>Tip:</strong> You can retry validation to reprocess this item, or fix the
              content directly in the content browser.
            </p>
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
          <button
            onClick={handleRetry}
            disabled={retryMutation.isPending}
            className="btn-primary flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${retryMutation.isPending ? 'animate-spin' : ''}`} />
            {retryMutation.isPending ? 'Retrying...' : 'Retry Validation'}
          </button>
        </div>
      </div>
    </div>
  );
}
