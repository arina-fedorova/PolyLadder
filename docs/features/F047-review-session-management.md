# F047: Review Session Management

**Feature Code**: F047
**Created**: 2025-12-17
**Phase**: 13 - Spaced Repetition System
**Status**: Implemented
**Implemented**: 2026-01-04

---

## Description

Implement review session management that queues due items from the SRS schedule and presents them to users for practice. Sessions track user progress, record performance ratings, and update the SRS algorithm.

## Success Criteria

- [x] Review queue fetched from user_srs_schedule (due_date <= today)
- [x] Items presented in due order (oldest first)
- [x] Performance feedback updates SRS schedule via SM-2 algorithm
- [x] Review count tracked per session
- [x] Session summary shows items reviewed, accuracy, and time spent
- [x] Session can be paused and resumed (via active session tracking)

---

## Implementation Summary

### Files Created

**Database Migration** (`packages/db/src/migrations/`):

- `040_create_user_review_sessions.ts` - Session tracking table with progress and lifecycle

**Review Service** (`packages/api/src/services/review/`):

- `review.interface.ts` - TypeScript interfaces for sessions, queue, and ratings
- `review-session.service.ts` - Service implementing session management
- `index.ts` - Module exports

**API Routes** (`packages/api/src/routes/learning/`):

- `review.ts` - All review session endpoints

**Frontend** (`packages/web/src/components/practice/`):

- `ReviewPracticeSession.tsx` - Flashcard-style review UI component

**Unit Tests** (`packages/api/tests/unit/services/review/`):

- `review-session.service.test.ts` - 18 tests covering service logic

### API Endpoints

- `GET /learning/review/queue` - Fetch due items for review
- `POST /learning/review/session/start` - Start a new session
- `POST /learning/review/submit` - Submit review with SRS update
- `GET /learning/review/session/:id` - Get session stats
- `POST /learning/review/session/:id/complete` - Complete session
- `GET /learning/review/session/active` - Get active session
- `GET /learning/review/history` - Get session history

### Key Features

1. **Session Management**:
   - Start, track, and complete review sessions
   - Auto-cleanup abandoned sessions (24h inactive)
   - Track items reviewed, correct count, response time

2. **SRS Integration**:
   - Uses SM2Calculator from F046 for scheduling
   - Supports both user_srs_schedule and user_srs_items tables
   - Records review history for analytics

3. **Frontend Component**:
   - Flashcard-style review interface
   - Rating buttons with interval previews
   - Progress tracking and session summary

---

## Tasks

### Task 1: Create Review Queue API Endpoint

**Description**: GET /learning/review/queue endpoint to fetch due items for review.

**Implementation Plan**:

Create `packages/api/src/routes/learning/review-queue.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth.middleware';

const ReviewQueueItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  itemType: Type.Union([
    Type.Literal('vocabulary'),
    Type.Literal('grammar'),
    Type.Literal('orthography'),
  ]),
  itemId: Type.String({ format: 'uuid' }),
  dueDate: Type.String({ format: 'date-time' }),
  interval: Type.Integer(),
  repetitions: Type.Integer(),

  // Item details (joined from respective tables)
  itemData: Type.Object({
    // Vocabulary
    wordText: Type.Optional(Type.String()),
    translation: Type.Optional(Type.String()),

    // Grammar
    grammarTopic: Type.Optional(Type.String()),

    // Orthography
    character: Type.Optional(Type.String()),
  }),
});

const ReviewQueueResponseSchema = Type.Object({
  total: Type.Integer(),
  items: Type.Array(ReviewQueueItemSchema),
  nextReviewAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
});

export const reviewQueueRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/queue',
    {
      preHandler: authMiddleware,
      schema: {
        querystring: Type.Object({
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 50 })),
        }),
        response: {
          200: ReviewQueueResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { limit = 50 } = request.query as { limit?: number };

      try {
        // Get due items with joined content
        const queueResult = await fastify.pg.query(
          `SELECT
           s.id,
           s.item_type,
           s.item_id,
           s.due_date,
           s.interval,
           s.repetitions,

           -- Vocabulary data
           v.word_text,
           v.translation,

           -- Grammar data
           g.topic as grammar_topic,

           -- Orthography data
           o.character
         FROM user_srs_schedule s
         LEFT JOIN approved_vocabulary v ON s.item_type = 'vocabulary' AND s.item_id = v.id
         LEFT JOIN approved_grammar_lessons g ON s.item_type = 'grammar' AND s.item_id = g.id
         LEFT JOIN approved_orthography o ON s.item_type = 'orthography' AND s.item_id = o.id
         WHERE s.user_id = $1 AND s.due_date <= CURRENT_TIMESTAMP
         ORDER BY s.due_date ASC
         LIMIT $2`,
          [userId, limit]
        );

        // Get next upcoming review (if no items due now)
        let nextReviewAt = null;
        if (queueResult.rows.length === 0) {
          const nextResult = await fastify.pg.query(
            `SELECT MIN(due_date) as next_due_date
           FROM user_srs_schedule
           WHERE user_id = $1 AND due_date > CURRENT_TIMESTAMP`,
            [userId]
          );

          if (nextResult.rows[0]?.next_due_date) {
            nextReviewAt = nextResult.rows[0].next_due_date.toISOString();
          }
        }

        const items = queueResult.rows.map((row) => ({
          id: row.id,
          itemType: row.item_type,
          itemId: row.item_id,
          dueDate: row.due_date.toISOString(),
          interval: parseInt(row.interval),
          repetitions: parseInt(row.repetitions),
          itemData: {
            wordText: row.word_text || undefined,
            translation: row.translation || undefined,
            grammarTopic: row.grammar_topic || undefined,
            character: row.character || undefined,
          },
        }));

        return reply.status(200).send({
          total: items.length,
          items,
          nextReviewAt,
        });
      } catch (error) {
        request.log.error({ err: error, userId }, 'Failed to fetch review queue');
        throw error;
      }
    }
  );
};
```

**Files Created**: `packages/api/src/routes/learning/review-queue.ts`

---

### Task 2: Create Review Submission Endpoint

**Description**: POST /learning/review/submit endpoint to record review performance and update SRS schedule.

**Implementation Plan**:

Create `packages/api/src/routes/learning/review-submit.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth.middleware';

const SubmitReviewRequestSchema = Type.Object({
  itemId: Type.String({ format: 'uuid' }),
  rating: Type.Union([
    Type.Literal('again'),
    Type.Literal('hard'),
    Type.Literal('good'),
    Type.Literal('easy'),
  ]),
  responseTimeMs: Type.Integer({ minimum: 0 }),
  wasCorrect: Type.Boolean(),
  sessionId: Type.Optional(Type.String({ format: 'uuid' })), // Track which session this belongs to
});

const SubmitReviewResponseSchema = Type.Object({
  success: Type.Boolean(),
  nextReview: Type.Object({
    dueDate: Type.String({ format: 'date-time' }),
    interval: Type.Integer(),
    repetitions: Type.Integer(),
    easeFactor: Type.Number(),
  }),
});

export const reviewSubmitRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/submit',
    {
      preHandler: authMiddleware,
      schema: {
        body: SubmitReviewRequestSchema,
        response: {
          200: SubmitReviewResponseSchema,
          404: Type.Object({
            error: Type.Object({
              statusCode: Type.Literal(404),
              message: Type.String(),
              requestId: Type.String(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { itemId, rating, responseTimeMs, wasCorrect, sessionId } = request.body;

      try {
        // Use SRS service to record review and calculate next schedule
        const updateResult = await fastify.srs.recordReview(userId, {
          itemId,
          rating,
          responseTimeMs,
          wasCorrect,
        });

        // Update session progress if sessionId provided
        if (sessionId) {
          await fastify.pg.query(
            `UPDATE user_review_sessions
           SET items_reviewed = items_reviewed + 1,
               correct_count = correct_count + CASE WHEN $3 THEN 1 ELSE 0 END,
               last_activity_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND user_id = $2`,
            [sessionId, userId, wasCorrect]
          );
        }

        request.log.info(
          { userId, itemId, rating, nextInterval: updateResult.newInterval },
          'Review submitted'
        );

        return reply.status(200).send({
          success: true,
          nextReview: {
            dueDate: updateResult.nextDueDate.toISOString(),
            interval: updateResult.newInterval,
            repetitions: updateResult.newRepetitions,
            easeFactor: updateResult.newEaseFactor,
          },
        });
      } catch (error) {
        if (error.message?.includes('No SRS schedule found')) {
          return reply.status(404).send({
            error: {
              statusCode: 404,
              message: `Item ${itemId} not found in review queue`,
              requestId: request.id,
            },
          });
        }

        request.log.error({ err: error, userId, itemId }, 'Failed to submit review');
        throw error;
      }
    }
  );
};
```

