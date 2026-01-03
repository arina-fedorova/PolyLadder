import { useState, useEffect, useRef } from 'react';

interface DictationExerciseProps {
  exercise: {
    exerciseId: string;
    audioUrl: string;
    correctTranscript: string;
    meaningId: string;
    cefrLevel: string;
    wordCount: number;
  };
  onSubmit: (userTranscript: string, timeSpentMs: number) => void;
  feedback: {
    isCorrect: boolean;
    characterAccuracy: number;
    wordAccuracy: number;
    diff: Array<{
      type: 'correct' | 'substitution' | 'insertion' | 'deletion';
      expected?: string;
      actual?: string;
      position: number;
    }>;
    correctTranscript: string;
    qualityRating: number;
  } | null;
  disabled: boolean;
}

export function DictationExercise({
  exercise,
  onSubmit,
  feedback,
  disabled,
}: DictationExerciseProps) {
  const [userTranscript, setUserTranscript] = useState('');
  const [playCount, setPlayCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset state when exercise changes
  useEffect(() => {
    setUserTranscript('');
    setPlayCount(0);
    setIsPlaying(false);
    startTimeRef.current = Date.now();
    textareaRef.current?.focus();

    // Auto-play audio on new exercise
    if (exercise.audioUrl) {
      setTimeout(() => void playAudio(), 500);
    }
  }, [exercise.exerciseId]);

  const playAudio = async () => {
    if (!exercise.audioUrl || isPlaying) return;

    try {
      setIsPlaying(true);
      if (!audioRef.current) {
        audioRef.current = new Audio(exercise.audioUrl);
        audioRef.current.addEventListener('ended', () => setIsPlaying(false));
        audioRef.current.addEventListener('error', () => setIsPlaying(false));
      }
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
      setPlayCount((prev) => prev + 1);
    } catch {
      setIsPlaying(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userTranscript.trim() || disabled) return;

    const timeSpent = Date.now() - startTimeRef.current;
    onSubmit(userTranscript.trim(), timeSpent);
  };

  const renderDiff = () => {
    if (!feedback) return null;

    return (
      <div className="flex flex-wrap gap-1 mt-3 text-lg">
        {feedback.diff.map((word, idx) => {
          switch (word.type) {
            case 'correct':
              return (
                <span key={idx} className="text-green-600 font-medium">
                  {word.expected}
                </span>
              );
            case 'substitution':
              return (
                <span key={idx} className="relative group">
                  <span className="text-red-600 line-through">{word.actual}</span>
                  <span className="text-green-600 ml-1">{word.expected}</span>
                </span>
              );
            case 'insertion':
              return (
                <span key={idx} className="text-orange-500 line-through">
                  {word.actual}
                </span>
              );
            case 'deletion':
              return (
                <span key={idx} className="text-blue-600 bg-blue-100 px-1 rounded">
                  {word.expected}
                </span>
              );
            default:
              return null;
          }
        })}
      </div>
    );
  };

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 0.9) return 'text-green-600';
    if (accuracy >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="dictation-exercise card p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="badge badge-outline">{exercise.cefrLevel}</span>
          <span className="text-sm text-gray-500">{exercise.wordCount} words</span>
        </div>
        <div className="text-sm text-gray-500">Plays: {playCount}</div>
      </div>

      {/* Audio Player */}
      <div className="bg-gray-50 p-6 rounded-lg mb-6 text-center">
        <button
          onClick={() => void playAudio()}
          className={`btn btn-circle btn-lg ${isPlaying ? 'btn-disabled' : 'btn-primary'}`}
          disabled={isPlaying || disabled}
        >
          {isPlaying ? (
            <span className="loading loading-spinner"></span>
          ) : (
            <span className="text-2xl">🔊</span>
          )}
        </button>
        <p className="text-sm text-gray-600 mt-3">
          {playCount === 0 ? 'Click to play audio' : 'Click to replay'}
        </p>
      </div>

      {/* Input form */}
      {!feedback && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">
              <span className="label-text">Type what you hear:</span>
            </label>
            <textarea
              ref={textareaRef}
              value={userTranscript}
              onChange={(e) => setUserTranscript(e.target.value)}
              className="textarea textarea-bordered w-full text-lg h-24"
              placeholder="Type the transcript here..."
              disabled={disabled}
              autoFocus
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={!userTranscript.trim() || disabled}
          >
            Check Transcription
          </button>
        </form>
      )}

      {/* Feedback */}
      {feedback && (
        <div className={`alert ${feedback.isCorrect ? 'alert-success' : 'alert-warning'} mt-4`}>
          <div className="w-full">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-lg">
                {feedback.isCorrect ? '✓ Excellent!' : '○ Good try!'}
              </div>
              <div className="flex gap-4 text-sm">
                <span className={getAccuracyColor(feedback.characterAccuracy)}>
                  {Math.round(feedback.characterAccuracy * 100)}% accuracy
                </span>
                <span className="text-gray-600">
                  {Math.round(feedback.wordAccuracy * 100)}% words
                </span>
              </div>
            </div>

            {/* Word diff visualization */}
            <div className="bg-white/50 rounded-lg p-4 mt-2">
              <div className="text-sm text-gray-600 mb-2">Your transcription compared:</div>
              {renderDiff()}
            </div>

            {!feedback.isCorrect && (
              <div className="mt-4 p-3 bg-white/50 rounded">
                <div className="text-sm font-medium mb-1">Correct transcription:</div>
                <div className="text-lg">{feedback.correctTranscript}</div>
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-4 text-xs text-gray-600">
              <span>
                <span className="inline-block w-3 h-3 bg-green-200 rounded mr-1"></span>
                Correct
              </span>
              <span>
                <span className="inline-block w-3 h-3 bg-red-200 rounded mr-1"></span>
                Wrong word
              </span>
              <span>
                <span className="inline-block w-3 h-3 bg-orange-200 rounded mr-1"></span>
                Extra word
              </span>
              <span>
                <span className="inline-block w-3 h-3 bg-blue-200 rounded mr-1"></span>
                Missing word
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tip */}
      {!feedback && (
        <div className="text-center mt-6 text-sm text-gray-500">
          Tip: Listen carefully and transcribe exactly what you hear. Small punctuation differences
          are okay.
        </div>
      )}
    </div>
  );
}
