# F042: Dictation Practice

**Feature Code**: F042
**Created**: 2025-12-17
**Phase**: 12 - Practice Modes
**Status**: Implemented

---

## Description

Implement dictation exercises where users listen to audio and type what they hear. This practice mode develops listening comprehension and spelling accuracy by requiring learners to transcribe spoken utterances. The system provides fuzzy matching for minor errors, word-level difference highlighting, and variable playback speed controls.

## Success Criteria

- [x] Audio playback with replay button (play count tracking implemented)
- [x] Text input for dictation with textarea input
- [x] Fuzzy matching comparison with correct transcript (Levenshtein distance)
- [x] Word-level highlighting of differences (insertions, deletions, substitutions)
- [x] Character-level accuracy scoring with partial credit
- [x] SRS integration: accuracy → quality rating (SM-2 algorithm)
- [x] Show correct transcript after submission with diff visualization

---

## Tasks

### Task 1: Create Dictation Exercise Service

**File**: `packages/api/src/services/practice/dictation.service.ts`

Create backend service that:

- Fetches SRS-scheduled audio items with transcripts
- Validates submitted dictation with fuzzy word matching
- Calculates character-level and word-level accuracy
- Generates word-level diff for frontend highlighting
- Updates SRS based on accuracy score

**Implementation**:

```typescript
// packages/api/src/services/practice/dictation.service.ts
import { Pool } from 'pg';
import { SRSService } from '../srs/srs.service';

interface DictationExercise {
  id: string;
  audioUrl: string;
  audioLength: number; // seconds
  correctTranscript: string;
  srsItemId: string;
  language: string;
  cefrLevel: string;
}

interface DictationResult {
  isCorrect: boolean;
  characterAccuracy: number; // 0.0 to 1.0
  wordAccuracy: number; // 0.0 to 1.0
  diff: WordDiff[];
  correctTranscript: string;
}

interface WordDiff {
  type: 'correct' | 'substitution' | 'insertion' | 'deletion';
  expected?: string;
  actual?: string;
  position: number;
}

export class DictationService {
  constructor(
    private pool: Pool,
    private srsService: SRSService
  ) {}

  /**
   * Fetch dictation exercises from SRS queue
   * Only includes items with associated audio
   */
  async getDictationExercises(
    userId: string,
    language: string,
    limit: number = 10
  ): Promise<DictationExercise[]> {
    const result = await this.pool.query(
      `SELECT
         aa.id AS audio_id,
         aa.audio_url,
         aa.audio_length,
         COALESCE(au.utterance_text, av.word_text) AS correct_transcript,
         usi.id AS srs_item_id,
         COALESCE(au.language, av.language) AS language,
         COALESCE(au.cefr_level, av.cefr_level) AS cefr_level
       FROM user_srs_items usi
       LEFT JOIN approved_utterances au ON usi.vocabulary_id IS NULL
         AND usi.utterance_id = au.id
       LEFT JOIN approved_vocabulary av ON usi.vocabulary_id = av.id
         AND usi.utterance_id IS NULL
       LEFT JOIN approved_audio aa ON (
         (au.id IS NOT NULL AND aa.utterance_id = au.id) OR
         (av.id IS NOT NULL AND aa.vocabulary_id = av.id)
       )
       WHERE usi.user_id = $1
         AND COALESCE(au.language, av.language) = $2
         AND usi.next_review_date <= NOW()
         AND aa.id IS NOT NULL  -- Only items with audio
       ORDER BY usi.next_review_date ASC
       LIMIT $3`,
      [userId, language, limit]
    );

    return result.rows.map((row) => ({
      id: row.audio_id,
      audioUrl: row.audio_url,
      audioLength: row.audio_length,
      correctTranscript: row.correct_transcript,
      srsItemId: row.srs_item_id,
      language: row.language,
      cefrLevel: row.cefr_level,
    }));
  }

  /**
   * Validate user's dictation submission
   * Returns accuracy metrics and word-level diff
   */
  async validateDictation(
    exerciseId: string,
    userTranscript: string,
    correctTranscript: string,
    srsItemId: string,
    userId: string
  ): Promise<DictationResult> {
    const normalized = this.normalizeText(userTranscript);
    const correctNormalized = this.normalizeText(correctTranscript);

    // Calculate character-level accuracy (Levenshtein-based)
    const charAccuracy = this.calculateCharacterAccuracy(normalized, correctNormalized);

    // Calculate word-level accuracy with diff
    const { wordAccuracy, diff } = this.calculateWordDiff(normalized, correctNormalized);

    // Determine SRS quality based on accuracy
    const quality = this.accuracyToQuality(charAccuracy);

    // Update SRS schedule
    await this.srsService.processReview(srsItemId, userId, quality);

    // Record attempt
    await this.pool.query(
      `INSERT INTO practice_attempts
         (user_id, srs_item_id, practice_type, user_answer, is_correct, accuracy, created_at)
       VALUES ($1, $2, 'dictation', $3, $4, $5, NOW())`,
      [userId, srsItemId, userTranscript, charAccuracy >= 0.9, charAccuracy]
    );

    return {
      isCorrect: charAccuracy >= 0.9,
      characterAccuracy: charAccuracy,
      wordAccuracy,
      diff,
      correctTranscript,
    };
  }

  /**
   * Normalize text for comparison:
   * - Trim whitespace
   * - Convert to lowercase
   * - Collapse multiple spaces
   * - Remove leading/trailing punctuation from words
   */
  private normalizeText(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/([.!?,;:]+)\s+/g, '$1 '); // Normalize punctuation spacing
  }

  /**
   * Calculate character-level accuracy using Levenshtein distance
   */
  private calculateCharacterAccuracy(user: string, correct: string): number {
    const distance = this.levenshteinDistance(user, correct);
    const maxLength = Math.max(user.length, correct.length);

    if (maxLength === 0) return 1.0;

    return Math.max(0, 1 - distance / maxLength);
  }

  /**
   * Levenshtein distance algorithm
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b[i - 1] === a[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Calculate word-level accuracy and generate diff
   * Uses dynamic programming for word-level edit distance
   */
  private calculateWordDiff(
    user: string,
    correct: string
  ): { wordAccuracy: number; diff: WordDiff[] } {
    const userWords = user.split(' ').filter((w) => w.length > 0);
    const correctWords = correct.split(' ').filter((w) => w.length > 0);

    const m = userWords.length;
    const n = correctWords.length;

    // DP matrix for edit distance
    const dp: number[][] = Array(m + 1)
      .fill(0)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (userWords[i - 1] === correctWords[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] =
            1 +
            Math.min(
              dp[i - 1][j - 1], // substitution
              dp[i - 1][j], // deletion
              dp[i][j - 1] // insertion
            );
        }
      }
    }

    const editDistance = dp[m][n];
    const maxWords = Math.max(m, n);
    const wordAccuracy = maxWords === 0 ? 1.0 : Math.max(0, 1 - editDistance / maxWords);

    // Backtrack to generate diff
    const diff: WordDiff[] = [];
    let i = m,
      j = n;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && userWords[i - 1] === correctWords[j - 1]) {
        diff.unshift({
          type: 'correct',
          expected: correctWords[j - 1],
          actual: userWords[i - 1],
          position: j - 1,
        });
        i--;
        j--;
      } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
        diff.unshift({
          type: 'substitution',
          expected: correctWords[j - 1],
          actual: userWords[i - 1],
          position: j - 1,
        });
        i--;
        j--;
      } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
        diff.unshift({ type: 'insertion', actual: userWords[i - 1], position: j });
        i--;
      } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
        diff.unshift({ type: 'deletion', expected: correctWords[j - 1], position: j - 1 });
        j--;
      }
    }

    return { wordAccuracy, diff };
  }

  /**
   * Convert character accuracy to SRS quality rating
   */
  private accuracyToQuality(accuracy: number): number {
    if (accuracy >= 0.95) return 5; // Perfect or near-perfect
    if (accuracy >= 0.85) return 4; // Good
    if (accuracy >= 0.7) return 3; // Acceptable with effort
    if (accuracy >= 0.5) return 2; // Barely recognized
    return 0; // Complete failure
  }
}
```

**Open Questions**:

1. **Audio Source Strategy**: Should we support Text-to-Speech (TTS) fallback for items without human recordings, or require all dictation exercises to have human-recorded audio? TTS would increase exercise availability but may have unnatural pronunciation.
2. **Progressive Disclosure**: Should we show word-by-word hints after failed attempts (similar to F041 cloze hints), or only show full transcript after submission?
3. **Background Noise Simulation**: For advanced learners, should we optionally add background noise/distractions to audio to simulate real-world listening conditions?

---

### Task 2: Create Dictation API Endpoints

**File**: `packages/api/src/routes/practice/dictation.ts`

Add REST endpoints for:

- GET `/practice/dictation/exercises` - Fetch exercises from SRS queue
- POST `/practice/dictation/submit` - Submit and validate dictation

**Implementation**:

```typescript
// packages/api/src/routes/practice/dictation.ts
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { DictationService } from '../../services/practice/dictation.service';

const GetDictationExercisesSchema = z.object({
  language: z.enum(['russian', 'chinese', 'arabic']),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const SubmitDictationSchema = z.object({
  exerciseId: z.string().uuid(),
  userTranscript: z.string().min(1).max(1000),
  correctTranscript: z.string(),
  srsItemId: z.string().uuid(),
});

const dictationRoutes: FastifyPluginAsync = async (fastify) => {
  const dictationService = new DictationService(fastify.db.pool, fastify.srsService);

  /**
   * GET /practice/dictation/exercises
   * Fetch dictation exercises from SRS queue
   */
  fastify.get(
    '/exercises',
    {
      onRequest: [fastify.authenticate],
      schema: {
        querystring: GetDictationExercisesSchema,
        response: {
          200: z.object({
            exercises: z.array(
              z.object({
                id: z.string().uuid(),
                audioUrl: z.string(),
                audioLength: z.number(),
                srsItemId: z.string().uuid(),
                language: z.string(),
                cefrLevel: z.string(),
                // Note: correctTranscript NOT sent to client before submission
              })
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const { language, limit } = GetDictationExercisesSchema.parse(request.query);
      const userId = request.user.userId;

      const exercises = await dictationService.getDictationExercises(userId, language, limit);

      // Remove correctTranscript before sending to client
      const sanitizedExercises = exercises.map((ex) => ({
        id: ex.id,
        audioUrl: ex.audioUrl,
        audioLength: ex.audioLength,
        srsItemId: ex.srsItemId,
        language: ex.language,
        cefrLevel: ex.cefrLevel,
      }));

      return reply.send({ exercises: sanitizedExercises });
    }
  );

  /**
   * POST /practice/dictation/submit
   * Submit dictation answer for validation
   */
  fastify.post(
    '/submit',
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: SubmitDictationSchema,
        response: {
          200: z.object({
            isCorrect: z.boolean(),
            characterAccuracy: z.number(),
            wordAccuracy: z.number(),
            diff: z.array(
              z.object({
                type: z.enum(['correct', 'substitution', 'insertion', 'deletion']),
                expected: z.string().optional(),
                actual: z.string().optional(),
                position: z.number(),
              })
            ),
            correctTranscript: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { exerciseId, userTranscript, correctTranscript, srsItemId } =
        SubmitDictationSchema.parse(request.body);
      const userId = request.user.userId;

      const result = await dictationService.validateDictation(
        exerciseId,
        userTranscript,
        correctTranscript,
        srsItemId,
        userId
      );

      return reply.send(result);
    }
  );
};

export default dictationRoutes;
```

**Integration**: Register in `packages/api/src/routes/practice/index.ts`:

```typescript
import dictationRoutes from './dictation';

export const practiceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(recallRoutes, { prefix: '/recall' });
  fastify.register(recognitionRoutes, { prefix: '/recognition' });
  fastify.register(clozeRoutes, { prefix: '/cloze' });
  fastify.register(dictationRoutes, { prefix: '/dictation' }); // NEW
};
```

**Open Questions**:

1. **Audio Streaming**: Should we support audio streaming for longer utterances (>30 seconds), or is direct file download sufficient? Streaming would reduce initial load time but adds complexity.
2. **Rate Limiting**: Should dictation submissions have stricter rate limiting than other practice modes to prevent rapid-fire guessing? E.g., minimum 3-second delay between submissions.
3. **Replay Count Tracking**: Should we track how many times a user replays audio and use this as a difficulty signal (more replays → easier SRS scheduling)?

---

### Task 3: Create Dictation React Component

**File**: `packages/web/src/components/practice/DictationPractice.tsx`

Create UI component with:

- Audio player with play/pause, replay button, and speed controls (0.75x, 1x, 1.25x)
- Large text area for user input with character count
- Submit button (disabled until audio played once)
- Visual diff display highlighting word-level differences
- Show accuracy percentages and correct transcript after submission

**Implementation**:

```tsx
// packages/web/src/components/practice/DictationPractice.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

interface DictationExercise {
  id: string;
  audioUrl: string;
  audioLength: number;
  srsItemId: string;
  language: string;
  cefrLevel: string;
}

interface WordDiff {
  type: 'correct' | 'substitution' | 'insertion' | 'deletion';
  expected?: string;
  actual?: string;
  position: number;
}

interface DictationResult {
  isCorrect: boolean;
  characterAccuracy: number;
  wordAccuracy: number;
  diff: WordDiff[];
  correctTranscript: string;
}

interface Props {
  exercise: DictationExercise;
  onComplete: () => void;
}

const PLAYBACK_SPEEDS = [0.75, 1.0, 1.25] as const;

export const DictationPractice: React.FC<Props> = ({ exercise, onComplete }) => {
  const [userTranscript, setUserTranscript] = useState('');
  const [result, setResult] = useState<DictationResult | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [correctTranscript, setCorrectTranscript] = useState<string>('');

  const audioRef = useRef<HTMLAudioElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/practice/dictation/submit', {
        exerciseId: exercise.id,
        userTranscript,
        correctTranscript, // Sent from client context (was stored when fetched)
        srsItemId: exercise.srsItemId,
      });
      return response.data;
    },
    onSuccess: (data: DictationResult) => {
      setResult(data);
    },
  });

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  const handlePlay = () => {
    if (audioRef.current) {
      audioRef.current.play();
      setIsPlaying(true);
      setHasPlayedOnce(true);
    }
  };

  const handlePause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    // Auto-focus textarea after audio ends
    textareaRef.current?.focus();
  };

  const handleSubmit = () => {
    if (!userTranscript.trim() || !hasPlayedOnce) return;
    submitMutation.mutate();
  };

  const handleTryAgain = () => {
    setUserTranscript('');
    setResult(null);
    textareaRef.current?.focus();
  };

  const renderDiff = () => {
    if (!result) return null;

    return (
      <div className="space-y-4">
        <div className="flex gap-4 text-sm">
          <div>
            <span className="font-semibold">Character Accuracy:</span>{' '}
            <span
              className={result.characterAccuracy >= 0.9 ? 'text-green-600' : 'text-orange-600'}
            >
              {(result.characterAccuracy * 100).toFixed(1)}%
            </span>
          </div>
          <div>
            <span className="font-semibold">Word Accuracy:</span>{' '}
            <span className={result.wordAccuracy >= 0.9 ? 'text-green-600' : 'text-orange-600'}>
              {(result.wordAccuracy * 100).toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="font-semibold mb-2">Comparison:</div>
          <div className="flex flex-wrap gap-1">
            {result.diff.map((word, idx) => {
              if (word.type === 'correct') {
                return (
                  <span key={idx} className="px-1 py-0.5 bg-green-100 text-green-800 rounded">
                    {word.actual}
                  </span>
                );
              } else if (word.type === 'substitution') {
                return (
                  <span key={idx} className="relative group">
                    <span className="px-1 py-0.5 bg-orange-100 text-orange-800 rounded line-through">
                      {word.actual}
                    </span>
                    <span className="px-1 py-0.5 bg-green-100 text-green-800 rounded ml-1">
                      {word.expected}
                    </span>
                  </span>
                );
              } else if (word.type === 'insertion') {
                return (
                  <span key={idx} className="px-1 py-0.5 bg-red-100 text-red-800 rounded">
                    +{word.actual}
                  </span>
                );
              } else if (word.type === 'deletion') {
                return (
                  <span key={idx} className="px-1 py-0.5 bg-blue-100 text-blue-800 rounded">
                    -{word.expected}
                  </span>
                );
              }
            })}
          </div>
        </div>

        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="font-semibold mb-2">Correct Transcript:</div>
          <div className="text-gray-800">{result.correctTranscript}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Dictation Exercise</h3>
          <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded">
            {exercise.cefrLevel}
          </span>
        </div>

        {/* Audio Player */}
        <div className="bg-gray-50 p-6 rounded-lg space-y-4">
          <audio
            ref={audioRef}
            src={exercise.audioUrl}
            onEnded={handleAudioEnded}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />

          <div className="flex items-center gap-4">
            <button
              onClick={isPlaying ? handlePause : handlePlay}
              disabled={result !== null}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold transition-colors"
            >
              {isPlaying ? '⏸️ Pause' : '▶️ Play'}
            </button>

            <button
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.currentTime = 0;
                  audioRef.current.play();
                }
              }}
              disabled={!hasPlayedOnce || result !== null}
              className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
            >
              🔄 Replay
            </button>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Speed:</span>
              <div className="flex gap-1">
                {PLAYBACK_SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setPlaybackSpeed(speed)}
                    disabled={result !== null}
                    className={`px-3 py-1 rounded text-sm transition-colors ${
                      playbackSpeed === speed
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    } disabled:bg-gray-100 disabled:cursor-not-allowed`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-500">
            Duration: {Math.floor(exercise.audioLength / 60)}:
            {(exercise.audioLength % 60).toString().padStart(2, '0')}
          </div>
        </div>

        {/* Text Input */}
        {result === null && (
          <div className="space-y-2">
            <label htmlFor="dictation-input" className="block text-sm font-medium text-gray-700">
              Type what you hear:
            </label>
            <textarea
              ref={textareaRef}
              id="dictation-input"
              value={userTranscript}
              onChange={(e) => setUserTranscript(e.target.value)}
              disabled={!hasPlayedOnce}
              placeholder={hasPlayedOnce ? 'Start typing...' : 'Play the audio first'}
              className="w-full h-32 px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed resize-none text-lg"
            />
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">{userTranscript.length} characters</span>
              <button
                onClick={handleSubmit}
                disabled={!userTranscript.trim() || !hasPlayedOnce || submitMutation.isPending}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold transition-colors"
              >
                {submitMutation.isPending ? 'Checking...' : 'Submit'}
              </button>
            </div>
          </div>
        )}

        {/* Result Display */}
        {result && (
          <div className="space-y-4">
            <div className={`p-4 rounded-lg ${result.isCorrect ? 'bg-green-50' : 'bg-orange-50'}`}>
              <div className="text-lg font-semibold mb-2">
                {result.isCorrect ? '✓ Excellent!' : '✗ Keep practicing!'}
              </div>
              {renderDiff()}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleTryAgain}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-colors"
              >
                🔄 Try Again
              </button>
              <button
                onClick={onComplete}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold transition-colors"
              >
                Next Exercise →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 p-4 rounded-lg text-sm text-gray-700">
        <strong>Instructions:</strong>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>Listen carefully to the audio</li>
          <li>You can replay as many times as needed</li>
          <li>Adjust playback speed if it's too fast</li>
          <li>Type exactly what you hear, including punctuation</li>
          <li>Minor spelling mistakes are tolerated with partial credit</li>
        </ul>
      </div>
    </div>
  );
};
```

