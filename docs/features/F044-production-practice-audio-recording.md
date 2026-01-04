# F044: Production Practice (Audio Recording)

**Feature Code**: F044
**Created**: 2025-12-17
**Phase**: 12 - Practice Modes
**Status**: Implemented

---

## Description

Implement audio recording exercises for pronunciation practice where users record themselves speaking and compare with native speaker audio. This practice mode develops active speaking skills and pronunciation awareness through self-assessment. The MVP uses self-assessment ratings (no automatic speech recognition) and optionally stores recordings for user review.

## Success Criteria

- [x] Microphone access permission with clear user consent
- [ ] Audio recording with real-time waveform visualization
- [x] Playback controls for both native and user recordings
- [x] Side-by-side comparison UI (listen to native, then your recording)
- [x] Self-assessment interface (again/hard/good/easy)
- [x] Recording saved temporarily for session (optional persistent storage)
- [x] SRS integration based on self-assessment
- [x] Countdown timer before recording starts

---

## Tasks

### Task 1: Create Production Exercise Service

**File**: `packages/api/src/services/practice/production.service.ts`

Create backend service that:

- Fetches production exercises (utterances/words with native audio) from SRS queue
- Records self-assessment ratings for SRS scheduling
- Optionally stores user recording metadata (if persistent storage enabled)
- Tracks production practice attempts and progress

**Implementation**:

```typescript
// packages/api/src/services/practice/production.service.ts
import { Pool } from 'pg';
import { SRSService } from '../srs/srs.service';

interface ProductionExercise {
  id: string;
  text: string;
  language: string;
  nativeAudioUrl: string;
  nativeAudioLength: number; // seconds
  romanization?: string; // For non-Latin scripts
  translation?: string; // Optional translation for context
  srsItemId: string;
  cefrLevel: string;
}

interface ProductionAssessment {
  srsItemId: string;
  userId: string;
  selfRating: 'again' | 'hard' | 'good' | 'easy';
  recordingDuration: number; // seconds
  attemptNumber: number; // 1st, 2nd, 3rd attempt in this session
}

export class ProductionService {
  constructor(
    private pool: Pool,
    private srsService: SRSService
  ) {}

  /**
   * Fetch production exercises from SRS queue
   * Only includes items with native audio recordings
   */
  async getProductionExercises(
    userId: string,
    language: string,
    limit: number = 10
  ): Promise<ProductionExercise[]> {
    const result = await this.pool.query(
      `SELECT
         COALESCE(au.id, av.id) AS item_id,
         COALESCE(au.utterance_text, av.word_text) AS text,
         COALESCE(au.language, av.language) AS language,
         aa.audio_url AS native_audio_url,
         aa.audio_length AS native_audio_length,
         av.romanization,
         am.definition AS translation,
         usi.id AS srs_item_id,
         COALESCE(au.cefr_level, av.cefr_level) AS cefr_level
       FROM user_srs_items usi
       LEFT JOIN approved_utterances au ON usi.utterance_id = au.id
       LEFT JOIN approved_vocabulary av ON usi.vocabulary_id = av.id
       LEFT JOIN approved_audio aa ON (
         (au.id IS NOT NULL AND aa.utterance_id = au.id) OR
         (av.id IS NOT NULL AND aa.vocabulary_id = av.id)
       )
       LEFT JOIN approved_meanings am ON am.vocabulary_id = av.id
         AND am.base_language = $3
       WHERE usi.user_id = $1
         AND COALESCE(au.language, av.language) = $2
         AND usi.next_review_date <= NOW()
         AND aa.id IS NOT NULL  -- Only items with native audio
         AND aa.speaker_type = 'native' -- Only native speaker recordings
       ORDER BY usi.next_review_date ASC
       LIMIT $4`,
      [userId, language, 'english', limit] // Assuming English as base language
    );

    return result.rows.map((row) => ({
      id: row.item_id,
      text: row.text,
      language: row.language,
      nativeAudioUrl: row.native_audio_url,
      nativeAudioLength: row.native_audio_length,
      romanization: row.romanization,
      translation: row.translation,
      srsItemId: row.srs_item_id,
      cefrLevel: row.cefr_level,
    }));
  }

  /**
   * Record production practice attempt with self-assessment
   */
  async recordProductionAttempt(assessment: ProductionAssessment): Promise<void> {
    const { srsItemId, userId, selfRating, recordingDuration, attemptNumber } = assessment;

    // Convert self-rating to SRS quality (0-5)
    const quality = this.selfRatingToQuality(selfRating);

    // Update SRS schedule
    await this.srsService.processReview(srsItemId, userId, quality);

    // Record attempt in database
    await this.pool.query(
      `INSERT INTO practice_attempts
         (user_id, srs_item_id, practice_type, user_answer, is_correct, accuracy, metadata, created_at)
       VALUES ($1, $2, 'production', $3, $4, $5, $6, NOW())`,
      [
        userId,
        srsItemId,
        'audio_recording',
        quality >= 3, // Consider "good" or "easy" as correct
        quality / 5.0, // Normalize to 0.0-1.0
        JSON.stringify({ recordingDuration, attemptNumber }),
      ]
    );
  }

  /**
   * Convert self-assessment rating to SRS quality (0-5)
   */
  private selfRatingToQuality(rating: 'again' | 'hard' | 'good' | 'easy'): number {
    switch (rating) {
      case 'again':
        return 0; // Complete blackout, couldn't pronounce
      case 'hard':
        return 3; // Pronounced with difficulty, noticeable errors
      case 'good':
        return 4; // Pronounced correctly with minor hesitation
      case 'easy':
        return 5; // Perfect pronunciation, confident
    }
  }

  /**
   * Get production practice statistics for user
   */
  async getProductionStats(
    userId: string,
    language: string
  ): Promise<{
    totalAttempts: number;
    averageQuality: number;
    streakDays: number;
  }> {
    const result = await this.pool.query(
      `SELECT
         COUNT(*) AS total_attempts,
         AVG(accuracy) AS average_quality
       FROM practice_attempts pa
       JOIN user_srs_items usi ON pa.srs_item_id = usi.id
       LEFT JOIN approved_utterances au ON usi.utterance_id = au.id
       LEFT JOIN approved_vocabulary av ON usi.vocabulary_id = av.id
       WHERE pa.user_id = $1
         AND pa.practice_type = 'production'
         AND COALESCE(au.language, av.language) = $2`,
      [userId, language]
    );

    // Calculate streak (consecutive days with production practice)
    const streakResult = await this.pool.query(
      `WITH daily_practice AS (
         SELECT DISTINCT DATE(created_at) AS practice_date
         FROM practice_attempts
         WHERE user_id = $1 AND practice_type = 'production'
         ORDER BY practice_date DESC
       ),
       streak AS (
         SELECT practice_date,
                ROW_NUMBER() OVER (ORDER BY practice_date DESC) AS row_num,
                practice_date - INTERVAL '1 day' * (ROW_NUMBER() OVER (ORDER BY practice_date DESC) - 1) AS streak_date
         FROM daily_practice
       )
       SELECT COUNT(*) AS streak_days
       FROM streak
       WHERE streak_date = (SELECT MAX(practice_date) FROM daily_practice)
       GROUP BY streak_date`,
      [userId]
    );

    return {
      totalAttempts: parseInt(result.rows[0]?.total_attempts || '0'),
      averageQuality: parseFloat(result.rows[0]?.average_quality || '0'),
      streakDays: parseInt(streakResult.rows[0]?.streak_days || '0'),
    };
  }
}
```

**Open Questions**:

1. **Recording Storage Strategy**: Should we store user recordings persistently, or only keep them in browser memory for the session?
   - **Ephemeral (MVP)**: No storage, recordings discarded after session. Simple, no storage costs.
   - **Persistent**: Store in object storage (S3) with URLs in database. Allows progress review but adds complexity and costs.
   - **Recommendation**: Start with ephemeral, add persistent storage as optional feature later.

2. **Recording Format**: What audio format should we use for recordings?
   - **WebM/Opus**: Best browser support, good compression (recommended)
   - **MP3**: Universal compatibility but requires encoding
   - **WAV**: Uncompressed, large file size
   - **Recommendation**: WebM/Opus for MVP

