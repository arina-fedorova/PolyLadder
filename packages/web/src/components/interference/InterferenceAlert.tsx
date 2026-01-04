import { useState } from 'react';

interface InterferencePattern {
  id: string;
  targetLanguage: string;
  sourceLanguage: string;
  targetText: string;
  interferingText: string;
  confidenceScore: number;
  occurrenceCount: number;
}

interface InterferenceAlertProps {
  isInterference: boolean;
  confidenceScore: number;
  pattern: InterferencePattern | null;
  explanation: string;
  onDismiss?: () => void;
  onStartRemediation?: (patternId: string) => void;
}

const LANGUAGE_NAMES: Record<string, string> = {
  EN: 'English',
  RU: 'Russian',
  DE: 'German',
  FR: 'French',
  ES: 'Spanish',
  IT: 'Italian',
  PT: 'Portuguese',
  ZH: 'Chinese',
  JA: 'Japanese',
  AR: 'Arabic',
  SL: 'Slovenian',
};

const LANGUAGE_COLORS: Record<string, string> = {
  EN: 'bg-blue-100 text-blue-800',
  RU: 'bg-red-100 text-red-800',
  DE: 'bg-yellow-100 text-yellow-800',
  FR: 'bg-indigo-100 text-indigo-800',
  ES: 'bg-orange-100 text-orange-800',
  IT: 'bg-green-100 text-green-800',
  PT: 'bg-teal-100 text-teal-800',
  ZH: 'bg-pink-100 text-pink-800',
  JA: 'bg-purple-100 text-purple-800',
  AR: 'bg-emerald-100 text-emerald-800',
  SL: 'bg-cyan-100 text-cyan-800',
};

export function InterferenceAlert({
  isInterference,
  confidenceScore,
  pattern,
  explanation,
  onDismiss,
  onStartRemediation,
}: InterferenceAlertProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isInterference || !pattern) {
    return null;
  }

  const confidencePercent = Math.round(confidenceScore * 100);
  const isHighConfidence = confidenceScore >= 0.9;
  const isFirstOccurrence = pattern.occurrenceCount === 1;

  return (
    <div
      className={`rounded-lg border-2 overflow-hidden transition-all ${
        isHighConfidence ? 'border-orange-400 bg-orange-50' : 'border-yellow-400 bg-yellow-50'
      }`}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{isHighConfidence ? '!' : 'i'}</span>
            <div>
              <h4 className="font-semibold text-gray-800">
                {isFirstOccurrence ? 'Language Interference Detected' : 'Recurring Interference'}
              </h4>
              <p className="text-sm text-gray-600 mt-1">{explanation}</p>
            </div>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Dismiss"
            >
              ×
            </button>
          )}
        </div>

        {/* Quick Info */}
        <div className="mt-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded text-sm font-medium ${
                LANGUAGE_COLORS[pattern.sourceLanguage] || 'bg-gray-100'
              }`}
            >
              {pattern.interferingText}
            </span>
            <span className="text-gray-400">≠</span>
            <span
              className={`px-2 py-0.5 rounded text-sm font-medium ${
                LANGUAGE_COLORS[pattern.targetLanguage] || 'bg-gray-100'
              }`}
            >
              {pattern.targetText}
            </span>
          </div>
          <span className="text-sm text-gray-500">Confidence: {confidencePercent}%</span>
          {!isFirstOccurrence && (
            <span className="text-sm text-orange-600 font-medium">
              Occurred {pattern.occurrenceCount} times
            </span>
          )}
        </div>
      </div>

      {/* Expandable Details */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-sm text-gray-600 flex items-center justify-center gap-2 transition-colors"
      >
        <span>{isExpanded ? 'Hide details' : 'Show details'}</span>
        <span className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {isExpanded && (
        <div className="p-4 border-t border-gray-200 space-y-4">
          {/* Detailed comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-white border border-gray-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                Confused word ({LANGUAGE_NAMES[pattern.sourceLanguage]})
              </div>
              <div className="text-lg font-semibold text-orange-700">{pattern.interferingText}</div>
            </div>
            <div className="p-3 rounded-lg bg-white border border-green-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                Correct word ({LANGUAGE_NAMES[pattern.targetLanguage]})
              </div>
              <div className="text-lg font-semibold text-green-700">{pattern.targetText}</div>
            </div>
          </div>

          {/* Tips */}
          <div className="bg-blue-50 p-3 rounded-lg">
            <h5 className="font-medium text-blue-800 mb-2">Tips to avoid this confusion:</h5>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Create a mental image linking each word to its language</li>
              <li>• Practice saying both words with their language context</li>
              <li>• Use remediation exercises to strengthen the distinction</li>
            </ul>
          </div>

          {/* Actions */}
          {onStartRemediation && (
            <button
              onClick={() => onStartRemediation(pattern.id)}
              className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Start Remediation Exercises
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default InterferenceAlert;
