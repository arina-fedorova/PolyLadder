# F052: Vocabulary Progress Dashboard

**Feature Code**: F052
**Created**: 2025-12-17
**Phase**: 15 - Progress Tracking & Analytics
**Status**: Completed

---

## Description

Implement dashboard showing vocabulary progress: words learned, words in review, words mastered.

## Success Criteria

- [x] Word count by state (unknown, learning, known)
- [x] Per-language breakdown
- [x] Progress over time (chart)
- [x] Recent words learned
- [x] CEFR level distribution

---

## Tasks

### Task 1: Vocabulary Analytics Service

**File**: `packages/api/src/services/analytics/vocabulary-analytics.service.ts`

**Description**: Service to aggregate vocabulary statistics including word counts by state, CEFR distribution, learning trends over time, and per-language breakdowns.

**Implementation**:

```typescript
import { Pool } from 'pg';

interface VocabularyStats {
  totalWords: number;
  byState: {
    unknown: number;
    learning: number;
    known: number;
  };
  byLanguage: Array<{
    language: string;
    totalWords: number;
    unknown: number;
    learning: number;
    known: number;
  }>;
  byCEFR: Array<{
    level: string;
    count: number;
  }>;
  recentlyLearned: Array<{
    wordId: string;
    text: string;
    language: string;
    translations: string[];
    learnedAt: Date;
  }>;
}

interface VocabularyTrend {
  date: string;
  totalWords: number;
  learning: number;
  known: number;
}

interface WordDetails {
  wordId: string;
  text: string;
  language: string;
  translations: string[];
  state: 'unknown' | 'learning' | 'known';
  cefrLevel: string;
  reviewCount: number;
  lastReviewed: Date | null;
  nextReview: Date | null;
  easeFactor: number;
  interval: number;
}

interface LearningVelocity {
  wordsPerDay: number;
  wordsPerWeek: number;
  wordsThisWeek: number;
  wordsLastWeek: number;
  trend: 'increasing' | 'stable' | 'decreasing';
}

export class VocabularyAnalyticsService {
  constructor(private pool: Pool) {}

  /**
   * Get overall vocabulary statistics for a user
   */
  async getVocabularyStats(userId: string, language?: string): Promise<VocabularyStats> {
    // Total words by state
    let stateQuery = `
      SELECT
        ws.state,
        COUNT(*) as count
      FROM word_states ws
      WHERE ws.user_id = $1
    `;
    const params: any[] = [userId];

    if (language) {
      stateQuery += ` AND ws.language = $2`;
      params.push(language);
    }

    stateQuery += ` GROUP BY ws.state`;

    const stateResult = await this.pool.query(stateQuery, params);

    const byState = {
      unknown: 0,
      learning: 0,
      known: 0,
    };

    stateResult.rows.forEach((row) => {
      byState[row.state as keyof typeof byState] = parseInt(row.count);
    });

    const totalWords = byState.unknown + byState.learning + byState.known;

    // Per-language breakdown
    const languageQuery = `
      SELECT
        ws.language,
        COUNT(*) as total_words,
        SUM(CASE WHEN ws.state = 'unknown' THEN 1 ELSE 0 END) as unknown,
        SUM(CASE WHEN ws.state = 'learning' THEN 1 ELSE 0 END) as learning,
        SUM(CASE WHEN ws.state = 'known' THEN 1 ELSE 0 END) as known
      FROM word_states ws
      WHERE ws.user_id = $1
      ${language ? 'AND ws.language = $2' : ''}
      GROUP BY ws.language
      ORDER BY total_words DESC
    `;

    const languageResult = await this.pool.query(languageQuery, params);

    const byLanguage = languageResult.rows.map((row) => ({
      language: row.language,
      totalWords: parseInt(row.total_words),
      unknown: parseInt(row.unknown),
      learning: parseInt(row.learning),
      known: parseInt(row.known),
    }));

    // CEFR level distribution
    const cefrQuery = `
      SELECT
        u.cefr_level,
        COUNT(DISTINCT ws.word_id) as count
      FROM word_states ws
      JOIN approved_utterances u ON u.id = ws.word_id::uuid
      WHERE ws.user_id = $1
      ${language ? 'AND ws.language = $2' : ''}
      GROUP BY u.cefr_level
      ORDER BY
        CASE u.cefr_level
          WHEN 'A0' THEN 1
          WHEN 'A1' THEN 2
          WHEN 'A2' THEN 3
          WHEN 'B1' THEN 4
          WHEN 'B2' THEN 5
          WHEN 'C1' THEN 6
          WHEN 'C2' THEN 7
        END
    `;

    const cefrResult = await this.pool.query(cefrQuery, params);

    const byCEFR = cefrResult.rows.map((row) => ({
      level: row.cefr_level,
      count: parseInt(row.count),
    }));

    // Recently learned words (state changed to 'known' in last 30 days)
    const recentQuery = `
      SELECT
        ws.word_id,
        u.text,
        u.language,
        u.translations,
        ws.last_reviewed as learned_at
      FROM word_states ws
      JOIN approved_utterances u ON u.id = ws.word_id::uuid
      WHERE ws.user_id = $1
        AND ws.state = 'known'
        AND ws.last_reviewed >= NOW() - INTERVAL '30 days'
      ${language ? 'AND ws.language = $2' : ''}
      ORDER BY ws.last_reviewed DESC
      LIMIT 20
    `;

    const recentResult = await this.pool.query(recentQuery, params);

    const recentlyLearned = recentResult.rows.map((row) => ({
      wordId: row.word_id,
      text: row.text,
      language: row.language,
      translations: row.translations,
      learnedAt: new Date(row.learned_at),
    }));

    return {
      totalWords,
      byState,
      byLanguage,
      byCEFR,
      recentlyLearned,
    };
  }

  /**
   * Get vocabulary learning trends over time
   */
  async getVocabularyTrends(
    userId: string,
    language?: string,
    days: number = 30
  ): Promise<VocabularyTrend[]> {
    const params: any[] = [userId, days];
    let languageFilter = '';

    if (language) {
      languageFilter = 'AND ws.language = $3';
      params.push(language);
    }

    const query = `
      WITH date_series AS (
        SELECT generate_series(
          CURRENT_DATE - $2::int,
          CURRENT_DATE,
          '1 day'::interval
        )::date AS date
      ),
      daily_stats AS (
        SELECT
          DATE(ws.last_reviewed) as review_date,
          COUNT(DISTINCT ws.word_id) FILTER (WHERE ws.state IN ('learning', 'known')) as total_words,
          COUNT(DISTINCT ws.word_id) FILTER (WHERE ws.state = 'learning') as learning,
          COUNT(DISTINCT ws.word_id) FILTER (WHERE ws.state = 'known') as known
        FROM word_states ws
        WHERE ws.user_id = $1
          AND ws.last_reviewed IS NOT NULL
          ${languageFilter}
        GROUP BY DATE(ws.last_reviewed)
      )
      SELECT
        ds.date::text,
        COALESCE(SUM(dst.total_words) OVER (ORDER BY ds.date), 0) as total_words,
        COALESCE(SUM(dst.learning) OVER (ORDER BY ds.date), 0) as learning,
        COALESCE(SUM(dst.known) OVER (ORDER BY ds.date), 0) as known
      FROM date_series ds
      LEFT JOIN daily_stats dst ON dst.review_date = ds.date
      ORDER BY ds.date
    `;

    const result = await this.pool.query(query, params);

    return result.rows.map((row) => ({
      date: row.date,
      totalWords: parseInt(row.total_words),
      learning: parseInt(row.learning),
      known: parseInt(row.known),
    }));
  }

  /**
   * Get detailed word information
   */
  async getWordDetails(userId: string, wordId: string): Promise<WordDetails | null> {
    const query = `
      SELECT
        ws.word_id,
        u.text,
        u.language,
        u.translations,
        ws.state,
        u.cefr_level,
        ws.review_count,
        ws.last_reviewed,
        si.next_review,
        si.ease_factor,
        si.interval
      FROM word_states ws
      JOIN approved_utterances u ON u.id = ws.word_id::uuid
      LEFT JOIN srs_items si ON si.item_id = ws.word_id AND si.user_id = ws.user_id
      WHERE ws.user_id = $1 AND ws.word_id = $2
    `;

    const result = await this.pool.query(query, [userId, wordId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      wordId: row.word_id,
      text: row.text,
      language: row.language,
      translations: row.translations,
      state: row.state,
      cefrLevel: row.cefr_level,
      reviewCount: parseInt(row.review_count),
      lastReviewed: row.last_reviewed ? new Date(row.last_reviewed) : null,
      nextReview: row.next_review ? new Date(row.next_review) : null,
      easeFactor: parseFloat(row.ease_factor || '2.5'),
      interval: parseInt(row.interval || '0'),
    };
  }

  /**
   * Calculate learning velocity (words learned per day/week)
   */
  async getLearningVelocity(userId: string, language?: string): Promise<LearningVelocity> {
    const params: any[] = [userId];
    let languageFilter = '';

    if (language) {
      languageFilter = 'AND ws.language = $2';
      params.push(language);
    }

    const query = `
      WITH this_week AS (
        SELECT COUNT(*) as count
        FROM word_states ws
        WHERE ws.user_id = $1
          AND ws.state = 'known'
          AND ws.last_reviewed >= CURRENT_DATE - INTERVAL '7 days'
          ${languageFilter}
      ),
      last_week AS (
        SELECT COUNT(*) as count
        FROM word_states ws
        WHERE ws.user_id = $1
          AND ws.state = 'known'
          AND ws.last_reviewed >= CURRENT_DATE - INTERVAL '14 days'
          AND ws.last_reviewed < CURRENT_DATE - INTERVAL '7 days'
          ${languageFilter}
      ),
      total AS (
        SELECT
          COUNT(*) as total_words,
          MIN(ws.last_reviewed) as first_review
        FROM word_states ws
        WHERE ws.user_id = $1
          AND ws.state = 'known'
          AND ws.last_reviewed IS NOT NULL
          ${languageFilter}
      )
      SELECT
        tw.count as this_week,
        lw.count as last_week,
        t.total_words,
        EXTRACT(EPOCH FROM (NOW() - t.first_review)) / 86400 as days_learning
      FROM this_week tw, last_week lw, total t
    `;

    const result = await this.pool.query(query, params);

    if (result.rows.length === 0 || !result.rows[0].days_learning) {
      return {
        wordsPerDay: 0,
        wordsPerWeek: 0,
        wordsThisWeek: 0,
        wordsLastWeek: 0,
        trend: 'stable',
      };
    }

    const row = result.rows[0];
    const daysLearning = parseFloat(row.days_learning);
    const totalWords = parseInt(row.total_words);
    const wordsThisWeek = parseInt(row.this_week);
    const wordsLastWeek = parseInt(row.last_week);

    const wordsPerDay = daysLearning > 0 ? totalWords / daysLearning : 0;
    const wordsPerWeek = wordsPerDay * 7;

    let trend: 'increasing' | 'stable' | 'decreasing';
    if (wordsThisWeek > wordsLastWeek * 1.1) {
      trend = 'increasing';
    } else if (wordsThisWeek < wordsLastWeek * 0.9) {
      trend = 'decreasing';
    } else {
      trend = 'stable';
    }

    return {
      wordsPerDay: Math.round(wordsPerDay * 10) / 10,
      wordsPerWeek: Math.round(wordsPerWeek),
      wordsThisWeek,
      wordsLastWeek,
      trend,
    };
  }

  /**
   * Get words by state with pagination
   */
  async getWordsByState(
    userId: string,
    state: 'unknown' | 'learning' | 'known',
    language?: string,
    offset: number = 0,
    limit: number = 50
  ): Promise<{
    words: WordDetails[];
    total: number;
  }> {
    const params: any[] = [userId, state];
    let languageFilter = '';
    let paramIndex = 3;

    if (language) {
      languageFilter = 'AND ws.language = $3';
      params.push(language);
      paramIndex = 4;
    }

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM word_states ws
      WHERE ws.user_id = $1 AND ws.state = $2
      ${languageFilter}
    `;

    const countResult = await this.pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated words
    params.push(limit, offset);

    const wordsQuery = `
      SELECT
        ws.word_id,
        u.text,
        u.language,
        u.translations,
        ws.state,
        u.cefr_level,
        ws.review_count,
        ws.last_reviewed,
        si.next_review,
        si.ease_factor,
        si.interval
      FROM word_states ws
      JOIN approved_utterances u ON u.id = ws.word_id::uuid
      LEFT JOIN srs_items si ON si.item_id = ws.word_id AND si.user_id = ws.user_id
      WHERE ws.user_id = $1 AND ws.state = $2
      ${languageFilter}
      ORDER BY ws.last_reviewed DESC NULLS LAST
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const wordsResult = await this.pool.query(wordsQuery, params);

    const words = wordsResult.rows.map((row) => ({
      wordId: row.word_id,
      text: row.text,
      language: row.language,
      translations: row.translations,
      state: row.state,
      cefrLevel: row.cefr_level,
      reviewCount: parseInt(row.review_count),
      lastReviewed: row.last_reviewed ? new Date(row.last_reviewed) : null,
      nextReview: row.next_review ? new Date(row.next_review) : null,
      easeFactor: parseFloat(row.ease_factor || '2.5'),
      interval: parseInt(row.interval || '0'),
    }));

    return { words, total };
  }
}
```

