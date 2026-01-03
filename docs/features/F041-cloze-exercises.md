# F041: Cloze Exercises

**Feature Code**: F041
**Created**: 2025-12-17
**Phase**: 12 - Practice Modes
**Status**: Completed

---

## Description

Implement cloze (fill-in-the-blank) exercises for vocabulary and grammar practice in context. Cloze exercises are highly effective for language learning as they require active production (typing the word) while providing contextual support (the surrounding sentence). The system removes target words from authentic sentences, accepts typed answers with fuzzy matching for minor typos/accents, provides progressive hints (first letter → word length → part of speech), and tracks accuracy for SRS scheduling. Supports both vocabulary practice (learn word usage in context) and grammar practice (conjugations, articles, prepositions).

## Success Criteria

- [x] Sentence displayed with blank(s) where target word(s) removed
- [x] Text input for answer submission
- [x] Fuzzy matching tolerates accents, capitalization, minor typos
- [x] Immediate feedback with correct answer and explanation
- [x] Progressive hint system (first letter → word length → POS)
- [x] Audio playback of complete sentence
- [ ] Multiple blanks per sentence support (advanced) - deferred to v2
- [x] Partial credit for close answers (affects SRS scheduling)
- [x] Integration with SRS for optimal spacing
- [x] Track attempts per exercise for adaptive difficulty

---

## Tasks

### Task 1: Cloze Exercise Generation Service

**Implementation Plan**:

Create `packages/api/src/services/practice/cloze.service.ts`:

```typescript
import { Pool } from 'pg';
import { Language } from '@polyladder/core';

interface ClozeExercise {
  exerciseId: string;
  sentenceText: string; // With ___ for blanks
  correctAnswer: string;
  alternativeAnswers: string[]; // Acceptable variations
  blankPosition: number; // Character index of blank
  hint: {
    firstLetter: string;
    wordLength: number;
    partOfSpeech: string;
  };
  context: string | null;
  audioUrl: string | null;
  explanation: string;
  srsItemId: string | null;
}

export class ClozeExerciseService {
  constructor(private readonly pool: Pool) {}

  /**
   * Generate cloze exercises from SRS queue
   * Strategy: Take sentences with target vocabulary/grammar, blank out the target
   */
  async getClozeExercises(
    userId: string,
    language: Language,
    limit: number = 10
  ): Promise<ClozeExercise[]> {
    // Get vocabulary items due for review
    const srsItems = await this.pool.query<{
      id: string;
      vocabularyId: string | null;
    }>(
      `SELECT id, vocabulary_id as "vocabularyId"
       FROM user_srs_items
       WHERE user_id = $1
         AND language = $2
         AND vocabulary_id IS NOT NULL
         AND next_review_date <= NOW()
       ORDER BY next_review_date ASC
       LIMIT $3`,
      [userId, language, limit]
    );

    const exercises: ClozeExercise[] = [];

    for (const item of srsItems.rows) {
      if (item.vocabularyId) {
        const exercise = await this.generateVocabularyCloze(item.vocabularyId, item.id);
        if (exercise) exercises.push(exercise);
      }
    }

    return exercises;
  }

  /**
   * Generate cloze exercise from vocabulary word
   * Finds sentence containing the word, blanks it out
   */
  private async generateVocabularyCloze(
    vocabularyId: string,
    srsItemId: string
  ): Promise<ClozeExercise | null> {
    // Get word and a sentence using it
    const result = await this.pool.query<{
      wordText: string;
      sentenceText: string;
      translation: string | null;
      audioUrl: string | null;
      partOfSpeech: string;
      context: string | null;
    }>(
      `SELECT
        av.word_text as "wordText",
        au.sentence_text as "sentenceText",
        au.translation,
        au.audio_url as "audioUrl",
        av.part_of_speech as "partOfSpeech",
        au.context
       FROM approved_vocabulary av
       JOIN approved_utterances au ON au.vocabulary_id = av.id
       WHERE av.id = $1
       ORDER BY RANDOM()
       LIMIT 1`,
      [vocabularyId]
    );

    if (result.rows.length === 0) return null;

    const { wordText, sentenceText, translation, audioUrl, partOfSpeech, context } = result.rows[0];

    // Find word position in sentence (case-insensitive)
    const regex = new RegExp(`\\b${this.escapeRegex(wordText)}\\b`, 'i');
    const match = sentenceText.match(regex);

    if (!match || match.index === undefined) {
      // Word not found in sentence, skip
      return null;
    }

    const blankPosition = match.index;
    const actualWord = match[0]; // Preserves case from sentence

    // Create sentence with blank
    const sentenceWithBlank = sentenceText.replace(regex, '_____');

    // Generate alternative answers (different cases, with/without accents)
    const alternatives = this.generateAlternatives(wordText);

    return {
      exerciseId: `cloze_${vocabularyId}_${Date.now()}`,
      sentenceText: sentenceWithBlank,
      correctAnswer: actualWord,
      alternativeAnswers: alternatives,
      blankPosition,
      hint: {
        firstLetter: actualWord[0],
        wordLength: actualWord.length,
        partOfSpeech,
      },
      context,
      audioUrl,
      explanation: translation || '',
      srsItemId,
    };
  }

  /**
   * Generate acceptable alternative answers
   * (different capitalization, with/without accents)
   */
  private generateAlternatives(word: string): string[] {
    const alternatives = new Set<string>();

    // Add lowercase version
    alternatives.add(word.toLowerCase());

    // Add capitalized version
    alternatives.add(word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

    // Add uppercase version
    alternatives.add(word.toUpperCase());

    // Add version without accents
    const withoutAccents = word
      .replace(/[áàäâ]/gi, 'a')
      .replace(/[éèëê]/gi, 'e')
      .replace(/[íìïî]/gi, 'i')
      .replace(/[óòöô]/gi, 'o')
      .replace(/[úùüû]/gi, 'u')
      .replace(/[ñ]/gi, 'n')
      .replace(/[ç]/gi, 'c');

    alternatives.add(withoutAccents);
    alternatives.add(withoutAccents.toLowerCase());

    return Array.from(alternatives);
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Validate user answer with fuzzy matching
   */
  async validateClozeAnswer(
    exerciseId: string,
    userAnswer: string,
    correctAnswer: string,
    alternativeAnswers: string[],
    srsItemId: string | null,
    userId: string
  ): Promise<{
    isCorrect: boolean;
    similarity: number;
    feedback: string;
    correctAnswer: string;
  }> {
    const trimmedAnswer = userAnswer.trim();

    // Exact match (case-insensitive)
    if (trimmedAnswer.toLowerCase() === correctAnswer.toLowerCase()) {
      await this.updateSRS(srsItemId, userId, 5); // Perfect
      return {
        isCorrect: true,
        similarity: 1.0,
        feedback: '✓ Perfect!',
        correctAnswer,
      };
    }

    // Check alternatives
    if (alternativeAnswers.some((alt) => alt.toLowerCase() === trimmedAnswer.toLowerCase())) {
      await this.updateSRS(srsItemId, userId, 5); // Perfect
      return {
        isCorrect: true,
        similarity: 1.0,
        feedback: '✓ Correct!',
        correctAnswer,
      };
    }

    // Fuzzy matching - check similarity
    const similarity = this.calculateSimilarity(trimmedAnswer, correctAnswer);

    if (similarity >= 0.9) {
      // Very close - accept with note
      await this.updateSRS(srsItemId, userId, 4); // Good
      return {
        isCorrect: true,
        similarity,
        feedback: '✓ Correct! (minor spelling difference)',
        correctAnswer,
      };
    } else if (similarity >= 0.7) {
      // Close but not quite
      await this.updateSRS(srsItemId, userId, 2); // Hard
      return {
        isCorrect: false,
        similarity,
        feedback: `✗ Close! The correct answer is "${correctAnswer}". You wrote "${trimmedAnswer}".`,
        correctAnswer,
      };
    } else {
      // Wrong answer
      await this.updateSRS(srsItemId, userId, 0); // Again
      return {
        isCorrect: false,
        similarity,
        feedback: `✗ Incorrect. The correct answer is "${correctAnswer}".`,
        correctAnswer,
      };
    }
  }

  /**
   * Calculate string similarity (Levenshtein-based)
   */
  private calculateSimilarity(a: string, b: string): number {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[áàäâ]/g, 'a')
        .replace(/[éèëê]/g, 'e')
        .replace(/[íìïî]/g, 'i')
        .replace(/[óòöô]/g, 'o')
        .replace(/[úùüû]/g, 'u');

    const normA = normalize(a);
    const normB = normalize(b);

    const distance = this.levenshteinDistance(normA, normB);
    const maxLength = Math.max(normA.length, normB.length);

    return 1 - distance / maxLength;
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
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Update SRS based on answer quality
   */
  private async updateSRS(
    srsItemId: string | null,
    userId: string,
    quality: number
  ): Promise<void> {
    if (!srsItemId) return;

    // Get current SRS data
    const itemResult = await this.pool.query<{
      interval: number;
      easeFactor: number;
      reviewCount: number;
    }>(
      `SELECT interval, ease_factor as "easeFactor", review_count as "reviewCount"
       FROM user_srs_items
       WHERE id = $1 AND user_id = $2`,
      [srsItemId, userId]
    );

    if (itemResult.rows.length === 0) return;

    const item = itemResult.rows[0];

    // Calculate new interval and EF using SM-2 algorithm
    // (Simplified - should use SRSService)
    let newEF = item.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (newEF < 1.3) newEF = 1.3;

    let newInterval: number;
    if (quality < 3) {
      newInterval = 0; // Review again soon
    } else if (item.reviewCount === 0) {
      newInterval = 1;
    } else if (item.reviewCount === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(item.interval * newEF);
    }

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);

    // Update SRS item
    await this.pool.query(
      `UPDATE user_srs_items
       SET interval = $3,
           ease_factor = $4,
           next_review_date = $5,
           last_reviewed_at = NOW(),
           review_count = review_count + 1
       WHERE id = $1 AND user_id = $2`,
      [srsItemId, userId, newInterval, newEF, nextReviewDate]
    );
  }
}
```

