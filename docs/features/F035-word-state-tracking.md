# F035: Word State Tracking (Unknown → Learning → Known)

**Feature Code**: F035
**Created**: 2025-12-17
**Phase**: 10 - Vocabulary Learning
**Status**: Not Started

---

## Description

The word state tracking system manages the learning journey of vocabulary items from initial encounter to mastery. Each word progresses through three states: **unknown** (never encountered), **learning** (actively studying), and **known** (mastered after 5+ successful reviews). This state information drives SRS scheduling, progress dashboards, and learning recommendations. State transitions are automatic based on user performance but can be manually adjusted if needed.

## Success Criteria

- [ ] New words start in "unknown" state until first encounter
- [ ] First vocabulary encounter automatically transitions to "learning" state
- [ ] Consistent correct answers (5+ successful reviews) promotes to "known" state
- [ ] State transitions tracked in user_word_state table with timestamps
- [ ] Word state visible in vocabulary dashboard and learning interfaces
- [ ] State affects SRS scheduling intervals (known words have longer intervals)
- [ ] Manual state reset option for forgotten words (known → learning)
- [ ] State statistics shown in progress dashboard (X unknown, Y learning, Z known)

---

## Tasks

### Task 1: Word State Database Schema

**File**: `packages/db/migrations/017-user-word-state.sql`

Create table to track vocabulary state per user.

**Implementation Plan**:

```sql
-- Table to track word learning state for each user
CREATE TABLE user_word_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vocabulary_id UUID NOT NULL REFERENCES approved_vocabulary(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('unknown', 'learning', 'known')),
  first_seen_at TIMESTAMP,
  marked_learning_at TIMESTAMP,
  marked_known_at TIMESTAMP,
  successful_reviews INT NOT NULL DEFAULT 0,
  total_reviews INT NOT NULL DEFAULT 0,
  last_reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE (user_id, vocabulary_id),
  CONSTRAINT valid_successful_reviews CHECK (successful_reviews >= 0),
  CONSTRAINT valid_total_reviews CHECK (total_reviews >= successful_reviews),
  CONSTRAINT state_timestamps_consistency CHECK (
    (state = 'unknown' AND first_seen_at IS NULL) OR
    (state = 'learning' AND first_seen_at IS NOT NULL) OR
    (state = 'known' AND first_seen_at IS NOT NULL AND marked_known_at IS NOT NULL)
  )
);

-- Indexes for fast lookups
CREATE INDEX idx_user_word_state_user_language
  ON user_word_state(user_id, language);

CREATE INDEX idx_user_word_state_state
  ON user_word_state(state);

CREATE INDEX idx_user_word_state_vocab
  ON user_word_state(vocabulary_id);

-- Composite index for dashboard queries (count by state)
CREATE INDEX idx_user_word_state_user_state
  ON user_word_state(user_id, state);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_word_state_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_word_state_updated_at
  BEFORE UPDATE ON user_word_state
  FOR EACH ROW
  EXECUTE FUNCTION update_user_word_state_timestamp();

-- View for easy state statistics
CREATE VIEW user_word_state_stats AS
SELECT
  user_id,
  language,
  COUNT(*) FILTER (WHERE state = 'unknown') as unknown_count,
  COUNT(*) FILTER (WHERE state = 'learning') as learning_count,
  COUNT(*) FILTER (WHERE state = 'known') as known_count,
  COUNT(*) as total_words
FROM user_word_state
GROUP BY user_id, language;
```

**Dependencies**: PostgreSQL database (F001), approved_vocabulary table

---

### Task 2: Word State Service

**File**: `packages/api/src/services/vocabulary/word-state.service.ts`

Create service to manage word state transitions.

**Implementation Plan**:

```typescript
import { Pool } from 'pg';

export type WordState = 'unknown' | 'learning' | 'known';

export interface WordStateInfo {
  vocabularyId: string;
  userId: string;
  state: WordState;
  successfulReviews: number;
  totalReviews: number;
  firstSeenAt: string | null;
  markedLearningAt: string | null;
  markedKnownAt: string | null;
  lastReviewedAt: string | null;
}

const KNOWN_THRESHOLD = 5; // Number of successful reviews to mark as "known"

export class WordStateService {
  constructor(private readonly pool: Pool) {}

  /**
   * Get word state for a user
   * Creates "unknown" entry if word not yet encountered
   */
  async getWordState(userId: string, vocabularyId: string): Promise<WordStateInfo> {
    // Try to get existing state
    const result = await this.pool.query(
      `SELECT
        vocabulary_id,
        user_id,
        state,
        successful_reviews,
        total_reviews,
        first_seen_at,
        marked_learning_at,
        marked_known_at,
        last_reviewed_at
       FROM user_word_state
       WHERE user_id = $1 AND vocabulary_id = $2`,
      [userId, vocabularyId]
    );

    if (result.rows.length > 0) {
      return this.mapRowToWordState(result.rows[0]);
    }

    // Get vocabulary language for new entry
    const vocabResult = await this.pool.query(
      `SELECT language FROM approved_vocabulary WHERE id = $1`,
      [vocabularyId]
    );

    if (vocabResult.rows.length === 0) {
      throw new Error('Vocabulary item not found');
    }

    const language = vocabResult.rows[0].language;

    // Create initial "unknown" state
    const insertResult = await this.pool.query(
      `INSERT INTO user_word_state
       (user_id, vocabulary_id, language, state, successful_reviews, total_reviews)
       VALUES ($1, $2, $3, 'unknown', 0, 0)
       RETURNING *`,
      [userId, vocabularyId, language]
    );

    return this.mapRowToWordState(insertResult.rows[0]);
  }

  /**
   * Mark word as encountered (unknown → learning)
   */
  async markAsEncountered(userId: string, vocabularyId: string): Promise<WordStateInfo> {
    const currentState = await this.getWordState(userId, vocabularyId);

    if (currentState.state !== 'unknown') {
      return currentState; // Already learning or known
    }

    const result = await this.pool.query(
      `UPDATE user_word_state
       SET state = 'learning',
           first_seen_at = NOW(),
           marked_learning_at = NOW()
       WHERE user_id = $1 AND vocabulary_id = $2
       RETURNING *`,
      [userId, vocabularyId]
    );

    return this.mapRowToWordState(result.rows[0]);
  }

  /**
   * Record a review result and update state if necessary
   */
  async recordReview(
    userId: string,
    vocabularyId: string,
    wasSuccessful: boolean
  ): Promise<WordStateInfo> {
    // Mark as encountered if first time
    await this.markAsEncountered(userId, vocabularyId);

    // Get current state
    const currentState = await this.getWordState(userId, vocabularyId);

    const newSuccessfulReviews = wasSuccessful
      ? currentState.successfulReviews + 1
      : currentState.successfulReviews;
    const newTotalReviews = currentState.totalReviews + 1;

    // Determine new state
    let newState: WordState = currentState.state;
    let markedKnownAt: string | null = currentState.markedKnownAt;

    if (currentState.state === 'learning' && newSuccessfulReviews >= KNOWN_THRESHOLD) {
      newState = 'known';
      markedKnownAt = new Date().toISOString();
    }

    // Update state
    const result = await this.pool.query(
      `UPDATE user_word_state
       SET successful_reviews = $1,
           total_reviews = $2,
           last_reviewed_at = NOW(),
           state = $3,
           marked_known_at = $4
       WHERE user_id = $5 AND vocabulary_id = $6
       RETURNING *`,
      [newSuccessfulReviews, newTotalReviews, newState, markedKnownAt, userId, vocabularyId]
    );

    return this.mapRowToWordState(result.rows[0]);
  }

  /**
   * Manually reset word to learning state (if user forgot)
   */
  async resetToLearning(userId: string, vocabularyId: string): Promise<WordStateInfo> {
    const result = await this.pool.query(
      `UPDATE user_word_state
       SET state = 'learning',
           marked_known_at = NULL,
           successful_reviews = 0
       WHERE user_id = $1 AND vocabulary_id = $2
       RETURNING *`,
      [userId, vocabularyId]
    );

    if (result.rows.length === 0) {
      throw new Error('Word state not found');
    }

    return this.mapRowToWordState(result.rows[0]);
  }

  /**
   * Get word state statistics for a user and language
   */
  async getStateStats(userId: string, language: string) {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE state = 'unknown') as unknown_count,
        COUNT(*) FILTER (WHERE state = 'learning') as learning_count,
        COUNT(*) FILTER (WHERE state = 'known') as known_count,
        COUNT(*) as total_words
       FROM user_word_state
       WHERE user_id = $1 AND language = $2`,
      [userId, language]
    );

    return {
      unknownCount: parseInt(result.rows[0].unknown_count, 10),
      learningCount: parseInt(result.rows[0].learning_count, 10),
      knownCount: parseInt(result.rows[0].known_count, 10),
      totalWords: parseInt(result.rows[0].total_words, 10),
    };
  }

  /**
   * Get all words in a specific state for a user
   */
  async getWordsByState(
    userId: string,
    language: string,
    state: WordState,
    limit: number = 50,
    offset: number = 0
  ) {
    const result = await this.pool.query(
      `SELECT
        uws.vocabulary_id,
        uws.state,
        uws.successful_reviews,
        uws.total_reviews,
        uws.last_reviewed_at,
        v.word_text,
        v.translation,
        v.cefr_level
       FROM user_word_state uws
       JOIN approved_vocabulary v ON uws.vocabulary_id = v.id
       WHERE uws.user_id = $1
         AND uws.language = $2
         AND uws.state = $3
       ORDER BY uws.last_reviewed_at DESC NULLS LAST
       LIMIT $4 OFFSET $5`,
      [userId, language, state, limit, offset]
    );

    return result.rows;
  }

  /**
   * Bulk initialize word states for new vocabulary
   */
  async bulkInitializeWords(
    userId: string,
    vocabularyIds: string[],
    language: string
  ): Promise<number> {
    if (vocabularyIds.length === 0) {
      return 0;
    }

    const values = vocabularyIds.map((_, idx) => {
      const baseIdx = idx * 3;
      return `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, 'unknown', 0, 0)`;
    }).join(', ');

    const params: any[] = [];
    vocabularyIds.forEach(vocabId => {
      params.push(userId, vocabId, language);
    });

    const result = await this.pool.query(
      `INSERT INTO user_word_state
       (user_id, vocabulary_id, language, state, successful_reviews, total_reviews)
       VALUES ${values}
       ON CONFLICT (user_id, vocabulary_id) DO NOTHING
       RETURNING id`,
      params
    );

    return result.rowCount || 0;
  }

  private mapRowToWordState(row: any): WordStateInfo {
    return {
      vocabularyId: row.vocabulary_id,
      userId: row.user_id,
      state: row.state,
      successfulReviews: row.successful_reviews,
      totalReviews: row.total_reviews,
      firstSeenAt: row.first_seen_at,
      markedLearningAt: row.marked_learning_at,
      markedKnownAt: row.marked_known_at,
      lastReviewedAt: row.last_reviewed_at,
    };
  }
}
```

**Dependencies**: PostgreSQL pool

---

### Task 3: API Endpoints for Word State

**File**: `packages/api/src/routes/learning/word-state.ts`

Create REST API endpoints for word state management.

**Implementation Plan**:

```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { WordStateService } from '../../services/vocabulary/word-state.service';