3. **Maximum Recording Length**: Should we enforce a maximum recording duration to prevent abuse?
   - Short utterances: 5-10 seconds max
   - Long utterances: 30 seconds max
   - **Recommendation**: Set max based on native audio length × 2 (allows for pauses/retries)

---

### Task 2: Create Production API Endpoints

**File**: `packages/api/src/routes/practice/production.ts`

Add REST endpoints for:

- GET `/practice/production/exercises` - Fetch exercises from SRS queue
- POST `/practice/production/assess` - Submit self-assessment rating

**Implementation**:

```typescript
// packages/api/src/routes/practice/production.ts
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ProductionService } from '../../services/practice/production.service';

const GetProductionExercisesSchema = z.object({
  language: z.enum(['russian', 'chinese', 'arabic']),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const SubmitProductionAssessmentSchema = z.object({
  srsItemId: z.string().uuid(),
  selfRating: z.enum(['again', 'hard', 'good', 'easy']),
  recordingDuration: z.number().min(0).max(60), // Max 60 seconds
  attemptNumber: z.number().int().min(1).max(10),
});

const GetProductionStatsSchema = z.object({
  language: z.enum(['russian', 'chinese', 'arabic']),
});

const productionRoutes: FastifyPluginAsync = async (fastify) => {
  const productionService = new ProductionService(fastify.db.pool, fastify.srsService);

  /**
   * GET /practice/production/exercises
   * Fetch production exercises from SRS queue
   */
  fastify.get(
    '/exercises',
    {
      onRequest: [fastify.authenticate],
      schema: {
        querystring: GetProductionExercisesSchema,
        response: {
          200: z.object({
            exercises: z.array(
              z.object({
                id: z.string().uuid(),
                text: z.string(),
                language: z.string(),
                nativeAudioUrl: z.string(),
                nativeAudioLength: z.number(),
                romanization: z.string().optional(),
                translation: z.string().optional(),
                srsItemId: z.string().uuid(),
                cefrLevel: z.string(),
              })
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const { language, limit } = GetProductionExercisesSchema.parse(request.query);
      const userId = request.user.userId;

      const exercises = await productionService.getProductionExercises(userId, language, limit);

      return reply.send({ exercises });
    }
  );

  /**
   * POST /practice/production/assess
   * Submit self-assessment for production practice
   */
  fastify.post(
    '/assess',
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: SubmitProductionAssessmentSchema,
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const assessment = SubmitProductionAssessmentSchema.parse(request.body);
      const userId = request.user.userId;

      await productionService.recordProductionAttempt({
        ...assessment,
        userId,
      });

      return reply.send({
        success: true,
        message: 'Assessment recorded successfully',
      });
    }
  );

  /**
   * GET /practice/production/stats
   * Get production practice statistics
   */
  fastify.get(
    '/stats',
    {
      onRequest: [fastify.authenticate],
      schema: {
        querystring: GetProductionStatsSchema,
        response: {
          200: z.object({
            totalAttempts: z.number(),
            averageQuality: z.number(),
            streakDays: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { language } = GetProductionStatsSchema.parse(request.query);
      const userId = request.user.userId;

      const stats = await productionService.getProductionStats(userId, language);

      return reply.send(stats);
    }
  );
};

export default productionRoutes;
```

**Integration**: Register in `packages/api/src/routes/practice/index.ts`:

```typescript
import productionRoutes from './production';

export const practiceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(recallRoutes, { prefix: '/recall' });
  fastify.register(recognitionRoutes, { prefix: '/recognition' });
  fastify.register(clozeRoutes, { prefix: '/cloze' });
  fastify.register(dictationRoutes, { prefix: '/dictation' });
  fastify.register(translationRoutes, { prefix: '/translation' });
  fastify.register(productionRoutes, { prefix: '/production' }); // NEW
};
```

**Open Questions**:

1. **Upload Endpoint for Persistent Storage**: If we decide to store recordings persistently, should we add a `POST /practice/production/upload` endpoint to receive audio files? This would require multipart/form-data handling and S3 integration.
2. **Audio Transcription API**: Should we add a future endpoint `POST /practice/production/transcribe` that uses ASR (Automatic Speech Recognition) for automatic pronunciation feedback? This would require integration with services like Google Speech-to-Text or Whisper API.
3. **Pronunciation Scoring**: Should we provide a simple pronunciation scoring API that compares user audio waveform with native audio using signal processing? This would be less accurate than ASR but doesn't require external APIs.