**Files Created**:

- `packages/api/src/services/practice/cloze.service.ts`

**Technical Features**:

- **Word Extraction**: Finds target word in sentence, replaces with blank
- **Fuzzy Matching**: Levenshtein distance for typo tolerance
- **Alternative Answers**: Accepts different capitalizations and accent variations
- **Progressive Hints**: First letter, word length, part of speech
- **SRS Integration**: Updates scheduling based on answer quality

---

### Task 2: API Endpoints for Cloze Exercises

**Implementation Plan**:

Create `packages/api/src/routes/practice/cloze.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Language } from '@polyladder/core';
import { ClozeExerciseService } from '../../services/practice/cloze.service';
import { authMiddleware } from '../../middleware/auth';

const ClozeQueueSchema = z.object({
  language: z.nativeEnum(Language),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

const SubmitClozeSchema = z.object({
  exerciseId: z.string(),
  userAnswer: z.string().min(1).max(100),
  correctAnswer: z.string(),
  alternativeAnswers: z.array(z.string()),
  srsItemId: z.string().uuid().nullable(),
});

export const clozeExerciseRoutes: FastifyPluginAsync = async (fastify) => {
  const clozeService = new ClozeExerciseService(fastify.pg.pool);

  /**
   * GET /practice/cloze/exercises
   * Get cloze exercises for practice
   */
  fastify.get(
    '/practice/cloze/exercises',
    {
      preHandler: authMiddleware,
      schema: {
        querystring: ClozeQueueSchema,
      },
    },
    async (request, reply) => {
      const { language, limit } = ClozeQueueSchema.parse(request.query);
      const userId = request.user!.userId;

      const exercises = await clozeService.getClozeExercises(userId, language, limit);

      return reply.status(200).send({ exercises });
    }
  );

  /**
   * POST /practice/cloze/submit
   * Submit cloze answer for validation
   */
  fastify.post(
    '/practice/cloze/submit',
    {
      preHandler: authMiddleware,
      schema: {
        body: SubmitClozeSchema,
      },
    },
    async (request, reply) => {
      const { exerciseId, userAnswer, correctAnswer, alternativeAnswers, srsItemId } =
        SubmitClozeSchema.parse(request.body);
      const userId = request.user!.userId;

      const result = await clozeService.validateClozeAnswer(
        exerciseId,
        userAnswer,
        correctAnswer,
        alternativeAnswers,
        srsItemId,
        userId
      );

      return reply.status(200).send({ result });
    }
  );
};
```

