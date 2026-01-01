# F031: Orthography Gate System

**Feature Code**: F031
**Created**: 2025-12-17
**Completed**: 2026-01-01
**Phase**: 8 - Learning Foundation
**Status**: Completed

---

## Description

The orthography gate ensures learners master the writing system, alphabet, pronunciation, and basic phonetics of a language before accessing higher-level content. This CEFR A0-level prerequisite prevents learners from attempting vocabulary and grammar without foundational knowledge of how to read and write the language. The gate tracks progress per language and blocks access to A1+ content until completed.

## Success Criteria

- [x] Orthography gate status tracked per language in database
- [x] Users cannot access A1+ content without passing gate for that language
- [x] Gate completion unlocks vocabulary and grammar content
- [ ] Orthography exercises presented first for new languages
- [~] Progress toward gate completion visible (status-based: locked/unlocked/completed)
- [x] Gate bypass option for operators (testing purposes only)
- [x] Visual gate lock/unlock indicator in learning dashboard
- [ ] Different gate requirements per language (based on writing system complexity)

**Implementation Notes**:

- Simplified gate tracking using status-based approach (locked → unlocked → completed)
- Lesson count progress not implemented (requires approved_orthography table from content pipeline)
- All languages use same gate mechanism (differentiation by complexity not implemented)
- Content ordering (orthography-first) deferred to content presentation layer

---

## Tasks

### Task 1: Orthography Gate Service

**File**: `packages/api/src/services/orthography/orthography-gate.service.ts`

Create service to check gate status and calculate progress.

**Implementation Plan**:

```typescript
import { Pool } from 'pg';

export interface OrthographyGateProgress {
  language: string;
  status: 'locked' | 'in_progress' | 'completed';
  totalLessons: number;
  completedLessons: number;
  percentComplete: number;
  isPassed: boolean;
  completedAt: string | null;
}

export class OrthographyGateService {
  constructor(private readonly pool: Pool) {}

  /**
   * Check if user has passed orthography gate for a language
   */
  async checkGateStatus(userId: string, language: string): Promise<boolean> {
    // Check user_orthography_gates table for status
    const gateResult = await this.pool.query(
      `SELECT status FROM user_orthography_gates
       WHERE user_id = $1 AND language = $2`,
      [userId, language]
    );

    if (gateResult.rows.length === 0) {
      // Gate not initialized yet - create it
      await this.initializeGateForLanguage(userId, language);
      return false;
    }

    return gateResult.rows[0].status === 'completed';
  }

  /**
   * Get detailed progress for orthography gate
   */
  async getGateProgress(userId: string, language: string): Promise<OrthographyGateProgress> {
    // Get total orthography lessons for language
    const totalResult = await this.pool.query(
      `SELECT COUNT(*) as total
       FROM approved_orthography
       WHERE language = $1 AND cefr_level = 'A0'`,
      [language]
    );

    const totalLessons = parseInt(totalResult.rows[0].total, 10);

    // Get completed lessons count
    const completedResult = await this.pool.query(
      `SELECT COUNT(DISTINCT uop.orthography_id) as completed
       FROM user_orthography_progress uop
       JOIN approved_orthography ao ON uop.orthography_id = ao.id
       WHERE uop.user_id = $1
         AND ao.language = $2
         AND ao.cefr_level = 'A0'
         AND uop.status = 'mastered'`,
      [userId, language]
    );

    const completedLessons = parseInt(completedResult.rows[0].completed, 10);

    // Get gate status
    const gateResult = await this.pool.query(
      `SELECT status, completed_at
       FROM user_orthography_gates
       WHERE user_id = $1 AND language = $2`,
      [userId, language]
    );

    const gateStatus = gateResult.rows[0]?.status || 'locked';
    const completedAt = gateResult.rows[0]?.completed_at || null;

    const isPassed = completedLessons >= totalLessons;
    const percentComplete = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;

    // Auto-update gate status if completed but not marked
    if (isPassed && gateStatus !== 'completed') {
      await this.markGateCompleted(userId, language);
    }

    return {
      language,
      status: isPassed ? 'completed' : completedLessons > 0 ? 'in_progress' : 'locked',
      totalLessons,
      completedLessons,
      percentComplete: Math.round(percentComplete),
      isPassed,
      completedAt,
    };
  }

  /**
   * Initialize orthography gate for a new language
   */
  private async initializeGateForLanguage(userId: string, language: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_orthography_gates (user_id, language, status)
       VALUES ($1, $2, 'locked')
       ON CONFLICT (user_id, language) DO NOTHING`,
      [userId, language]
    );
  }

  /**
   * Mark gate as completed
   */
  private async markGateCompleted(userId: string, language: string): Promise<void> {
    await this.pool.query(
      `UPDATE user_orthography_gates
       SET status = 'completed',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $1 AND language = $2`,
      [userId, language]
    );
  }

  /**
   * Bypass gate for testing (operators only)
   */
  async bypassGate(userId: string, language: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_orthography_gates (user_id, language, status, completed_at)
       VALUES ($1, $2, 'completed', NOW())
       ON CONFLICT (user_id, language)
       DO UPDATE SET status = 'completed', completed_at = NOW(), updated_at = NOW()`,
      [userId, language]
    );
  }

  /**
   * Check if user can access content at given CEFR level for language
   */
  async canAccessLevel(userId: string, language: string, cefrLevel: string): Promise<boolean> {
    // A0 (orthography) is always accessible
    if (cefrLevel === 'A0') {
      return true;
    }

    // For A1+, check if gate is passed
    const gatePassed = await this.checkGateStatus(userId, language);
    return gatePassed;
  }
}
```

**Dependencies**: PostgreSQL pool, Database schema (F030 Task 4)

---

### Task 2: API Endpoints for Gate Status

**File**: `packages/api/src/routes/learning/orthography-gate.ts`

Create endpoints for checking and managing gate status.

**Implementation Plan**:

```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { OrthographyGateService } from '../../services/orthography/orthography-gate.service';

const GateStatusQuerySchema = z.object({
  language: z.string().min(2).max(3),
});

const BypassGateSchema = z.object({
  userId: z.string().uuid(),
  language: z.string().min(2).max(3),
});

export default async function orthographyGateRoutes(fastify: FastifyInstance) {
  const gateService = new OrthographyGateService(fastify.pg);

  // GET /learning/orthography-gate/status - Get gate status for language
  fastify.get('/learning/orthography-gate/status', {
    onRequest: [fastify.authenticate],
    schema: {
      querystring: GateStatusQuerySchema,
      response: {
        200: z.object({
          language: z.string(),
          status: z.enum(['locked', 'in_progress', 'completed']),
          totalLessons: z.number(),
          completedLessons: z.number(),
          percentComplete: z.number(),
          isPassed: z.boolean(),
          completedAt: z.string().nullable(),
        }),
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { language } = request.query as z.infer<typeof GateStatusQuerySchema>;

      const progress = await gateService.getGateProgress(userId, language);

      return reply.code(200).send(progress);
    },
  });

  // GET /learning/orthography-gate/all - Get gate status for all user's languages
  fastify.get('/learning/orthography-gate/all', {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const userId = request.user!.id;

      // Get user's studied languages
      const prefsResult = await fastify.pg.query(
        `SELECT studied_languages FROM user_preferences WHERE user_id = $1`,
        [userId]
      );

      if (prefsResult.rows.length === 0) {
        return reply.code(404).send({ error: 'User preferences not found' });
      }

      const languages = prefsResult.rows[0].studied_languages || [];

      // Get gate progress for each language
      const progressPromises = languages.map((lang: string) =>
        gateService.getGateProgress(userId, lang)
      );

      const allProgress = await Promise.all(progressPromises);

      return reply.code(200).send({
        gates: allProgress,
      });
    },
  });

  // POST /learning/orthography-gate/bypass - Bypass gate (operators only)
  fastify.post('/learning/orthography-gate/bypass', {
    onRequest: [fastify.authenticate, fastify.requireRole('operator')],
    schema: {
      body: BypassGateSchema,
      response: {
        200: z.object({
          success: z.boolean(),
          message: z.string(),
        }),
      },
    },
    handler: async (request, reply) => {
      const { userId, language } = request.body as z.infer<typeof BypassGateSchema>;

      await gateService.bypassGate(userId, language);

      return reply.code(200).send({
        success: true,
        message: `Orthography gate bypassed for user ${userId} in language ${language}`,
      });
    },
  });
}
```

**Dependencies**: Fastify, Zod, OrthographyGateService, Auth middleware (F019)

---

### Task 3: Gate Lock Middleware for Content Access

**File**: `packages/api/src/middleware/gate-check.middleware.ts`

Create middleware to enforce gate restrictions on content endpoints.

**Implementation Plan**:

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { OrthographyGateService } from '../services/orthography/orthography-gate.service';

export interface GateCheckOptions {
  languageParam?: string; // Query param name for language (default: 'language')
  cefrLevelParam?: string; // Query param name for CEFR level (default: 'cefrLevel')
}

/**
 * Middleware to check if user has passed orthography gate before accessing content
 */
export function createGateCheckMiddleware(
  gateService: OrthographyGateService,
  options: GateCheckOptions = {}
) {
  const { languageParam = 'language', cefrLevelParam = 'cefrLevel' } = options;

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const language = (request.query as any)[languageParam];
    const cefrLevel = (request.query as any)[cefrLevelParam];

    if (!language) {
      return reply.code(400).send({ error: 'Language parameter required' });
    }

    if (!cefrLevel) {
      return reply.code(400).send({ error: 'CEFR level parameter required' });
    }

    // Check if user can access this level
    const canAccess = await gateService.canAccessLevel(userId, language, cefrLevel);

    if (!canAccess) {
      return reply.code(403).send({
        error: 'Orthography gate not passed',
        message: `You must complete the orthography lessons (A0) for ${language} before accessing ${cefrLevel} content.`,
        gateRequired: true,
      });
    }

    // User can access - continue
  };
}