**Files Created**: `packages/api/src/routes/learning/review-submit.ts`

---

### Task 3: Create Review Session Tracking

**Description**: API endpoints to start, pause, and complete review sessions with progress tracking.

**Implementation Plan**:

Create `packages/api/src/routes/learning/review-session.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth.middleware';

const StartSessionResponseSchema = Type.Object({
  sessionId: Type.String({ format: 'uuid' }),
  itemsInQueue: Type.Integer(),
  startedAt: Type.String({ format: 'date-time' }),
});

const SessionStatsSchema = Type.Object({
  sessionId: Type.String({ format: 'uuid' }),
  itemsReviewed: Type.Integer(),
  correctCount: Type.Integer(),
  accuracyPct: Type.Number(),
  durationSeconds: Type.Integer(),
  status: Type.Union([Type.Literal('active'), Type.Literal('completed')]),
  startedAt: Type.String({ format: 'date-time' }),
  completedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
});

export const reviewSessionRoute: FastifyPluginAsync = async (fastify) => {
  // Start a new review session
  fastify.post(
    '/session/start',
    {
      preHandler: authMiddleware,
      schema: {
        response: {
          200: StartSessionResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;

      try {
        // Check how many items are due
        const queueCount = await fastify.pg.query(
          `SELECT COUNT(*) as count
         FROM user_srs_schedule
         WHERE user_id = $1 AND due_date <= CURRENT_TIMESTAMP`,
          [userId]
        );

        const itemsInQueue = parseInt(queueCount.rows[0].count);

        // Create session record
        const sessionResult = await fastify.pg.query(
          `INSERT INTO user_review_sessions
         (user_id, items_reviewed, correct_count, status, started_at, last_activity_at)
         VALUES ($1, 0, 0, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id, started_at`,
          [userId]
        );

        const session = sessionResult.rows[0];

        request.log.info({ userId, sessionId: session.id, itemsInQueue }, 'Review session started');

        return reply.status(200).send({
          sessionId: session.id,
          itemsInQueue,
          startedAt: session.started_at.toISOString(),
        });
      } catch (error) {
        request.log.error({ err: error, userId }, 'Failed to start review session');
        throw error;
      }
    }
  );

  // Get session stats
  fastify.get(
    '/session/:sessionId',
    {
      preHandler: authMiddleware,
      schema: {
        params: Type.Object({
          sessionId: Type.String({ format: 'uuid' }),
        }),
        response: {
          200: SessionStatsSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { sessionId } = request.params as { sessionId: string };

      try {
        const result = await fastify.pg.query(
          `SELECT
           id,
           items_reviewed,
           correct_count,
           status,
           started_at,
           completed_at,
           EXTRACT(EPOCH FROM (COALESCE(completed_at, CURRENT_TIMESTAMP) - started_at)) as duration_seconds
         FROM user_review_sessions
         WHERE id = $1 AND user_id = $2`,
          [sessionId, userId]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({
            error: {
              statusCode: 404,
              message: 'Session not found',
              requestId: request.id,
            },
          });
        }

        const session = result.rows[0];
        const itemsReviewed = parseInt(session.items_reviewed);
        const correctCount = parseInt(session.correct_count);

        return reply.status(200).send({
          sessionId: session.id,
          itemsReviewed,
          correctCount,
          accuracyPct: itemsReviewed > 0 ? Math.round((correctCount / itemsReviewed) * 100) : 0,
          durationSeconds: Math.round(parseFloat(session.duration_seconds)),
          status: session.status,
          startedAt: session.started_at.toISOString(),
          completedAt: session.completed_at ? session.completed_at.toISOString() : null,
        });
      } catch (error) {
        request.log.error({ err: error, userId, sessionId }, 'Failed to fetch session stats');
        throw error;
      }
    }
  );

  // Complete a review session
  fastify.post(
    '/session/:sessionId/complete',
    {
      preHandler: authMiddleware,
      schema: {
        params: Type.Object({
          sessionId: Type.String({ format: 'uuid' }),
        }),
        response: {
          200: SessionStatsSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { sessionId } = request.params as { sessionId: string };

      try {
        const result = await fastify.pg.query(
          `UPDATE user_review_sessions
         SET status = 'completed', completed_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2 AND status = 'active'
         RETURNING
           id,
           items_reviewed,
           correct_count,
           status,
           started_at,
           completed_at,
           EXTRACT(EPOCH FROM (completed_at - started_at)) as duration_seconds`,
          [sessionId, userId]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({
            error: {
              statusCode: 404,
              message: 'Session not found or already completed',
              requestId: request.id,
            },
          });
        }

        const session = result.rows[0];
        const itemsReviewed = parseInt(session.items_reviewed);
        const correctCount = parseInt(session.correct_count);

        request.log.info(
          { userId, sessionId, itemsReviewed, correctCount },
          'Review session completed'
        );

        return reply.status(200).send({
          sessionId: session.id,
          itemsReviewed,
          correctCount,
          accuracyPct: itemsReviewed > 0 ? Math.round((correctCount / itemsReviewed) * 100) : 0,
          durationSeconds: Math.round(parseFloat(session.duration_seconds)),
          status: session.status,
          startedAt: session.started_at.toISOString(),
          completedAt: session.completed_at!.toISOString(),
        });
      } catch (error) {
        request.log.error({ err: error, userId, sessionId }, 'Failed to complete session');
        throw error;
      }
    }
  );
};
```

**Files Created**: `packages/api/src/routes/learning/review-session.ts`

---

### Task 4: Add Review Sessions Database Table

**Description**: Database table to track review session metadata and progress.

**Implementation Plan**:

Create `packages/db/migrations/015-user-review-sessions.sql`:

```sql
-- User review sessions for tracking study sessions
CREATE TABLE user_review_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Session progress
  items_reviewed INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,

  -- Session lifecycle
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'completed'
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL,

  CONSTRAINT valid_status CHECK (status IN ('active', 'completed')),
  CONSTRAINT valid_counts CHECK (correct_count <= items_reviewed)
);

CREATE INDEX idx_user_review_sessions_user ON user_review_sessions(user_id, started_at DESC);
CREATE INDEX idx_user_review_sessions_status ON user_review_sessions(status, last_activity_at);

-- View: User session summary statistics
CREATE VIEW user_session_summary AS
SELECT
  user_id,
  COUNT(*) as total_sessions,
  SUM(items_reviewed) as total_items_reviewed,
  SUM(correct_count) as total_correct,
  ROUND(100.0 * SUM(correct_count) / NULLIF(SUM(items_reviewed), 0), 2) as overall_accuracy_pct,
  AVG(EXTRACT(EPOCH FROM (COALESCE(completed_at, CURRENT_TIMESTAMP) - started_at)) / 60) as avg_session_duration_min,
  MAX(completed_at) as last_session_at
FROM user_review_sessions
WHERE status = 'completed'
GROUP BY user_id;

-- Cleanup abandoned sessions (active for > 24 hours with no activity)
CREATE OR REPLACE FUNCTION cleanup_abandoned_sessions() RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE user_review_sessions
  SET status = 'completed', completed_at = last_activity_at
  WHERE status = 'active' AND last_activity_at < CURRENT_TIMESTAMP - INTERVAL '24 hours'
  RETURNING * INTO updated_count;

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;
```

**Files Created**: `packages/db/migrations/015-user-review-sessions.sql`

---

### Task 5: Register Review Routes

**Description**: Register all review-related routes under /learning/review prefix.

**Implementation Plan**:

Create `packages/api/src/routes/learning/review/index.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { reviewQueueRoute } from './review-queue';
import { reviewSubmitRoute } from './review-submit';
import { reviewSessionRoute } from './review-session';

export const reviewRoutes: FastifyPluginAsync = async (fastify) => {
  // Register all review routes
  await fastify.register(reviewQueueRoute);
  await fastify.register(reviewSubmitRoute);
  await fastify.register(reviewSessionRoute);
};
```

Update `packages/api/src/routes/learning/index.ts` to include review routes:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { languagesRoute } from './languages';
import { orthographyRoute } from './orthography';
import { vocabularyRoute } from './vocabulary';
import { exercisesRoute } from './exercises';
import { srsRoute } from './srs';
import { reviewRoutes } from './review'; // NEW

export const learningRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(languagesRoute);
  await fastify.register(orthographyRoute);
  await fastify.register(vocabularyRoute);
  await fastify.register(exercisesRoute);
  await fastify.register(srsRoute);
  await fastify.register(reviewRoutes, { prefix: '/review' }); // NEW
};
```

**Files Created**:

- `packages/api/src/routes/learning/review/index.ts`
- Update `packages/api/src/routes/learning/index.ts`

---

### Task 6: Create React Review Session Component

**Description**: React component for review session UI with flashcard-style interface.

**Implementation Plan**:

Create `packages/web/src/pages/ReviewSession.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