const GetWordStateSchema = z.object({
  vocabularyId: z.string().uuid(),
});

const RecordReviewSchema = z.object({
  vocabularyId: z.string().uuid(),
  wasSuccessful: z.boolean(),
});

const ResetWordSchema = z.object({
  vocabularyId: z.string().uuid(),
});

const GetWordsByStateSchema = z.object({
  language: z.string().min(2).max(3),
  state: z.enum(['unknown', 'learning', 'known']),
  limit: z.string().transform(Number).default('50'),
  offset: z.string().transform(Number).default('0'),
});

export default async function wordStateRoutes(fastify: FastifyInstance) {
  const wordStateService = new WordStateService(fastify.pg);

  // GET /learning/word-state/:vocabularyId - Get word state
  fastify.get('/learning/word-state/:vocabularyId', {
    onRequest: [fastify.authenticate],
    schema: {
      params: GetWordStateSchema,
      response: {
        200: z.object({
          vocabularyId: z.string(),
          userId: z.string(),
          state: z.enum(['unknown', 'learning', 'known']),
          successfulReviews: z.number(),
          totalReviews: z.number(),
          firstSeenAt: z.string().nullable(),
          markedLearningAt: z.string().nullable(),
          markedKnownAt: z.string().nullable(),
          lastReviewedAt: z.string().nullable(),
        }),
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { vocabularyId } = request.params as z.infer<typeof GetWordStateSchema>;

      const state = await wordStateService.getWordState(userId, vocabularyId);

      return reply.code(200).send(state);
    },
  });

  // POST /learning/word-state/record-review - Record a review
  fastify.post('/learning/word-state/record-review', {
    onRequest: [fastify.authenticate],
    schema: {
      body: RecordReviewSchema,
      response: {
        200: z.object({
          vocabularyId: z.string(),
          state: z.enum(['unknown', 'learning', 'known']),
          successfulReviews: z.number(),
          totalReviews: z.number(),
          stateChanged: z.boolean(),
        }),
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { vocabularyId, wasSuccessful } = request.body as z.infer<typeof RecordReviewSchema>;

      const previousState = await wordStateService.getWordState(userId, vocabularyId);
      const newState = await wordStateService.recordReview(userId, vocabularyId, wasSuccessful);

      return reply.code(200).send({
        vocabularyId: newState.vocabularyId,
        state: newState.state,
        successfulReviews: newState.successfulReviews,
        totalReviews: newState.totalReviews,
        stateChanged: previousState.state !== newState.state,
      });
    },
  });

  // POST /learning/word-state/reset - Reset word to learning
  fastify.post('/learning/word-state/reset', {
    onRequest: [fastify.authenticate],
    schema: {
      body: ResetWordSchema,
      response: {
        200: z.object({
          success: z.boolean(),
          message: z.string(),
        }),
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { vocabularyId } = request.body as z.infer<typeof ResetWordSchema>;

      await wordStateService.resetToLearning(userId, vocabularyId);

      return reply.code(200).send({
        success: true,
        message: 'Word reset to learning state',
      });
    },
  });

  // GET /learning/word-state/stats - Get state statistics
  fastify.get('/learning/word-state/stats', {
    onRequest: [fastify.authenticate],
    schema: {
      querystring: z.object({
        language: z.string().min(2).max(3),
      }),
      response: {
        200: z.object({
          unknownCount: z.number(),
          learningCount: z.number(),
          knownCount: z.number(),
          totalWords: z.number(),
        }),
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { language } = request.query as { language: string };

      const stats = await wordStateService.getStateStats(userId, language);

      return reply.code(200).send(stats);
    },
  });

  // GET /learning/word-state/by-state - Get words by state
  fastify.get('/learning/word-state/by-state', {
    onRequest: [fastify.authenticate],
    schema: {
      querystring: GetWordsByStateSchema,
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { language, state, limit, offset } = request.query as z.infer<typeof GetWordsByStateSchema>;

      const words = await wordStateService.getWordsByState(
        userId,
        language,
        state,
        limit,
        offset
      );

      return reply.code(200).send({
        words,
        total: words.length,
        limit,
        offset,
      });
    },
  });
}
```

**Dependencies**: Fastify, Zod, WordStateService, Auth middleware (F019)

---

### Task 4: Word State Display Component

**File**: `packages/web/src/components/vocabulary/WordStateBadge.tsx`

Create React component to display word state visually.

**Implementation Plan**:

```typescript
import React from 'react';

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
```

**Dependencies**: React, Tailwind CSS

---

### Task 5: Word State Progress Dashboard Component

**File**: `packages/web/src/components/vocabulary/WordStateProgress.tsx`

Create dashboard showing word state statistics.

**Implementation Plan**:

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { WordStateBadge } from './WordStateBadge';

interface WordStateStats {
  unknownCount: number;
  learningCount: number;
  knownCount: number;
  totalWords: number;
}

interface WordStateProgressProps {
  language: string;
}

export function WordStateProgress({ language }: WordStateProgressProps) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['word-state-stats', language],
    queryFn: async () => {
      const response = await apiClient.get<WordStateStats>(
        `/learning/word-state/stats?language=${language}`
      );
      return response.data;
    },
  });

  if (isLoading) {
    return (
      <div className="card p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!stats || stats.totalWords === 0) {
    return (
      <div className="card p-6 text-center text-gray-500">
        No vocabulary words yet. Start learning to see your progress!
      </div>
    );
  }

  const knownPercentage = (stats.knownCount / stats.totalWords) * 100;
  const learningPercentage = (stats.learningCount / stats.totalWords) * 100;
  const unknownPercentage = (stats.unknownCount / stats.totalWords) * 100;

  return (
    <div className="card p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Vocabulary Progress
        </h3>
        <p className="text-sm text-gray-600">
          {stats.totalWords} total words
        </p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden flex">
          {stats.knownCount > 0 && (
            <div
              className="bg-green-500 h-full transition-all"
              style={{ width: `${knownPercentage}%` }}
              title={`${stats.knownCount} known (${Math.round(knownPercentage)}%)`}
            ></div>
          )}
          {stats.learningCount > 0 && (
            <div
              className="bg-yellow-500 h-full transition-all"
              style={{ width: `${learningPercentage}%` }}
              title={`${stats.learningCount} learning (${Math.round(learningPercentage)}%)`}
            ></div>
          )}
          {stats.unknownCount > 0 && (
            <div
              className="bg-gray-400 h-full transition-all"
              style={{ width: `${unknownPercentage}%` }}
              title={`${stats.unknownCount} unknown (${Math.round(unknownPercentage)}%)`}
            ></div>
          )}
        </div>
      </div>

      {/* State Breakdown */}
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <WordStateBadge state="known" />
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {stats.knownCount}
          </p>
          <p className="text-xs text-gray-500">
            {Math.round(knownPercentage)}%
          </p>
        </div>

        <div className="text-center">
          <WordStateBadge state="learning" />
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {stats.learningCount}
          </p>
          <p className="text-xs text-gray-500">
            {Math.round(learningPercentage)}%
          </p>
        </div>

        <div className="text-center">
          <WordStateBadge state="unknown" />
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {stats.unknownCount}
          </p>
          <p className="text-xs text-gray-500">
            {Math.round(unknownPercentage)}%
          </p>
        </div>
      </div>

      {/* Insights */}
      <div className="pt-4 border-t border-gray-200">
        <p className="text-sm text-gray-700">
          {stats.knownCount === 0 && (
            <>Keep practicing! Complete 5+ successful reviews to mark words as known.</>
          )}
          {stats.knownCount > 0 && stats.knownCount < stats.totalWords / 2 && (
            <>Great progress! You've mastered {stats.knownCount} words.</>
          )}
          {stats.knownCount >= stats.totalWords / 2 && (
            <>Excellent work! You know more than half of your vocabulary.</>
          )}
        </p>
      </div>
    </div>
  );
}
```

**Dependencies**: TanStack Query, React, API client (F018)

---

### Task 6: Integration with Review System

**File**: `packages/api/src/services/learning/review-session.service.ts` (modification)

Update review session service to record word state changes.

**Implementation Plan**:

```typescript
// Add to existing ReviewSessionService

import { WordStateService } from '../vocabulary/word-state.service';

export class ReviewSessionService {
  private wordStateService: WordStateService;

  constructor(pool: Pool) {
    // ... existing code
    this.wordStateService = new WordStateService(pool);
  }

  /**
   * Submit review answer
   * Updates both SRS schedule AND word state
   */
  async submitReview(
    sessionId: string,
    itemId: string,
    rating: PerformanceRating
  ): Promise<{
    nextInterval: number;
    wordStateChanged: boolean;
    newWordState?: string;
  }> {
    // ... existing SRS update code

    // Determine if review was successful
    const wasSuccessful = ['good', 'easy'].includes(rating);

    // Update word state
    const previousState = await this.wordStateService.getWordState(userId, itemId);
    const newState = await this.wordStateService.recordReview(userId, itemId, wasSuccessful);

    return {
      nextInterval: updatedSchedule.interval,
      wordStateChanged: previousState.state !== newState.state,
      newWordState: newState.state,
    };
  }
}
```

**Dependencies**: WordStateService, ReviewSessionService (F047)

---

## Open Questions

### Question 1: Known Threshold

**Context**: Currently, 5 successful reviews mark a word as "known". Is this the right number?

**Options**:
1. **Fixed threshold (5 reviews)** (current approach)
   - Pros: Simple, predictable
   - Cons: May not reflect actual mastery for all learners
2. **CEFR-level dependent** (A1=3, B1=5, C1=7)
   - Pros: Adjusts difficulty for word complexity
   - Cons: More complex logic
3. **Adaptive threshold** based on user performance
   - Pros: Personalized to learner ability
   - Cons: Complex algorithm, may confuse users

**Decision Needed**: Determine optimal known threshold.

**Temporary Plan**: Use fixed threshold of 5 for MVP. Can adjust based on user feedback.

---

### Question 2: Forgotten Words

**Context**: If a user fails a "known" word, should it auto-revert to "learning"?

**Options**:
1. **Manual reset only** (current approach)
   - Pros: Prevents false negatives, user controls state
   - Cons: User must remember to reset
2. **Auto-revert on failure**
   - Pros: Automatic maintenance, reflects actual knowledge
   - Cons: May revert temporarily forgotten words too quickly
3. **Gradual decay** (require 2-3 failures to revert)
   - Pros: Forgives occasional mistakes
   - Cons: More complex state machine

**Decision Needed**: Choose forgotten word handling strategy.

**Temporary Plan**: Use manual reset only (Option 1) for MVP. Add auto-revert in Phase 2 if users request it.

---

### Question 3: Unknown vs Not Started

**Context**: Should we distinguish between "never seen" and "explicitly marked as unknown"?

**Options**:
1. **Single "unknown" state** (current approach)
   - Pros: Simpler state machine
   - Cons: Can't distinguish new words from words user marked as unknown
2. **Separate "not_started" and "unknown" states**
   - Pros: Can track which words user actively skipped
   - Cons: More complex UI and state transitions
3. **Implicit state** (no record = unknown)
   - Pros: Minimal database footprint
   - Cons: Harder to query, no audit trail

**Decision Needed**: Choose state granularity level.

**Temporary Plan**: Use single "unknown" state (Option 1) for MVP. Can add not_started in Phase 2 if needed.

---

## Dependencies

**Blocks**:
- F036: Contextual Vocabulary Introduction (uses word state to filter new words)
- F046: SRS Algorithm (word state affects scheduling intervals)

**Depends on**:
- F001: Database Schema (users, vocabulary tables)
- F031: Orthography Gate System (unlocks vocabulary access)
- F047: Review Session Management (triggers state updates)

**Optional**:
- Analytics system for state transition patterns
- Gamification (badges for X known words)

---

## Notes

### Implementation Priority
1. Create database schema (Task 1)
2. Implement word state service (Task 2)
3. Create API endpoints (Task 3)
4. Build UI components (Tasks 4, 5)
5. Integrate with review system (Task 6)

### State Transition Logic
- **unknown → learning**: Triggered on first encounter (exercise, lesson, or review)
- **learning → known**: Triggered after 5+ successful reviews (rating: good or easy)
- **known → learning**: Manual reset only (user action)
- **State Persistence**: All transitions logged with timestamps for audit trail

### Performance Considerations
- Index on (user_id, language, state) for fast dashboard queries
- Batch initialize words when user adds new language
- Cache state statistics in React Query (5-minute stale time)
- Use view for aggregated statistics to avoid repeated GROUP BY queries

### Security Considerations
- Only users can modify their own word states (auth middleware)
- Validate vocabulary_id exists in approved_vocabulary before state creation
- Rate limit state reset endpoint to prevent abuse
- Log all state transitions for audit trail

### UX Considerations
- Visual badges for each state (unknown=gray, learning=yellow, known=green)
- Progress bar showing known/learning/unknown distribution
- Celebration animation when word transitions to "known"
- Option to filter vocabulary list by state
- Show "X more reviews to known" indicator on learning words