**Files Created**:

- `packages/api/src/routes/practice/cloze.ts`

**API Summary**:

- `GET /practice/cloze/exercises` - Get cloze exercises
- `POST /practice/cloze/submit` - Submit answer with fuzzy matching

---

### Task 3: React Cloze Exercise Components

**Implementation Plan**:

Create `packages/web/src/components/practice/ClozePractice.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { Language } from '@polyladder/core';

interface ClozePracticeProps {
  language: Language;
}

export function ClozePractice({ language }: ClozePracticeProps) {
  const queryClient = useQueryClient();
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState<any>(null);
  const [hintLevel, setHintLevel] = useState(0); // 0=none, 1=first letter, 2=length, 3=POS
  const [attemptCount, setAttemptCount] = useState(0);

  const { data: exercises, isLoading } = useQuery({
    queryKey: ['cloze-exercises', language],
    queryFn: async () => {
      const response = await apiClient.get(`/practice/cloze/exercises?language=${language}&limit=10`);
      return response.data.exercises;
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (payload: {
      exerciseId: string;
      userAnswer: string;
      correctAnswer: string;
      alternativeAnswers: string[];
      srsItemId: string | null;
    }) => {
      const response = await apiClient.post('/practice/cloze/submit', payload);
      return response.data.result;
    },
    onSuccess: (result) => {
      setFeedback(result);
      setShowFeedback(true);

      // Auto-advance after delay if correct
      if (result.isCorrect) {
        setTimeout(() => {
          setCurrentExerciseIndex(prev => prev + 1);
          setUserAnswer('');
          setShowFeedback(false);
          setFeedback(null);
          setHintLevel(0);
          setAttemptCount(0);
        }, 2500);
      } else {
        // Increment attempt count for hints
        setAttemptCount(prev => prev + 1);
      }
    },
  });

  // Reset state when exercise changes
  useEffect(() => {
    setUserAnswer('');
    setShowFeedback(false);
    setFeedback(null);
    setHintLevel(0);
    setAttemptCount(0);
  }, [currentExerciseIndex]);

  if (isLoading) {
    return <div className="text-center py-8">Loading exercises...</div>;
  }

  if (!exercises || exercises.length === 0) {
    return (
      <div className="card p-8 text-center">
        <h3 className="text-xl font-bold text-green-600">All Done!</h3>
        <p className="text-gray-600 mt-2">No exercises available right now.</p>
      </div>
    );
  }

  if (currentExerciseIndex >= exercises.length) {
    return (
      <div className="card p-8 text-center">
        <h3 className="text-2xl font-bold text-green-600 mb-4">Session Complete!</h3>
        <p className="text-gray-700 mb-4">You've completed all exercises.</p>
        <button
          onClick={() => {
            setCurrentExerciseIndex(0);
            queryClient.invalidateQueries({ queryKey: ['cloze-exercises'] });
          }}
          className="btn btn-primary"
        >
          Start New Session
        </button>
      </div>
    );
  }

  const currentExercise = exercises[currentExerciseIndex];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAnswer.trim()) return;

    submitMutation.mutate({
      exerciseId: currentExercise.exerciseId,
      userAnswer,
      correctAnswer: currentExercise.correctAnswer,
      alternativeAnswers: currentExercise.alternativeAnswers,
      srsItemId: currentExercise.srsItemId,
    });
  };

  const handleShowHint = () => {
    setHintLevel(prev => Math.min(prev + 1, 3));
  };

  const playAudio = () => {
    if (currentExercise.audioUrl) {
      const audio = new Audio(currentExercise.audioUrl);
      audio.play();
    }
  };

  const renderHint = () => {
    if (hintLevel === 0) return null;

    const hints = [];
    if (hintLevel >= 1) {
      hints.push(`First letter: ${currentExercise.hint.firstLetter}`);
    }
    if (hintLevel >= 2) {
      hints.push(`Length: ${currentExercise.hint.wordLength} letters`);
    }
    if (hintLevel >= 3) {
      hints.push(`Part of speech: ${currentExercise.hint.partOfSpeech}`);
    }

    return (
      <div className="alert alert-info mt-3">
        <div>
          <div className="font-semibold">💡 Hints:</div>
          <ul className="list-disc list-inside text-sm">
            {hints.map((hint, idx) => (
              <li key={idx}>{hint}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  return (
    <div className="cloze-practice max-w-3xl mx-auto p-6">
      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Exercise {currentExerciseIndex + 1} of {exercises.length}</span>
          <span>Attempts: {attemptCount}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${((currentExerciseIndex + 1) / exercises.length) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Exercise */}
      <div className="card p-8 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold">Fill in the blank:</h3>
          {currentExercise.audioUrl && (
            <button onClick={playAudio} className="btn btn-circle">
              🔊
            </button>
          )}
        </div>

        {/* Sentence with blank */}
        <div className="bg-gray-50 p-6 rounded-lg mb-6">
          <p className="text-2xl leading-relaxed">
            {currentExercise.sentenceText.split('_____').map((part, idx, arr) => (
              <React.Fragment key={idx}>
                {part}
                {idx < arr.length - 1 && (
                  <span className="inline-block min-w-[120px] border-b-4 border-blue-500 mx-2 pb-1">
                    {showFeedback && feedback ? (
                      <span className={feedback.isCorrect ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                        {feedback.isCorrect ? userAnswer : `${userAnswer} → ${currentExercise.correctAnswer}`}
                      </span>
                    ) : (
                      <span className="text-transparent">placeholder</span>
                    )}
                  </span>
                )}
              </React.Fragment>
            ))}
          </p>
        </div>

        {currentExercise.context && (
          <p className="text-sm text-gray-600 italic mb-4">Context: {currentExercise.context}</p>
        )}

        {/* Answer Input */}
        {!showFeedback && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="text"
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                className="input input-bordered w-full text-lg"
                placeholder="Type your answer here..."
                autoFocus
                disabled={submitMutation.isPending}
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="btn btn-primary flex-1"
                disabled={!userAnswer.trim() || submitMutation.isPending}
              >
                Check Answer
              </button>

              {attemptCount >= 2 && hintLevel < 3 && (
                <button
                  type="button"
                  onClick={handleShowHint}
                  className="btn btn-secondary"
                >
                  Show Hint
                </button>
              )}
            </div>

            {renderHint()}
          </form>
        )}

        {/* Feedback */}
        {showFeedback && feedback && (
          <div className={`alert ${feedback.isCorrect ? 'alert-success' : 'alert-error'}`}>
            <div>
              <div className="font-semibold">{feedback.feedback}</div>
              {currentExercise.explanation && (
                <div className="text-sm mt-2">
                  Translation: {currentExercise.explanation}
                </div>
              )}
              {!feedback.isCorrect && (
                <div className="mt-3">
                  <button
                    onClick={() => {
                      setShowFeedback(false);
                      setFeedback(null);
                      setUserAnswer('');
                    }}
                    className="btn btn-sm btn-outline"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tip */}
      {!showFeedback && (
        <div className="text-center text-sm text-gray-500">
          <p>Tip: Focus on spelling and accents. Minor typos will be accepted.</p>
        </div>
      )}
    </div>
  );
}
```

