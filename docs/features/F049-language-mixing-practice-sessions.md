# F049: Language Mixing in Practice Sessions

**Feature Code**: F049
**Created**: 2025-12-17
**Phase**: 14 - Parallel Learning Support
**Status**: Not Started

---

## Description

Implement practice sessions that randomly mix exercises from all languages the user is studying to build mental agility and language switching skills. This feature trains users to rapidly switch between languages without confusion, reducing interference and improving long-term retention. The system creates a unified practice queue drawing from SRS items across all languages, with visual indicators showing which language each exercise targets.

## Success Criteria

- [ ] Practice session pulls exercises from all studied languages simultaneously
- [ ] Randomized ordering with no predictable patterns
- [ ] Clear language indicator for each exercise (flag, color badge, language name)
- [ ] Separate performance tracking per language within session
- [ ] User preference to enable/disable mixing (opt-in)
- [ ] Mixing ratio configurable (equal distribution vs weighted by proficiency)
- [ ] Session summary showing per-language breakdown

---

## Tasks

### Task 1: Create Mixed Practice Session Service

**File**: `packages/api/src/services/practice/mixed-session.service.ts`

Create backend service that:
- Fetches SRS items from all user's languages
- Creates randomized mixed queue with configurable distribution
- Tracks performance per language within mixed session
- Generates session summary with per-language analytics
- Respects user's mixing preferences

**Implementation**:

```typescript
// packages/api/src/services/practice/mixed-session.service.ts
import { Pool } from 'pg';
import { SRSService } from '../srs/srs.service';

interface MixedSessionConfig {
  userId: string;
  practiceTypes: PracticeType[]; // Which modes to include
  itemsPerLanguage: number; // Items from each language
  mixingStrategy: 'equal' | 'weighted' | 'random';
  totalItems: number; // Total items in session
}

type PracticeType = 'recall' | 'recognition' | 'cloze' | 'translation' | 'production';

interface MixedExerciseItem {
  id: string;
  language: string;
  practiceType: PracticeType;
  srsItemId: string;
  content: any; // Exercise-specific content
  estimatedDifficulty: number; // 1-5
}

interface MixedSessionSummary {
  sessionId: string;
  totalItems: number;
  totalCorrect: number;
  totalTime: number; // seconds
  languageBreakdown: LanguagePerformance[];
  switchingEfficiency: number; // 0.0-1.0, how well user handles switches
}

interface LanguagePerformance {
  language: string;
  itemsAttempted: number;
  correctAnswers: number;
  averageTime: number;
  accuracy: number;
}

export class MixedSessionService {
  constructor(
    private pool: Pool,
    private srsService: SRSService
  ) {}

  /**
   * Create a mixed practice session queue
   * Pulls from all user's languages and randomizes order
   */
  async createMixedSession(config: MixedSessionConfig): Promise<{
    sessionId: string;
    items: MixedExerciseItem[];
  }> {
    // Get user's active languages
    const languagesResult = await this.pool.query(
      `SELECT language FROM user_language_progress
       WHERE user_id = $1 AND is_active = true
       ORDER BY language ASC`,
      [config.userId]
    );

    const languages = languagesResult.rows.map(r => r.language);

    if (languages.length < 2) {
      throw new Error('Mixed practice requires at least 2 active languages');
    }

    // Fetch SRS items from each language
    const allItems: MixedExerciseItem[] = [];

    for (const language of languages) {
      const itemsForLanguage = await this.fetchItemsForLanguage(
        config.userId,
        language,
        config.practiceTypes,
        config.itemsPerLanguage
      );
      allItems.push(...itemsForLanguage);
    }

    // Apply mixing strategy
    let finalItems: MixedExerciseItem[];

    switch (config.mixingStrategy) {
      case 'equal':
        // Equal items from each language
        finalItems = this.equalDistribution(allItems, languages, config.totalItems);
        break;
      case 'weighted':
        // Weight by proficiency (more items from weaker languages)
        finalItems = await this.weightedDistribution(
          config.userId,
          allItems,
          languages,
          config.totalItems
        );
        break;
      case 'random':
        // Completely random selection
        finalItems = this.randomSample(allItems, config.totalItems);
        break;
    }

    // Shuffle to avoid language clustering
    finalItems = this.fisherYatesShuffle(finalItems);

    // Create session record
    const sessionResult = await this.pool.query(
      `INSERT INTO mixed_practice_sessions
         (user_id, languages, mixing_strategy, total_items, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id`,
      [config.userId, languages, config.mixingStrategy, finalItems.length]
    );

    return {
      sessionId: sessionResult.rows[0].id,
      items: finalItems
    };
  }

  /**
   * Fetch SRS items for a specific language
   */
  private async fetchItemsForLanguage(
    userId: string,
    language: string,
    practiceTypes: PracticeType[],
    limit: number
  ): Promise<MixedExerciseItem[]> {
    const result = await this.pool.query(
      `SELECT
         usi.id AS srs_item_id,
         COALESCE(av.language, au.language, agr.language) AS language,
         CASE
           WHEN av.id IS NOT NULL THEN 'recall'
           WHEN au.id IS NOT NULL THEN 'recognition'
           ELSE 'recall'
         END AS practice_type,
         COALESCE(av.word_text, au.utterance_text, agr.rule_name) AS content,
         usi.ease_factor AS difficulty
       FROM user_srs_items usi
       LEFT JOIN approved_vocabulary av ON usi.vocabulary_id = av.id
       LEFT JOIN approved_utterances au ON usi.utterance_id = au.id
       LEFT JOIN approved_grammar_rules agr ON usi.grammar_rule_id = agr.id
       WHERE usi.user_id = $1
         AND COALESCE(av.language, au.language, agr.language) = $2
         AND usi.next_review_date <= NOW()
       ORDER BY usi.next_review_date ASC
       LIMIT $3`,
      [userId, language, limit]
    );

    return result.rows.map(row => ({
      id: row.srs_item_id,
      language: row.language,
      practiceType: row.practice_type,
      srsItemId: row.srs_item_id,
      content: { text: row.content },
      estimatedDifficulty: 6 - row.difficulty // Invert ease factor to difficulty
    }));
  }

  /**
   * Equal distribution: same number from each language
   */
  private equalDistribution(
    items: MixedExerciseItem[],
    languages: string[],
    totalItems: number
  ): MixedExerciseItem[] {
    const itemsPerLanguage = Math.floor(totalItems / languages.length);
    const result: MixedExerciseItem[] = [];

    for (const language of languages) {
      const langItems = items.filter(i => i.language === language);
      result.push(...langItems.slice(0, itemsPerLanguage));
    }

    return result;
  }

  /**
   * Weighted distribution: more items from weaker languages
   */
  private async weightedDistribution(
    userId: string,
    items: MixedExerciseItem[],
    languages: string[],
    totalItems: number
  ): Promise<MixedExerciseItem[]> {
    // Get proficiency scores for each language
    const proficiencyResult = await this.pool.query(
      `SELECT language, proficiency_score
       FROM user_language_progress
       WHERE user_id = $1 AND language = ANY($2::varchar[])`,
      [userId, languages]
    );

    const proficiencies = new Map(
      proficiencyResult.rows.map(r => [r.language, r.proficiency_score || 0])
    );

    // Calculate weights (inverse of proficiency)
    const maxProficiency = Math.max(...Array.from(proficiencies.values()));
    const weights = new Map(
      Array.from(proficiencies.entries()).map(([lang, prof]) => [
        lang,
        maxProficiency - prof + 1 // Inverse weight
      ])
    );

    const totalWeight = Array.from(weights.values()).reduce((sum, w) => sum + w, 0);

    const result: MixedExerciseItem[] = [];

    for (const language of languages) {
      const weight = weights.get(language) || 1;
      const itemCount = Math.floor((weight / totalWeight) * totalItems);
      const langItems = items.filter(i => i.language === language);
      result.push(...langItems.slice(0, itemCount));
    }

    return result;
  }

  /**
   * Random sample from all items
   */
  private randomSample(items: MixedExerciseItem[], count: number): MixedExerciseItem[] {
    const shuffled = this.fisherYatesShuffle([...items]);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  /**
   * Fisher-Yates shuffle algorithm
   */
  private fisherYatesShuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Record practice attempt in mixed session
   */
  async recordMixedAttempt(
    sessionId: string,
    itemId: string,
    language: string,
    isCorrect: boolean,
    timeSpent: number // seconds
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO mixed_session_attempts
         (session_id, item_id, language, is_correct, time_spent, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [sessionId, itemId, language, isCorrect, timeSpent]
    );
  }

  /**
   * Generate session summary with per-language breakdown
   */
  async generateSessionSummary(sessionId: string): Promise<MixedSessionSummary> {
    // Get overall stats
    const overallResult = await this.pool.query(
      `SELECT
         COUNT(*) AS total_items,
         SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS total_correct,
         SUM(time_spent) AS total_time
       FROM mixed_session_attempts
       WHERE session_id = $1`,
      [sessionId]
    );

    // Get per-language breakdown
    const languageResult = await this.pool.query(
      `SELECT
         language,
         COUNT(*) AS items_attempted,
         SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct_answers,
         AVG(time_spent) AS average_time,
         CAST(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) AS accuracy
       FROM mixed_session_attempts
       WHERE session_id = $1
       GROUP BY language
       ORDER BY language ASC`,
      [sessionId]
    );

    const languageBreakdown: LanguagePerformance[] = languageResult.rows.map(row => ({
      language: row.language,
      itemsAttempted: parseInt(row.items_attempted),
      correctAnswers: parseInt(row.correct_answers),
      averageTime: parseFloat(row.average_time),
      accuracy: parseFloat(row.accuracy)
    }));

    // Calculate switching efficiency (penalty for language switches with errors)
    const switchingEfficiency = await this.calculateSwitchingEfficiency(sessionId);

    // Mark session as completed
    await this.pool.query(
      `UPDATE mixed_practice_sessions
       SET completed_at = NOW(), switching_efficiency = $2
       WHERE id = $1`,
      [sessionId, switchingEfficiency]
    );

    return {
      sessionId,
      totalItems: parseInt(overallResult.rows[0].total_items),
      totalCorrect: parseInt(overallResult.rows[0].total_correct),
      totalTime: parseInt(overallResult.rows[0].total_time),
      languageBreakdown,
      switchingEfficiency
    };
  }

  /**
   * Calculate how efficiently user handles language switches
   * Looks at accuracy immediately after language changes
   */
  private async calculateSwitchingEfficiency(sessionId: string): Promise<number> {
    const result = await this.pool.query(
      `WITH ordered_attempts AS (
         SELECT
           language,
           is_correct,
           LAG(language) OVER (ORDER BY created_at) AS prev_language,
           created_at
         FROM mixed_session_attempts
         WHERE session_id = $1
       ),
       switches AS (
         SELECT
           CASE WHEN is_correct THEN 1 ELSE 0 END AS correct_after_switch
         FROM ordered_attempts
         WHERE language != prev_language AND prev_language IS NOT NULL
       )
       SELECT
         COALESCE(AVG(correct_after_switch), 1.0) AS efficiency
       FROM switches`,
      [sessionId]
    );

    return parseFloat(result.rows[0]?.efficiency || '1.0');
  }
}
```

**Database Schema Additions**:

```sql
-- Mixed practice sessions
CREATE TABLE mixed_practice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  languages VARCHAR(20)[] NOT NULL,
  mixing_strategy VARCHAR(20) CHECK (mixing_strategy IN ('equal', 'weighted', 'random')),
  total_items INT NOT NULL,
  switching_efficiency FLOAT, -- Set after completion
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Attempts within mixed sessions
CREATE TABLE mixed_session_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES mixed_practice_sessions(id) ON DELETE CASCADE,
  item_id VARCHAR(100) NOT NULL,
  language VARCHAR(20) NOT NULL,
  is_correct BOOLEAN NOT NULL,
  time_spent INT NOT NULL, -- seconds
  created_at TIMESTAMP DEFAULT NOW()
);

-- User preferences for mixing
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS
  enable_language_mixing BOOLEAN DEFAULT false,
  mixing_strategy VARCHAR(20) DEFAULT 'equal',
  items_per_session INT DEFAULT 20;

CREATE INDEX idx_mixed_sessions_user ON mixed_practice_sessions(user_id);
CREATE INDEX idx_mixed_attempts_session ON mixed_session_attempts(session_id);
CREATE INDEX idx_mixed_attempts_created ON mixed_session_attempts(created_at);
```

**Open Questions**:
1. **Switching Penalty**: Should we add a small time buffer after language switches to let users mentally adjust?
   - **No buffer**: Natural switching practice
   - **1-2 second buffer**: Reduces frustration, more forgiving
   - **Recommendation**: No buffer for MVP, users can pause manually if needed

2. **Language Clustering Prevention**: Should we actively prevent clustering (e.g., no more than 2 consecutive items from same language)?
   - **Fully random**: True randomness may cluster
   - **Enforced distribution**: Guarantees no clustering, but less random
   - **Recommendation**: Enforced max 2 consecutive same-language items

3. **Difficulty Balancing Across Languages**: Should mixed sessions match difficulty levels across languages (e.g., all A2-level items)?
   - **Match difficulty**: Fair comparison, but may not respect individual SRS schedules
   - **Respect SRS**: Items due for review, regardless of difficulty
   - **Recommendation**: Respect SRS, show difficulty in results

---

### Task 2: Create Mixed Practice API Endpoints

**File**: `packages/api/src/routes/practice/mixed-session.ts`

Add REST endpoints for:
- POST `/practice/mixed/start` - Start a new mixed session
- POST `/practice/mixed/submit` - Submit answer for an item
- GET `/practice/mixed/summary/:sessionId` - Get session summary
- GET `/practice/mixed/preferences` - Get user's mixing preferences
- PUT `/practice/mixed/preferences` - Update mixing preferences

**Implementation**:

```typescript
// packages/api/src/routes/practice/mixed-session.ts
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { MixedSessionService } from '../../services/practice/mixed-session.service';

const StartMixedSessionSchema = z.object({
  practiceTypes: z.array(z.enum(['recall', 'recognition', 'cloze', 'translation', 'production'])),
  itemsPerLanguage: z.number().int().min(5).max(50).default(10),
  mixingStrategy: z.enum(['equal', 'weighted', 'random']).default('equal'),
  totalItems: z.number().int().min(10).max(100).default(20)
});

const SubmitMixedAttemptSchema = z.object({
  sessionId: z.string().uuid(),
  itemId: z.string(),
  language: z.string(),
  isCorrect: z.boolean(),
  timeSpent: z.number().int().min(0).max(600) // Max 10 minutes per item
});

const UpdatePreferencesSchema = z.object({
  enableLanguageMixing: z.boolean(),
  mixingStrategy: z.enum(['equal', 'weighted', 'random']),
  itemsPerSession: z.number().int().min(10).max(100)
});

const mixedSessionRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new MixedSessionService(fastify.db.pool, fastify.srsService);

  /**
   * POST /practice/mixed/start
   * Start a new mixed practice session
   */
  fastify.post(
    '/start',
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: StartMixedSessionSchema,
        response: {
          200: z.object({
            sessionId: z.string().uuid(),
            items: z.array(z.object({
              id: z.string(),
              language: z.string(),
              practiceType: z.string(),
              srsItemId: z.string(),
              content: z.any(),
              estimatedDifficulty: z.number()
            }))
          })
        }
      }
    },
    async (request, reply) => {
      const config = StartMixedSessionSchema.parse(request.body);
      const userId = request.user.userId;

      const session = await service.createMixedSession({
        userId,
        ...config
      });

      return reply.send(session);
    }
  );

  /**
   * POST /practice/mixed/submit
   * Submit answer for a mixed session item
   */
  fastify.post(
    '/submit',
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: SubmitMixedAttemptSchema,
        response: {
          200: z.object({
            success: z.boolean()
          })
        }
      }
    },
    async (request, reply) => {
      const { sessionId, itemId, language, isCorrect, timeSpent } =
        SubmitMixedAttemptSchema.parse(request.body);

      await service.recordMixedAttempt(sessionId, itemId, language, isCorrect, timeSpent);

      return reply.send({ success: true });
    }
  );

  /**
   * GET /practice/mixed/summary/:sessionId
   * Get summary of completed mixed session
   */
  fastify.get(
    '/summary/:sessionId',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: z.object({
          sessionId: z.string().uuid()
        }),
        response: {
          200: z.object({
            summary: z.object({
              sessionId: z.string().uuid(),
              totalItems: z.number(),
              totalCorrect: z.number(),
              totalTime: z.number(),
              languageBreakdown: z.array(z.object({
                language: z.string(),
                itemsAttempted: z.number(),
                correctAnswers: z.number(),
                averageTime: z.number(),
                accuracy: z.number()
              })),
              switchingEfficiency: z.number()
            })
          })
        }
      }
    },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const summary = await service.generateSessionSummary(sessionId);

      return reply.send({ summary });
    }
  );

  /**
   * GET /practice/mixed/preferences
   * Get user's mixing preferences
   */
  fastify.get(
    '/preferences',
    {
      onRequest: [fastify.authenticate],
      schema: {
        response: {
          200: z.object({
            preferences: z.object({
              enableLanguageMixing: z.boolean(),
              mixingStrategy: z.string(),
              itemsPerSession: z.number()
            })
          })
        }
      }
    },
    async (request, reply) => {
      const userId = request.user.userId;

      const result = await fastify.db.pool.query(
        `SELECT enable_language_mixing, mixing_strategy, items_per_session
         FROM user_preferences
         WHERE user_id = $1`,
        [userId]
      );

      const preferences = result.rows[0] || {
        enable_language_mixing: false,
        mixing_strategy: 'equal',
        items_per_session: 20
      };

      return reply.send({
        preferences: {
          enableLanguageMixing: preferences.enable_language_mixing,
          mixingStrategy: preferences.mixing_strategy,
          itemsPerSession: preferences.items_per_session
        }
      });
    }
  );

  /**
   * PUT /practice/mixed/preferences
   * Update user's mixing preferences
   */
  fastify.put(
    '/preferences',
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: UpdatePreferencesSchema,
        response: {
          200: z.object({
            success: z.boolean()
          })
        }
      }
    },
    async (request, reply) => {
      const userId = request.user.userId;
      const { enableLanguageMixing, mixingStrategy, itemsPerSession } =
        UpdatePreferencesSchema.parse(request.body);

      await fastify.db.pool.query(
        `UPDATE user_preferences
         SET enable_language_mixing = $2,
             mixing_strategy = $3,
             items_per_session = $4
         WHERE user_id = $1`,
        [userId, enableLanguageMixing, mixingStrategy, itemsPerSession]
      );

      return reply.send({ success: true });
    }
  );
};

export default mixedSessionRoutes;
```

**Integration**: Register in `packages/api/src/routes/practice/index.ts`:

```typescript
import mixedSessionRoutes from './mixed-session';

export const practiceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(recallRoutes, { prefix: '/recall' });
  fastify.register(recognitionRoutes, { prefix: '/recognition' });
  fastify.register(clozeRoutes, { prefix: '/cloze' });
  fastify.register(dictationRoutes, { prefix: '/dictation' });
  fastify.register(translationRoutes, { prefix: '/translation' });
  fastify.register(productionRoutes, { prefix: '/production' });
  fastify.register(readingRoutes, { prefix: '/reading' });
  fastify.register(mixedSessionRoutes, { prefix: '/mixed' }); // NEW
};
```

**Open Questions**:
1. **Session Persistence**: Should unfinished mixed sessions be saved and resumable?
   - **Ephemeral**: Session lost on browser close, simpler
   - **Persistent**: Can resume later, better UX
   - **Recommendation**: Persistent, store session state in database

2. **Real-time Progress Updates**: Should we push real-time stats as user progresses through session?
   - **WebSocket updates**: Real-time, but adds complexity
   - **Periodic polling**: Simpler, slight delay
   - **End-of-session only**: Simplest, no mid-session feedback
   - **Recommendation**: End-of-session only for MVP

3. **Mixing Notification**: Should we notify users when they switch languages (e.g., "Now: Russian")?
   - **Always notify**: Helpful, but may become annoying
   - **Optional notification**: User can toggle
   - **No notification**: Exercise clearly shows language anyway
   - **Recommendation**: Always show but subtle (language badge)

---

### Task 3: Create Mixed Practice Session React Component

**File**: `packages/web/src/pages/MixedPracticeSession.tsx`

Create UI component with:
- Session configuration (mixing strategy, item count)
- Language indicator badge for each exercise (prominent, color-coded)
- Practice exercise display (delegates to specific practice components)
- Progress bar showing completion and per-language breakdown
- Session summary with per-language analytics
- Switching efficiency visualization

**Implementation**:

```tsx
// packages/web/src/pages/MixedPracticeSession.tsx
import React, { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { RecallPractice } from '../components/practice/RecallPractice';
import { RecognitionPractice } from '../components/practice/RecognitionPractice';
import { ClozeExercise } from '../components/practice/ClozePractice';

interface MixedExerciseItem {
  id: string;
  language: string;
  practiceType: string;
  srsItemId: string;
  content: any;
  estimatedDifficulty: number;
}

interface MixedSessionSummary {
  sessionId: string;
  totalItems: number;
  totalCorrect: number;
  totalTime: number;
  languageBreakdown: {
    language: string;
    itemsAttempted: number;
    correctAnswers: number;
    averageTime: number;
    accuracy: number;
  }[];
  switchingEfficiency: number;
}

const LANGUAGE_COLORS: Record<string, string> = {
  russian: 'bg-red-100 text-red-800 border-red-300',
  chinese: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  arabic: 'bg-green-100 text-green-800 border-green-300',
  english: 'bg-blue-100 text-blue-800 border-blue-300'
};

const LANGUAGE_NAMES: Record<string, string> = {
  russian: 'Russian',
  chinese: 'Chinese',
  arabic: 'Arabic',
  english: 'English'
};

export const MixedPracticeSession: React.FC = () => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<MixedExerciseItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [sessionComplete, setSessionComplete] = useState(false);
  const [summary, setSummary] = useState<MixedSessionSummary | null>(null);

  // Start mixed session
  const startSessionMutation = useMutation({
    mutationFn: async (config: any) => {
      const response = await apiClient.post('/practice/mixed/start', config);
      return response.data;
    },
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setItems(data.items);
      setCurrentIndex(0);
      setStartTime(Date.now());
    }
  });

  // Submit attempt
  const submitAttemptMutation = useMutation({
    mutationFn: async (attempt: any) => {
      await apiClient.post('/practice/mixed/submit', attempt);
    }
  });

  // Get summary
  const summaryQuery = useQuery({
    queryKey: ['mixed-summary', sessionId],
    queryFn: async () => {
      const response = await apiClient.get(`/practice/mixed/summary/${sessionId}`);
      return response.data;
    },
    enabled: sessionComplete && !!sessionId
  });

  useEffect(() => {
    if (summaryQuery.data) {
      setSummary(summaryQuery.data.summary);
    }
  }, [summaryQuery.data]);

  const handleStartSession = () => {
    startSessionMutation.mutate({
      practiceTypes: ['recall', 'recognition', 'cloze'],
      itemsPerLanguage: 10,
      mixingStrategy: 'equal',
      totalItems: 20
    });
  };

  const handleExerciseComplete = (isCorrect: boolean) => {
    const currentItem = items[currentIndex];
    const timeSpent = Math.floor((Date.now() - startTime) / 1000);

    // Submit attempt
    submitAttemptMutation.mutate({
      sessionId,
      itemId: currentItem.id,
      language: currentItem.language,
      isCorrect,
      timeSpent
    });

    // Move to next item or complete session
    if (currentIndex < items.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setStartTime(Date.now());
    } else {
      setSessionComplete(true);
    }
  };

  if (!sessionId) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <h2 className="text-2xl font-bold mb-4">Mixed Language Practice</h2>
          <p className="text-gray-600 mb-6">
            Practice all your languages in one session to build mental agility and reduce interference.
          </p>
          <button
            onClick={handleStartSession}
            disabled={startSessionMutation.isPending}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-semibold transition-colors"
          >
            {startSessionMutation.isPending ? 'Starting...' : 'Start Mixed Session'}
          </button>
        </div>
      </div>
    );
  }

  if (sessionComplete && summary) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Summary Header */}
        <div className="bg-white rounded-lg shadow-sm p-8">
          <h2 className="text-3xl font-bold mb-4">Session Complete!</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Total Items</div>
              <div className="text-3xl font-bold text-blue-600">{summary.totalItems}</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Correct</div>
              <div className="text-3xl font-bold text-green-600">{summary.totalCorrect}</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Accuracy</div>
              <div className="text-3xl font-bold text-purple-600">
                {((summary.totalCorrect / summary.totalItems) * 100).toFixed(0)}%
              </div>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Switching</div>
              <div className="text-3xl font-bold text-orange-600">
                {(summary.switchingEfficiency * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        </div>

        {/* Per-Language Breakdown */}
        <div className="bg-white rounded-lg shadow-sm p-8">
          <h3 className="text-2xl font-bold mb-6">Per-Language Performance</h3>
          <div className="space-y-4">
            {summary.languageBreakdown.map(lang => (
              <div key={lang.language} className="border-2 border-gray-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className={`px-4 py-2 rounded-lg font-semibold border-2 ${LANGUAGE_COLORS[lang.language]}`}>
                      {LANGUAGE_NAMES[lang.language]}
                    </span>
                    <span className="text-gray-600">
                      {lang.itemsAttempted} items
                    </span>
                  </div>
                  <div className="text-2xl font-bold" style={{
                    color: lang.accuracy >= 0.8 ? '#10b981' : lang.accuracy >= 0.6 ? '#f59e0b' : '#ef4444'
                  }}>
                    {(lang.accuracy * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Correct: </span>
                    <span className="font-semibold">{lang.correctAnswers}/{lang.itemsAttempted}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Avg Time: </span>
                    <span className="font-semibold">{lang.averageTime.toFixed(1)}s</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Speed: </span>
                    <span className="font-semibold">
                      {lang.averageTime < 5 ? 'Fast' : lang.averageTime < 10 ? 'Normal' : 'Slow'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Switching Efficiency Insight */}
        <div className={`rounded-lg p-6 border-l-4 ${
          summary.switchingEfficiency >= 0.8
            ? 'bg-green-50 border-green-400'
            : summary.switchingEfficiency >= 0.6
            ? 'bg-yellow-50 border-yellow-400'
            : 'bg-orange-50 border-orange-400'
        }`}>
          <h4 className="font-semibold mb-2">Language Switching Analysis</h4>
          <p className="text-gray-700">
            {summary.switchingEfficiency >= 0.8
              ? '🎉 Excellent! You handle language switches very well with minimal errors.'
              : summary.switchingEfficiency >= 0.6
              ? '👍 Good switching ability. Continue practicing to improve consistency.'
              : '💪 Language switches are challenging for you. This is normal - keep practicing!'}
          </p>
          <div className="mt-3 text-sm text-gray-600">
            Your accuracy immediately after switching languages: {(summary.switchingEfficiency * 100).toFixed(0)}%
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={() => {
              setSessionId(null);
              setItems([]);
              setCurrentIndex(0);
              setSessionComplete(false);
              setSummary(null);
            }}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-colors"
          >
            Start Another Session
          </button>
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Active session
  const currentItem = items[currentIndex];
  const progress = ((currentIndex + 1) / items.length) * 100;

  // Check if language switched from previous item
  const previousItem = currentIndex > 0 ? items[currentIndex - 1] : null;
  const languageSwitched = previousItem && previousItem.language !== currentItem.language;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Progress Bar */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-600">
            Progress: {currentIndex + 1} / {items.length}
          </span>
          <span className="text-sm font-medium text-gray-600">
            {progress.toFixed(0)}% Complete
          </span>
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Language Indicator */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <span className={`px-6 py-3 rounded-lg font-bold text-lg border-2 ${LANGUAGE_COLORS[currentItem.language]}`}>
              {LANGUAGE_NAMES[currentItem.language]}
            </span>
            {languageSwitched && (
              <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded text-sm font-medium animate-pulse">
                ⚡ Language Switch!
              </span>
            )}
          </div>
          <div className="text-sm text-gray-600">
            Difficulty: {'★'.repeat(currentItem.estimatedDifficulty)}
          </div>
        </div>

        {/* Exercise Component */}
        <div className="mt-6">
          {currentItem.practiceType === 'recall' && (
            <RecallPractice
              exercise={currentItem}
              onComplete={handleExerciseComplete}
            />
          )}
          {currentItem.practiceType === 'recognition' && (
            <RecognitionPractice
              exercise={currentItem}
              onComplete={handleExerciseComplete}
            />
          )}
          {currentItem.practiceType === 'cloze' && (
            <ClozeExercise
              exercise={currentItem}
              onComplete={handleExerciseComplete}
            />
          )}
        </div>
      </div>
    </div>
  );
};
```

**Integration**: Add route in `packages/web/src/App.tsx`:

```tsx
import { MixedPracticeSession } from './pages/MixedPracticeSession';

// In route configuration:
<Route
  path="/practice/mixed"
  element={<MixedPracticeSession />}
/>
```

**Open Questions**:
1. **Visual Language Switching Cue**: Should we add a brief transition animation when language switches to help users prepare?
   - **No animation**: Immediate switch, more challenging
   - **Brief flash/fade**: 0.5s visual cue, helps cognitive preparation
   - **Recommendation**: Optional brief flash animation (user can disable)

2. **Difficulty Matching**: Should we try to match difficulty across languages within a session?
   - **Match**: All items similar difficulty, fair comparison
   - **SRS-driven**: Natural difficulty variation based on schedules
   - **Recommendation**: SRS-driven, difficulty is contextual per language anyway

3. **Session Interruption**: What happens if user closes browser mid-session?
   - **Lost**: Session abandoned, no recovery
   - **Resume**: Can continue where left off
   - **Recommendation**: Session persisted, can resume on next visit

---

## Dependencies

- **Blocks**: None
- **Depends on**:
  - F001 (Database Schema) - `user_srs_items`, `user_language_progress`, `user_preferences`
  - F039-F045 (Practice Modes) - All practice components for different exercise types
  - F046 (SRS Algorithm) - SRS scheduling
  - F018 (API Infrastructure) - Fastify setup, authentication
  - F022 (React Setup) - React 18, TanStack Query, Tailwind CSS

---

## Notes

### Cognitive Benefits of Language Mixing
- **Reduced Interference**: Regular switching trains brain to separate languages
- **Mental Agility**: Improves ability to rapidly change linguistic context
- **Real-world Simulation**: Mimics bilingual/multilingual environments
- **Stronger Encoding**: Context switching leads to deeper memory encoding

### Mixing Strategies
- **Equal**: Same number from each language (fair, balanced)
- **Weighted**: More items from weaker languages (adaptive, efficiency-focused)
- **Random**: Purely random selection (most challenging, unpredictable)

### Switching Efficiency Metric
Measures accuracy immediately after language switches:
- **80%+**: Excellent switching ability, minimal interference
- **60-80%**: Good, some interference but manageable
- **<60%**: Significant switching penalty, needs more practice

### Best Practices
- Start with 2 languages before adding 3rd
- Begin with equal distribution, try weighted later
- Short sessions (15-20 items) more effective than long ones
- Practice regularly to maintain switching skills

### Accessibility
- Clear language indicators with color and text
- Progress visualization
- Optional switching notifications
- Per-language performance breakdown

### Future Enhancements (Out of Scope)
- **Adaptive Mixing**: AI adjusts mixing ratio based on performance
- **Clustering Prevention**: Enforce max consecutive same-language items
- **Language Hints**: Optional hints when switching (e.g., "Remember, this is Russian")
- **Switching Training Mode**: Explicitly practice rapid switching with minimal items
- **Gamification**: Badges for switching efficiency milestones
- **Multi-modal Mixing**: Mix not just languages but also practice types

---

## Open Questions

### 1. Mixing Ratio Calculation Strategy

**Question**: How should the system determine the proportion of exercises from each language in a mixed session - equal distribution, weighted by proficiency, or user-configurable?

**Current Approach**: User-configurable strategy in session settings UI with three presets: "Equal" (50/50 for 2 languages), "Weighted" (more from weaker languages based on SRS due counts), and "Random" (purely random selection). Default is "Equal".

**Alternatives**:
1. **Equal distribution always**: Fixed 50/50 for 2 languages, 33/33/33 for 3 languages, etc. Simple and balanced but ignores learning needs.
2. **SRS-weighted** (current "Weighted" option): Proportion matches ratio of due items in each language. If 70% of due items are Russian and 30% Chinese, session will be 70/30. Efficient but may create very imbalanced sessions.
3. **Proficiency-weighted**: More exercises from languages at lower CEFR levels. Helps weaker languages catch up.
4. **Engagement-weighted**: More exercises from languages user practices less frequently. Prevents neglect of one language.
5. **Adaptive AI**: Machine learning model predicts optimal ratio based on historical performance, interference patterns, and progress velocity.

**Recommendation**: Implement **hybrid presets** combining multiple weighting strategies. Provide 4 preset options:
- **"Balanced"**: Equal distribution (current "Equal")
- **"Focus Weak Languages"**: Proficiency-weighted (Option 3) - languages with lower CEFR level get 2x representation
- **"Clear Backlog"**: SRS-weighted (current "Weighted" - Option 2)
- **"Custom"**: User manually sets percentages (e.g., 60% Russian, 40% Chinese)

Default to "Balanced" for first 10 mixed sessions, then suggest "Focus Weak Languages" if CEFR gap >1 level detected. Store mixing strategy effectiveness in analytics: track whether specific strategies correlate with better retention (measured by SRS quality scores after mixed sessions vs single-language sessions).

---

### 2. Language Switching Frequency and Clustering

**Question**: Should the system enforce minimum/maximum consecutive items from the same language, or allow random clustering where same language appears multiple times in a row?

**Current Approach**: Random interleaving with no clustering constraints. In a 20-item session with 50/50 Russian/Chinese, the sequence is completely random - could theoretically get all 10 Russian items consecutively, though unlikely (p<0.001).

**Alternatives**:
1. **Pure random** (current): No constraints. Realistic but may create frustrating clusters.
2. **Max cluster size**: Enforce maximum N consecutive items from same language (e.g., max 3). Prevents long stretches but may feel artificial.
3. **Alternating**: Strictly alternate languages (A-B-A-B-A-B...). Maximum switching frequency but potentially exhausting.
4. **Batch switching**: Group items into batches (e.g., 5 Russian, then 5 Chinese, then 5 Russian, 5 Chinese). Reduces switching overhead while still mixing.
5. **Adaptive clustering**: Short clusters (2-3 items) when switching efficiency is low, longer clusters (5-7 items) when efficiency is high.

**Recommendation**: Implement **max cluster size with randomized breaks** (Option 2 enhanced). Default: max 4 consecutive items from same language. When approaching limit (3rd consecutive item), insert 30% chance of forced switch to keep pattern unpredictable. Example sequence: RU-RU-CH-RU-RU-RU-CH-CH-RU (max 3 consecutive respected with probabilistic variation). Add user preference toggle: "Switching style" - "Frequent (max 2)", "Balanced (max 4)" default, "Batched (max 7)". Track "switching penalty" metric: compare accuracy on first item after language switch vs non-switch items. If penalty >20%, suggest reducing switch frequency. Store in `user_preferences.metadata->>'mixing_cluster_max'`.

---

### 3. Interference Prevention and Switch Notifications

**Question**: Should the system explicitly signal language switches to users (e.g., "Next: Russian" banner), or let users discover switches organically to train spontaneous code-switching?

**Current Approach**: Implicit language indicators only. Language flag icon and name always visible on each exercise card, but no explicit "Language switching!" notification between items.

**Alternatives**:
1. **No notifications** (current): User must notice language indicator on each card. Most realistic but may catch users off-guard initially.
2. **Always notify**: Full-screen interstitial between language switches ("Now practicing: Russian 🇷🇺"). Clear but disruptive, breaks flow.
3. **First-switch notification only**: Notify on first switch in session, then no more notifications. Primes user awareness.
4. **Gradual fade-out**: Start with prominent notifications, gradually reduce over 10+ sessions as user builds skill. Training wheels approach.
5. **Performance-triggered**: Only show notification if user made error on previous item (likely distracted/confused). Adaptive help.
6. **Customizable**: User preference toggle - "Switch notifications: Always / On Errors / Never".

**Recommendation**: Implement **gradual fade-out with performance triggers** (Option 4 + 5 + 6 hybrid). Default behavior:
- **Sessions 1-5**: Show 2-second "Switching to [Language]" banner with flag on every switch
- **Sessions 6-15**: Show banner only on first switch of session
- **Session 16+**: No automatic banner, but show if previous item was incorrect (performance trigger)
- **Always available**: Add "🔔" icon to toggle switch notifications on/off in session settings

Track metrics: Does notification presence correlate with switch accuracy? Hypothesis: notifications help initially (reduce switch penalty) but become crutch if used too long. Optimal path is fade-out. Store user's current notification phase in `user_preferences.metadata->>'mixing_notification_phase'` (1-5 scale).
