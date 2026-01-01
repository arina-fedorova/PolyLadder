export type WordState = 'unknown' | 'learning' | 'known';

interface WordStateBadgeProps {
  state: WordState;
  successfulReviews?: number;
  totalReviews?: number;
  showDetails?: boolean;
}

const STATE_CONFIG = {
  unknown: {
    label: 'Unknown',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
    borderColor: 'border-gray-300',
    icon: '❓',
  },
  learning: {
    label: 'Learning',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-800',
    borderColor: 'border-yellow-300',
    icon: '📚',
  },
  known: {
    label: 'Known',
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
    borderColor: 'border-green-300',
    icon: '✓',
  },
};

export function WordStateBadge({
  state,
  successfulReviews = 0,
  totalReviews = 0,
  showDetails = false,
}: WordStateBadgeProps) {
  const config = STATE_CONFIG[state];

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${config.bgColor} ${config.textColor} ${config.borderColor}`}
      >
        <span>{config.icon}</span>
        <span>{config.label}</span>
      </span>

      {showDetails && totalReviews > 0 && (
        <span className="text-xs text-gray-500">
          {successfulReviews}/{totalReviews} correct
        </span>
      )}
    </div>
  );
}
