# F054: CEFR Level Assessment

**Feature Code**: F054
**Created**: 2025-12-17
**Phase**: 15 - Progress Tracking & Analytics
**Status**: Not Started

---

## Description

Implement CEFR level assessment that estimates user's current level based on completed content and performance across vocabulary and grammar dimensions.

## Success Criteria

- [ ] CEFR level estimate per language (A0, A1, A2, B1, B2, C1, C2)
- [ ] Level calculation based on completed vocabulary and grammar concepts
- [ ] Performance accuracy factored into level determination
- [ ] Current level displayed on dashboard with progress indicators
- [ ] Level progression tracked over time with historical data
- [ ] Requirements for next level clearly shown
- [ ] Predicted time to next level based on learning velocity

---

## Tasks

### Task 1: Implement CEFR Assessment Service

**File**: `packages/api/src/services/analytics/cefr-assessment.service.ts`

Create a comprehensive service for assessing user's CEFR level based on vocabulary mastery, grammar completion, and performance metrics.

```typescript
import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

/**
 * CEFR Level Assessment Service
 *
 * Assesses user's current CEFR level based on:
 * 1. Vocabulary mastery (words marked as 'known' per CEFR level)
 * 2. Grammar concept completion per CEFR level
 * 3. Performance accuracy in practice sessions
 *
 * Algorithm:
 * - A level is "completed" when user has mastered ≥80% of its vocabulary
 *   AND completed ≥70% of its grammar concepts
 * - Current CEFR level = highest completed level
 * - If current level has <95% completion, user is "progressing" within that level
 * - If current level has ≥95% completion, user is "ready" for next level
 */

interface CEFRLevelData {
  level: string;
  vocabularyTotal: number;
  vocabularyMastered: number;
  vocabularyPercentage: number;
  grammarTotal: number;
  grammarCompleted: number;
  grammarPercentage: number;
  overallPercentage: number;
  isCompleted: boolean;
  averageAccuracy: number;
}

interface CEFRAssessment {
  userId: string;
  language: string;
  currentLevel: string;
  status: 'progressing' | 'ready' | 'completed';
  levelDetails: CEFRLevelData[];
  nextLevel: string | null;
  progressToNextLevel: number;
  estimatedDaysToNextLevel: number | null;
  assessedAt: Date;
}

interface LevelProgression {
  date: Date;
  level: string;
  vocabularyPercentage: number;
  grammarPercentage: number;
  overallPercentage: number;
}

interface LevelRequirements {
  level: string;
  vocabularyNeeded: number;
  grammarNeeded: number;
  vocabularyGap: string[];
  grammarGap: string[];
  estimatedPracticeHours: number;
}

interface CEFROverview {
  language: string;
  currentLevel: string;
  status: string;
  progressToNextLevel: number;
  lastAssessed: Date;
}

export class CEFRAssessmentService {
  private pool: Pool;
  private readonly CEFR_LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  private readonly VOCABULARY_COMPLETION_THRESHOLD = 0.80; // 80%
  private readonly GRAMMAR_COMPLETION_THRESHOLD = 0.70; // 70%
  private readonly READY_FOR_NEXT_THRESHOLD = 0.95; // 95%

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Assess user's current CEFR level for a language
   *
   * Steps:
   * 1. Get vocabulary and grammar data per CEFR level
   * 2. Calculate completion percentage for each level
   * 3. Determine highest completed level
   * 4. Calculate progress to next level
   * 5. Estimate time to next level based on learning velocity
   * 6. Record assessment in history
   */
  async assessCEFRLevel(
    userId: string,
    language: string
  ): Promise<CEFRAssessment> {
    const client = await this.pool.connect();

    try {
      // Get all CEFR level data
      const levelDetails = await this.calculateAllLevelData(
        client,
        userId,
        language
      );

      // Determine current level (highest completed)
      let currentLevel = 'A0';
      for (const level of levelDetails) {
        if (level.isCompleted) {
          currentLevel = level.level;
        } else {
          break; // Levels must be completed sequentially
        }
      }

      // Determine status and next level
      const currentLevelData = levelDetails.find(ld => ld.level === currentLevel);
      const currentLevelIndex = this.CEFR_LEVELS.indexOf(currentLevel);
      const nextLevel = currentLevelIndex < this.CEFR_LEVELS.length - 1
        ? this.CEFR_LEVELS[currentLevelIndex + 1]
        : null;

      let status: 'progressing' | 'ready' | 'completed';
      if (!nextLevel) {
        status = 'completed';
      } else if (currentLevelData && currentLevelData.overallPercentage >= this.READY_FOR_NEXT_THRESHOLD) {
        status = 'ready';
      } else {
        status = 'progressing';
      }

      // Calculate progress to next level
      const nextLevelData = nextLevel
        ? levelDetails.find(ld => ld.level === nextLevel)
        : null;
      const progressToNextLevel = nextLevelData
        ? nextLevelData.overallPercentage
        : 100;

      // Estimate days to next level
      const estimatedDaysToNextLevel = await this.estimateDaysToNextLevel(
        client,
        userId,
        language,
        nextLevel,
        progressToNextLevel
      );

      // Record assessment
      await this.recordAssessment(
        client,
        userId,
        language,
        currentLevel,
        levelDetails
      );

      return {
        userId,
        language,
        currentLevel,
        status,
        levelDetails,
        nextLevel,
        progressToNextLevel,
        estimatedDaysToNextLevel,
        assessedAt: new Date()
      };

    } finally {
      client.release();
    }
  }

  /**
   * Calculate vocabulary and grammar completion for all CEFR levels
   */
  private async calculateAllLevelData(
    client: PoolClient,
    userId: string,
    language: string
  ): Promise<CEFRLevelData[]> {
    const levelDataArray: CEFRLevelData[] = [];

    for (const level of this.CEFR_LEVELS) {
      // Vocabulary statistics
      const vocabQuery = `
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN ws.state = 'known' THEN 1 END) as mastered,
          AVG(CASE WHEN ws.state = 'known' THEN ws.ease_factor ELSE NULL END) as avg_ease
        FROM approved_utterances u
        LEFT JOIN word_states ws ON ws.word_id = u.id::text AND ws.user_id = $1
        WHERE u.language = $2 AND u.cefr_level = $3
      `;

      const vocabResult = await client.query(vocabQuery, [userId, language, level]);
      const vocabTotal = parseInt(vocabResult.rows[0].total);
      const vocabMastered = parseInt(vocabResult.rows[0].mastered);
      const vocabPercentage = vocabTotal > 0 ? (vocabMastered / vocabTotal) * 100 : 0;

      // Grammar statistics
      const grammarQuery = `
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN gp.is_completed = true THEN 1 END) as completed,
          AVG(CASE WHEN gp.is_completed = true THEN gp.mastery_level ELSE NULL END) as avg_mastery
        FROM approved_grammar_rules gr
        LEFT JOIN grammar_progress gp ON gp.grammar_id = gr.id::text AND gp.user_id = $1
        WHERE gr.language = $2 AND gr.cefr_level = $3
      `;

      const grammarResult = await client.query(grammarQuery, [userId, language, level]);
      const grammarTotal = parseInt(grammarResult.rows[0].total);
      const grammarCompleted = parseInt(grammarResult.rows[0].completed);
      const grammarPercentage = grammarTotal > 0 ? (grammarCompleted / grammarTotal) * 100 : 0;

      // Overall percentage (weighted: 60% vocabulary, 40% grammar)
      const overallPercentage = (vocabPercentage * 0.6) + (grammarPercentage * 0.4);

      // Level is completed if vocabulary ≥80% AND grammar ≥70%
      const isCompleted =
        vocabPercentage >= this.VOCABULARY_COMPLETION_THRESHOLD * 100 &&
        grammarPercentage >= this.GRAMMAR_COMPLETION_THRESHOLD * 100;

      // Average accuracy from recent practice
      const accuracyQuery = `
        SELECT AVG(
          CASE
            WHEN item_type = 'vocabulary' THEN ws.ease_factor / 2.5
            WHEN item_type = 'grammar' THEN gp.mastery_level / 100.0
            ELSE 0
          END
        ) as avg_accuracy
        FROM srs_items si
        LEFT JOIN word_states ws ON ws.word_id = si.item_id AND ws.user_id = si.user_id
        LEFT JOIN grammar_progress gp ON gp.grammar_id = si.item_id AND gp.user_id = si.user_id
        WHERE si.user_id = $1
          AND si.language = $2
          AND si.last_reviewed >= NOW() - INTERVAL '30 days'
      `;

      const accuracyResult = await client.query(accuracyQuery, [userId, language]);
      const averageAccuracy = parseFloat(accuracyResult.rows[0]?.avg_accuracy || '0') * 100;

      levelDataArray.push({
        level,
        vocabularyTotal: vocabTotal,
        vocabularyMastered: vocabMastered,
        vocabularyPercentage: Math.round(vocabPercentage * 10) / 10,
        grammarTotal: grammarTotal,
        grammarCompleted: grammarCompleted,
        grammarPercentage: Math.round(grammarPercentage * 10) / 10,
        overallPercentage: Math.round(overallPercentage * 10) / 10,
        isCompleted,
        averageAccuracy: Math.round(averageAccuracy * 10) / 10
      });
    }

    return levelDataArray;
  }

  /**
   * Estimate days to complete next level based on learning velocity
   */
  private async estimateDaysToNextLevel(
    client: PoolClient,
    userId: string,
    language: string,
    nextLevel: string | null,
    currentProgress: number
  ): Promise<number | null> {
    if (!nextLevel || currentProgress >= 100) {
      return null;
    }

    // Calculate learning velocity (items mastered per day over last 30 days)
    const velocityQuery = `
      WITH recent_progress AS (
        SELECT
          DATE(last_reviewed) as review_date,
          COUNT(DISTINCT word_id) as words_learned
        FROM word_states
        WHERE user_id = $1
          AND language = $2
          AND state = 'known'
          AND last_reviewed >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(last_reviewed)
      )
      SELECT AVG(words_learned) as avg_words_per_day
      FROM recent_progress
    `;

    const velocityResult = await client.query(velocityQuery, [userId, language]);
    const avgWordsPerDay = parseFloat(velocityResult.rows[0]?.avg_words_per_day || '0');

    if (avgWordsPerDay === 0) {
      return null; // Cannot estimate without learning history
    }

    // Get total items needed for next level
    const requirementsQuery = `
      SELECT
        COUNT(DISTINCT u.id) as vocab_total,
        COUNT(DISTINCT gr.id) as grammar_total
      FROM approved_utterances u
      FULL OUTER JOIN approved_grammar_rules gr ON gr.language = u.language AND gr.cefr_level = u.cefr_level
      WHERE COALESCE(u.language, gr.language) = $1
        AND COALESCE(u.cefr_level, gr.cefr_level) = $2
    `;

    const reqResult = await client.query(requirementsQuery, [language, nextLevel]);
    const totalItems = parseInt(reqResult.rows[0]?.vocab_total || '0') +
                      parseInt(reqResult.rows[0]?.grammar_total || '0');

    const itemsRemaining = totalItems * (1 - currentProgress / 100);
    const estimatedDays = Math.ceil(itemsRemaining / avgWordsPerDay);

    return estimatedDays;
  }

  /**
   * Record assessment in history table
   */
  private async recordAssessment(
    client: PoolClient,
    userId: string,
    language: string,
    currentLevel: string,
    levelDetails: CEFRLevelData[]
  ): Promise<void> {
    const currentLevelData = levelDetails.find(ld => ld.level === currentLevel);

    if (!currentLevelData) return;

    const insertQuery = `
      INSERT INTO cefr_level_history (
        id, user_id, language, cefr_level,
        vocabulary_percentage, grammar_percentage, overall_percentage,
        assessed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `;

    await client.query(insertQuery, [
      uuidv4(),
      userId,
      language,
      currentLevel,
      currentLevelData.vocabularyPercentage,
      currentLevelData.grammarPercentage,
      currentLevelData.overallPercentage
    ]);
  }

  /**
   * Get CEFR level progression over time
   */
  async getLevelProgression(
    userId: string,
    language: string,
    days: number = 90
  ): Promise<LevelProgression[]> {
    const query = `
      SELECT
        assessed_at as date,
        cefr_level as level,
        vocabulary_percentage,
        grammar_percentage,
        overall_percentage
      FROM cefr_level_history
      WHERE user_id = $1 AND language = $2
        AND assessed_at >= NOW() - INTERVAL '${days} days'
      ORDER BY assessed_at ASC
    `;

    const result = await this.pool.query(query, [userId, language]);

    return result.rows.map(row => ({
      date: new Date(row.date),
      level: row.level,
      vocabularyPercentage: parseFloat(row.vocabulary_percentage),
      grammarPercentage: parseFloat(row.grammar_percentage),
      overallPercentage: parseFloat(row.overall_percentage)
    }));
  }

  /**
   * Get requirements for next CEFR level
   */
  async getLevelRequirements(
    userId: string,
    language: string,
    targetLevel?: string
  ): Promise<LevelRequirements | null> {
    // If no target level specified, use next level
    if (!targetLevel) {
      const assessment = await this.assessCEFRLevel(userId, language);
      targetLevel = assessment.nextLevel || '';

      if (!targetLevel) {
        return null; // Already at max level
      }
    }

    const client = await this.pool.connect();

    try {
      // Get vocabulary gaps
      const vocabGapQuery = `
        SELECT u.id, u.text
        FROM approved_utterances u
        LEFT JOIN word_states ws ON ws.word_id = u.id::text AND ws.user_id = $1
        WHERE u.language = $2 AND u.cefr_level = $3
          AND (ws.state IS NULL OR ws.state != 'known')
        ORDER BY u.frequency DESC
        LIMIT 20
      `;

      const vocabGapResult = await client.query(vocabGapQuery, [userId, language, targetLevel]);
      const vocabularyGap = vocabGapResult.rows.map(r => r.text);
      const vocabularyNeeded = vocabGapResult.rowCount || 0;

      // Get grammar gaps
      const grammarGapQuery = `
        SELECT gr.id, gr.title
        FROM approved_grammar_rules gr
        LEFT JOIN grammar_progress gp ON gp.grammar_id = gr.id::text AND gp.user_id = $1
        WHERE gr.language = $2 AND gr.cefr_level = $3
          AND (gp.is_completed IS NULL OR gp.is_completed = false)
        ORDER BY gr.title ASC
        LIMIT 20
      `;

      const grammarGapResult = await client.query(grammarGapQuery, [userId, language, targetLevel]);
      const grammarGap = grammarGapResult.rows.map(r => r.title);
      const grammarNeeded = grammarGapResult.rowCount || 0;

      // Estimate practice hours (assume 10 words/hour, 5 grammar concepts/hour)
      const estimatedPracticeHours = Math.ceil(
        (vocabularyNeeded / 10) + (grammarNeeded / 5)
      );

      return {
        level: targetLevel,
        vocabularyNeeded,
        grammarNeeded,
        vocabularyGap,
        grammarGap,
        estimatedPracticeHours
      };

    } finally {
      client.release();
    }
  }

  /**
   * Get CEFR overview for all languages
   */
  async getAllLanguagesOverview(userId: string): Promise<CEFROverview[]> {
    // Get all active languages for user
    const languagesQuery = `
      SELECT language
      FROM user_language_progress
      WHERE user_id = $1 AND is_active = true
    `;

    const languagesResult = await this.pool.query(languagesQuery, [userId]);
    const languages = languagesResult.rows.map(r => r.language);

    const overviews: CEFROverview[] = [];

    for (const language of languages) {
      const assessment = await this.assessCEFRLevel(userId, language);

      overviews.push({
        language,
        currentLevel: assessment.currentLevel,
        status: assessment.status,
        progressToNextLevel: assessment.progressToNextLevel,
        lastAssessed: assessment.assessedAt
      });
    }

    return overviews;
  }
}
```

**Database Schema**:

```sql
-- CEFR Level History Table
-- Records historical CEFR level assessments over time

CREATE TABLE IF NOT EXISTS cefr_level_history (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  language VARCHAR(20) NOT NULL,
  cefr_level VARCHAR(5) NOT NULL CHECK (cefr_level IN ('A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  vocabulary_percentage FLOAT NOT NULL,
  grammar_percentage FLOAT NOT NULL,
  overall_percentage FLOAT NOT NULL,
  assessed_at TIMESTAMP DEFAULT NOW(),

  -- Indexes for efficient querying
  CONSTRAINT fk_cefr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cefr_history_user_language
  ON cefr_level_history(user_id, language);

CREATE INDEX IF NOT EXISTS idx_cefr_history_assessed_at
  ON cefr_level_history(assessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_cefr_history_user_lang_date
  ON cefr_level_history(user_id, language, assessed_at DESC);
```

---

### Task 2: Create CEFR Assessment API Endpoints

**File**: `packages/api/src/routes/analytics/cefr.routes.ts`

Create REST API endpoints for CEFR level assessment and progression tracking.

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { CEFRAssessmentService } from '../../services/analytics/cefr-assessment.service.ts';
import { Pool } from 'pg';

// Request schemas
const assessmentParamsSchema = z.object({
  language: z.string().min(2).max(20)
});

const progressionQuerySchema = z.object({
  language: z.string().min(2).max(20),
  days: z.coerce.number().int().positive().max(365).optional().default(90)
});

const requirementsQuerySchema = z.object({
  language: z.string().min(2).max(20),
  targetLevel: z.enum(['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional()
});

export async function cefrRoutes(fastify: FastifyInstance) {
  const pool: Pool = fastify.db; // Assuming db plugin provides pool
  const cefrService = new CEFRAssessmentService(pool);

  /**
   * GET /api/cefr/assessment/:language
   *
   * Get current CEFR level assessment for a language
   *
   * Response:
   * {
   *   userId: string,
   *   language: string,
   *   currentLevel: string,
   *   status: 'progressing' | 'ready' | 'completed',
   *   levelDetails: Array<{
   *     level: string,
   *     vocabularyTotal: number,
   *     vocabularyMastered: number,
   *     vocabularyPercentage: number,
   *     grammarTotal: number,
   *     grammarCompleted: number,
   *     grammarPercentage: number,
   *     overallPercentage: number,
   *     isCompleted: boolean,
   *     averageAccuracy: number
   *   }>,
   *   nextLevel: string | null,
   *   progressToNextLevel: number,
   *   estimatedDaysToNextLevel: number | null,
   *   assessedAt: Date
   * }
   */
  fastify.get(
    '/assessment/:language',
    {
      schema: {
        params: assessmentParamsSchema,
        response: {
          200: z.object({
            userId: z.string().uuid(),
            language: z.string(),
            currentLevel: z.string(),
            status: z.enum(['progressing', 'ready', 'completed']),
            levelDetails: z.array(z.object({
              level: z.string(),
              vocabularyTotal: z.number(),
              vocabularyMastered: z.number(),
              vocabularyPercentage: z.number(),
              grammarTotal: z.number(),
              grammarCompleted: z.number(),
              grammarPercentage: z.number(),
              overallPercentage: z.number(),
              isCompleted: z.boolean(),
              averageAccuracy: z.number()
            })),
            nextLevel: z.string().nullable(),
            progressToNextLevel: z.number(),
            estimatedDaysToNextLevel: z.number().nullable(),
            assessedAt: z.date()
          })
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { language } = assessmentParamsSchema.parse(request.params);
        const userId = request.user.id; // Assuming auth middleware sets user

        const assessment = await cefrService.assessCEFRLevel(userId, language);

        return reply.code(200).send(assessment);

      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'Failed to assess CEFR level',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * GET /api/cefr/progression?language=es&days=90
   *
   * Get CEFR level progression history over time
   *
   * Response:
   * {
   *   language: string,
   *   days: number,
   *   progression: Array<{
   *     date: Date,
   *     level: string,
   *     vocabularyPercentage: number,
   *     grammarPercentage: number,
   *     overallPercentage: number
   *   }>
   * }
   */
  fastify.get(
    '/progression',
    {
      schema: {
        querystring: progressionQuerySchema,
        response: {
          200: z.object({
            language: z.string(),
            days: z.number(),
            progression: z.array(z.object({
              date: z.date(),
              level: z.string(),
              vocabularyPercentage: z.number(),
              grammarPercentage: z.number(),
              overallPercentage: z.number()
            }))
          })
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { language, days } = progressionQuerySchema.parse(request.query);
        const userId = request.user.id;

        const progression = await cefrService.getLevelProgression(
          userId,
          language,
          days
        );

        return reply.code(200).send({
          language,
          days,
          progression
        });

      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'Failed to get level progression',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * GET /api/cefr/requirements?language=es&targetLevel=B1
   *
   * Get requirements for reaching target CEFR level
   *
   * Response:
   * {
   *   level: string,
   *   vocabularyNeeded: number,
   *   grammarNeeded: number,
   *   vocabularyGap: string[],
   *   grammarGap: string[],
   *   estimatedPracticeHours: number
   * }
   */
  fastify.get(
    '/requirements',
    {
      schema: {
        querystring: requirementsQuerySchema,
        response: {
          200: z.object({
            level: z.string(),
            vocabularyNeeded: z.number(),
            grammarNeeded: z.number(),
            vocabularyGap: z.array(z.string()),
            grammarGap: z.array(z.string()),
            estimatedPracticeHours: z.number()
          }).nullable()
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { language, targetLevel } = requirementsQuerySchema.parse(request.query);
        const userId = request.user.id;

        const requirements = await cefrService.getLevelRequirements(
          userId,
          language,
          targetLevel
        );

        return reply.code(200).send(requirements);

      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'Failed to get level requirements',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * GET /api/cefr/overview
   *
   * Get CEFR overview for all active languages
   *
   * Response:
   * {
   *   overview: Array<{
   *     language: string,
   *     currentLevel: string,
   *     status: string,
   *     progressToNextLevel: number,
   *     lastAssessed: Date
   *   }>
   * }
   */
  fastify.get(
    '/overview',
    {
      schema: {
        response: {
          200: z.object({
            overview: z.array(z.object({
              language: z.string(),
              currentLevel: z.string(),
              status: z.string(),
              progressToNextLevel: z.number(),
              lastAssessed: z.date()
            }))
          })
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user.id;

        const overview = await cefrService.getAllLanguagesOverview(userId);

        return reply.code(200).send({ overview });

      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'Failed to get CEFR overview',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );
}
```

---

### Task 3: Create CEFR Assessment Dashboard Component

**File**: `packages/web/src/pages/CEFRAssessmentDashboard.tsx`

Create a React dashboard to display CEFR level assessment with progression charts and next level requirements.

```typescript
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';

interface CEFRLevelData {
  level: string;
  vocabularyTotal: number;
  vocabularyMastered: number;
  vocabularyPercentage: number;
  grammarTotal: number;
  grammarCompleted: number;
  grammarPercentage: number;
  overallPercentage: number;
  isCompleted: boolean;
  averageAccuracy: number;
}

interface CEFRAssessment {
  userId: string;
  language: string;
  currentLevel: string;
  status: 'progressing' | 'ready' | 'completed';
  levelDetails: CEFRLevelData[];
  nextLevel: string | null;
  progressToNextLevel: number;
  estimatedDaysToNextLevel: number | null;
  assessedAt: Date;
}

interface LevelProgression {
  date: Date;
  level: string;
  vocabularyPercentage: number;
  grammarPercentage: number;
  overallPercentage: number;
}

interface LevelRequirements {
  level: string;
  vocabularyNeeded: number;
  grammarNeeded: number;
  vocabularyGap: string[];
  grammarGap: string[];
  estimatedPracticeHours: number;
}

interface CEFROverview {
  language: string;
  currentLevel: string;
  status: string;
  progressToNextLevel: number;
  lastAssessed: Date;
}

const CEFR_COLORS: Record<string, string> = {
  A0: '#94a3b8',
  A1: '#60a5fa',
  A2: '#3b82f6',
  B1: '#8b5cf6',
  B2: '#a855f7',
  C1: '#ec4899',
  C2: '#f43f5e'
};

export const CEFRAssessmentDashboard: React.FC = () => {
  const [selectedLanguage, setSelectedLanguage] = useState<string>('es');
  const [progressionDays, setProgressionDays] = useState<number>(90);

  // Fetch current assessment
  const { data: assessment, isLoading: assessmentLoading } = useQuery<CEFRAssessment>({
    queryKey: ['cefr-assessment', selectedLanguage],
    queryFn: async () => {
      const response = await fetch(`/api/cefr/assessment/${selectedLanguage}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch assessment');
      return response.json();
    }
  });

  // Fetch progression history
  const { data: progressionData } = useQuery<{ progression: LevelProgression[] }>({
    queryKey: ['cefr-progression', selectedLanguage, progressionDays],
    queryFn: async () => {
      const response = await fetch(
        `/api/cefr/progression?language=${selectedLanguage}&days=${progressionDays}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch progression');
      return response.json();
    }
  });

  // Fetch requirements for next level
  const { data: requirements } = useQuery<LevelRequirements | null>({
    queryKey: ['cefr-requirements', selectedLanguage],
    queryFn: async () => {
      const response = await fetch(
        `/api/cefr/requirements?language=${selectedLanguage}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch requirements');
      return response.json();
    },
    enabled: !!assessment && assessment.nextLevel !== null
  });

  // Fetch overview of all languages
  const { data: overviewData } = useQuery<{ overview: CEFROverview[] }>({
    queryKey: ['cefr-overview'],
    queryFn: async () => {
      const response = await fetch('/api/cefr/overview', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch overview');
      return response.json();
    }
  });

  if (assessmentLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading CEFR assessment...</div>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">No assessment data available</div>
      </div>
    );
  }

  // Prepare chart data
  const levelProgressionChart = progressionData?.progression.map(p => ({
    date: new Date(p.date).toLocaleDateString(),
    'Overall %': p.overallPercentage,
    'Vocabulary %': p.vocabularyPercentage,
    'Grammar %': p.grammarPercentage
  })) || [];

  const levelComparisonChart = assessment.levelDetails.map(ld => ({
    level: ld.level,
    vocabulary: ld.vocabularyPercentage,
    grammar: ld.grammarPercentage,
    overall: ld.overallPercentage
  }));

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'ready': return 'bg-blue-100 text-blue-800';
      case 'progressing': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'All levels completed!';
      case 'ready': return 'Ready for next level';
      case 'progressing': return 'Making progress';
      default: return status;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">CEFR Level Assessment</h1>
            <p className="mt-1 text-sm text-gray-600">
              Track your language proficiency across CEFR levels
            </p>
          </div>

          {/* Language selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Language
            </label>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {overviewData?.overview.map(lang => (
                <option key={lang.language} value={lang.language}>
                  {lang.language.toUpperCase()} - {lang.currentLevel}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Current Level Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Current Level</div>
            <div className="mt-2 flex items-baseline">
              <div
                className="text-4xl font-bold"
                style={{ color: CEFR_COLORS[assessment.currentLevel] }}
              >
                {assessment.currentLevel}
              </div>
              <span className={`ml-3 px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(assessment.status)}`}>
                {getStatusText(assessment.status)}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Next Level</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              {assessment.nextLevel || 'Max Level'}
            </div>
            {assessment.nextLevel && (
              <div className="mt-2 text-xs text-gray-500">
                {assessment.progressToNextLevel.toFixed(1)}% complete
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Estimated Time</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              {assessment.estimatedDaysToNextLevel !== null
                ? `${assessment.estimatedDaysToNextLevel}d`
                : 'N/A'}
            </div>
            {assessment.estimatedDaysToNextLevel !== null && (
              <div className="mt-2 text-xs text-gray-500">
                to reach {assessment.nextLevel}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Last Assessed</div>
            <div className="mt-2 text-lg font-semibold text-gray-900">
              {new Date(assessment.assessedAt).toLocaleDateString()}
            </div>
            <div className="mt-2 text-xs text-gray-500">
              {new Date(assessment.assessedAt).toLocaleTimeString()}
            </div>
          </div>
        </div>

        {/* Level Details Grid */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Level Breakdown</h2>
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {assessment.levelDetails.map(level => (
              <div
                key={level.level}
                className={`border-2 rounded-lg p-4 ${
                  level.isCompleted
                    ? 'border-green-400 bg-green-50'
                    : level.level === assessment.currentLevel
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div
                  className="text-2xl font-bold mb-2"
                  style={{ color: CEFR_COLORS[level.level] }}
                >
                  {level.level}
                </div>

                <div className="space-y-2 text-sm">
                  <div>
                    <div className="text-gray-600">Vocabulary</div>
                    <div className="font-semibold">
                      {level.vocabularyMastered}/{level.vocabularyTotal}
                    </div>
                    <div className="text-xs text-gray-500">
                      {level.vocabularyPercentage.toFixed(1)}%
                    </div>
                  </div>

                  <div>
                    <div className="text-gray-600">Grammar</div>
                    <div className="font-semibold">
                      {level.grammarCompleted}/{level.grammarTotal}
                    </div>
                    <div className="text-xs text-gray-500">
                      {level.grammarPercentage.toFixed(1)}%
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-200">
                    <div className="text-gray-600">Overall</div>
                    <div className="font-bold text-lg">
                      {level.overallPercentage.toFixed(1)}%
                    </div>
                  </div>
                </div>

                {level.isCompleted && (
                  <div className="mt-3 flex items-center justify-center">
                    <span className="text-green-600 text-xl">✓</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Level Comparison Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Level Comparison</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={levelComparisonChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="level" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="vocabulary" fill="#3b82f6" name="Vocabulary %" />
              <Bar dataKey="grammar" fill="#8b5cf6" name="Grammar %" />
              <Bar dataKey="overall" fill="#10b981" name="Overall %" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Progression Over Time */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Progression Over Time</h2>
            <select
              value={progressionDays}
              onChange={(e) => setProgressionDays(Number(e.target.value))}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
            >
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 6 months</option>
              <option value={365}>Last year</option>
            </select>
          </div>

          {levelProgressionChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={levelProgressionChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="Overall %" stroke="#10b981" strokeWidth={2} />
                <Line type="monotone" dataKey="Vocabulary %" stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="Grammar %" stroke="#8b5cf6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              No progression data available for selected time period
            </div>
          )}
        </div>

        {/* Next Level Requirements */}
        {requirements && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Requirements for {requirements.level}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-sm font-medium text-blue-900">Vocabulary Gap</div>
                <div className="text-3xl font-bold text-blue-600 mt-2">
                  {requirements.vocabularyNeeded}
                </div>
                <div className="text-sm text-blue-700 mt-1">words to learn</div>
              </div>

              <div className="bg-purple-50 rounded-lg p-4">
                <div className="text-sm font-medium text-purple-900">Grammar Gap</div>
                <div className="text-3xl font-bold text-purple-600 mt-2">
                  {requirements.grammarNeeded}
                </div>
                <div className="text-sm text-purple-700 mt-1">concepts to learn</div>
              </div>

              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-sm font-medium text-green-900">Estimated Time</div>
                <div className="text-3xl font-bold text-green-600 mt-2">
                  {requirements.estimatedPracticeHours}h
                </div>
                <div className="text-sm text-green-700 mt-1">practice needed</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Top Vocabulary Gaps</h3>
                <div className="space-y-2">
                  {requirements.vocabularyGap.slice(0, 10).map((word, idx) => (
                    <div key={idx} className="flex items-center text-sm">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium mr-3">
                        {idx + 1}
                      </span>
                      <span className="text-gray-700">{word}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Top Grammar Gaps</h3>
                <div className="space-y-2">
                  {requirements.grammarGap.slice(0, 10).map((concept, idx) => (
                    <div key={idx} className="flex items-center text-sm">
                      <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-medium mr-3">
                        {idx + 1}
                      </span>
                      <span className="text-gray-700">{concept}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* All Languages Overview */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">All Languages</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {overviewData?.overview.map(lang => (
              <div
                key={lang.language}
                className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                  lang.language === selectedLanguage
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedLanguage(lang.language)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-lg font-bold text-gray-900">
                    {lang.language.toUpperCase()}
                  </div>
                  <div
                    className="text-2xl font-bold"
                    style={{ color: CEFR_COLORS[lang.currentLevel] }}
                  >
                    {lang.currentLevel}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Progress to next level</span>
                    <span className="font-semibold">{lang.progressToNextLevel.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${lang.progressToNextLevel}%` }}
                    />
                  </div>
                </div>

                <div className="mt-3 text-xs text-gray-500">
                  Last assessed: {new Date(lang.lastAssessed).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
```

---

## Open Questions

### 1. CEFR Level Calculation Methodology

**Question**: How should we weight different factors (vocabulary, grammar, accuracy) when determining CEFR level completion?

**Current Approach**:
- Vocabulary must be ≥80% mastered
- Grammar must be ≥70% completed
- Overall percentage = 60% vocabulary + 40% grammar
- Performance accuracy is tracked but not used in completion determination

**Alternatives**:
1. **Strict Approach**: Require 90% vocabulary AND 90% grammar for level completion
2. **Accuracy-Weighted**: Factor in average accuracy - reduce required percentages if accuracy is high
3. **Adaptive Thresholds**: Lower thresholds for higher CEFR levels (C1/C2 harder to "complete")
4. **Time-Based**: Consider how long user has been at a level before marking it complete

**Recommendation**: Current approach is balanced. Consider adding accuracy weighting as a future enhancement where high accuracy (>90%) allows level completion at 75% vocabulary / 65% grammar.

---

### 2. Level Progression Tracking Frequency

**Question**: How often should we automatically assess and record CEFR level progression?

**Current Approach**: Assessment is recorded every time the endpoint is called (on-demand only)

**Alternatives**:
1. **Daily Auto-Assessment**: Run assessment daily via cron job for all active users
2. **Activity-Triggered**: Assess after every N practice sessions (e.g., every 10 sessions)
3. **Weekly Snapshots**: Record assessment every Sunday at midnight
4. **Milestone-Based**: Only record when a level changes or significant progress made (>5%)

**Recommendation**: Implement activity-triggered assessment (after every 10 completed practice sessions) to balance data granularity with database writes. Also record whenever user explicitly requests assessment via dashboard.

---

### 3. Estimated Time to Next Level Calculation

**Question**: What factors should be included in estimating time to reach next CEFR level?

**Current Approach**:
- Based solely on recent learning velocity (words per day over last 30 days)
- Simple division: items remaining / avg items per day

**Alternatives**:
1. **Difficulty Scaling**: Higher CEFR levels take longer per item - apply multiplier (1.0x for A1, 1.5x for B2, 2.0x for C2)
2. **Retention Consideration**: Factor in that some items will need re-learning (add 20% buffer)
3. **Historical Patterns**: Use user's previous level completion times to predict future
4. **Engagement-Adjusted**: Consider user's weekly active days - reduce estimate if inconsistent

**Recommendation**: Implement difficulty scaling with retention buffer. Formula: `(items_remaining * level_multiplier * 1.2) / avg_items_per_day`. This provides more realistic estimates especially for advanced levels.

---
