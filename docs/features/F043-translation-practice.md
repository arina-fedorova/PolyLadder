# F043: Translation Practice (Between Studied Languages)

**Feature Code**: F043
**Created**: 2025-12-17
**Phase**: 12 - Practice Modes
**Status**: Not Started

---

## Description

Implement translation exercises between studied languages (not just base language). This practice mode enables bidirectional translation between any language pair the user is studying, supporting parallel language learning. The system accepts multiple valid translations with fuzzy matching and provides context-aware feedback showing alternative acceptable translations.

## Success Criteria

- [ ] Sentence in language A, translate to language B (any language pair combination)
- [ ] Multiple valid translations accepted and stored per exercise
- [ ] Fuzzy matching with semantic similarity scoring
- [ ] Language pair selection (user chooses source and target languages)
- [ ] Show alternative valid translations after submission
- [ ] SRS integration based on translation accuracy
- [ ] Hint system showing partial translation or word-by-word hints

---

## Tasks

### Task 1: Create Translation Exercise Service

**File**: `packages/api/src/services/practice/translation.service.ts`

Create backend service that:
- Fetches translation exercises from SRS queue for specified language pair
- Validates submitted translations against multiple acceptable answers
- Uses fuzzy matching with configurable threshold
- Calculates semantic similarity score
- Updates SRS based on translation quality
- Generates hints (word-by-word, partial translation)

**Implementation**:

```typescript
// packages/api/src/services/practice/translation.service.ts
import { Pool } from 'pg';
import { SRSService } from '../srs/srs.service';

interface TranslationExercise {
  id: string;
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
  acceptableTranslations: string[]; // Multiple valid translations
  contextNotes?: string; // Optional context explaining translation nuances
  srsItemId: string;
  cefrLevel: string;
}

interface TranslationResult {
  isCorrect: boolean;
  similarity: number; // 0.0 to 1.0
  matchedTranslation?: string; // Which acceptable translation was closest
  alternativeTranslations: string[]; // Other valid translations
  feedback: string;
}

export class TranslationService {
  constructor(
    private pool: Pool,
    private srsService: SRSService
  ) {}

  /**
   * Fetch translation exercises for specified language pair
   * Only returns items that user is currently studying in both languages
   */
  async getTranslationExercises(
    userId: string,
    sourceLanguage: string,
    targetLanguage: string,
    limit: number = 10
  ): Promise<TranslationExercise[]> {
    // Verify user is studying both languages
    const languagesResult = await this.pool.query(
      `SELECT language FROM user_language_progress
       WHERE user_id = $1 AND language IN ($2, $3)`,
      [userId, sourceLanguage, targetLanguage]
    );

    if (languagesResult.rows.length < 2) {
      throw new Error(
        `User must be studying both ${sourceLanguage} and ${targetLanguage} for translation practice`
      );
    }

    // Fetch translation exercises from SRS queue
    const result = await this.pool.query(
      `SELECT
         te.id AS exercise_id,
         au_source.utterance_text AS source_text,
         au_source.language AS source_language,
         te.target_language,
         te.acceptable_translations,
         te.context_notes,
         usi.id AS srs_item_id,
         au_source.cefr_level
       FROM user_srs_items usi
       JOIN approved_utterances au_source ON usi.utterance_id = au_source.id
       JOIN translation_exercises te ON te.source_utterance_id = au_source.id
       WHERE usi.user_id = $1
         AND au_source.language = $2
         AND te.target_language = $3
         AND usi.next_review_date <= NOW()
       ORDER BY usi.next_review_date ASC
       LIMIT $4`,
      [userId, sourceLanguage, targetLanguage, limit]
    );

    return result.rows.map(row => ({
      id: row.exercise_id,
      sourceText: row.source_text,
      sourceLanguage: row.source_language,
      targetLanguage: row.target_language,
      acceptableTranslations: row.acceptable_translations, // JSONB array
      contextNotes: row.context_notes,
      srsItemId: row.srs_item_id,
      cefrLevel: row.cefr_level
    }));
  }

  /**
   * Validate user's translation submission
   * Checks against all acceptable translations with fuzzy matching
   */
  async validateTranslation(
    exerciseId: string,
    userTranslation: string,
    acceptableTranslations: string[],
    srsItemId: string,
    userId: string
  ): Promise<TranslationResult> {
    const normalized = this.normalizeText(userTranslation);

    let bestMatch: { translation: string; similarity: number } | null = null;

    // Compare against all acceptable translations
    for (const acceptable of acceptableTranslations) {
      const acceptableNormalized = this.normalizeText(acceptable);
      const similarity = this.calculateSimilarity(normalized, acceptableNormalized);

      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { translation: acceptable, similarity };
      }

      // Early exit if exact match
      if (similarity >= 0.99) {
        break;
      }
    }

    const similarity = bestMatch?.similarity || 0;
    const isCorrect = similarity >= 0.85; // 85% threshold for correctness

    // Determine SRS quality based on similarity
    const quality = this.similarityToQuality(similarity);

    // Update SRS schedule
    await this.srsService.processReview(srsItemId, userId, quality);

    // Record attempt
    await this.pool.query(
      `INSERT INTO practice_attempts
         (user_id, srs_item_id, practice_type, user_answer, is_correct, accuracy, created_at)
       VALUES ($1, $2, 'translation', $3, $4, $5, NOW())`,
      [userId, srsItemId, userTranslation, isCorrect, similarity]
    );

    // Generate feedback
    let feedback: string;
    if (similarity >= 0.95) {
      feedback = '✓ Perfect translation!';
    } else if (similarity >= 0.85) {
      feedback = '✓ Correct! Minor differences in phrasing.';
    } else if (similarity >= 0.70) {
      feedback = '✗ Close, but not quite accurate.';
    } else if (similarity >= 0.50) {
      feedback = '✗ Partially correct, but significant errors.';
    } else {
      feedback = '✗ Incorrect translation.';
    }

    return {
      isCorrect,
      similarity,
      matchedTranslation: bestMatch?.translation,
      alternativeTranslations: acceptableTranslations,
      feedback
    };
  }

  /**
   * Generate hints for translation exercise
   * Progressively reveals more information
   */
  async generateHint(
    exerciseId: string,
    sourceText: string,
    targetLanguage: string,
    hintLevel: number // 1, 2, or 3
  ): Promise<string> {
    if (hintLevel === 1) {
      // Hint 1: Show first word of translation
      const result = await this.pool.query(
        `SELECT acceptable_translations[1] AS first_translation
         FROM translation_exercises
         WHERE id = $1`,
        [exerciseId]
      );

      const firstTranslation = result.rows[0]?.first_translation || '';
      const firstWord = firstTranslation.split(' ')[0];
      return `First word: "${firstWord}"`;
    } else if (hintLevel === 2) {
      // Hint 2: Show word count
      const result = await this.pool.query(
        `SELECT acceptable_translations[1] AS first_translation
         FROM translation_exercises
         WHERE id = $1`,
        [exerciseId]
      );

      const firstTranslation = result.rows[0]?.first_translation || '';
      const wordCount = firstTranslation.split(' ').length;
      return `Translation has ${wordCount} words`;
    } else {
      // Hint 3: Show partial translation (first half)
      const result = await this.pool.query(
        `SELECT acceptable_translations[1] AS first_translation
         FROM translation_exercises
         WHERE id = $1`,
        [exerciseId]
      );

      const firstTranslation = result.rows[0]?.first_translation || '';
      const words = firstTranslation.split(' ');
      const halfLength = Math.ceil(words.length / 2);
      const partial = words.slice(0, halfLength).join(' ');
      return `First half: "${partial}..."`;
    }
  }

  /**
   * Normalize text for comparison
   */
  private normalizeText(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.!?,;:]+\s*/g, '') // Remove punctuation
      .replace(/["'«»""'']/g, ''); // Remove quotes
  }

  /**
   * Calculate similarity using Levenshtein distance
   * Normalized to 0.0-1.0 range
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);

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
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Convert similarity to SRS quality rating
   */
  private similarityToQuality(similarity: number): number {
    if (similarity >= 0.95) return 5; // Perfect
    if (similarity >= 0.85) return 4; // Good
    if (similarity >= 0.70) return 3; // Acceptable
    if (similarity >= 0.50) return 2; // Struggled
    return 0; // Failed
  }
}
```