**Files Created**:

- `packages/web/src/components/practice/ClozePractice.tsx`

**UI Features**:

- Sentence displayed with visual blank (underline)
- Text input with auto-focus
- Progressive hint system (unlocks after 2 attempts)
- Immediate visual feedback (inline answer display)
- Audio playback button
- "Try Again" option for incorrect answers
- Progress bar

---

## Dependencies

- **Blocks**: None
- **Depends on**:
  - F001 (Database Schema)
  - F046 (SRS Algorithm)

---

## Open Questions

### Question 1: Multiple Blanks per Sentence

**Context**: Should we support sentences with multiple blanks, or one blank per exercise?

**Options**:

1. **Single Blank** (Current implementation)
   - Pros: Simple, focused practice
   - Cons: Can't practice complex sentences
2. **Multiple Blanks** (Sequential fill)
   - Pros: More challenging, realistic
   - Cons: Complex UI, harder to grade
3. **Multiple Blanks** (All at once)
   - Pros: Tests holistic understanding
   - Cons: Very difficult, may frustrate learners
4. **Adaptive** (Start single, progress to multiple)
   - Pros: Natural progression
   - Cons: Requires proficiency tracking

**Current Decision**: Option 1 (single blank) for MVP. Add multiple blanks in v2 if user feedback requests it.