**Key Features**:

1. **Aggregate Statistics**: Total words, state distribution, CEFR breakdown
2. **Per-Language Breakdown**: Statistics split by each studied language
3. **Trend Analysis**: Word count over time with cumulative totals
4. **Learning Velocity**: Words learned per day/week with trend detection
5. **Detailed Word Info**: Full SRS data for individual words
6. **Pagination**: Efficient retrieval of large word lists

---

### Task 2: Vocabulary Analytics API Endpoints

**File**: `packages/api/src/routes/analytics/vocabulary.routes.ts`

**Description**: RESTful API endpoints for vocabulary statistics, trends, and detailed word information.

**Implementation**:

```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { VocabularyAnalyticsService } from '../../services/analytics/vocabulary-analytics.service.ts';

// Request/Response Schemas
const GetStatsQuerySchema = z.object({
  language: z.string().optional(),
});

const GetTrendsQuerySchema = z.object({
  language: z.string().optional(),
  days: z
    .string()
    .transform((val) => parseInt(val, 10))
    .optional(),
});

const GetWordsByStateQuerySchema = z.object({
  state: z.enum(['unknown', 'learning', 'known']),
  language: z.string().optional(),
  offset: z
    .string()
    .transform((val) => parseInt(val, 10))
    .optional(),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .optional(),
});

const GetWordDetailsParamsSchema = z.object({
  wordId: z.string().uuid(),
});

export async function vocabularyAnalyticsRoutes(fastify: FastifyInstance) {
  const vocabularyService = new VocabularyAnalyticsService(fastify.pg.pool);

  /**
   * GET /analytics/vocabulary/stats
   * Get overall vocabulary statistics
   */
  fastify.get(
    '/analytics/vocabulary/stats',
    {
      schema: {
        querystring: GetStatsQuerySchema,
        response: {
          200: z.object({
            totalWords: z.number(),
            byState: z.object({
              unknown: z.number(),
              learning: z.number(),
              known: z.number(),
            }),
            byLanguage: z.array(
              z.object({
                language: z.string(),
                totalWords: z.number(),
                unknown: z.number(),
                learning: z.number(),
                known: z.number(),
              })
            ),
            byCEFR: z.array(
              z.object({
                level: z.string(),
                count: z.number(),
              })
            ),
            recentlyLearned: z.array(
              z.object({
                wordId: z.string(),
                text: z.string(),
                language: z.string(),
                translations: z.array(z.string()),
                learnedAt: z.string(),
              })
            ),
          }),
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.id;
      const { language } = request.query;

      try {
        const stats = await vocabularyService.getVocabularyStats(userId, language);

        return reply.status(200).send({
          ...stats,
          recentlyLearned: stats.recentlyLearned.map((w) => ({
            ...w,
            learnedAt: w.learnedAt.toISOString(),
          })),
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to fetch vocabulary statistics',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /analytics/vocabulary/trends
   * Get vocabulary learning trends over time
   */
  fastify.get(
    '/analytics/vocabulary/trends',
    {
      schema: {
        querystring: GetTrendsQuerySchema,
        response: {
          200: z.object({
            trends: z.array(
              z.object({
                date: z.string(),
                totalWords: z.number(),
                learning: z.number(),
                known: z.number(),
              })
            ),
          }),
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.id;
      const { language, days } = request.query;

      try {
        const trends = await vocabularyService.getVocabularyTrends(userId, language, days || 30);

        return reply.status(200).send({ trends });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to fetch vocabulary trends',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /analytics/vocabulary/velocity
   * Get learning velocity (words per day/week)
   */
  fastify.get(
    '/analytics/vocabulary/velocity',
    {
      schema: {
        querystring: GetStatsQuerySchema,
        response: {
          200: z.object({
            wordsPerDay: z.number(),
            wordsPerWeek: z.number(),
            wordsThisWeek: z.number(),
            wordsLastWeek: z.number(),
            trend: z.enum(['increasing', 'stable', 'decreasing']),
          }),
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.id;
      const { language } = request.query;

      try {
        const velocity = await vocabularyService.getLearningVelocity(userId, language);

        return reply.status(200).send(velocity);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to calculate learning velocity',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /analytics/vocabulary/words
   * Get words by state with pagination
   */
  fastify.get(
    '/analytics/vocabulary/words',
    {
      schema: {
        querystring: GetWordsByStateQuerySchema,
        response: {
          200: z.object({
            words: z.array(
              z.object({
                wordId: z.string(),
                text: z.string(),
                language: z.string(),
                translations: z.array(z.string()),
                state: z.enum(['unknown', 'learning', 'known']),
                cefrLevel: z.string(),
                reviewCount: z.number(),
                lastReviewed: z.string().nullable(),
                nextReview: z.string().nullable(),
                easeFactor: z.number(),
                interval: z.number(),
              })
            ),
            total: z.number(),
          }),
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.id;
      const { state, language, offset, limit } = request.query;

      try {
        const result = await vocabularyService.getWordsByState(
          userId,
          state,
          language,
          offset || 0,
          limit || 50
        );

        return reply.status(200).send({
          words: result.words.map((w) => ({
            ...w,
            lastReviewed: w.lastReviewed?.toISOString() || null,
            nextReview: w.nextReview?.toISOString() || null,
          })),
          total: result.total,
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to fetch words',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /analytics/vocabulary/word/:wordId
   * Get detailed information about a specific word
   */
  fastify.get(
    '/analytics/vocabulary/word/:wordId',
    {
      schema: {
        params: GetWordDetailsParamsSchema,
        response: {
          200: z.object({
            wordId: z.string(),
            text: z.string(),
            language: z.string(),
            translations: z.array(z.string()),
            state: z.enum(['unknown', 'learning', 'known']),
            cefrLevel: z.string(),
            reviewCount: z.number(),
            lastReviewed: z.string().nullable(),
            nextReview: z.string().nullable(),
            easeFactor: z.number(),
            interval: z.number(),
          }),
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.id;
      const { wordId } = request.params;

      try {
        const word = await vocabularyService.getWordDetails(userId, wordId);

        if (!word) {
          return reply.status(404).send({ error: 'Word not found' });
        }

        return reply.status(200).send({
          ...word,
          lastReviewed: word.lastReviewed?.toISOString() || null,
          nextReview: word.nextReview?.toISOString() || null,
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to fetch word details',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
}
```

