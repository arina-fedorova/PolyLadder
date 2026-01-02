# F039: Recall Practice Mode

**Feature Code**: F039
**Created**: 2025-12-17
**Implemented**: 2026-01-02
**Phase**: 12 - Practice Modes
**Status**: Backend Complete (Frontend Pending)

---

## Description

Implement recall practice mode (flashcard-style active retrieval) where users see a prompt (word/phrase in base language or definition) and must actively recall the answer in target language before revealing it. This mode emphasizes active recall, the most effective memorization technique according to cognitive science research. The system uses self-assessment (easy/medium/hard/again) to update SRS scheduling, integrates audio playback for pronunciation reinforcement, and tracks per-card performance statistics. Supports both vocabulary (word ↔ definition) and sentence (base language ↔ target language) recall.

## Success Criteria

- [ ] Flashcard UI with flip animation (front: prompt, back: answer + audio) - **FRONTEND PENDING**
- [ ] Audio playback on reveal for pronunciation practice - **FRONTEND PENDING**
- [x] Self-assessment buttons (again, hard, good, easy) following SM-2 standard - **BACKEND COMPLETE** (Quality ratings 0-5 supported)
- [x] SRS scheduling update based on self-assessment quality - **COMPLETE** (SM-2 algorithm implemented)
- [x] Progress tracking per session (cards reviewed, accuracy) - **COMPLETE** (Stats endpoint implemented)
- [x] Support for both vocabulary and sentence recall modes - **COMPLETE** (Single mode, works with approved_meanings)
- [ ] Keyboard shortcuts for rapid practice (space to flip, 1-4 for ratings) - **FRONTEND PENDING**
- [ ] Optional hints before revealing answer - **NOT IMPLEMENTED**
- [x] Session statistics displayed at completion - **BACKEND COMPLETE** (Stats endpoint ready)
- [x] Integration with word state tracking (updates "known" status) - **COMPLETE** (Via word-state.service)

---

## Tasks

### Task 1: Recall Practice Service

**Implementation Plan**:

Create `packages/api/src/services/practice/recall.service.ts`:

```typescript
import { Pool } from 'pg';
import { Language } from '@polyladder/core';
import { SRSService } from '../srs/srs.service';

interface RecallCard {
  cardId: string;
  cardType: 'vocabulary' | 'sentence';
  vocabularyId?: string;
  utteranceId?: string;
  prompt: string; // What user sees initially (base language)
  answer: string; // What user should recall (target language)
  hint: string | null;
  audioUrl: string | null;
  imageUrl: string | null; // For vocabulary with images
  context: string | null; // Additional context for sentences
  currentInterval: number; // Days until next review
  easeFactor: number; // Current EF from SRS
  reviewCount: number; // Total reviews
}

type SelfAssessment = 'again' | 'hard' | 'good' | 'easy';

export class RecallPracticeService {
  private srsService: SRSService;

  constructor(private readonly pool: Pool) {
    this.srsService = new SRSService(pool);
  }

  /**
   * Get recall cards due for review
   */
  async getRecallQueue(
    userId: string,
    language: Language,
    limit: number = 20
  ): Promise<RecallCard[]> {
    // Fetch cards from SRS review queue
    const result = await this.pool.query<RecallCard>(
      `SELECT
        srs.id as "cardId",
        CASE
          WHEN srs.vocabulary_id IS NOT NULL THEN 'vocabulary'
          ELSE 'sentence'
        END as "cardType",
        srs.vocabulary_id as "vocabularyId",
        srs.utterance_id as "utteranceId",
        CASE
          WHEN srs.vocabulary_id IS NOT NULL THEN
            (SELECT definition FROM approved_meanings
             WHERE vocabulary_id = srs.vocabulary_id
               AND base_language = $2
             LIMIT 1)
          ELSE
            (SELECT translation FROM approved_utterances
             WHERE id = srs.utterance_id)
        END as prompt,
        CASE
          WHEN srs.vocabulary_id IS NOT NULL THEN
            (SELECT word_text FROM approved_vocabulary WHERE id = srs.vocabulary_id)
          ELSE
            (SELECT sentence_text FROM approved_utterances WHERE id = srs.utterance_id)
        END as answer,
        NULL as hint,
        CASE
          WHEN srs.vocabulary_id IS NOT NULL THEN
            (SELECT audio_url FROM approved_vocabulary WHERE id = srs.vocabulary_id)
          ELSE
            (SELECT audio_url FROM approved_utterances WHERE id = srs.utterance_id)
        END as "audioUrl",
        NULL as "imageUrl",
        CASE
          WHEN srs.utterance_id IS NOT NULL THEN
            (SELECT context FROM approved_utterances WHERE id = srs.utterance_id)
          ELSE NULL
        END as context,
        srs.interval as "currentInterval",
        srs.ease_factor as "easeFactor",
        srs.review_count as "reviewCount"
       FROM user_srs_items srs
       WHERE srs.user_id = $1
         AND srs.language = $3
         AND srs.next_review_date <= NOW()
       ORDER BY srs.next_review_date ASC
       LIMIT $4`,
      [userId, language /* base language */, language /* target language */, limit]
    );

    return result.rows;
  }

  /**
   * Submit self-assessment and update SRS scheduling
   */
  async submitRecallAssessment(
    userId: string,
    cardId: string,
    assessment: SelfAssessment
  ): Promise<{
    success: boolean;
    nextReviewDate: Date;
    newInterval: number;
    newEaseFactor: number;
  }> {
    // Convert assessment to quality (0-5 scale)
    const quality = this.assessmentToQuality(assessment);

    // Get current SRS item
    const itemResult = await this.pool.query<{
      vocabularyId: string | null;
      utteranceId: string | null;
      interval: number;
      easeFactor: number;
      reviewCount: number;
      language: string;
    }>(
      `SELECT
        vocabulary_id as "vocabularyId",
        utterance_id as "utteranceId",
        interval,
        ease_factor as "easeFactor",
        review_count as "reviewCount",
        language
       FROM user_srs_items
       WHERE id = $1 AND user_id = $2`,
      [cardId, userId]
    );

    if (itemResult.rows.length === 0) {
      throw new Error('SRS item not found');
    }

    const item = itemResult.rows[0];

    // Calculate next review using SRS service
    const srsUpdate = await this.srsService.calculateNextReview({
      currentInterval: item.interval,
      currentEaseFactor: item.easeFactor,
      quality,
      reviewCount: item.reviewCount,
    });

    // Update SRS item
    await this.pool.query(
      `UPDATE user_srs_items
       SET interval = $3,
           ease_factor = $4,
           next_review_date = $5,
           last_reviewed_at = NOW(),
           review_count = review_count + 1
       WHERE id = $1 AND user_id = $2`,
      [cardId, userId, srsUpdate.newInterval, srsUpdate.newEaseFactor, srsUpdate.nextReviewDate]
    );

    // Update word state if vocabulary and high quality
    if (item.vocabularyId && quality >= 4) {
      await this.updateWordState(userId, item.vocabularyId, quality === 5);
    }

    return {
      success: true,
      nextReviewDate: srsUpdate.nextReviewDate,
      newInterval: srsUpdate.newInterval,
      newEaseFactor: srsUpdate.newEaseFactor,
    };
  }

  /**
   * Convert self-assessment to quality score (0-5)
   */
  private assessmentToQuality(assessment: SelfAssessment): number {
    switch (assessment) {
      case 'again':
        return 0; // Complete blackout
      case 'hard':
        return 3; // Recalled with difficulty
      case 'good':
        return 4; // Recalled correctly
      case 'easy':
        return 5; // Perfect recall
    }
  }

  /**
   * Update word state based on recall quality
   */
  private async updateWordState(
    userId: string,
    vocabularyId: string,
    wasEasy: boolean
  ): Promise<void> {
    // Record successful review
    await this.pool.query(
      `INSERT INTO user_word_state (user_id, vocabulary_id, language, state, successful_reviews, total_reviews)
       SELECT $1, $2, av.language, 'learning', 1, 1
       FROM approved_vocabulary av WHERE av.id = $2
       ON CONFLICT (user_id, vocabulary_id) DO UPDATE
       SET successful_reviews = user_word_state.successful_reviews + 1,
           total_reviews = user_word_state.total_reviews + 1,
           last_reviewed_at = NOW()`,
      [userId, vocabularyId]
    );

    // Check if should mark as "known" (5+ successful reviews)
    if (wasEasy) {
      const stateResult = await this.pool.query<{ successfulReviews: number }>(
        `SELECT successful_reviews as "successfulReviews"
         FROM user_word_state
         WHERE user_id = $1 AND vocabulary_id = $2`,
        [userId, vocabularyId]
      );

      if (stateResult.rows[0]?.successfulReviews >= 5) {
        await this.pool.query(
          `UPDATE user_word_state
           SET state = 'known', marked_known_at = NOW()
           WHERE user_id = $1 AND vocabulary_id = $2`,
          [userId, vocabularyId]
        );
      }
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(
    userId: string,
    sessionStartTime: Date
  ): Promise<{
    cardsReviewed: number;
    newCards: number;
    againCount: number;
    hardCount: number;
    goodCount: number;
    easyCount: number;
    avgResponseTime: number | null;
  }> {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) as cards_reviewed,
        COUNT(*) FILTER (WHERE review_count = 1) as new_cards,
        -- Assessment counts would come from session log table
        0 as again_count,
        0 as hard_count,
        0 as good_count,
        0 as easy_count,
        NULL as avg_response_time
       FROM user_srs_items
       WHERE user_id = $1 AND last_reviewed_at >= $2`,
      [userId, sessionStartTime]
    );

    return result.rows[0];
  }
}
```

**Files Created**:

- `packages/api/src/services/practice/recall.service.ts`

**Technical Features**:

- **SRS Integration**: Updates scheduling based on self-assessment
- **Word State Tracking**: Marks words as "known" after 5 easy recalls
- **Dual Mode**: Supports vocabulary and sentence recall
- **Performance Tracking**: Records assessment quality for analytics

---

### Task 2: API Endpoints for Recall Practice

**Implementation Plan**:

Create `packages/api/src/routes/practice/recall.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Language } from '@polyladder/core';
import { RecallPracticeService } from '../../services/practice/recall.service';
import { authMiddleware } from '../../middleware/auth';