---

### Task 3: Create Production React Component

**File**: `packages/web/src/components/practice/ProductionPractice.tsx`

Create UI component with:

- Microphone permission request with clear explanation
- Native audio player with play/pause controls
- Recording button with countdown timer (3-2-1-GO)
- Real-time recording indicator with waveform visualization
- Playback of user recording
- Self-assessment buttons (again/hard/good/easy) with tooltips
- Side-by-side comparison: listen to native → listen to your recording
- Retry button to record again before assessment

**Implementation**:

```tsx
// packages/web/src/components/practice/ProductionPractice.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

interface ProductionExercise {
  id: string;
  text: string;
  language: string;
  nativeAudioUrl: string;
  nativeAudioLength: number;
  romanization?: string;
  translation?: string;
  srsItemId: string;
  cefrLevel: string;
}

interface Props {
  exercise: ProductionExercise;
  onComplete: () => void;
}

type RecordingState = 'idle' | 'countdown' | 'recording' | 'recorded';
type SelfRating = 'again' | 'hard' | 'good' | 'easy';

export const ProductionPractice: React.FC<Props> = ({ exercise, onComplete }) => {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [countdown, setCountdown] = useState(3);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [hasPlayedNative, setHasPlayedNative] = useState(false);
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);

  const nativeAudioRef = useRef<HTMLAudioElement>(null);
  const userAudioRef = useRef<HTMLAudioElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Check if microphone permission already granted
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const hasAudioInput = devices.some((device) => device.kind === 'audioinput');
      if (hasAudioInput) {
        // Permission check will happen on first recording attempt
      }
    });

    return () => {
      // Cleanup: stop recording if component unmounts
      if (mediaRecorderRef.current && recordingState === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  const requestMicrophonePermission = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermissionGranted(true);
      // Stop the stream immediately, we'll request it again when recording
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (error) {
      console.error('Microphone permission denied:', error);
      alert(
        'Microphone access is required for pronunciation practice. Please grant permission in your browser settings.'
      );
      return false;
    }
  };

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

    const countdownInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          beginRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const beginRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Use WebM/Opus format if supported
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

        if (userAudioRef.current) {
          userAudioRef.current.src = audioUrl;
        }

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());

        setRecordingState('recorded');
      };

      mediaRecorder.start();
      setRecordingState('recording');
      setRecordingDuration(0);

      // Track recording duration
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 0.1);
      }, 100);

      // Auto-stop after max duration (native audio length × 2)
      const maxDuration = exercise.nativeAudioLength * 2;
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          stopRecording();
        }
      }, maxDuration * 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Failed to start recording. Please check your microphone.');
      setRecordingState('idle');
    }
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
    if (userAudioRef.current) {
      userAudioRef.current.src = '';
    }
  };

  const assessMutation = useMutation({
    mutationFn: async (selfRating: SelfRating) => {
      const response = await apiClient.post('/practice/production/assess', {
        srsItemId: exercise.srsItemId,
        selfRating,
        recordingDuration: Math.round(recordingDuration * 10) / 10,
        attemptNumber,
      });
      return response.data;
    },
    onSuccess: () => {
      onComplete();
    },
  });

  const handleAssessment = (rating: SelfRating) => {
    assessMutation.mutate(rating);
  };

  const handleNativeAudioPlay = () => {
    setHasPlayedNative(true);
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Pronunciation Practice</h3>
          <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded">
            {exercise.cefrLevel}
          </span>
        </div>

        {/* Text to Pronounce */}
        <div className="bg-blue-50 p-6 rounded-lg mb-6">
          <div className="text-sm font-semibold text-gray-600 mb-2">Pronounce this:</div>
          <div className="text-2xl text-gray-900 font-semibold mb-2">{exercise.text}</div>
          {exercise.romanization && (
            <div className="text-sm text-gray-600 italic">{exercise.romanization}</div>
          )}
          {exercise.translation && (
            <div className="text-sm text-gray-500 mt-2">Translation: {exercise.translation}</div>
          )}
        </div>

        {/* Native Audio */}
        <div className="bg-green-50 p-4 rounded-lg mb-6">
          <div className="text-sm font-semibold text-gray-700 mb-3">🎧 Native Speaker Audio:</div>
          <audio
            ref={nativeAudioRef}
            src={exercise.nativeAudioUrl}
            controls
            onPlay={handleNativeAudioPlay}
            className="w-full"
          />
          <div className="text-xs text-gray-600 mt-2">
            Listen carefully to the pronunciation before recording
          </div>
        </div>

        {/* Recording Controls */}
        <div className="space-y-4">
          {recordingState === 'idle' && (
            <div className="text-center space-y-4">
              <button
                onClick={startRecording}
                disabled={!hasPlayedNative}
                className="px-8 py-4 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold text-lg transition-colors"
              >
                🎤 Start Recording
              </button>
              {!hasPlayedNative && (
                <div className="text-sm text-orange-600">
                  ⚠️ Please listen to the native audio first
                </div>
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
              <button
                onClick={stopRecording}
                className="px-8 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold transition-colors"
              >
                ⏹️ Stop Recording
              </button>
              <div className="text-sm text-gray-600">
                Max duration: {exercise.nativeAudioLength * 2}s
              </div>
            </div>
          )}

          {recordingState === 'recorded' && (
            <div className="space-y-4">
              {/* User Recording Playback */}
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-sm font-semibold text-gray-700 mb-3">🎙️ Your Recording:</div>
                <audio ref={userAudioRef} controls className="w-full" />
                <div className="text-xs text-gray-600 mt-2">
                  Duration: {recordingDuration.toFixed(1)}s
                </div>
              </div>

              {/* Comparison Tip */}
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3">
                <div className="text-sm text-gray-700">
                  💡 <strong>Compare:</strong> Listen to the native audio, then listen to your
                  recording. How similar is your pronunciation?
                </div>
              </div>

              {/* Self-Assessment Buttons */}
              <div className="space-y-3">
                <div className="text-sm font-semibold text-gray-700">
                  How was your pronunciation?
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleAssessment('again')}
                    disabled={assessMutation.isPending}
                    className="px-4 py-3 bg-red-100 text-red-800 rounded-lg hover:bg-red-200 disabled:opacity-50 font-medium transition-colors"
                    title="I couldn't pronounce it correctly"
                  >
                    ❌ Again
                  </button>
                  <button
                    onClick={() => handleAssessment('hard')}
                    disabled={assessMutation.isPending}
                    className="px-4 py-3 bg-orange-100 text-orange-800 rounded-lg hover:bg-orange-200 disabled:opacity-50 font-medium transition-colors"
                    title="I pronounced it, but with noticeable errors"
                  >
                    😅 Hard
                  </button>
                  <button
                    onClick={() => handleAssessment('good')}
                    disabled={assessMutation.isPending}
                    className="px-4 py-3 bg-green-100 text-green-800 rounded-lg hover:bg-green-200 disabled:opacity-50 font-medium transition-colors"
                    title="I pronounced it correctly with minor hesitation"
                  >
                    ✓ Good
                  </button>
                  <button
                    onClick={() => handleAssessment('easy')}
                    disabled={assessMutation.isPending}
                    className="px-4 py-3 bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 disabled:opacity-50 font-medium transition-colors"
                    title="Perfect pronunciation, I'm confident!"
                  >
                    🌟 Easy
                  </button>
                </div>
              </div>

              {/* Retry Button */}
              <div className="text-center">
                <button
                  onClick={retryRecording}
                  disabled={assessMutation.isPending}
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 font-medium transition-colors"
                >
                  🔄 Record Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 p-4 rounded-lg text-sm text-gray-700">
        <strong>Instructions:</strong>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>Listen to the native speaker audio carefully</li>
          <li>Click "Start Recording" when ready (3-second countdown)</li>
          <li>Speak clearly into your microphone</li>
          <li>Listen to your recording and compare with native audio</li>
          <li>Honestly assess your pronunciation quality</li>
          <li>You can record multiple times before submitting assessment</li>
        </ul>
      </div>

      {/* Microphone Troubleshooting */}
      {!micPermissionGranted && (
        <div className="bg-orange-50 border-l-4 border-orange-400 p-4 text-sm">
          <div className="font-semibold text-orange-800 mb-2">
            🎤 Microphone Permission Required
          </div>
          <div className="text-gray-700">
            This exercise requires microphone access. When you click "Start Recording," your browser
            will ask for permission. Please click "Allow" to continue.
          </div>
        </div>
      )}
    </div>
  );
};
```