**API Endpoints Summary**:

| Method | Endpoint                             | Description                       |
| ------ | ------------------------------------ | --------------------------------- |
| GET    | `/analytics/vocabulary/stats`        | Get overall vocabulary statistics |
| GET    | `/analytics/vocabulary/trends`       | Get learning trends over time     |
| GET    | `/analytics/vocabulary/velocity`     | Get learning velocity (words/day) |
| GET    | `/analytics/vocabulary/words`        | Get words by state (paginated)    |
| GET    | `/analytics/vocabulary/word/:wordId` | Get detailed word information     |

**Key Features**:

1. **Flexible Filtering**: Optional language filter on all endpoints
2. **Time Range Selection**: Configurable period for trends
3. **Pagination**: Efficient large dataset handling
4. **Detailed Word Data**: Full SRS parameters per word
5. **Velocity Metrics**: Learning speed with trend analysis

---

### Task 3: Vocabulary Dashboard Component

**File**: `packages/web/src/pages/VocabularyDashboard.tsx`

**Description**: React dashboard displaying vocabulary statistics with charts for trends, CEFR distribution, and per-language breakdown.

**Implementation**:

```typescript
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { api } from '../lib/api';

interface VocabularyStats {
  totalWords: number;
  byState: {
    unknown: number;
    learning: number;
    known: number;
  };
  byLanguage: Array<{
    language: string;
    totalWords: number;
    unknown: number;
    learning: number;
    known: number;
  }>;
  byCEFR: Array<{
    level: string;
    count: number;
  }>;
  recentlyLearned: Array<{
    wordId: string;
    text: string;
    language: string;
    translations: string[];
    learnedAt: string;
  }>;
}

interface VocabularyTrend {
  date: string;
  totalWords: number;
  learning: number;
  known: number;
}

interface LearningVelocity {
  wordsPerDay: number;
  wordsPerWeek: number;
  wordsThisWeek: number;
  wordsLastWeek: number;
  trend: 'increasing' | 'stable' | 'decreasing';
}

const LANGUAGE_NAMES: Record<string, string> = {
  'ru': 'Russian',
  'zh': 'Chinese',
  'ar': 'Arabic',
  'es': 'Spanish',
  'it': 'Italian',
  'fr': 'French',
  'de': 'German',
  'pt': 'Portuguese'
};

const STATE_COLORS = {
  unknown: '#9CA3AF',
  learning: '#F59E0B',
  known: '#10B981'
};

const CEFR_COLORS = {
  'A0': '#E5E7EB',
  'A1': '#BFDBFE',
  'A2': '#93C5FD',
  'B1': '#60A5FA',
  'B2': '#3B82F6',
  'C1': '#2563EB',
  'C2': '#1E40AF'
};

export function VocabularyDashboard() {
  const [selectedLanguage, setSelectedLanguage] = useState<string | undefined>(undefined);
  const [trendDays, setTrendDays] = useState(30);

  // Fetch statistics
  const { data: stats, isLoading: statsLoading } = useQuery<VocabularyStats>({
    queryKey: ['vocabulary-stats', selectedLanguage],
    queryFn: async () => {
      const params = selectedLanguage ? `?language=${selectedLanguage}` : '';
      const response = await api.get(`/analytics/vocabulary/stats${params}`);
      return response.data;
    }
  });

  // Fetch trends
  const { data: trendsData } = useQuery<{ trends: VocabularyTrend[] }>({
    queryKey: ['vocabulary-trends', selectedLanguage, trendDays],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedLanguage) params.append('language', selectedLanguage);
      params.append('days', trendDays.toString());
      const response = await api.get(`/analytics/vocabulary/trends?${params}`);
      return response.data;
    }
  });

  // Fetch velocity
  const { data: velocity } = useQuery<LearningVelocity>({
    queryKey: ['vocabulary-velocity', selectedLanguage],
    queryFn: async () => {
      const params = selectedLanguage ? `?language=${selectedLanguage}` : '';
      const response = await api.get(`/analytics/vocabulary/velocity${params}`);
      return response.data;
    }
  });

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-gray-600">Loading vocabulary data...</div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  // Prepare chart data
  const stateChartData = [
    { name: 'Unknown', value: stats.byState.unknown, color: STATE_COLORS.unknown },
    { name: 'Learning', value: stats.byState.learning, color: STATE_COLORS.learning },
    { name: 'Known', value: stats.byState.known, color: STATE_COLORS.known }
  ];

  const cefrChartData = stats.byCEFR.map(item => ({
    level: item.level,
    count: item.count,
    color: CEFR_COLORS[item.level as keyof typeof CEFR_COLORS]
  }));

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Vocabulary Progress</h1>
          <p className="text-gray-600">Track your vocabulary learning journey</p>
        </div>

        {/* Language Filter */}
        <div className="mb-8 flex gap-2">
          <button
            onClick={() => setSelectedLanguage(undefined)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              !selectedLanguage
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            All Languages
          </button>
          {stats.byLanguage.map(lang => (
            <button
              key={lang.language}
              onClick={() => setSelectedLanguage(lang.language)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedLanguage === lang.language
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {LANGUAGE_NAMES[lang.language]}
            </button>
          ))}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Total Words</div>
            <div className="text-3xl font-bold text-gray-900">{stats.totalWords}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Learning</div>
            <div className="text-3xl font-bold text-orange-600">{stats.byState.learning}</div>
            <div className="text-xs text-gray-500 mt-1">
              {stats.totalWords > 0
                ? `${Math.round((stats.byState.learning / stats.totalWords) * 100)}%`
                : '0%'}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Known</div>
            <div className="text-3xl font-bold text-green-600">{stats.byState.known}</div>
            <div className="text-xs text-gray-500 mt-1">
              {stats.totalWords > 0
                ? `${Math.round((stats.byState.known / stats.totalWords) * 100)}%`
                : '0%'}
            </div>
          </div>
          {velocity && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-1">Learning Velocity</div>
              <div className="text-3xl font-bold text-blue-600">
                {velocity.wordsPerDay.toFixed(1)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                words/day
                {velocity.trend === 'increasing' && ' ↑'}
                {velocity.trend === 'decreasing' && ' ↓'}
              </div>
            </div>
          )}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* State Distribution Pie Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Words by State</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stateChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                >
                  {stateChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* CEFR Distribution Bar Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">CEFR Level Distribution</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={cefrChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="level" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count">
                  {cefrChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Learning Trend Chart */}
        {trendsData && trendsData.trends.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Learning Progress Over Time</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setTrendDays(7)}
                  className={`px-3 py-1 rounded text-sm ${
                    trendDays === 7 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  7 days
                </button>
                <button
                  onClick={() => setTrendDays(30)}
                  className={`px-3 py-1 rounded text-sm ${
                    trendDays === 30 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  30 days
                </button>
                <button
                  onClick={() => setTrendDays(90)}
                  className={`px-3 py-1 rounded text-sm ${
                    trendDays === 90 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  90 days
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={trendsData.trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="known"
                  stroke={STATE_COLORS.known}
                  strokeWidth={2}
                  name="Known"
                />
                <Line
                  type="monotone"
                  dataKey="learning"
                  stroke={STATE_COLORS.learning}
                  strokeWidth={2}
                  name="Learning"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Per-Language Breakdown */}
        {stats.byLanguage.length > 1 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Progress by Language</h2>
            <div className="space-y-4">
              {stats.byLanguage.map(lang => {
                const total = lang.totalWords;
                const knownPercent = total > 0 ? (lang.known / total) * 100 : 0;
                const learningPercent = total > 0 ? (lang.learning / total) * 100 : 0;
                const unknownPercent = 100 - knownPercent - learningPercent;

                return (
                  <div key={lang.language}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900">
                        {LANGUAGE_NAMES[lang.language]}
                      </span>
                      <span className="text-sm text-gray-600">{total} words</span>
                    </div>
                    <div className="w-full h-8 bg-gray-200 rounded-full overflow-hidden flex">
                      <div
                        className="bg-green-500"
                        style={{ width: `${knownPercent}%` }}
                        title={`Known: ${lang.known}`}
                      />
                      <div
                        className="bg-orange-500"
                        style={{ width: `${learningPercent}%` }}
                        title={`Learning: ${lang.learning}`}
                      />
                      <div
                        className="bg-gray-400"
                        style={{ width: `${unknownPercent}%` }}
                        title={`Unknown: ${lang.unknown}`}
                      />
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-gray-600">
                      <span>Known: {lang.known}</span>
                      <span>Learning: {lang.learning}</span>
                      <span>Unknown: {lang.unknown}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recently Learned Words */}
        {stats.recentlyLearned.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recently Learned</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.recentlyLearned.map(word => (
                <div
                  key={word.wordId}
                  className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                >
                  <div className="font-semibold text-lg text-gray-900 mb-1">{word.text}</div>
                  <div className="text-sm text-gray-600 mb-2">
                    {word.translations.join(', ')}
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{LANGUAGE_NAMES[word.language]}</span>
                    <span>{new Date(word.learnedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Component Features**:

1. **Summary Cards**: Total words, learning/known counts with percentages
2. **Learning Velocity**: Words per day with trend indicator (↑↓)
3. **State Pie Chart**: Visual distribution of unknown/learning/known
4. **CEFR Bar Chart**: Words by proficiency level
5. **Trend Line Chart**: Progress over time (7/30/90 day views)
6. **Language Breakdown**: Horizontal bars for multi-language progress
7. **Recently Learned**: Grid of most recently mastered words
8. **Language Filter**: Toggle between all languages or specific language

---

## Open Questions

### 1. **Chart Library Selection**

- **Question**: Which charting library should we use? Recharts (current choice) vs Chart.js vs D3.js?
- **Options**:
  - Recharts: React-native, composable, good for simple charts
  - Chart.js: Popular, many plugins, React wrapper needed
  - D3.js: Most powerful, steeper learning curve, full control
- **Recommendation**: Start with Recharts for MVP (already in implementation), consider D3.js for advanced features later

### 2. **Data Refresh Strategy**

- **Question**: How often should the dashboard refresh statistics? Real-time, manual refresh, or timed interval?
- **Options**:
  - Manual refresh only (user clicks button)
  - Auto-refresh every 5 minutes
  - Real-time updates via WebSocket
- **Recommendation**: Manual refresh for MVP, add auto-refresh on data mutations (after practice sessions) in phase 2

### 3. **Export Functionality**

- **Question**: Should users be able to export their vocabulary data (CSV, JSON)?
- **Options**:
  - No export (view only)
  - CSV export for spreadsheet analysis
  - JSON export for backup/portability
  - PDF report generation
- **Recommendation**: Add CSV export in phase 2 based on user demand, focus on visualization quality first

---

## Dependencies

- **Blocks**: None
- **Depends on**: F001 (Database Schema), F035 (Word State Tracking), F046 (SRS System)

---

## Notes

- Dashboard shows aggregate statistics across all word states
- Filterable by language for multi-language learners
- Trends use cumulative counts (words accumulate over time)
- Recently learned = words that reached 'known' state in last 30 days
- CEFR distribution helps users see their vocabulary level spread
- Learning velocity calculates average rate and compares week-over-week
- All charts are responsive and mobile-friendly using Recharts