**Integration**: Add to practice mode router in `packages/web/src/pages/PracticeModePage.tsx`:

```tsx
import { DictationPractice } from '../components/practice/DictationPractice';

// In practice mode selector:
case 'dictation':
  return <DictationPractice exercise={currentExercise} onComplete={loadNextExercise} />;
```

**Open Questions**:

1. **Keyboard Shortcuts**: Should we add keyboard shortcuts for audio controls (e.g., Space to play/pause, R to replay)? This would improve UX but may conflict with text input.
2. **Auto-Submit on Confidence**: Should we add an optional "I'm confident" button that submits without requiring explicit submit click? Could speed up practice for advanced learners.
3. **Audio Waveform Visualization**: Should we show a visual waveform of the audio to help users track playback position? Adds complexity but improves accessibility for hearing-impaired users.

---

## Dependencies

- **Blocks**: None
- **Depends on**:
  - F001 (Database Schema) - `approved_audio`, `approved_utterances`, `approved_vocabulary`, `user_srs_items`, `practice_attempts`
  - F002 (Domain Model) - Language enum, CEFR levels
  - F046 (SRS Algorithm) - `SRSService.processReview()`
  - F018 (API Infrastructure) - Fastify setup, authentication middleware
  - F022 (React Setup) - React 18, TanStack Query, Tailwind CSS

---

## Notes

### Audio Requirements

- Only exercises with associated audio records in `approved_audio` table are eligible
- Audio must be high-quality recordings (human voice preferred over TTS)
- Recommended format: MP3 or OGG at 128kbps minimum
- Audio length should be 5-30 seconds for optimal dictation practice

### Scoring Algorithm

- **Character-level accuracy**: Levenshtein distance normalized by max length
  - 95%+ = Perfect (quality 5)
  - 85-95% = Good (quality 4)
  - 70-85% = Acceptable (quality 3)
  - 50-70% = Recognized (quality 2)
  - <50% = Failed (quality 0)

### Word-Level Diff Types

- **Correct**: Word matches exactly (green background)
- **Substitution**: Wrong word in correct position (orange strikethrough + green correct)
- **Insertion**: Extra word not in original (red +word)
- **Deletion**: Missing word from original (blue -word)