**Integration**: Add to practice mode router in `packages/web/src/pages/PracticeModePage.tsx`:

```tsx
import { ProductionPractice } from '../components/practice/ProductionPractice';

// In practice mode selector:
case 'production':
  return <ProductionPractice exercise={currentExercise} onComplete={loadNextExercise} />;
```

**Open Questions**:

1. **Waveform Visualization**: Should we add real-time waveform visualization during recording using Web Audio API? This would provide visual feedback but adds complexity (~200 lines of code).
2. **Recording Limits**: Should we limit the number of retry attempts before forcing assessment (e.g., max 5 retries)? This prevents perfectionism paralysis but may frustrate learners.
3. **Offline Support**: Should recordings work offline using Service Workers? This would allow practice without internet but requires caching strategy for native audio files.

---

## Dependencies

- **Blocks**: None
- **Depends on**:
  - F001 (Database Schema) - `approved_utterances`, `approved_vocabulary`, `approved_audio`, `user_srs_items`, `practice_attempts`
  - F002 (Domain Model) - Language enum, CEFR levels
  - F046 (SRS Algorithm) - `SRSService.processReview()`
  - F018 (API Infrastructure) - Fastify setup, authentication middleware
  - F022 (React Setup) - React 18, TanStack Query, Tailwind CSS