**Impact**: Low - single blank is standard for most language learning apps.

---

### Question 2: Hint Timing

**Context**: When should hints become available?

**Options**:

1. **After N Attempts** (Current: after 2 wrong attempts)
   - Pros: Encourages independent thinking
   - Cons: May frustrate beginners
2. **Immediately Available** (Always show hint button)
   - Pros: Learner autonomy, less frustration
   - Cons: May lead to hint dependency
3. **Time-Based** (After 30 seconds)
   - Pros: Prevents getting stuck
   - Cons: Pressures learners
4. **Request-Based** (User asks for hint anytime)
   - Pros: Maximum flexibility
   - Cons: No incentive to try first

**Current Decision**: Option 1 (after 2 attempts) for MVP. Balances challenge and support.

**Impact**: Low - affects user experience but can adjust based on feedback.

---

### Question 3: Fuzzy Matching Strictness

**Context**: How tolerant should fuzzy matching be?

**Options**:

1. **Very Strict** (95%+ similarity required)
   - Pros: Enforces accurate spelling
   - Cons: Frustrates learners with minor typos
2. **Moderate** (90%+ similarity, current implementation)
   - Pros: Balanced, accepts minor errors
   - Cons: May accept some incorrect forms
3. **Lenient** (80%+ similarity)
   - Pros: Beginner-friendly, less frustration
   - Cons: May not teach correct spelling
4. **Adaptive** (Stricter as CEFR level increases)
   - Pros: Scales with proficiency
   - Cons: Complex, inconsistent

**Current Decision**: Option 2 (moderate at 90%) for MVP. Standard for language learning tools.

**Impact**: Medium - affects learning outcomes. Can refine thresholds based on data.

---

## Notes

- **Cloze Format**: Highly effective for vocabulary acquisition (research-backed)
- **Fuzzy Matching**: Levenshtein distance with accent normalization
- **Progressive Hints**: First letter → word length → part of speech (unlocks after 2 failed attempts)
- **Audio Integration**: Complete sentence audio for pronunciation and comprehension
- **SRS Integration**: Quality score (0-5) based on similarity (perfect=5, close=4, wrong=0)
- **Alternative Answers**: Accepts different capitalizations and accent variations automatically
- **Context Support**: Shows sentence translation and source context when available
- **Inline Feedback**: Shows answer directly in blank space for visual reinforcement
- **Try Again**: Allows retry on incorrect answers (with hint support)
- **Future Enhancement**: Add grammar-focused cloze (articles, prepositions, conjugations)
- **Future Enhancement**: Add multiple blanks per sentence for advanced learners
- **Future Enhancement**: Add audio-first cloze (hear sentence → fill blank)