interface ReviewItem {
  id: string;
  itemType: 'vocabulary' | 'grammar' | 'orthography';
  itemId: string;
  itemData: {
    wordText?: string;
    translation?: string;
    grammarTopic?: string;
    character?: string;
  };
}

export const ReviewSession: React.FC = () => {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionStats, setSessionStats] = useState({
    itemsReviewed: 0,
    correctCount: 0,
  });

  useEffect(() => {
    startSession();
  }, []);

  const startSession = async () => {
    try {
      // Start session
      const sessionRes = await api.post('/learning/review/session/start');
      setSessionId(sessionRes.sessionId);

      // Fetch queue
      const queueRes = await api.get('/learning/review/queue');
      setQueue(queueRes.items);

      if (queueRes.items.length === 0) {
        // No items due
        alert(`No reviews due! Next review: ${queueRes.nextReviewAt || 'N/A'}`);
        navigate('/dashboard');
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to start session:', error);
      setLoading(false);
    }
  };

  const submitReview = async (rating: 'again' | 'hard' | 'good' | 'easy') => {
    if (!sessionId) return;

    const currentItem = queue[currentIndex];
    const startTime = Date.now();

    try {
      await api.post('/learning/review/submit', {
        itemId: currentItem.itemId,
        rating,
        responseTimeMs: showAnswer ? Date.now() - startTime : 0,
        wasCorrect: rating !== 'again',
        sessionId,
      });

      // Update stats
      setSessionStats(prev => ({
        itemsReviewed: prev.itemsReviewed + 1,
        correctCount: prev.correctCount + (rating !== 'again' ? 1 : 0),
      }));

      // Move to next item
      if (currentIndex < queue.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setShowAnswer(false);
      } else {
        // Session complete
        completeSession();
      }
    } catch (error) {
      console.error('Failed to submit review:', error);
    }
  };

  const completeSession = async () => {
    if (!sessionId) return;

    try {
      const stats = await api.post(`/learning/review/session/${sessionId}/complete`);
      navigate('/review/summary', { state: { stats } });
    } catch (error) {
      console.error('Failed to complete session:', error);
    }
  };

  if (loading) {
    return <div className="loading">Loading review session...</div>;
  }

  if (queue.length === 0) {
    return <div>No items to review!</div>;
  }

  const currentItem = queue[currentIndex];
  const progress = ((currentIndex + 1) / queue.length) * 100;

  return (
    <div className="review-session">
      <div className="review-header">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="stats">
          <span>Reviewed: {sessionStats.itemsReviewed}</span>
          <span>
            Accuracy:{' '}
            {sessionStats.itemsReviewed > 0
              ? Math.round((sessionStats.correctCount / sessionStats.itemsReviewed) * 100)
              : 0}
            %
          </span>
        </div>
      </div>

      <div className="flashcard">
        <div className="card-front">
          <h2>
            {currentItem.itemType === 'vocabulary' && currentItem.itemData.wordText}
            {currentItem.itemType === 'grammar' && currentItem.itemData.grammarTopic}
            {currentItem.itemType === 'orthography' && currentItem.itemData.character}
          </h2>
        </div>

        {showAnswer && (
          <div className="card-back">
            <p className="answer">
              {currentItem.itemType === 'vocabulary' && currentItem.itemData.translation}
              {currentItem.itemType === 'grammar' && 'Grammar explanation...'}
              {currentItem.itemType === 'orthography' && 'Pronunciation...'}
            </p>
          </div>
        )}
      </div>

      {!showAnswer ? (
        <button className="btn-show-answer" onClick={() => setShowAnswer(true)}>
          Show Answer
        </button>
      ) : (
        <div className="rating-buttons">
          <button className="btn-again" onClick={() => submitReview('again')}>
            Again
          </button>
          <button className="btn-hard" onClick={() => submitReview('hard')}>
            Hard
          </button>
          <button className="btn-good" onClick={() => submitReview('good')}>
            Good
          </button>
          <button className="btn-easy" onClick={() => submitReview('easy')}>
            Easy
          </button>
        </div>
      )}

      <button className="btn-quit" onClick={completeSession}>
        End Session
      </button>
    </div>
  );
};
```

**Files Created**: `packages/web/src/pages/ReviewSession.tsx`

---

### Task 7: Create Session Summary Component

**Description**: Post-session summary page showing performance statistics.

**Implementation Plan**:

Create `packages/web/src/pages/ReviewSummary.tsx`:

```typescript
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface SessionStats {
  sessionId: string;
  itemsReviewed: number;
  correctCount: number;
  accuracyPct: number;
  durationSeconds: number;
}