**Database Schema Addition**:

```sql
-- Translation exercises table
CREATE TABLE translation_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_utterance_id UUID REFERENCES approved_utterances(id) NOT NULL,
  target_language VARCHAR(20) NOT NULL,
  acceptable_translations TEXT[] NOT NULL, -- Multiple valid translations
  context_notes TEXT, -- Optional explanation of translation nuances
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_translation_exercises_source ON translation_exercises(source_utterance_id);
CREATE INDEX idx_translation_exercises_target_lang ON translation_exercises(target_language);
```

**Open Questions**:
1. **Semantic Similarity Engine**: Should we integrate an NLP library (e.g., sentence-transformers, spaCy) for semantic similarity instead of just Levenshtein distance? This would better handle paraphrases but adds significant complexity and dependencies.
2. **Translation Crowdsourcing**: Should we allow users to suggest alternative translations when they believe their answer is correct? This would improve translation coverage over time but requires moderation.
3. **Back-Translation Validation**: Should we implement back-translation (translate result back to source language) to validate semantic accuracy? This would require integration with translation APIs (DeepL, Google Translate).

---

### Task 2: Create Translation API Endpoints

**File**: `packages/api/src/routes/practice/translation.ts`

Add REST endpoints for:
- GET `/practice/translation/exercises` - Fetch exercises for language pair
- POST `/practice/translation/submit` - Submit and validate translation
- GET `/practice/translation/hint/:exerciseId` - Get progressive hints

**Implementation**:

```typescript
// packages/api/src/routes/practice/translation.ts
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { TranslationService } from '../../services/practice/translation.service';

const GetTranslationExercisesSchema = z.object({
  sourceLanguage: z.enum(['russian', 'chinese', 'arabic']),
  targetLanguage: z.enum(['russian', 'chinese', 'arabic']),
  limit: z.coerce.number().int().min(1).max(50).default(10)
});

const SubmitTranslationSchema = z.object({
  exerciseId: z.string().uuid(),
  userTranslation: z.string().min(1).max(500),
  acceptableTranslations: z.array(z.string()),
  srsItemId: z.string().uuid()
});

const GetHintSchema = z.object({
  exerciseId: z.string().uuid(),
  hintLevel: z.coerce.number().int().min(1).max(3)
});

const translationRoutes: FastifyPluginAsync = async (fastify) => {
  const translationService = new TranslationService(
    fastify.db.pool,
    fastify.srsService
  );

  /**
   * GET /practice/translation/exercises
   * Fetch translation exercises for specified language pair
   */
  fastify.get(
    '/exercises',
    {
      onRequest: [fastify.authenticate],
      schema: {
        querystring: GetTranslationExercisesSchema,
        response: {
          200: z.object({
            exercises: z.array(z.object({
              id: z.string().uuid(),
              sourceText: z.string(),
              sourceLanguage: z.string(),
              targetLanguage: z.string(),
              acceptableTranslations: z.array(z.string()),
              contextNotes: z.string().optional(),
              srsItemId: z.string().uuid(),
              cefrLevel: z.string()
            }))
          })
        }
      }
    },
    async (request, reply) => {
      const { sourceLanguage, targetLanguage, limit } =
        GetTranslationExercisesSchema.parse(request.query);
      const userId = request.user.userId;

      if (sourceLanguage === targetLanguage) {
        return reply.status(400).send({
          error: 'Source and target languages must be different'
        });
      }

      const exercises = await translationService.getTranslationExercises(
        userId,
        sourceLanguage,
        targetLanguage,
        limit
      );

      return reply.send({ exercises });
    }
  );

  /**
   * POST /practice/translation/submit
   * Submit translation answer for validation
   */
  fastify.post(
    '/submit',
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: SubmitTranslationSchema,
        response: {
          200: z.object({
            isCorrect: z.boolean(),
            similarity: z.number(),
            matchedTranslation: z.string().optional(),
            alternativeTranslations: z.array(z.string()),
            feedback: z.string()
          })
        }
      }
    },
    async (request, reply) => {
      const { exerciseId, userTranslation, acceptableTranslations, srsItemId } =
        SubmitTranslationSchema.parse(request.body);
      const userId = request.user.userId;

      const result = await translationService.validateTranslation(
        exerciseId,
        userTranslation,
        acceptableTranslations,
        srsItemId,
        userId
      );

      return reply.send(result);
    }
  );

  /**
   * GET /practice/translation/hint/:exerciseId
   * Get progressive hint for translation exercise
   */
  fastify.get(
    '/hint/:exerciseId',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: z.object({
          exerciseId: z.string().uuid()
        }),
        querystring: z.object({
          hintLevel: z.coerce.number().int().min(1).max(3)
        }),
        response: {
          200: z.object({
            hint: z.string()
          })
        }
      }
    },
    async (request, reply) => {
      const { exerciseId } = request.params as { exerciseId: string };
      const { hintLevel } = GetHintSchema.parse(request.query);
      const userId = request.user.userId;

      // Fetch exercise to get source text and target language
      const exerciseResult = await fastify.db.pool.query(
        `SELECT au.utterance_text, te.target_language
         FROM translation_exercises te
         JOIN approved_utterances au ON te.source_utterance_id = au.id
         WHERE te.id = $1`,
        [exerciseId]
      );

      if (exerciseResult.rows.length === 0) {
        return reply.status(404).send({ error: 'Exercise not found' });
      }

      const { utterance_text, target_language } = exerciseResult.rows[0];

      const hint = await translationService.generateHint(
        exerciseId,
        utterance_text,
        target_language,
        hintLevel
      );

      return reply.send({ hint });
    }
  );
};

export default translationRoutes;
```

**Integration**: Register in `packages/api/src/routes/practice/index.ts`:

```typescript
import translationRoutes from './translation';

export const practiceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(recallRoutes, { prefix: '/recall' });
  fastify.register(recognitionRoutes, { prefix: '/recognition' });
  fastify.register(clozeRoutes, { prefix: '/cloze' });
  fastify.register(dictationRoutes, { prefix: '/dictation' });
  fastify.register(translationRoutes, { prefix: '/translation' }); // NEW
};
```

**Open Questions**:
1. **Language Pair Availability**: How should we handle cases where user is studying 3+ languages? Should we auto-generate all possible language pair combinations (N×(N-1) pairs), or only generate pairs that operators explicitly approve?
2. **Bidirectional Exercises**: Should A→B translation and B→A translation be separate exercises or automatically generated mirror exercises? Mirror exercises would double practice opportunities but may have different difficulty levels.
3. **Rate Limiting for Hints**: Should we limit how many hints a user can request per exercise (e.g., max 3 hints, unlocked progressively after failed attempts)? This prevents hint abuse but may frustrate learners.

---

### Task 3: Create Translation React Component

**File**: `packages/web/src/components/practice/TranslationPractice.tsx`

Create UI component with:
- Language pair selector (source → target)
- Source text display with CEFR level badge
- Large text area for translation input
- Hint button with progressive levels (unlocks after 1 failed attempt)
- Submit button with validation
- Result display showing similarity score and alternative translations
- Context notes display (if available)

**Implementation**:

```tsx
// packages/web/src/components/practice/TranslationPractice.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

interface TranslationExercise {
  id: string;
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
  acceptableTranslations: string[];
  contextNotes?: string;
  srsItemId: string;
  cefrLevel: string;
}

interface TranslationResult {
  isCorrect: boolean;
  similarity: number;
  matchedTranslation?: string;
  alternativeTranslations: string[];
  feedback: string;
}

interface Props {
  exercise: TranslationExercise;
  onComplete: () => void;
}

const LANGUAGE_NAMES: Record<string, string> = {
  russian: 'Russian',
  chinese: 'Chinese',
  arabic: 'Arabic',
  english: 'English'
};

export const TranslationPractice: React.FC<Props> = ({ exercise, onComplete }) => {
  const [userTranslation, setUserTranslation] = useState('');
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [currentHint, setCurrentHint] = useState<string>('');
  const [failedAttempts, setFailedAttempts] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Auto-focus textarea on mount
    textareaRef.current?.focus();
  }, []);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/practice/translation/submit', {
        exerciseId: exercise.id,
        userTranslation,
        acceptableTranslations: exercise.acceptableTranslations,
        srsItemId: exercise.srsItemId
      });
      return response.data;
    },
    onSuccess: (data: TranslationResult) => {
      setResult(data);
      if (!data.isCorrect) {
        setFailedAttempts(prev => prev + 1);
      }
    }
  });

  const hintMutation = useMutation({
    mutationFn: async (level: number) => {
      const response = await apiClient.get(
        `/practice/translation/hint/${exercise.id}?hintLevel=${level}`
      );
      return response.data;
    },
    onSuccess: (data: { hint: string }) => {
      setCurrentHint(data.hint);
    }
  });

  const handleSubmit = () => {
    if (!userTranslation.trim()) return;
    submitMutation.mutate();
  };

  const handleTryAgain = () => {
    setUserTranslation('');
    setResult(null);
    textareaRef.current?.focus();
  };

  const handleRequestHint = () => {
    const nextLevel = hintLevel + 1;
    if (nextLevel <= 3) {
      setHintLevel(nextLevel);
      hintMutation.mutate(nextLevel);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Ctrl+Enter
    if (e.ctrlKey && e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">Translation Exercise</h3>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="px-2 py-1 bg-blue-100 rounded">
                {LANGUAGE_NAMES[exercise.sourceLanguage]}
              </span>
              <span>→</span>
              <span className="px-2 py-1 bg-green-100 rounded">
                {LANGUAGE_NAMES[exercise.targetLanguage]}
              </span>
            </div>
          </div>
          <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded">
            {exercise.cefrLevel}
          </span>
        </div>

        {/* Source Text */}
        <div className="bg-blue-50 p-6 rounded-lg mb-6">
          <div className="text-sm font-semibold text-gray-600 mb-2">
            Translate from {LANGUAGE_NAMES[exercise.sourceLanguage]}:
          </div>
          <div className="text-xl text-gray-900 leading-relaxed">
            {exercise.sourceText}
          </div>
        </div>

        {/* Context Notes */}
        {exercise.contextNotes && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
            <div className="flex items-start">
              <span className="text-yellow-600 mr-2">💡</span>
              <div className="text-sm text-gray-700">{exercise.contextNotes}</div>
            </div>
          </div>
        )}

        {/* Translation Input */}
        {result === null && (
          <div className="space-y-3">
            <label htmlFor="translation-input" className="block text-sm font-medium text-gray-700">
              Your translation in {LANGUAGE_NAMES[exercise.targetLanguage]}:
            </label>
            <textarea
              ref={textareaRef}
              id="translation-input"
              value={userTranslation}
              onChange={(e) => setUserTranslation(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your translation here..."
              className="w-full h-32 px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 resize-none text-lg"
            />

            {/* Hint Display */}
            {currentHint && (
              <div className="bg-purple-50 border-l-4 border-purple-400 p-3">
                <div className="text-sm text-purple-900">
                  <strong>Hint {hintLevel}:</strong> {currentHint}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center">
              <div className="flex gap-2">
                <button
                  onClick={handleRequestHint}
                  disabled={hintLevel >= 3 || failedAttempts === 0}
                  className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                  title={failedAttempts === 0 ? "Try submitting first to unlock hints" : ""}
                >
                  💡 Hint {hintLevel > 0 ? `(${hintLevel}/3)` : ''}
                </button>
                <span className="text-xs text-gray-500 self-center">
                  {userTranslation.length} characters
                </span>
              </div>

              <div className="flex gap-2">
                <span className="text-xs text-gray-500 self-center">
                  Ctrl+Enter to submit
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={!userTranslation.trim() || submitMutation.isPending}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold transition-colors"
                >
                  {submitMutation.isPending ? 'Checking...' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Result Display */}
        {result && (
          <div className="space-y-4">
            <div className={`p-4 rounded-lg ${result.isCorrect ? 'bg-green-50' : 'bg-orange-50'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-lg font-semibold">
                  {result.isCorrect ? '✓ Correct!' : '✗ Not quite right'}
                </div>
                <div className="text-sm">
                  <span className="font-semibold">Similarity:</span>{' '}
                  <span className={result.similarity >= 0.85 ? 'text-green-600' : 'text-orange-600'}>
                    {(result.similarity * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="text-sm text-gray-700 mb-3">{result.feedback}</div>

              {/* User's Answer */}
              <div className="bg-white p-3 rounded border border-gray-200 mb-3">
                <div className="text-xs font-semibold text-gray-600 mb-1">Your translation:</div>
                <div className="text-gray-900">{userTranslation}</div>
              </div>

              {/* Matched Translation */}
              {result.matchedTranslation && (
                <div className="bg-white p-3 rounded border border-green-300 mb-3">
                  <div className="text-xs font-semibold text-green-700 mb-1">
                    Closest acceptable translation:
                  </div>
                  <div className="text-gray-900">{result.matchedTranslation}</div>
                </div>
              )}

              {/* Alternative Translations */}
              {result.alternativeTranslations.length > 1 && (
                <div className="bg-white p-3 rounded border border-blue-300">
                  <div className="text-xs font-semibold text-blue-700 mb-2">
                    Other acceptable translations:
                  </div>
                  <ul className="space-y-1">
                    {result.alternativeTranslations
                      .filter(t => t !== result.matchedTranslation)
                      .map((translation, idx) => (
                        <li key={idx} className="text-sm text-gray-700 pl-4 relative">
                          <span className="absolute left-0">•</span>
                          {translation}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
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
          <li>Translate the sentence into {LANGUAGE_NAMES[exercise.targetLanguage]}</li>
          <li>Multiple valid translations are accepted</li>
          <li>Focus on meaning, not word-for-word translation</li>
          <li>Minor spelling/grammar errors are tolerated</li>
          <li>Use hints if you get stuck (available after first attempt)</li>
          <li>Press Ctrl+Enter to submit quickly</li>
        </ul>
      </div>
    </div>
  );
};
```

**Integration**: Add to practice mode router in `packages/web/src/pages/PracticeModePage.tsx`:

```tsx
import { TranslationPractice } from '../components/practice/TranslationPractice';

// In practice mode selector:
case 'translation':
  return <TranslationPractice exercise={currentExercise} onComplete={loadNextExercise} />;
```

**Language Pair Selector Component**:

```tsx
// packages/web/src/components/practice/LanguagePairSelector.tsx
import React from 'react';

interface Props {
  availableLanguages: string[];
  sourceLanguage: string;
  targetLanguage: string;
  onSourceChange: (lang: string) => void;
  onTargetChange: (lang: string) => void;
}

export const LanguagePairSelector: React.FC<Props> = ({
  availableLanguages,
  sourceLanguage,
  targetLanguage,
  onSourceChange,
  onTargetChange
}) => {
  const LANGUAGE_NAMES: Record<string, string> = {
    russian: 'Russian',
    chinese: 'Chinese',
    arabic: 'Arabic',
    english: 'English'
  };

  return (
    <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
      <div className="flex-1">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Translate from:
        </label>
        <select
          value={sourceLanguage}
          onChange={(e) => onSourceChange(e.target.value)}
          className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
        >
          {availableLanguages.map(lang => (
            <option key={lang} value={lang} disabled={lang === targetLanguage}>
              {LANGUAGE_NAMES[lang]}
            </option>
          ))}
        </select>
      </div>

      <div className="text-2xl text-gray-400 mt-6">→</div>

      <div className="flex-1">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Translate to:
        </label>
        <select
          value={targetLanguage}
          onChange={(e) => onTargetChange(e.target.value)}
          className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
        >
          {availableLanguages.map(lang => (
            <option key={lang} value={lang} disabled={lang === sourceLanguage}>
              {LANGUAGE_NAMES[lang]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
```

**Open Questions**:
1. **Language Detection**: Should we add automatic language detection to warn users if they accidentally typed in the wrong language? This would prevent common mistakes but requires additional libraries.
2. **Voice Input**: Should we support voice input for translation (especially useful for non-Latin scripts like Arabic, Chinese)? This would improve accessibility but adds complexity with browser API permissions.
3. **Translation History**: Should we show users their previous translation attempts for the same exercise? This would help learners see their progress but increases UI complexity.

---

## Dependencies

- **Blocks**: None
- **Depends on**:
  - F001 (Database Schema) - `approved_utterances`, `user_srs_items`, `practice_attempts`
  - F002 (Domain Model) - Language enum, CEFR levels
  - F046 (SRS Algorithm) - `SRSService.processReview()`
  - F018 (API Infrastructure) - Fastify setup, authentication middleware
  - F022 (React Setup) - React 18, TanStack Query, Tailwind CSS
  - F048 (Comparative Grammar) - Useful for parallel learning context (soft dependency)

---

## Notes

### Translation Validation Strategy
- **Primary**: Levenshtein distance-based fuzzy matching (85% threshold for correctness)
- **Future**: Consider semantic similarity using sentence embeddings for better paraphrase detection
- **Multiple answers**: All acceptable translations stored in JSONB array in database

### Language Pair Combinations
For a user studying N languages, there are N×(N-1) possible directed translation pairs:
- 2 languages: 2 pairs (A→B, B→A)
- 3 languages: 6 pairs (A→B, A→C, B→A, B→C, C→A, C→B)
- 4 languages: 12 pairs (grows quadratically)

### Hint System
- **Hint 1** (after 1st failed attempt): First word of translation
- **Hint 2** (after 2nd failed attempt): Word count
- **Hint 3** (after 3rd failed attempt): First half of translation

### Similarity Scoring
- **95%+**: Perfect translation (quality 5)
- **85-95%**: Correct with minor phrasing differences (quality 4)
- **70-85%**: Close but not quite accurate (quality 3)
- **50-70%**: Partially correct (quality 2)
- **<50%**: Incorrect (quality 0)

### Context Notes
- Optional field explaining translation nuances (idioms, cultural context, formal vs informal)
- Helps learners understand why certain translations are preferred
- Example: "This phrase is informal; formal translation would be X"

### Accessibility
- Keyboard shortcut: Ctrl+Enter to submit
- Auto-focus on textarea for quick input
- High contrast colors for result feedback
- Clear visual distinction between source and target languages

### Future Enhancements (Out of Scope)
- Neural machine translation integration for automatic translation suggestions
- Translation quality estimation using BERT-based models
- Community voting on alternative translations
- Translation memory system to reuse common phrases
- Comparative analysis showing how different target languages express the same concept

---

## Open Questions

### 1. Acceptable Answer Variations Handling

**Question**: How should we determine and maintain the list of acceptable translations for each exercise - manual curation, algorithmic generation, or community contribution?

**Current Approach**: Acceptable translations stored as TEXT[] array in `translation_exercises.acceptable_translations`, presumably manually curated by operators. System uses Levenshtein distance (85% threshold) to match user input against all stored acceptable answers.

**Alternatives**:
1. **Manual curation only** (current): Operators manually add all acceptable variations. High quality but limited coverage and maintenance burden.
2. **NMT-generated candidates**: Use neural machine translation APIs (DeepL, Google Translate) to generate baseline translations, then manually review and approve. Faster setup but requires validation.
3. **Community contribution with voting**: Allow learners to submit alternative translations, community votes on acceptability. Crowdsourced coverage but requires moderation and quality control.
4. **Hybrid semantic matching**: Store 1-2 canonical translations, use sentence embedding similarity (BERT, sentence-transformers) to accept semantic equivalents. Most flexible but requires ML infrastructure.

**Recommendation**: Implement **NMT-generated candidates with manual review** (Option 2) for initial population, then layer **hybrid semantic matching** (Option 4) on top. Use DeepL API to generate 3-5 translation candidates, operators approve/edit to create `acceptable_translations`. Add semantic similarity check (cosine similarity on sentence embeddings) as fallback when Levenshtein distance fails. This balances coverage with quality. Store semantic embeddings in `translation_exercises.embeddings` JSONB field for efficient comparison.

---

### 2. Context Hints and Timing

**Question**: When should context notes be revealed - immediately with the exercise, after first attempt, or only on request?

**Current Approach**: Context notes (`translation_exercises.context_notes`) displayed immediately if available, shown in yellow box before user submits answer. Hints (first word, word count, partial translation) only available after failed attempts.

**Alternatives**:
1. **Immediate display** (current): Show context notes upfront. Helps learners understand nuances but may make exercise too easy.
2. **Post-attempt reveal**: Only show context notes after first submission, regardless of correctness. Learners must attempt translation without guidance first.
3. **On-demand**: Add "Show context" button that learners can click if confused. Tracks usage for analytics.
4. **Adaptive reveal**: For CEFR A0-A2, show immediately; for B1+, only show after attempt. Scaffolds beginners while challenging advanced learners.

**Recommendation**: Implement **adaptive reveal** (Option 4) with on-demand option. For A0-A2 exercises, show context notes immediately as scaffolding. For B1+ exercises, hide context notes initially but provide "Need context?" button. After first failed attempt, auto-reveal context notes. Track context note views in `practice_attempts.metadata->>'context_viewed'` to analyze correlation between context usage and success rates. This respects learner agency while providing appropriate support.

---

### 3. Bidirectional Translation and Reverse Exercises

**Question**: Should translation practice be bidirectional (A→B and B→A treated as separate exercises) or should we auto-generate reverse exercises?

**Current Approach**: Translation exercises are unidirectional - each record in `translation_exercises` has explicit `source_utterance_id` and `target_language`. A→B and B→A would require separate database records.

**Alternatives**:
1. **Unidirectional only** (current): Each translation pair requires separate database entry. Simple but doubles data entry work and may have inconsistent coverage.
2. **Auto-reverse generation**: Automatically create B→A exercise by swapping source and target. Zero additional data entry but assumes translations are perfectly symmetric (often false).
3. **Flagged reverse**: Add `has_reverse BOOLEAN` flag. Only generate reverse exercise if operator marks it as appropriate. Balances automation with accuracy.
4. **Separate reverse validation**: Generate reverse exercises automatically but require separate acceptable answer validation for each direction. Comprehensive but more maintenance.

**Recommendation**: Implement **flagged reverse with separate validation** (Option 3 + 4 hybrid). Add `bidirectional BOOLEAN DEFAULT false` column to `translation_exercises`. When true, automatically generate both A→B and B→A exercises, but store separate `acceptable_translations_reverse TEXT[]` array for the B→A direction. This acknowledges that translation is often asymmetric (idioms, cultural expressions translate differently in reverse). Operators can opt-in bidirectionality per exercise while maintaining translation quality in both directions.