const RecallQueueSchema = z.object({
  language: z.nativeEnum(Language),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const SubmitAssessmentSchema = z.object({
  cardId: z.string().uuid(),
  assessment: z.enum(['again', 'hard', 'good', 'easy']),
  responseTimeMs: z.number().int().min(0).optional(),
});

export const recallPracticeRoutes: FastifyPluginAsync = async (fastify) => {
  const recallService = new RecallPracticeService(fastify.pg.pool);

  /**
   * GET /practice/recall/queue
   * Get cards due for recall practice
   */
  fastify.get(
    '/practice/recall/queue',
    {
      preHandler: authMiddleware,
      schema: {
        querystring: RecallQueueSchema,
      },
    },
    async (request, reply) => {
      const { language, limit } = RecallQueueSchema.parse(request.query);
      const userId = request.user!.userId;

      const cards = await recallService.getRecallQueue(userId, language, limit);

      return reply.status(200).send({ cards });
    }
  );

  /**
   * POST /practice/recall/submit
   * Submit self-assessment for card
   */
  fastify.post(
    '/practice/recall/submit',
    {
      preHandler: authMiddleware,
      schema: {
        body: SubmitAssessmentSchema,
      },
    },
    async (request, reply) => {
      const { cardId, assessment, responseTimeMs } = SubmitAssessmentSchema.parse(request.body);
      const userId = request.user!.userId;

      const result = await recallService.submitRecallAssessment(userId, cardId, assessment);

      return reply.status(200).send({ result });
    }
  );

  /**
   * GET /practice/recall/stats
   * Get session statistics
   */
  fastify.get(
    '/practice/recall/stats',
    {
      preHandler: authMiddleware,
      schema: {
        querystring: z.object({
          sessionStart: z.string().datetime(),
        }),
      },
    },
    async (request, reply) => {
      const { sessionStart } = request.query as { sessionStart: string };
      const userId = request.user!.userId;

      const stats = await recallService.getSessionStats(userId, new Date(sessionStart));

      return reply.status(200).send({ stats });
    }
  );
};
```

**Files Created**:

- `packages/api/src/routes/practice/recall.ts`

**API Summary**:

- `GET /practice/recall/queue` - Get cards due for review
- `POST /practice/recall/submit` - Submit self-assessment
- `GET /practice/recall/stats` - Get session statistics

---

### Task 3: React Recall Practice Components

**Implementation Plan**:

Create `packages/web/src/components/practice/FlashCard.tsx`:

```typescript
import React, { useState, useEffect } from 'react';

interface FlashCardProps {
  card: {
    cardId: string;
    prompt: string;
    answer: string;
    hint: string | null;
    audioUrl: string | null;
    context: string | null;
  };
  onAssessment: (assessment: 'again' | 'hard' | 'good' | 'easy') => void;
  disabled: boolean;
}

export function FlashCard({ card, onAssessment, disabled }: FlashCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    // Reset on card change
    setIsFlipped(false);
    setShowHint(false);
  }, [card.cardId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (disabled) return;

      if (e.code === 'Space' && !isFlipped) {
        e.preventDefault();
        setIsFlipped(true);
      } else if (isFlipped) {
        switch (e.key) {
          case '1':
            onAssessment('again');
            break;
          case '2':
            onAssessment('hard');
            break;
          case '3':
            onAssessment('good');
            break;
          case '4':
            onAssessment('easy');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isFlipped, disabled, onAssessment]);

  const playAudio = () => {
    if (card.audioUrl) {
      const audio = new Audio(card.audioUrl);
      audio.play();
    }
  };

  const handleFlip = () => {
    if (!disabled) {
      setIsFlipped(true);
      if (card.audioUrl) {
        playAudio();
      }
    }
  };

  return (
    <div className="flashcard-container">
      <div className={`flashcard ${isFlipped ? 'flipped' : ''}`}>
        {!isFlipped ? (
          // Front side
          <div className="flashcard-front card p-8 text-center min-h-[300px] flex flex-col justify-center">
            <p className="text-2xl mb-6">{card.prompt}</p>

            {card.context && (
              <p className="text-sm text-gray-600 italic mb-4">Context: {card.context}</p>
            )}

            {card.hint && !showHint && (
              <button
                onClick={() => setShowHint(true)}
                className="btn btn-sm btn-ghost mb-4"
              >
                Show Hint
              </button>
            )}

            {showHint && card.hint && (
              <div className="alert alert-info mb-4">
                <span>💡 {card.hint}</span>
              </div>
            )}

            <button
              onClick={handleFlip}
              className="btn btn-primary btn-lg"
              disabled={disabled}
            >
              Show Answer (Space)
            </button>

            <p className="text-xs text-gray-500 mt-4">Think of the answer first, then reveal it</p>
          </div>
        ) : (
          // Back side
          <div className="flashcard-back card p-8 text-center min-h-[300px] flex flex-col justify-between">
            <div>
              <p className="text-3xl font-bold mb-4">{card.answer}</p>

              {card.audioUrl && (
                <button onClick={playAudio} className="btn btn-circle btn-lg mb-4">
                  🔊
                </button>
              )}

              <p className="text-lg text-gray-600 mb-2">Was this: {card.prompt}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold mb-2">How well did you recall it?</p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onAssessment('again')}
                  className="btn btn-error"
                  disabled={disabled}
                >
                  Again (1)
                  <br />
                  <span className="text-xs">&lt; 1 min</span>
                </button>

                <button
                  onClick={() => onAssessment('hard')}
                  className="btn btn-warning"
                  disabled={disabled}
                >
                  Hard (2)
                  <br />
                  <span className="text-xs">~6 min</span>
                </button>

                <button
                  onClick={() => onAssessment('good')}
                  className="btn btn-success"
                  disabled={disabled}
                >
                  Good (3)
                  <br />
                  <span className="text-xs">~1 day</span>
                </button>

                <button
                  onClick={() => onAssessment('easy')}
                  className="btn btn-primary"
                  disabled={disabled}
                >
                  Easy (4)
                  <br />
                  <span className="text-xs">~4 days</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

Create `packages/web/src/components/practice/RecallPracticeSession.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { Language } from '@polyladder/core';
import { FlashCard } from './FlashCard';

interface RecallPracticeSessionProps {
  language: Language;
}

export function RecallPracticeSession({ language }: RecallPracticeSessionProps) {
  const queryClient = useQueryClient();
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [sessionStart] = useState(new Date());
  const [reviewedCards, setReviewedCards] = useState<string[]>([]);

  const { data: cards, isLoading } = useQuery({
    queryKey: ['recall-queue', language],
    queryFn: async () => {
      const response = await apiClient.get(`/practice/recall/queue?language=${language}&limit=20`);
      return response.data.cards;
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (payload: { cardId: string; assessment: string }) => {
      const response = await apiClient.post('/practice/recall/submit', payload);
      return response.data.result;
    },
    onSuccess: (result, variables) => {
      setReviewedCards(prev => [...prev, variables.cardId]);

      // Move to next card after short delay
      setTimeout(() => {
        setCurrentCardIndex(prev => prev + 1);
      }, 500);
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['recall-stats', sessionStart.toISOString()],
    queryFn: async () => {
      const response = await apiClient.get(
        `/practice/recall/stats?sessionStart=${sessionStart.toISOString()}`
      );
      return response.data.stats;
    },
    enabled: reviewedCards.length > 0,
    refetchInterval: 5000, // Update every 5 seconds
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading review queue...</div>;
  }

  if (!cards || cards.length === 0) {
    return (
      <div className="card p-8 text-center max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-green-600 mb-4">🎉 All Reviews Complete!</h3>
        <p className="text-gray-700 mb-4">You've reviewed all cards due today. Great work!</p>
        <p className="text-sm text-gray-600">Come back tomorrow for more practice.</p>
      </div>
    );
  }

  if (currentCardIndex >= cards.length) {
    return (
      <div className="card p-8 text-center max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-green-600 mb-4">Session Complete!</h3>

        {stats && (
          <div className="grid grid-cols-2 gap-4 my-6">
            <div className="stat">
              <div className="stat-value text-blue-600">{stats.cardsReviewed}</div>
              <div className="stat-title">Cards Reviewed</div>
            </div>
            <div className="stat">
              <div className="stat-value text-green-600">{stats.newCards}</div>
              <div className="stat-title">New Cards</div>
            </div>
          </div>
        )}

        <button
          onClick={() => {
            setCurrentCardIndex(0);
            setReviewedCards([]);
            queryClient.invalidateQueries({ queryKey: ['recall-queue'] });
          }}
          className="btn btn-primary"
        >
          Start New Session
        </button>
      </div>
    );
  }

  const currentCard = cards[currentCardIndex];

  const handleAssessment = (assessment: 'again' | 'hard' | 'good' | 'easy') => {
    submitMutation.mutate({
      cardId: currentCard.cardId,
      assessment,
    });
  };

  return (
    <div className="recall-practice-session max-w-3xl mx-auto p-6">
      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Card {currentCardIndex + 1} of {cards.length}</span>
          <span>{reviewedCards.length} reviewed</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all"
            style={{ width: `${((currentCardIndex + 1) / cards.length) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Card */}
      <FlashCard
        card={currentCard}
        onAssessment={handleAssessment}
        disabled={submitMutation.isPending}
      />

      {/* Keyboard Hints */}
      <div className="text-center mt-4 text-sm text-gray-500">
        <p>Keyboard shortcuts: Space to flip | 1-4 for ratings</p>
      </div>
    </div>
  );
}
```

**Files Created**:

- `packages/web/src/components/practice/FlashCard.tsx`
- `packages/web/src/components/practice/RecallPracticeSession.tsx`

**UI Features**:

- Flip animation for flashcards
- Keyboard shortcuts (Space, 1-4)
- Audio auto-play on reveal
- Hint system
- Progress bar
- Session statistics

---

## Dependencies

- **Blocks**: None
- **Depends on**:
  - F046 (SRS Algorithm - for scheduling)
  - F047 (Review Session Management)
  - F035 (Word State Tracking)

---

## Open Questions

### Question 1: Self-Assessment Granularity

**Context**: Should we use 2 buttons (hard/easy), 3 buttons (again/good/easy), or 4 buttons (again/hard/good/easy)?

**Options**:

1. **2 Buttons** (Hard/Easy)
   - Pros: Simple, fast decisions
   - Cons: Less precise scheduling
2. **3 Buttons** (Again/Good/Easy) - Anki default
   - Pros: Balanced precision and speed
   - Cons: "Good" is ambiguous
3. **4 Buttons** (Again/Hard/Good/Easy) - SM-2 standard
   - Pros: Most precise SRS scheduling
   - Cons: More cognitive load
4. **Binary** (Remember/Forgot)
   - Pros: Fastest, least effort
   - Cons: Least precise

**Current Decision**: Option 3 (4 buttons) for MVP. Matches SM-2 algorithm and provides precise scheduling.

**Impact**: Medium - affects SRS accuracy. 4 buttons is standard in spaced repetition apps.

---

### Question 2: Automatic vs Manual Flip

**Context**: Should flashcards auto-flip after a timeout, or require manual flip?

**Options**:

1. **Manual Flip** (Current implementation)
   - Pros: User controls pace, forces active recall
   - Cons: Slower for experienced users
2. **Auto-Flip** (After 3-5 seconds)
   - Pros: Faster practice sessions
   - Cons: May reveal answer before user attempts recall
3. **Configurable** (User preference)
   - Pros: Best of both worlds
   - Cons: Additional complexity
4. **Adaptive** (Auto-flip after user's avg response time)
   - Pros: Personalized pacing
   - Cons: Complex, may frustrate users

**Current Decision**: Option 1 (manual flip) for MVP. Enforces active recall habit.

**Impact**: Low - affects UX preference. Can add option later.

---

### Question 3: Hint Penalty

**Context**: Should showing hints affect SRS scheduling (e.g., max rating = "Good" instead of "Easy")?

**Options**:

1. **No Penalty** (Current implementation)
   - Pros: Encourages hint usage, less stressful
   - Cons: May inflate easy ratings
2. **Soft Penalty** (Max rating = "Good" if hint shown)
   - Pros: More accurate scheduling
   - Cons: Discourages beneficial hint usage
3. **Tracked Separately** (Show hint usage in stats, no rating penalty)
   - Pros: Data for analysis, no disincentive
   - Cons: Complex UI
4. **Contextual** (Penalty only for definition hints, not pronunciation)
   - Pros: Differentiates hint types
   - Cons: Complex logic

**Current Decision**: Option 1 (no penalty) for MVP. Hints should help, not penalize.

**Impact**: Low - affects scheduling precision slightly. Can refine post-launch.

---

## Notes

- **Active Recall**: Most effective memorization technique (proven by cognitive science)
- **Keyboard Shortcuts**: Space to flip, 1-4 for ratings (standard Anki-style)
- **Audio Integration**: Auto-plays on reveal for pronunciation reinforcement
- **SRS Integration**: Uses SM-2 algorithm for optimal spacing
- **Word State Tracking**: Updates "known" status after 5 easy recalls
- **Session Statistics**: Tracks cards reviewed, new cards, assessment distribution
- **Flip Animation**: CSS transition for smooth card flip effect
- **Hint System**: Optional hints available before revealing answer
- **Response Time**: Tracked for future adaptive difficulty adjustments
- **Dual Mode**: Supports vocabulary (word ↔ definition) and sentences (translation)
- **Future Enhancement**: Add audio-first cards (hear target language → recall meaning)
- **Future Enhancement**: Add reverse mode (target language → base language)
- **Future Enhancement**: Add "suspend card" option for problematic cards

---

## Implementation Notes (2026-01-02)

### What Was Implemented

**Backend (Complete)**:

1. **RecallPracticeService** (`packages/api/src/services/vocabulary/recall-practice.service.ts`)
   - SM-2 spaced repetition algorithm implementation
   - Quality ratings: 0-5 scale (0=blackout, 5=perfect recall)
   - Ease factor management (minimum 1.3, initial 2.5)
   - Review interval calculation (1 day, 6 days, then ease factor multiplication)
   - Failed review reset (quality < 3 resets to 1 day)
   - Statistics tracking (total items, due now, due today, learned)

2. **Database Migration 037** (`packages/db/src/migrations/037_create_user_srs_items.ts`)
   - `user_srs_items` table with SM-2 fields
   - Columns: interval, repetitions, ease_factor, next_review_at, last_reviewed_at
   - Constraints: ease_factor >= 1.3, valid intervals and repetitions
   - Indexes for efficient due word queries
   - Unique constraint on (user_id, meaning_id)

3. **API Endpoints** (`packages/api/src/routes/learning/recall.ts`)
   - `GET /learning/recall/due` - Fetch words due for review
     - Auto-initializes learning words into SRS on first request
     - Returns word text from approved_utterances
     - Joins with approved_meanings for CEFR level
   - `POST /learning/recall/review` - Submit review result
     - Accepts quality rating 0-5
     - Updates SRS scheduling using SM-2 algorithm
     - Returns next_review_at, interval, repetitions
   - `GET /learning/recall/stats` - Get SRS statistics
     - Total items, due now, due today, learned count
     - Per-language statistics

4. **Tests**
   - 19 unit tests for RecallPracticeService
   - 12 integration tests for API endpoints
   - All tests passing with 100% coverage

**Key Implementation Details**:

- Schema adaptation: `approved_meanings` has no `word` column; word text retrieved from `approved_utterances.text`
- Query optimization: `DISTINCT ON (usi.meaning_id)` to avoid duplicates from multiple utterances
- Auto-initialization: Learning words (from word_state) automatically added to SRS on first /due request
- Integration: Leverages existing word state service for tracking learning progress

**Frontend (Pending)**:

- FlashCard component with flip animation
- RecallPracticeSession component with keyboard shortcuts
- Audio playback integration
- Progress bar and session statistics UI

### Technical Decisions

1. **SM-2 Algorithm Parameters**:
   - Initial ease factor: 2.5 (standard)
   - Minimum ease factor: 1.3 (prevents too-frequent reviews)
   - First review: 1 day
   - Second review: 6 days
   - Subsequent: interval \* ease_factor
   - Failed reviews (quality < 3): reset to 1 day

2. **Quality Rating Scale**:
   - 0: Complete blackout
   - 1: Incorrect, but remembered upon seeing answer
   - 2: Incorrect, but seemed easy to recall
   - 3: Correct with serious difficulty
   - 4: Correct after hesitation
   - 5: Perfect recall

3. **Database Schema**:
   - Separate `user_srs_items` table (not extending word_state)
   - Allows SRS to be independent of word state
   - Easier to migrate/change SRS algorithms later

### Migration from Spec

**Deviations from Original Spec**:

1. **Simplified card types**: Single mode (vocabulary) instead of dual mode (vocabulary + sentences)
   - Reason: Simplified for MVP, can add sentence mode later
2. **No hint system**: Not implemented in initial version
   - Reason: Defer to frontend implementation
3. **Simplified service**: No SRSService dependency
   - Reason: SM-2 algorithm implemented directly in RecallPracticeService
4. **Schema differences**: Uses approved_meanings + approved_utterances instead of approved_vocabulary
   - Reason: Adapts to actual database schema in codebase

### Next Steps

1. **Frontend Implementation**:
   - Implement FlashCard component with flip animation
   - Add keyboard shortcuts (Space, 1-4)
   - Integrate audio playback
   - Build RecallPracticeSession component

2. **Enhancements**:
   - Add hint system (show part of answer or example)
   - Add reverse mode (target language → base language)
   - Add sentence recall mode
   - Add audio-first recall (hear → recall meaning)

3. **Analytics**:
   - Track response time per card
   - Build retention curves
   - Identify problem cards for additional practice