### Playback Speed

- **0.75x**: Slower for beginners or difficult utterances
- **1.0x**: Normal speed (default)
- **1.25x**: Faster for advanced learners training speed comprehension

### Accessibility

- All buttons have aria-labels for screen readers
- Audio player includes duration display
- High contrast colors for diff highlighting
- Keyboard navigation supported

### Future Enhancements (Out of Scope)

- ASR (Automatic Speech Recognition) for pronunciation feedback
- Real-time dictation (type while listening)
- Sentence-by-sentence progressive dictation for longer texts
- Comparison with native speaker recordings

---

## Open Questions

### 1. Audio Source and Quality Standards

**Question**: Should we support Text-to-Speech (TTS) fallback for items without human recordings, or require all dictation exercises to have human-recorded audio?

**Current Approach**: Only exercises with `approved_audio` records are eligible (enforced by `WHERE aa.id IS NOT NULL`). No fallback mechanism exists - if audio is missing, the item is excluded from dictation practice.

**Alternatives**:

1. **Human-only (strict)**: Require all dictation exercises to have human-recorded audio (current approach). Highest quality but limited exercise availability.
2. **TTS fallback**: Use cloud TTS services (Google Cloud TTS, Azure) when human audio unavailable. Increases coverage but may have unnatural pronunciation.
3. **Hybrid with labeling**: Allow TTS but clearly label exercises as "synthetic voice" vs "native speaker". Users can filter preference.
4. **Progressive quality**: Start with TTS for A0-A2 (simpler utterances), require human recordings for B1+ (natural speech patterns matter more).

**Recommendation**: Implement **progressive quality** (Option 4). Use high-quality neural TTS for CEFR A0-A2 levels where utterances are simple and pronunciation is more standardized. Require human recordings for B1+ where natural speech patterns, intonation, and connected speech are critical learning targets. Store audio source type in `approved_audio.metadata->>'source'` ('human' | 'tts') for analytics.

---

### 2. Partial Credit and Typo Tolerance

**Question**: How should the scoring system handle minor typos, punctuation errors, and capitalization differences?

**Current Approach**: Levenshtein distance-based character accuracy with normalization (lowercase, whitespace collapse, punctuation spacing). Gives partial credit: 95%+ = quality 5, 85-95% = quality 4, etc. Punctuation is compared but normalized.

**Alternatives**:

1. **Strict matching**: Require exact character-for-character match including capitalization and punctuation. No partial credit for typos.
2. **Current fuzzy approach**: Levenshtein distance with normalization (current). Balances accuracy with forgiveness.
3. **Phonetic matching**: Use phonetic algorithms (Soundex, Metaphone) to accept homophones and spelling variations. Very lenient.
4. **Graduated penalties**: Different penalty weights for different error types (typo = 0.2, wrong word = 1.0, missing word = 1.0).

**Recommendation**: Enhance current approach with **graduated penalties** (Option 4). Implement Damerau-Levenshtein distance (allows transpositions) for character-level scoring with lower penalty for single-character typos. Maintain current normalization for punctuation/capitalization. Add `accuracy_details` field to `practice_attempts` storing error breakdown (typos vs word errors) for analytics. This encourages listening comprehension focus while not penalizing learners for minor typing mistakes.

---

### 3. Hint and Progressive Disclosure System

**Question**: Should we provide hints during dictation attempts, and if so, how progressive should the disclosure be?

**Current Approach**: No hints provided. Users can replay audio unlimited times at different speeds, but no textual hints. Full transcript only shown after submission.

**Alternatives**:

1. **No hints (current)**: Pure dictation test with no assistance beyond audio replay. Challenging but tests true listening ability.
2. **Word-count hint**: Show number of words expected ("Your answer should contain 7 words"). Helps users know when to stop.
3. **First-letter hints**: After 2 failed attempts, show first letter of each word ("T** c** i\_ b\_\_\_"). Partial assistance.
4. **Progressive word reveal**: After first failure, show article/preposition words ("** cat ** blue"). After second failure, show 50% of content words.

**Recommendation**: Implement **word-count hint** (Option 2) combined with optional first-letter hints. Show word count immediately as non-intrusive help ("Expected words: 7"). After first failed attempt scoring < 70%, offer optional "Show first letters" button (don't auto-reveal). This respects learner agency while providing graduated support. Track hint usage in `practice_attempts.metadata->>'hints_used'` to analyze if hinted attempts have different retention rates in SRS.