---

## Notes

### MediaRecorder API Browser Support

- **Chrome/Edge**: Full support (WebM/Opus)
- **Firefox**: Full support (WebM/Opus)
- **Safari**: Partial support (MP4/AAC on iOS 14.3+)
- **Fallback**: Check `MediaRecorder.isTypeSupported()` before recording

### Audio Format Strategy

- **Primary**: WebM with Opus codec (best compression, good quality)
- **Fallback**: WebM default codec
- **No encoding**: Browser handles encoding automatically via MediaRecorder API

### Self-Assessment Ratings

- **Again** (Quality 0): Couldn't pronounce correctly, complete failure
- **Hard** (Quality 3): Pronounced with difficulty, noticeable errors
- **Good** (Quality 4): Pronounced correctly with minor hesitation
- **Easy** (Quality 5): Perfect pronunciation, confident delivery

### Privacy Considerations

- **Clear permission request**: Explain why microphone access is needed
- **Ephemeral by default**: Recordings stored in browser memory only, discarded after session
- **Optional persistence**: If enabled, user must explicitly consent to server storage
- **No automatic upload**: Recordings never sent to server in MVP (only self-assessment)

### Recording Duration Limits

- **Minimum**: No minimum (user can stop immediately)
- **Maximum**: Native audio length × 2 (allows pauses/retries)
- **Example**: 3-second native audio → max 6-second recording

### Accessibility

- **Visual countdown**: Large numbers before recording starts
- **Recording indicator**: Pulsing red dot + timer during recording
- **Clear button states**: Disabled states with tooltips explaining why
- **Keyboard navigation**: All buttons keyboard accessible

### Future Enhancements (Out of Scope)

- **Automatic Speech Recognition (ASR)**: Use Whisper API or Google Speech-to-Text for automatic pronunciation scoring
- **Phoneme-level feedback**: Highlight specific sounds that need improvement
- **Native/user audio sync visualization**: Side-by-side waveform comparison
- **Pitch/tone analysis**: For tonal languages (Chinese, etc.)
- **Recording history**: Show all attempts for a single item with timestamps
- **Community sharing**: Allow users to share their best recordings (with consent)

---

## Open Questions

### 1. Audio Recording Storage Strategy

**Question**: Should user audio recordings be stored persistently on the server, or kept only ephemerally in browser memory during the session?

**Current Approach**: Ephemeral storage only (MVP). Recordings exist in browser memory via MediaRecorder Blob, played back locally for comparison, then discarded when user moves to next exercise or closes browser. No server upload.

**Alternatives**:

1. **Ephemeral only** (current): Zero storage costs, no privacy concerns, but users can't review past recordings to track pronunciation improvement over time.
2. **Persistent with user opt-in**: Store recordings in object storage (S3/CloudFlare R2) with expiration (30-90 days). Requires explicit user consent per recording.
3. **Persistent for premium users**: Free users get ephemeral, paid subscribers get persistent storage with unlimited history.
4. **Selective persistence**: Auto-save only recordings where user self-rated "easy" (quality 5) as pronunciation milestones.

**Recommendation**: Implement **selective persistence** (Option 4) combined with opt-in for all recordings. Auto-save "easy" rated recordings as pronunciation checkpoints users can review later. Add opt-in toggle for saving all recordings (stores in S3 with 90-day TTL). This balances storage costs with providing value (progress tracking) while respecting privacy. Store metadata in `user_recordings` table: `{user_id, srs_item_id, recording_url, self_rating, created_at, expires_at}`.

---

### 2. Automatic Speech Recognition (ASR) Integration Timeline

**Question**: When should we integrate ASR for automated pronunciation scoring, and which service should we use?

**Current Approach**: No ASR - MVP relies entirely on self-assessment. Users rate own pronunciation against native audio (again/hard/good/easy). Subjective but requires no external dependencies.

**Alternatives**:

1. **No ASR** (current): Simplest, zero API costs, but users may not accurately self-assess pronunciation quality.
2. **OpenAI Whisper API**: State-of-art multilingual ASR with transcription and confidence scores. Costs $0.006/minute (cheap).
3. **Google Cloud Speech-to-Text**: Excellent accuracy, per-second pricing, supports 125+ languages with phoneme-level output.
4. **Azure Speech Services**: Similar to Google, includes pronunciation assessment API specifically designed for language learners.
5. **On-premise Whisper**: Self-host open-source Whisper model (faster-whisper). No ongoing API costs but requires GPU infrastructure.

**Recommendation**: Phase in ASR gradually. **MVP: Self-assessment only** (Option 1). **Phase 2 (3-6 months)**: Integrate **Azure Pronunciation Assessment API** (Option 4) as optional "AI feedback" feature for premium users. Azure's pronunciation assessment returns accuracy, fluency, completeness, and prosody scores specifically designed for language learning (not just transcription). Costs ~$1-2 per 1000 assessments. Display ASR score alongside self-assessment, analyze correlation to validate self-assessment accuracy. **Phase 3**: Make ASR available to all users once proven valuable.

---

### 3. Self-Assessment Methodology and Calibration

**Question**: How can we ensure users accurately self-assess pronunciation quality without external feedback or ASR?

**Current Approach**: Simple 4-point scale (again/hard/good/easy) mapped to SRS quality 0/3/4/5. No guidance on calibration. Users may systematically over-rate or under-rate themselves.

**Alternatives**:

1. **No guidance** (current): Simplest but prone to miscalibration. Optimistic users always rate "easy", perfectionist users always rate "hard".
2. **Rubric with examples**: Provide clear rubric for each rating with audio examples (e.g., "Good = minor accent, understood by native speakers").
3. **Comparative anchoring**: Before self-assessment, require user to listen to 3 recordings (bad/okay/excellent) to calibrate expectations.
4. **Forced distribution**: Constrain ratings statistically (e.g., can't rate >50% as "easy" in a session). Prevents inflation.
5. **Periodic ASR validation**: Every 10th recording gets ASR analysis, shown to user to calibrate future self-assessments.

**Recommendation**: Implement **rubric with examples** (Option 2) combined with **periodic ASR validation** (Option 5). Provide clear rubric in tooltip/modal when hovering over rating buttons:

- **Again**: "Couldn't pronounce, major errors, unrecognizable"
- **Hard**: "Recognizable but difficult, noticeable accent/hesitation"
- **Good**: "Clear pronunciation, minor accent, native would understand"
- **Easy**: "Natural pronunciation, confident, near-native"

Every 20th recording, offer optional ASR check (Azure API) with message: "Want AI feedback on this one?" Show ASR scores alongside self-rating to help calibrate. Track correlation between self-rating and ASR scores in analytics to identify systematic over/under-rating.
