import { useState, useEffect, useRef, useCallback } from 'react';

interface TranslationExerciseProps {
  exercise: {
    exerciseId: string;
    sourceText: string;
    sourceLanguage: string;
    targetLanguage: string;
    acceptableTranslations: string[];
    hint: {
      firstWord: string;
      wordCount: number;
    };
    cefrLevel: string;
    meaningId: string;
  };
  onSubmit: (userTranslation: string, timeSpentMs: number) => void;
  onRequestHint: (hintLevel: number) => Promise<string>;
  feedback: {
    isCorrect: boolean;
    similarity: number;
    matchedTranslation: string | null;
    alternativeTranslations: string[];
    feedback: string;
    qualityRating: number;
  } | null;
  disabled: boolean;
  attemptCount: number;
}

export function TranslationExercise({
  exercise,
  onSubmit,
  onRequestHint,
  feedback,
  disabled,
  attemptCount,
}: TranslationExerciseProps) {
  const [userTranslation, setUserTranslation] = useState('');
  const [hintLevel, setHintLevel] = useState(0);
  const [currentHint, setCurrentHint] = useState<string | null>(null);
  const [isLoadingHint, setIsLoadingHint] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset state when exercise changes
  useEffect(() => {
    setUserTranslation('');
    setHintLevel(0);
    setCurrentHint(null);
    startTimeRef.current = Date.now();
    textareaRef.current?.focus();
  }, [exercise.exerciseId]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!userTranslation.trim() || disabled) return;

      const timeSpent = Date.now() - startTimeRef.current;
      onSubmit(userTranslation.trim(), timeSpent);
    },
    [userTranslation, disabled, onSubmit]
  );

  // Handle Ctrl+Enter shortcut
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleShowHint = async () => {
    if (hintLevel >= 3 || isLoadingHint) return;

    const newLevel = hintLevel + 1;
    setIsLoadingHint(true);

    try {
      const hint = await onRequestHint(newLevel);
      setCurrentHint(hint);
      setHintLevel(newLevel);
    } finally {
      setIsLoadingHint(false);
    }
  };

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.95) return 'text-green-600';
    if (similarity >= 0.85) return 'text-yellow-600';
    if (similarity >= 0.7) return 'text-orange-500';
    return 'text-red-600';
  };

  const getLanguageName = (code: string) => {
    const names: Record<string, string> = {
      EN: 'English',
      RU: 'Russian',
      DE: 'German',
      FR: 'French',
      ES: 'Spanish',
      IT: 'Italian',
      PT: 'Portuguese',
      ZH: 'Chinese',
      JA: 'Japanese',
      KO: 'Korean',
    };
    return names[code.toUpperCase()] || code;
  };

  return (
    <div className="translation-exercise card p-8">
      {/* Header with language pair */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="badge badge-outline">{exercise.cefrLevel}</span>
          <span className="text-sm font-medium text-gray-600">
            {getLanguageName(exercise.sourceLanguage)} → {getLanguageName(exercise.targetLanguage)}
          </span>
        </div>
      </div>

      {/* Source text */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg mb-6">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
          Translate from {getLanguageName(exercise.sourceLanguage)}:
        </div>
        <p className="text-2xl font-medium text-gray-800">{exercise.sourceText}</p>
      </div>

      {/* Input form */}
      {!feedback && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">
              <span className="label-text">
                Your translation in {getLanguageName(exercise.targetLanguage)}:
              </span>
            </label>
            <textarea
              ref={textareaRef}
              value={userTranslation}
              onChange={(e) => setUserTranslation(e.target.value)}
              onKeyDown={handleKeyDown}
              className="textarea textarea-bordered w-full text-lg h-24"
              placeholder={`Type your ${getLanguageName(exercise.targetLanguage)} translation...`}
              disabled={disabled}
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              className="btn btn-primary flex-1"
              disabled={!userTranslation.trim() || disabled}
            >
              Check Translation
            </button>

            {attemptCount >= 1 && hintLevel < 3 && (
              <button
                type="button"
                onClick={() => void handleShowHint()}
                className="btn btn-secondary"
                disabled={isLoadingHint}
              >
                {isLoadingHint ? (
                  <span className="loading loading-spinner loading-sm"></span>
                ) : (
                  `Hint ${hintLevel + 1}/3`
                )}
              </button>
            )}
          </div>

          {/* Current hint display */}
          {currentHint && (
            <div className="alert alert-info">
              <div>
                <span className="font-medium">Hint:</span> {currentHint}
              </div>
            </div>
          )}
        </form>
      )}

      {/* Feedback */}
      {feedback && (
        <div className={`alert ${feedback.isCorrect ? 'alert-success' : 'alert-warning'} mt-4`}>
          <div className="w-full">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-lg">
                {feedback.isCorrect ? '✓ ' : '○ '}
                {feedback.feedback}
              </div>
              <div className={`text-sm font-medium ${getSimilarityColor(feedback.similarity)}`}>
                {Math.round(feedback.similarity * 100)}% match
              </div>
            </div>

            {/* User's answer */}
            <div className="bg-white/50 rounded-lg p-3 mt-2">
              <div className="text-sm text-gray-600 mb-1">Your translation:</div>
              <div className="text-lg">{userTranslation}</div>
            </div>

            {/* Matched translation */}
            {feedback.matchedTranslation && (
              <div className="bg-white/50 rounded-lg p-3 mt-2">
                <div className="text-sm text-gray-600 mb-1">
                  {feedback.isCorrect ? 'Matched:' : 'Closest match:'}
                </div>
                <div className="text-lg font-medium">{feedback.matchedTranslation}</div>
              </div>
            )}

            {/* Alternative translations */}
            {feedback.alternativeTranslations.length > 1 && (
              <div className="mt-4">
                <div className="text-sm font-medium mb-2">Other accepted translations:</div>
                <div className="flex flex-wrap gap-2">
                  {feedback.alternativeTranslations
                    .filter((t) => t !== feedback.matchedTranslation)
                    .map((translation, idx) => (
                      <span key={idx} className="badge badge-ghost text-sm">
                        {translation}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tip */}
      {!feedback && (
        <div className="text-center mt-6 text-sm text-gray-500">
          Tip: Minor spelling differences are accepted. Press <kbd className="kbd kbd-sm">Ctrl</kbd>
          +<kbd className="kbd kbd-sm">Enter</kbd> to submit.
        </div>
      )}
    </div>
  );
}