export const ReviewSummary: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const stats = location.state?.stats as SessionStats | undefined;

  if (!stats) {
    return <div>No session data available</div>;
  }

  const durationMin = Math.floor(stats.durationSeconds / 60);
  const durationSec = stats.durationSeconds % 60;

  return (
    <div className="review-summary">
      <h1>Review Complete!</h1>

      <div className="summary-stats">
        <div className="stat-card">
          <h2>{stats.itemsReviewed}</h2>
          <p>Items Reviewed</p>
        </div>

        <div className="stat-card">
          <h2>{stats.correctCount}</h2>
          <p>Correct</p>
        </div>

        <div className="stat-card">
          <h2>{stats.accuracyPct}%</h2>
          <p>Accuracy</p>
        </div>

        <div className="stat-card">
          <h2>
            {durationMin}m {durationSec}s
          </h2>
          <p>Duration</p>
        </div>
      </div>

      <div className="summary-actions">
        <button onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
        <button onClick={() => navigate('/review')}>Start New Session</button>
      </div>
    </div>
  );
};
```

**Files Created**: `packages/web/src/pages/ReviewSummary.tsx`

---

## Open Questions

### Question 1: Review Session Auto-Pause

**Context**: Users may close browser during review session. Should we auto-pause/resume?

**Options**:

1. Auto-save progress, allow resume from where they left off
   - Pros: Better UX, no lost progress
   - Cons: More complex state management
2. Abandon session if closed (cleanup after 24h)
   - Pros: Simpler implementation
   - Cons: Poor UX if accidental close
3. Prompt user before closing (onbeforeunload)
   - Pros: Prevents accidental data loss
   - Cons: Browser prompts can be annoying

**Temporary Plan**: Use option 2 (abandon after 24h). Add cleanup_abandoned_sessions() cron job. Consider auto-resume in future iteration if users request it.

---

### Question 2: Review Queue Size Limit

**Context**: Users with large backlogs (e.g., 500 due items) may be overwhelmed.

**Options**:

1. Show all due items (current implementation)
   - Pros: Complete, users see full backlog
   - Cons: May be demotivating
2. Cap queue at 50 items, show "X more items due"
   - Pros: Less overwhelming
   - Cons: Users may not realize full backlog size
3. Adaptive limit based on user preferences
   - Pros: Flexible
   - Cons: More configuration needed

**Temporary Plan**: Use option 2 (cap at 50, default). Add user setting later to configure limit.

---

### Question 3: Flashcard Flip Animation

**Context**: Current implementation shows/hides answer. Should we add card flip animation?

**Options**:

1. Simple show/hide (current)
   - Pros: Simple, fast
   - Cons: Less engaging
2. CSS flip animation
   - Pros: More engaging, familiar pattern
   - Cons: May be distracting for some users
3. Slide animation
   - Pros: Alternative visual feedback
   - Cons: Takes more screen space

**Temporary Plan**: Start with simple show/hide (option 1). Add flip animation as enhancement if users request it.

---

## Dependencies

- **Blocks**: F039-F045 (Practice modes can use review session infrastructure)
- **Depends on**: F046 (SRS Algorithm), F021 (Learning Endpoints)

---

## Notes

### Review Session Workflow

1. **Start Session**: POST /learning/review/session/start → creates session record, returns sessionId
2. **Fetch Queue**: GET /learning/review/queue → returns due items with content
3. **Show Item**: Display flashcard with question
4. **Show Answer**: User clicks "Show Answer" button
5. **Rate Performance**: User clicks rating button (again/hard/good/easy)
6. **Submit Review**: POST /learning/review/submit → updates SRS schedule, logs review
7. **Repeat**: Steps 3-6 for each item in queue
8. **Complete Session**: POST /learning/review/session/:id/complete → marks session done

### Performance Considerations

- Review queue query joins 3 tables (vocabulary, grammar, orthography)
- Use LEFT JOINs since each item only matches one type
- Limit queue to 50 items by default to keep query fast
- Session stats updated via single UPDATE query per review

### UX Design Notes

- **Flashcard Pattern**: Familiar to language learners, tested UX
- **4 Rating Buttons**: Maps to SM-2 quality scores (again=0, hard=3, good=4, easy=5)
- **Progress Bar**: Visual feedback on session completion
- **Session Summary**: Motivational feedback, shows improvement over time
- **Quick Actions**: "End Session" button for flexible stopping

### Future Enhancements

- **Audio Pronunciation**: Play audio for vocabulary/orthography items
- **Keyboard Shortcuts**: Space = show answer, 1-4 = ratings
- **Streaks**: Track consecutive days with reviews
- **Daily Goal**: Set target reviews per day
- **Review Heatmap**: Calendar view of review activity