// Example usage in route:
// fastify.get('/learning/vocabulary', {
//   onRequest: [fastify.authenticate, createGateCheckMiddleware(gateService)],
//   handler: async (request, reply) => { ... }
// });
```

**Dependencies**: Fastify types, OrthographyGateService

---

### Task 4: Gate Lock UI Component

**File**: `packages/web/src/components/learning/OrthographyGateLock.tsx`

Create UI component to display gate status and block content.

**Implementation Plan**:

```typescript
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '../../api/client';

interface OrthographyGateProgress {
  language: string;
  status: 'locked' | 'in_progress' | 'completed';
  totalLessons: number;
  completedLessons: number;
  percentComplete: number;
  isPassed: boolean;
  completedAt: string | null;
}

interface OrthographyGateLockProps {
  language: string;
  children: React.ReactNode;
  showProgress?: boolean;
}

export function OrthographyGateLock({ language, children, showProgress = true }: OrthographyGateLockProps) {
  const { data: gateProgress, isLoading } = useQuery({
    queryKey: ['orthography-gate', language],
    queryFn: async () => {
      const response = await apiClient.get<OrthographyGateProgress>(
        `/learning/orthography-gate/status?language=${language}`
      );
      return response.data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // If gate is passed, show content
  if (gateProgress?.isPassed) {
    return <>{children}</>;
  }

  // Gate not passed - show lock screen
  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="card border-2 border-yellow-300 bg-yellow-50 p-8 text-center space-y-6">
        <div className="flex justify-center">
          <svg className="w-24 h-24 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Orthography Gate Locked
          </h2>
          <p className="text-gray-700">
            Before you can access vocabulary and grammar for{' '}
            <span className="font-semibold">{language}</span>, you need to complete the
            orthography lessons (alphabet, pronunciation, and writing system).
          </p>
        </div>

        {showProgress && gateProgress && (
          <div className="space-y-3">
            <div className="bg-white rounded-lg p-4 border border-yellow-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Progress</span>
                <span className="text-sm font-bold text-gray-900">
                  {gateProgress.completedLessons} / {gateProgress.totalLessons} lessons
                </span>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-yellow-500 h-3 rounded-full transition-all"
                  style={{ width: `${gateProgress.percentComplete}%` }}
                ></div>
              </div>
            </div>

            <p className="text-sm text-gray-600">
              {gateProgress.status === 'locked' && (
                <>You haven't started the orthography lessons yet.</>
              )}
              {gateProgress.status === 'in_progress' && (
                <>You're making progress! Complete {gateProgress.totalLessons - gateProgress.completedLessons} more lessons to unlock this content.</>
              )}
            </p>
          </div>
        )}

        <div>
          <Link
            to={`/learn/orthography?language=${language}`}
            className="btn-primary inline-flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Start Orthography Lessons
          </Link>
        </div>
      </div>
    </div>
  );
}

// Usage example:
// <OrthographyGateLock language="es">
//   <VocabularyContent language="es" />
// </OrthographyGateLock>
```

**Dependencies**: TanStack Query, React Router, API client (F018)

---

### Task 5: Route Registration and Plugin Setup

**File**: `packages/api/src/app.ts`

Register orthography gate routes and initialize service.

**Implementation Plan**:

```typescript
// Add imports
import orthographyGateRoutes from './routes/learning/orthography-gate';
import { OrthographyGateService } from './services/orthography/orthography-gate.service';
import { createGateCheckMiddleware } from './middleware/gate-check.middleware';

// Initialize gate service
const gateService = new OrthographyGateService(app.pg);

// Decorate Fastify instance with gate service (for use in routes)
app.decorate('gateService', gateService);

// Decorate with gate check middleware creator
app.decorate('requireGate', createGateCheckMiddleware);

// Register routes
await app.register(orthographyGateRoutes);
```

**File**: `packages/api/src/routes/learning/vocabulary.ts` (example of using gate middleware)

**Implementation Plan**:

```typescript
// Example: Protect vocabulary endpoint with gate check
fastify.get('/learning/vocabulary', {
  onRequest: [
    fastify.authenticate,
    fastify.requireGate(fastify.gateService, {
      languageParam: 'language',
      cefrLevelParam: 'level',
    }),
  ],
  handler: async (request, reply) => {
    // This handler only runs if user has passed gate
    // ...fetch vocabulary
  },
});
```

**Dependencies**: All previous tasks, Fastify app setup (F018)

---

## Open Questions

### Question 1: Gate Bypass Permissions

**Context**: Operators can bypass gates for testing. Should this require special permissions or audit logging?

**Options**:

1. **Operator role only** (current approach)
   - Pros: Simple, already have role system
   - Cons: All operators can bypass, no granular control
2. **Special "gate-admin" permission**
   - Pros: More granular control
   - Cons: More complex permission system
3. **Audit all bypasses** to separate log table
   - Pros: Accountability, can review bypass history
   - Cons: Additional table, more code

**Decision Needed**: Determine if gate bypass needs special tracking.

**Temporary Plan**: Use operator role only (Option 1) for MVP. Add audit logging in post-launch if needed.

---

### Question 2: Language-Specific Gate Requirements

**Context**: Different languages have different writing system complexity. Should gate requirements vary?

**Options**:

1. **Fixed number of lessons per language** (e.g., 20)
   - Pros: Consistent user experience
   - Cons: Doesn't reflect actual complexity (Spanish needs less than Russian)
2. **Variable lessons based on language** (current approach)
   - Pros: Appropriate difficulty per language
   - Cons: Inconsistent completion time across languages
3. **Difficulty tiers** (Latin=5, Cyrillic=10, Non-phonetic=20)
   - Pros: Balance between consistency and appropriateness
   - Cons: Manual categorization needed

**Decision Needed**: How to scale gate requirements per language?

**Temporary Plan**: Use variable lessons (Option 2) based on approved_orthography count for each language.

---

### Question 3: Partial Gate Access

**Context**: Should users see locked content with previews, or completely hide it until gate passed?

**Options**:

1. **Completely hide** locked content
   - Pros: Clear focus on orthography, no distraction
   - Cons: Users don't know what they're unlocking
2. **Show with preview** (blurred or first sentence)
   - Pros: Motivating to see what's ahead
   - Cons: May tempt users to skip orthography
3. **Show count only** ("Unlock 500+ vocabulary words")
   - Pros: Motivation without distraction
   - Cons: May seem arbitrary

**Decision Needed**: Choose content visibility strategy for locked items.

**Temporary Plan**: Use OrthographyGateLock component (Option 1) to completely hide content until gate passed.

---

## Dependencies

**Blocks**:

- F033-F056: All A1+ learning content (blocked by orthography gate)

**Depends on**:

- F001: Database Schema (user progress tracking)
- F030: Language Selection & Management (gate created when language added)
- F032: Curriculum Graph Engine (defines orthography lessons)
- F033: Orthography Learning Module (the lessons that unlock the gate)

**Optional**:

- Audit logging system for bypass tracking

---

## Notes

### Implementation Priority

1. Create database tables (F030 Task 4, already done)
2. Implement OrthographyGateService (Task 1)
3. Create API endpoints (Task 2)
4. Add gate check middleware (Task 3)
5. Build UI lock component (Task 4)
6. Integrate into routing (Task 5)

### Gate Logic

- **CEFR A0**: Orthography content is always accessible (can't be gated)
- **CEFR A1+**: Requires orthography gate completion for same language
- **Per-Language**: Gates are tracked independently for each language
- **Auto-Completion**: Gate status updates automatically when last orthography lesson completed
- **Bypass**: Operators can bypass gates for testing purposes

### Language-Specific Requirements

- **Latin Alphabet Languages** (Spanish, Italian, Portuguese, French): ~5-10 orthography lessons
- **Cyrillic Languages** (Russian): ~15-20 lessons (new alphabet)
- **Non-Phonetic Languages** (Chinese, Japanese): ~30-40 lessons (complex writing systems)
- **Diacritic-Heavy Languages** (Slovenian): ~15 lessons (Latin + diacritics)

### UX Considerations

- Show clear progress indicator (X/Y lessons completed)
- Provide direct link to start orthography lessons from lock screen
- Visual lock icon to indicate gated content
- Success message and animation when gate unlocked
- Don't frustrate users - make orthography lessons engaging

### Performance Considerations

- Cache gate status in React Query (5-minute stale time)
- Use database indexes on user_orthography_gates(user_id, language)
- Minimize gate checks - check once per page load, not per item
- Consider materializing gate status to avoid repeated joins

### Security Considerations

- Enforce gate checks server-side (never trust client)
- Log all gate bypass operations for audit trail
- Verify user owns the language before checking gate status
- Rate limit gate check endpoint to prevent abuse
