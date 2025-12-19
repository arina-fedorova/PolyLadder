# F046: SRS Algorithm Implementation

**Feature Code**: F046
**Created**: 2025-12-17
**Phase**: 13 - Spaced Repetition System
**Status**: Not Started

---

## Description

Implement SM-2 (SuperMemo 2) spaced repetition algorithm for scheduling vocabulary and grammar review sessions. The algorithm adjusts review intervals based on user performance to optimize long-term retention.

## Success Criteria

- [ ] SM-2 algorithm implemented with ease factor calculation
- [ ] Performance ratings mapped to quality scores (1-5)
- [ ] Interval calculation follows SM-2 specification
- [ ] Due date scheduling in user_srs_schedule
- [ ] Algorithm adjusts based on user performance history
- [ ] Ease factor clamped between 1.3 and 3.0

---

## Tasks

### Task 1: Create SRS Service Interface

**Description**: Define TypeScript interface for SRS service with SM-2 algorithm operations.

**Implementation Plan**:

Create `packages/api/src/services/srs/srs.interface.ts`:
```typescript
export type PerformanceRating = 'again' | 'hard' | 'good' | 'easy';

export interface SRSScheduleItem {
  userId: string;
  itemType: 'vocabulary' | 'grammar' | 'orthography';
  itemId: string;
  dueDate: Date;
  interval: number; // Days until next review
  repetitions: number; // Number of successful reviews
  easeFactor: number; // SM-2 ease factor (1.3 - 3.0)
  lastReviewedAt: Date | null;
}

export interface SRSReviewResult {
  itemId: string;
  rating: PerformanceRating;
  responseTimeMs: number;
  wasCorrect: boolean;
}

export interface SRSUpdateResult {
  nextDueDate: Date;
  newInterval: number;
  newRepetitions: number;
  newEaseFactor: number;
  scheduleId: string;
}

export interface ISRSService {
  /**
   * Calculate next review schedule using SM-2 algorithm
   * @param currentSchedule Current SRS schedule item
   * @param rating User performance rating (1-5 quality score)
   * @returns Updated schedule parameters
   */
  calculateNextReview(
    currentSchedule: SRSScheduleItem,
    rating: PerformanceRating
  ): Promise<SRSUpdateResult>;

  /**
   * Add new item to SRS schedule (first review)
   * @param userId User ID
   * @param itemType Type of item (vocabulary, grammar, orthography)
   * @param itemId ID of the item
   * @returns Initial schedule
   */
  addToSchedule(
    userId: string,
    itemType: 'vocabulary' | 'grammar' | 'orthography',
    itemId: string
  ): Promise<SRSScheduleItem>;

  /**
   * Get all items due for review for a user
   * @param userId User ID
   * @param limit Maximum number of items to return
   * @returns Due items ordered by due_date ASC
   */
  getDueItems(userId: string, limit: number): Promise<SRSScheduleItem[]>;

  /**
   * Update schedule after review
   * @param userId User ID
   * @param result Review result with performance rating
   * @returns Updated schedule
   */
  recordReview(
    userId: string,
    result: SRSReviewResult
  ): Promise<SRSUpdateResult>;
}
```

**Files Created**: `packages/api/src/services/srs/srs.interface.ts`

---

### Task 2: Implement SM-2 Core Algorithm

**Description**: Implement SuperMemo 2 algorithm with quality-based interval calculation.

**Implementation Plan**:

Create `packages/api/src/services/srs/sm2-calculator.ts`:
```typescript
import { PerformanceRating, SRSScheduleItem, SRSUpdateResult } from './srs.interface';

/**
 * SM-2 Algorithm Implementation
 * Based on: https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method
 */
export class SM2Calculator {
  // Performance rating to SM-2 quality score mapping
  private static readonly QUALITY_SCORES: Record<PerformanceRating, number> = {
    again: 0, // Complete blackout, wrong response
    hard: 3,  // Correct response with serious difficulty
    good: 4,  // Correct response with hesitation
    easy: 5,  // Perfect response
  };

  /**
   * Calculate next review interval using SM-2 algorithm
   *
   * SM-2 Formula:
   * - If quality >= 3: interval increases
   * - If quality < 3: reset to day 1
   * - Ease factor: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
   * - EF is clamped to [1.3, 3.0]
   *
   * @param schedule Current schedule item
   * @param rating Performance rating
   * @returns Updated schedule parameters
   */
  public calculateNext(
    schedule: SRSScheduleItem,
    rating: PerformanceRating
  ): Omit<SRSUpdateResult, 'scheduleId'> {
    const quality = SM2Calculator.QUALITY_SCORES[rating];

    let newEaseFactor = schedule.easeFactor;
    let newRepetitions = schedule.repetitions;
    let newInterval = schedule.interval;

    // Calculate new ease factor
    newEaseFactor = this.calculateEaseFactor(schedule.easeFactor, quality);

    // Determine new interval based on performance
    if (quality >= 3) {
      // Correct response: increase interval
      newRepetitions = schedule.repetitions + 1;

      if (newRepetitions === 1) {
        newInterval = 1; // First review: 1 day
      } else if (newRepetitions === 2) {
        newInterval = 6; // Second review: 6 days
      } else {
        // Subsequent reviews: multiply previous interval by ease factor
        newInterval = Math.round(schedule.interval * newEaseFactor);
      }
    } else {
      // Incorrect response: reset to day 1
      newRepetitions = 0;
      newInterval = 1;
      // Note: ease factor still changes to make future reviews easier/harder
    }

    // Calculate next due date
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + newInterval);

    return {
      nextDueDate,
      newInterval,
      newRepetitions,
      newEaseFactor,
    };
  }

  /**
   * Calculate new ease factor using SM-2 formula
   * EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
   * Clamped to [1.3, 3.0]
   */
  private calculateEaseFactor(currentEF: number, quality: number): number {
    const newEF = currentEF + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

    // Clamp ease factor between 1.3 and 3.0
    return Math.max(1.3, Math.min(3.0, newEF));
  }

  /**
   * Get initial ease factor for new items
   */
  public static getInitialEaseFactor(): number {
    return 2.5; // SM-2 default starting ease factor
  }
}
```

**Files Created**: `packages/api/src/services/srs/sm2-calculator.ts`

---

### Task 3: Implement SRS Service with Database Integration

**Description**: Create SRS service that integrates SM-2 algorithm with PostgreSQL database.

**Implementation Plan**:

Create `packages/api/src/services/srs/srs.service.ts`:
```typescript
import { FastifyInstance } from 'fastify';
import {
  ISRSService,
  SRSScheduleItem,
  SRSReviewResult,
  SRSUpdateResult,
  PerformanceRating,
} from './srs.interface';
import { SM2Calculator } from './sm2-calculator';

export class SRSService implements ISRSService {
  private sm2Calculator: SM2Calculator;

  constructor(private fastify: FastifyInstance) {
    this.sm2Calculator = new SM2Calculator();
  }

  async calculateNextReview(
    currentSchedule: SRSScheduleItem,
    rating: PerformanceRating
  ): Promise<SRSUpdateResult> {
    const result = this.sm2Calculator.calculateNext(currentSchedule, rating);

    // Update database with new schedule
    const updateResult = await this.fastify.pg.query(
      `UPDATE user_srs_schedule
       SET
         due_date = $1,
         interval = $2,
         repetitions = $3,
         ease_factor = $4,
         last_reviewed_at = CURRENT_TIMESTAMP
       WHERE user_id = $5 AND item_type = $6 AND item_id = $7
       RETURNING id`,
      [
        result.nextDueDate,
        result.newInterval,
        result.newRepetitions,
        result.newEaseFactor,
        currentSchedule.userId,
        currentSchedule.itemType,
        currentSchedule.itemId,
      ]
    );

    return {
      ...result,
      scheduleId: updateResult.rows[0].id,
    };
  }

  async addToSchedule(
    userId: string,
    itemType: 'vocabulary' | 'grammar' | 'orthography',
    itemId: string
  ): Promise<SRSScheduleItem> {
    const initialEaseFactor = SM2Calculator.getInitialEaseFactor();
    const initialInterval = 1; // First review in 1 day
    const initialDueDate = new Date();
    initialDueDate.setDate(initialDueDate.getDate() + initialInterval);

    const result = await this.fastify.pg.query(
      `INSERT INTO user_srs_schedule
       (user_id, item_type, item_id, due_date, interval, repetitions, ease_factor, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, item_type, item_id) DO NOTHING
       RETURNING *`,
      [userId, itemType, itemId, initialDueDate, initialInterval, 0, initialEaseFactor]
    );

    const row = result.rows[0];
    return this.mapRowToScheduleItem(row);
  }

  async getDueItems(userId: string, limit: number = 50): Promise<SRSScheduleItem[]> {
    const result = await this.fastify.pg.query(
      `SELECT * FROM user_srs_schedule
       WHERE user_id = $1 AND due_date <= CURRENT_TIMESTAMP
       ORDER BY due_date ASC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map(row => this.mapRowToScheduleItem(row));
  }

  async recordReview(
    userId: string,
    reviewResult: SRSReviewResult
  ): Promise<SRSUpdateResult> {
    // Fetch current schedule
    const scheduleResult = await this.fastify.pg.query(
      `SELECT * FROM user_srs_schedule
       WHERE user_id = $1 AND item_id = $2
       FOR UPDATE`, // Lock row for update
      [userId, reviewResult.itemId]
    );

    if (scheduleResult.rows.length === 0) {
      throw new Error(`No SRS schedule found for item ${reviewResult.itemId}`);
    }

    const currentSchedule = this.mapRowToScheduleItem(scheduleResult.rows[0]);

    // Calculate next review using SM-2
    const updateResult = await this.calculateNextReview(
      currentSchedule,
      reviewResult.rating
    );

    // Log review in user_srs_reviews table (for analytics)
    await this.fastify.pg.query(
      `INSERT INTO user_srs_reviews
       (user_id, item_type, item_id, rating, response_time_ms, was_correct, reviewed_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [
        userId,
        currentSchedule.itemType,
        reviewResult.itemId,
        reviewResult.rating,
        reviewResult.responseTimeMs,
        reviewResult.wasCorrect,
      ]
    );

    return updateResult;
  }

  private mapRowToScheduleItem(row: any): SRSScheduleItem {
    return {
      userId: row.user_id,
      itemType: row.item_type,
      itemId: row.item_id,
      dueDate: row.due_date,
      interval: parseInt(row.interval),
      repetitions: parseInt(row.repetitions),
      easeFactor: parseFloat(row.ease_factor),
      lastReviewedAt: row.last_reviewed_at,
    };
  }
}
```

**Files Created**: `packages/api/src/services/srs/srs.service.ts`

---

### Task 4: Add SRS Reviews Tracking Table

**Description**: Database table to log all reviews for analytics and algorithm tuning.

**Implementation Plan**:

Create `packages/db/migrations/014-user-srs-reviews.sql`:
```sql
-- SRS review history for analytics
CREATE TABLE user_srs_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type VARCHAR(50) NOT NULL, -- 'vocabulary', 'grammar', 'orthography'
  item_id UUID NOT NULL,
  rating VARCHAR(20) NOT NULL, -- 'again', 'hard', 'good', 'easy'
  response_time_ms INTEGER NOT NULL, -- Time taken to answer
  was_correct BOOLEAN NOT NULL, -- Whether answer was correct
  reviewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Metadata for analysis
  ease_factor_before DECIMAL(4, 2), -- Ease factor before this review
  interval_before INTEGER, -- Interval before this review

  CONSTRAINT valid_rating CHECK (rating IN ('again', 'hard', 'good', 'easy')),
  CONSTRAINT valid_item_type CHECK (item_type IN ('vocabulary', 'grammar', 'orthography'))
);

CREATE INDEX idx_user_srs_reviews_user ON user_srs_reviews(user_id, reviewed_at DESC);
CREATE INDEX idx_user_srs_reviews_item ON user_srs_reviews(item_type, item_id);

-- Analytics view: user review stats
CREATE VIEW user_review_stats AS
SELECT
  user_id,
  COUNT(*) as total_reviews,
  COUNT(CASE WHEN was_correct THEN 1 END) as correct_reviews,
  ROUND(100.0 * COUNT(CASE WHEN was_correct THEN 1 END) / COUNT(*), 2) as accuracy_pct,
  AVG(response_time_ms) as avg_response_time_ms,
  COUNT(DISTINCT item_id) as unique_items_reviewed,
  MAX(reviewed_at) as last_review_at
FROM user_srs_reviews
GROUP BY user_id;

-- Analytics view: item difficulty (how users perform on each item)
CREATE VIEW item_difficulty_stats AS
SELECT
  item_type,
  item_id,
  COUNT(*) as review_count,
  AVG(CASE
    WHEN rating = 'again' THEN 0
    WHEN rating = 'hard' THEN 3
    WHEN rating = 'good' THEN 4
    WHEN rating = 'easy' THEN 5
  END) as avg_quality_score,
  ROUND(100.0 * COUNT(CASE WHEN was_correct THEN 1 END) / COUNT(*), 2) as success_rate_pct
FROM user_srs_reviews
GROUP BY item_type, item_id;
```

**Files Created**: `packages/db/migrations/014-user-srs-reviews.sql`

---

### Task 5: Create SRS Service Factory and Registration

**Description**: Register SRS service as Fastify plugin for dependency injection.

**Implementation Plan**:

Create `packages/api/src/plugins/srs.plugin.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { SRSService } from '../services/srs/srs.service';

declare module 'fastify' {
  interface FastifyInstance {
    srs: SRSService;
  }
}

const srsPlugin: FastifyPluginAsync = async (fastify) => {
  const srsService = new SRSService(fastify);

  fastify.decorate('srs', srsService);

  fastify.log.info('SRS service initialized with SM-2 algorithm');
};

export default fp(srsPlugin, {
  name: 'srs-service',
  dependencies: ['postgres'], // Ensure DB is connected
});
```

Update `packages/api/src/server.ts` to register SRS plugin:
```typescript
// In registerPlugins function
async function registerPlugins(server: FastifyInstance): Promise<void> {
  // ... existing plugins ...

  // Register SRS service
  await server.register(import('./plugins/srs.plugin'));
}
```

**Files Created**:
- `packages/api/src/plugins/srs.plugin.ts`
- Update `packages/api/src/server.ts`

---

### Task 6: Add Unit Tests for SM-2 Algorithm

**Description**: Test suite verifying SM-2 calculations match specification.

**Implementation Plan**:

Create `packages/api/src/services/srs/sm2-calculator.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { SM2Calculator } from './sm2-calculator';
import { SRSScheduleItem } from './srs.interface';

describe('SM2Calculator', () => {
  const calculator = new SM2Calculator();

  const createSchedule = (overrides: Partial<SRSScheduleItem> = {}): SRSScheduleItem => ({
    userId: 'user-1',
    itemType: 'vocabulary',
    itemId: 'vocab-1',
    dueDate: new Date(),
    interval: 1,
    repetitions: 0,
    easeFactor: 2.5,
    lastReviewedAt: null,
    ...overrides,
  });

  describe('Initial Reviews', () => {
    it('should schedule first review in 1 day on correct answer', () => {
      const schedule = createSchedule();
      const result = calculator.calculateNext(schedule, 'good');

      expect(result.newInterval).toBe(1);
      expect(result.newRepetitions).toBe(1);
      expect(result.newEaseFactor).toBeCloseTo(2.5, 1); // EF stays near 2.5 for quality 4
    });

    it('should schedule second review in 6 days on correct answer', () => {
      const schedule = createSchedule({ repetitions: 1, interval: 1 });
      const result = calculator.calculateNext(schedule, 'good');

      expect(result.newInterval).toBe(6);
      expect(result.newRepetitions).toBe(2);
    });

    it('should reset to day 1 on incorrect answer', () => {
      const schedule = createSchedule({ repetitions: 5, interval: 30 });
      const result = calculator.calculateNext(schedule, 'again');

      expect(result.newInterval).toBe(1);
      expect(result.newRepetitions).toBe(0);
      expect(result.newEaseFactor).toBeLessThan(2.5); // EF decreases
    });
  });

  describe('Ease Factor Calculation', () => {
    it('should increase ease factor for "easy" rating', () => {
      const schedule = createSchedule({ easeFactor: 2.5 });
      const result = calculator.calculateNext(schedule, 'easy');

      expect(result.newEaseFactor).toBeGreaterThan(2.5);
    });

    it('should decrease ease factor for "hard" rating', () => {
      const schedule = createSchedule({ easeFactor: 2.5 });
      const result = calculator.calculateNext(schedule, 'hard');

      expect(result.newEaseFactor).toBeLessThan(2.5);
    });

    it('should clamp ease factor to minimum 1.3', () => {
      const schedule = createSchedule({ easeFactor: 1.3 });
      const result = calculator.calculateNext(schedule, 'again');

      expect(result.newEaseFactor).toBeGreaterThanOrEqual(1.3);
    });

    it('should clamp ease factor to maximum 3.0', () => {
      const schedule = createSchedule({ easeFactor: 2.9 });
      const result = calculator.calculateNext(schedule, 'easy');

      expect(result.newEaseFactor).toBeLessThanOrEqual(3.0);
    });
  });

  describe('Interval Growth', () => {
    it('should grow intervals exponentially after 2nd review', () => {
      let schedule = createSchedule({ repetitions: 2, interval: 6, easeFactor: 2.5 });
      const result = calculator.calculateNext(schedule, 'good');

      // Third review: interval = 6 * 2.5 = 15 days
      expect(result.newInterval).toBeCloseTo(15, 0);
      expect(result.newRepetitions).toBe(3);
    });

    it('should continue exponential growth on subsequent reviews', () => {
      let schedule = createSchedule({ repetitions: 3, interval: 15, easeFactor: 2.5 });
      const result = calculator.calculateNext(schedule, 'good');

      // Fourth review: interval = 15 * 2.5 = 37.5 ≈ 38 days
      expect(result.newInterval).toBeCloseTo(38, 0);
      expect(result.newRepetitions).toBe(4);
    });
  });

  describe('Initial Values', () => {
    it('should return correct initial ease factor', () => {
      expect(SM2Calculator.getInitialEaseFactor()).toBe(2.5);
    });
  });
});
```

**Files Created**: `packages/api/src/services/srs/sm2-calculator.test.ts`

---

## Open Questions

### Question 1: Algorithm Tuning for PolyLadder Context

**Context**: SM-2 was designed for SuperMemo's use case. PolyLadder has unique constraints (multiple languages, parallel learning).

**Options**:
1. Use pure SM-2 as-is
   - Pros: Well-tested, simple to implement
   - Cons: May not optimize for parallel language learning patterns
2. Add language-specific ease factors (e.g., harder languages get boosted EF)
   - Pros: Accounts for language difficulty
   - Cons: More complex, needs tuning
3. Implement modified SM-2 with custom intervals (e.g., 1, 3, 7, 14, 30, 60, 120 days)
   - Pros: More predictable review cadence
   - Cons: Deviates from proven algorithm

**Decision Needed**: Choose algorithm variant before launch.

**Temporary Plan**: Implement pure SM-2. Log all reviews in `user_srs_reviews` table. Analyze data after 1000+ reviews to determine if modifications needed.

---

### Question 2: Performance Rating Mapping

**Context**: SM-2 uses quality scores 0-5. We map 4 ratings ('again', 'hard', 'good', 'easy') to these scores.

**Current Mapping**:
- again = 0 (complete failure)
- hard = 3 (minimum passing)
- good = 4 (good recall)
- easy = 5 (perfect recall)

**Question**: Should we add intermediate ratings (e.g., "okay" = quality 2)?

**Options**:
1. Keep 4 ratings (simpler UX)
2. Add 5th rating "okay" for marginal success (more granular)

**Temporary Plan**: Use 4 ratings for MVP. Add analytics to see if users struggle with binary "hard vs good" decision.

---

### Question 3: SRS Scheduling for Orthography

**Context**: Orthography is a prerequisite (gate) and has character-level learning. Should it follow same SRS as vocabulary?

**Options**:
1. Use SM-2 for individual characters/letter-combos
   - Pros: Consistent with vocabulary
   - Cons: May be too granular (too many reviews)
2. Use simplified schedule (daily practice for 7 days, then weekly)
   - Pros: Simpler, matches "gate" concept
   - Cons: Not adaptive to user performance
3. Don't use SRS for orthography (practice mode only)
   - Pros: Simplest
   - Cons: No reinforcement after gate pass

**Decision Needed**: Determine orthography SRS strategy.

**Temporary Plan**: Implement SRS for orthography with SM-2. If analytics show too many character reviews, switch to simplified schedule.

---

## Dependencies

- **Blocks**: F047 (Review Session Management uses this)
- **Depends on**: F001 (Database tables: `user_srs_schedule`)

---

## Notes

### SM-2 Algorithm Summary

- **Ease Factor (EF)**: Multiplier for interval growth, range [1.3, 3.0], default 2.5
- **Quality Score**: User performance 0-5 (0 = wrong, 3 = minimum pass, 5 = perfect)
- **Intervals**: 1 day (rep 1), 6 days (rep 2), then previous_interval * EF
- **Reset**: Quality < 3 resets to day 1 but keeps modified EF
- **Formula**: `EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))`

### Performance Impact

- SM-2 calculation is pure math (no DB calls)
- Each review = 2 queries (SELECT + UPDATE on `user_srs_schedule`)
- Review logging = 1 INSERT to `user_srs_reviews`
- Expected: <10ms per review with proper indexing

### Future Enhancements

- **Overdue Penalty**: Items overdue by 2x interval could reduce EF
- **Lapse Tracking**: Count consecutive failures, adjust algorithm
- **Adaptive Difficulty**: Adjust EF based on item difficulty stats (see `item_difficulty_stats` view)
