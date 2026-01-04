import { useState, useEffect, useRef, useCallback } from 'react';

type SelfRating = 'again' | 'hard' | 'good' | 'easy';
type RecordingState = 'idle' | 'countdown' | 'recording' | 'recorded';

interface ProductionExerciseProps {
  exercise: {
    exerciseId: string;
    text: string;
    audioUrl: string;
    audioLength: number;
    romanization: string | null;
    translation: string | null;
    meaningId: string;
    cefrLevel: string;
    language: string;
  };
  onSubmit: (
    selfRating: SelfRating,
    recordingDuration: number,
    attemptNumber: number,
    timeSpentMs: number
  ) => void;
  disabled: boolean;
}

export function ProductionExercise({ exercise, onSubmit, disabled }: ProductionExerciseProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [countdown, setCountdown] = useState(3);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [hasPlayedNative, setHasPlayedNative] = useState(false);
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);

  const startTimeRef = useRef<number>(Date.now());
  const nativeAudioRef = useRef<HTMLAudioElement>(null);
  const userAudioRef = useRef<HTMLAudioElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Reset state when exercise changes
  useEffect(() => {
    setRecordingState('idle');
    setCountdown(3);
    setRecordingDuration(0);
    setAttemptNumber(1);
    setHasPlayedNative(false);
    setUserAudioUrl(null);
    startTimeRef.current = Date.now();

    return () => {
      // Cleanup on unmount or exercise change
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [exercise.exerciseId]);

  const requestMicrophonePermission = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermissionGranted(true);
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch {
      alert(
        'Microphone access is required for pronunciation practice. Please grant permission in your browser settings.'
      );
      return false;
    }
  };

  const beginRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const audioUrl = URL.createObjectURL(audioBlob);
        setUserAudioUrl(audioUrl);
        stream.getTracks().forEach((track) => track.stop());
        setRecordingState('recorded');
      };

      mediaRecorder.start();
      setRecordingState('recording');
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 0.1);
      }, 100);

      // Auto-stop after max duration
      const maxDuration = exercise.audioLength * 2;
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          stopRecording();
        }
      }, maxDuration * 1000);
    } catch {
      alert('Failed to start recording. Please check your microphone.');
      setRecordingState('idle');
    }
  }, [exercise.audioLength]);

  const startRecording = async () => {
    if (!hasPlayedNative) {
      alert('Please listen to the native audio first before recording.');
      return;
    }

    if (!micPermissionGranted) {
      const granted = await requestMicrophonePermission();
      if (!granted) return;
    }

    // Start countdown
    setRecordingState('countdown');
    setCountdown(3);

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
          }
          void beginRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recordingState === 'recording') {
      mediaRecorderRef.current.stop();
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  const retryRecording = () => {
    setRecordingState('idle');
    setRecordingDuration(0);
    setAttemptNumber((prev) => prev + 1);
    setUserAudioUrl(null);
  };

  const handleAssessment = (rating: SelfRating) => {
    const timeSpent = Date.now() - startTimeRef.current;
    onSubmit(rating, Math.round(recordingDuration * 10) / 10, attemptNumber, timeSpent);
  };

  const handleNativeAudioPlay = () => {
    setHasPlayedNative(true);
  };

  const getLanguageName = (code: string) => {
    const names: Record<string, string> = {
      EN: 'English',
      RU: 'Russian',
      DE: 'German',
      FR: 'French',
      ES: 'Spanish',
      ZH: 'Chinese',
      JA: 'Japanese',
      AR: 'Arabic',
    };
    return names[code.toUpperCase()] || code;
  };

  return (
    <div className="production-exercise card p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="badge badge-outline">{exercise.cefrLevel}</span>
          <span className="text-sm font-medium text-gray-600">
            {getLanguageName(exercise.language)} Pronunciation
          </span>
        </div>
      </div>

      {/* Text to pronounce */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-lg mb-6">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Pronounce this:</div>
        <p className="text-2xl font-medium text-gray-800">{exercise.text}</p>
        {exercise.romanization && (
          <p className="text-sm text-gray-600 italic mt-2">{exercise.romanization}</p>
        )}
        {exercise.translation && (
          <p className="text-sm text-gray-500 mt-2">Translation: {exercise.translation}</p>
        )}
      </div>

      {/* Native audio */}
      <div className="bg-green-50 p-4 rounded-lg mb-6">
        <div className="text-sm font-semibold text-gray-700 mb-3">Native Speaker Audio:</div>
        <audio
          ref={nativeAudioRef}
          src={exercise.audioUrl}
          controls
          onPlay={handleNativeAudioPlay}
          className="w-full"
        />
        <div className="text-xs text-gray-600 mt-2">
          Listen carefully to the pronunciation before recording
        </div>
      </div>

      {/* Recording controls */}
      <div className="space-y-4">
        {recordingState === 'idle' && (
          <div className="text-center space-y-4">
            <button
              onClick={() => void startRecording()}
              disabled={!hasPlayedNative || disabled}
              className="btn btn-error btn-lg gap-2"
            >
              <span>Start Recording</span>
            </button>
            {!hasPlayedNative && (
              <div className="text-sm text-warning">Please listen to the native audio first</div>
            )}
            {attemptNumber > 1 && (
              <div className="text-sm text-gray-600">Attempt #{attemptNumber}</div>
            )}
          </div>
        )}

        {recordingState === 'countdown' && (
          <div className="text-center space-y-4">
            <div className="text-6xl font-bold text-blue-600 animate-pulse">{countdown}</div>
            <div className="text-lg text-gray-600">Get ready to speak...</div>
          </div>
        )}

        {recordingState === 'recording' && (
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-3">
              <div className="w-4 h-4 bg-red-600 rounded-full animate-pulse"></div>
              <span className="text-xl font-semibold text-red-600">
                Recording... {recordingDuration.toFixed(1)}s
              </span>
            </div>
            <button onClick={stopRecording} className="btn btn-neutral">
              Stop Recording
            </button>
            <div className="text-sm text-gray-600">Max duration: {exercise.audioLength * 2}s</div>
          </div>
        )}

        {recordingState === 'recorded' && (
          <div className="space-y-4">
            {/* User recording playback */}
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-sm font-semibold text-gray-700 mb-3">Your Recording:</div>
              {userAudioUrl && (
                <audio ref={userAudioRef} src={userAudioUrl} controls className="w-full" />
              )}
              <div className="text-xs text-gray-600 mt-2">
                Duration: {recordingDuration.toFixed(1)}s
              </div>
            </div>

            {/* Comparison tip */}
            <div className="alert alert-info">
              <div>
                <strong>Compare:</strong> Listen to the native audio, then listen to your recording.
                How similar is your pronunciation?
              </div>
            </div>

            {/* Self-assessment buttons */}
            <div className="space-y-3">
              <div className="text-sm font-semibold text-gray-700">How was your pronunciation?</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleAssessment('again')}
                  disabled={disabled}
                  className="btn btn-outline btn-error"
                  title="I couldn't pronounce it correctly"
                >
                  Again
                </button>
                <button
                  onClick={() => handleAssessment('hard')}
                  disabled={disabled}
                  className="btn btn-outline btn-warning"
                  title="I pronounced it, but with noticeable errors"
                >
                  Hard
                </button>
                <button
                  onClick={() => handleAssessment('good')}
                  disabled={disabled}
                  className="btn btn-outline btn-success"
                  title="I pronounced it correctly with minor hesitation"
                >
                  Good
                </button>
                <button
                  onClick={() => handleAssessment('easy')}
                  disabled={disabled}
                  className="btn btn-outline btn-info"
                  title="Perfect pronunciation, I'm confident!"
                >
                  Easy
                </button>
              </div>
            </div>

            {/* Retry button */}
            <div className="text-center">
              <button onClick={retryRecording} disabled={disabled} className="btn btn-ghost">
                Record Again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Microphone permission notice */}
      {!micPermissionGranted && recordingState === 'idle' && (
        <div className="alert alert-warning mt-6">
          <div>
            <div className="font-semibold">Microphone Permission Required</div>
            <div className="text-sm">
              This exercise requires microphone access. When you click "Start Recording," your
              browser will ask for permission.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
