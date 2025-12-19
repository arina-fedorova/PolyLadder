# F053: Grammar Coverage Tracking

**Feature Code**: F053
**Created**: 2025-12-17
**Phase**: 15 - Progress Tracking & Analytics
**Status**: Not Started

---

## Description

Implement grammar coverage tracker showing which grammar concepts have been learned per language.

## Success Criteria

- [ ] Grammar concepts list with completion status
- [ ] CEFR level grouping
- [ ] Per-language breakdown
- [ ] Coverage percentage (e.g., 75% of A1 grammar completed)
- [ ] Gaps identified (concepts not yet learned)

---

## Tasks

### Task 1: Grammar Coverage Analytics Service

**File**: `packages/api/src/services/analytics/grammar-analytics.service.ts`

**Description**: Service to calculate grammar coverage by analyzing user's completed grammar lessons and practice sessions. Tracks completion by CEFR level, identifies gaps, and provides recommendations.

**Implementation**:

```typescript
import { Pool } from 'pg';

interface GrammarConcept {
  id: string;
  title: string;
  description: string;
  cefrLevel: string;
  language: string;
  category: string;
  completed: boolean;
  masteryLevel: number; // 0-100
  lastPracticed: Date | null;
  practiceCount: number;
}

interface GrammarCoverageStats {
  totalConcepts: number;
  completedConcepts: number;
  coveragePercentage: number;
  byCEFR: Array<{
    level: string;
    total: number;
    completed: number;
    percentage: number;
  }>;
  byCategory: Array<{
    category: string;
    total: number;
    completed: number;
    percentage: number;
  }>;
  byLanguage: Array<{
    language: string;
    totalConcepts: number;
    completedConcepts: number;
    percentage: number;
  }>;
  gaps: GrammarConcept[];
  recentlyCompleted: GrammarConcept[];
}

interface GrammarRecommendation {
  conceptId: string;
  title: string;
  cefrLevel: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

interface GrammarMasteryTrend {
  date: string;
  conceptsCompleted: number;
  averageMastery: number;
}

export class GrammarAnalyticsService {
  constructor(private pool: Pool) {}

  /**
   * Get comprehensive grammar coverage statistics
   */
  async getGrammarCoverage(
    userId: string,
    language?: string
  ): Promise<GrammarCoverageStats> {
    const params: any[] = [userId];
    let languageFilter = '';

    if (language) {
      languageFilter = 'AND gr.language = $2';
      params.push(language);
    }

    // Get all grammar concepts with completion status
    const conceptsQuery = `
      SELECT
        gr.id,
        gr.title,
        gr.explanation as description,
        gr.cefr_level,
        gr.language,
        gr.category,
        COALESCE(gp.is_completed, false) as completed,
        COALESCE(gp.mastery_level, 0) as mastery_level,
        gp.last_practiced,
        COALESCE(gp.practice_count, 0) as practice_count
      FROM approved_grammar_rules gr
      LEFT JOIN grammar_progress gp ON gp.grammar_id = gr.id::text AND gp.user_id = $1
      WHERE 1=1 ${languageFilter}
      ORDER BY
        CASE gr.cefr_level
          WHEN 'A0' THEN 1
          WHEN 'A1' THEN 2
          WHEN 'A2' THEN 3
          WHEN 'B1' THEN 4
          WHEN 'B2' THEN 5
          WHEN 'C1' THEN 6
          WHEN 'C2' THEN 7
        END,
        gr.category,
        gr.title
    `;

    const conceptsResult = await this.pool.query(conceptsQuery, params);

    const allConcepts: GrammarConcept[] = conceptsResult.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      cefrLevel: row.cefr_level,
      language: row.language,
      category: row.category,
      completed: row.completed,
      masteryLevel: parseInt(row.mastery_level),
      lastPracticed: row.last_practiced ? new Date(row.last_practiced) : null,
      practiceCount: parseInt(row.practice_count)
    }));

    const totalConcepts = allConcepts.length;
    const completedConcepts = allConcepts.filter(c => c.completed).length;
    const coveragePercentage = totalConcepts > 0
      ? Math.round((completedConcepts / totalConcepts) * 100)
      : 0;

    // Group by CEFR level
    const byCEFRMap = new Map<string, { total: number; completed: number }>();
    allConcepts.forEach(concept => {
      const existing = byCEFRMap.get(concept.cefrLevel) || { total: 0, completed: 0 };
      existing.total++;
      if (concept.completed) existing.completed++;
      byCEFRMap.set(concept.cefrLevel, existing);
    });

    const byCEFR = Array.from(byCEFRMap.entries())
      .map(([level, stats]) => ({
        level,
        total: stats.total,
        completed: stats.completed,
        percentage: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
      }))
      .sort((a, b) => {
        const order = { 'A0': 1, 'A1': 2, 'A2': 3, 'B1': 4, 'B2': 5, 'C1': 6, 'C2': 7 };
        return (order[a.level as keyof typeof order] || 99) - (order[b.level as keyof typeof order] || 99);
      });

    // Group by category
    const byCategoryMap = new Map<string, { total: number; completed: number }>();
    allConcepts.forEach(concept => {
      const existing = byCategoryMap.get(concept.category) || { total: 0, completed: 0 };
      existing.total++;
      if (concept.completed) existing.completed++;
      byCategoryMap.set(concept.category, existing);
    });

    const byCategory = Array.from(byCategoryMap.entries())
      .map(([category, stats]) => ({
        category,
        total: stats.total,
        completed: stats.completed,
        percentage: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
      }))
      .sort((a, b) => b.percentage - a.percentage);

    // Group by language (if not filtered)
    let byLanguage: Array<{
      language: string;
      totalConcepts: number;
      completedConcepts: number;
      percentage: number;
    }> = [];

    if (!language) {
      const byLanguageMap = new Map<string, { total: number; completed: number }>();
      allConcepts.forEach(concept => {
        const existing = byLanguageMap.get(concept.language) || { total: 0, completed: 0 };
        existing.total++;
        if (concept.completed) existing.completed++;
        byLanguageMap.set(concept.language, existing);
      });

      byLanguage = Array.from(byLanguageMap.entries())
        .map(([lang, stats]) => ({
          language: lang,
          totalConcepts: stats.total,
          completedConcepts: stats.completed,
          percentage: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
        }))
        .sort((a, b) => b.percentage - a.percentage);
    }

    // Identify gaps (not completed, prioritize by CEFR level)
    const gaps = allConcepts
      .filter(c => !c.completed)
      .slice(0, 20); // Top 20 gaps

    // Recently completed (last 30 days)
    const recentlyCompleted = allConcepts
      .filter(c => c.completed && c.lastPracticed)
      .filter(c => {
        const daysSince = (Date.now() - c.lastPracticed!.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince <= 30;
      })
      .sort((a, b) => b.lastPracticed!.getTime() - a.lastPracticed!.getTime())
      .slice(0, 10);

    return {
      totalConcepts,
      completedConcepts,
      coveragePercentage,
      byCEFR,
      byCategory,
      byLanguage,
      gaps,
      recentlyCompleted
    };
  }

  /**
   * Get personalized grammar recommendations
   */
  async getGrammarRecommendations(
    userId: string,
    language: string,
    limit: number = 5
  ): Promise<GrammarRecommendation[]> {
    // Get user's current CEFR level
    const userLevelResult = await this.pool.query(
      `SELECT cefr_level FROM user_language_progress WHERE user_id = $1 AND language = $2`,
      [userId, language]
    );

    const userCEFRLevel = userLevelResult.rows[0]?.cefr_level || 'A1';

    // Get incomplete concepts at user's level and one level above
    const nextLevel = this.getNextCEFRLevel(userCEFRLevel);

    const query = `
      SELECT
        gr.id as concept_id,
        gr.title,
        gr.cefr_level,
        gr.category,
        COALESCE(gp.practice_count, 0) as practice_count,
        COALESCE(gp.mastery_level, 0) as mastery_level
      FROM approved_grammar_rules gr
      LEFT JOIN grammar_progress gp ON gp.grammar_id = gr.id::text AND gp.user_id = $1
      WHERE gr.language = $2
        AND (gr.cefr_level = $3 OR gr.cefr_level = $4)
        AND COALESCE(gp.is_completed, false) = false
      ORDER BY
        CASE gr.cefr_level
          WHEN $3 THEN 1  -- Current level first
          WHEN $4 THEN 2  -- Next level second
        END,
        gp.practice_count NULLS FIRST,
        gr.title
      LIMIT $5
    `;

    const result = await this.pool.query(query, [
      userId,
      language,
      userCEFRLevel,
      nextLevel,
      limit
    ]);

    return result.rows.map(row => {
      let reason = '';
      let priority: 'high' | 'medium' | 'low' = 'medium';

      if (row.practice_count === '0') {
        reason = 'Not yet practiced';
        priority = row.cefr_level === userCEFRLevel ? 'high' : 'medium';
      } else if (parseInt(row.mastery_level) < 50) {
        reason = 'Low mastery - needs more practice';
        priority = 'high';
      } else {
        reason = 'Ready to complete';
        priority = 'medium';
      }

      if (row.cefr_level !== userCEFRLevel) {
        reason += ' (next level)';
        priority = 'low';
      }

      return {
        conceptId: row.concept_id,
        title: row.title,
        cefrLevel: row.cefr_level,
        reason,
        priority
      };
    });
  }

  /**
   * Get grammar mastery trends over time
   */
  async getGrammarMasteryTrends(
    userId: string,
    language?: string,
    days: number = 30
  ): Promise<GrammarMasteryTrend[]> {
    const params: any[] = [userId, days];
    let languageFilter = '';

    if (language) {
      languageFilter = 'AND gr.language = $3';
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
      daily_progress AS (
        SELECT
          DATE(gp.last_practiced) as practice_date,
          COUNT(DISTINCT gp.grammar_id) FILTER (WHERE gp.is_completed = true) as concepts_completed,
          AVG(gp.mastery_level) as avg_mastery
        FROM grammar_progress gp
        JOIN approved_grammar_rules gr ON gr.id = gp.grammar_id::uuid
        WHERE gp.user_id = $1
          AND gp.last_practiced IS NOT NULL
          ${languageFilter}
        GROUP BY DATE(gp.last_practiced)
      )
      SELECT
        ds.date::text,
        COALESCE(SUM(dp.concepts_completed) OVER (ORDER BY ds.date), 0) as concepts_completed,
        COALESCE(dp.avg_mastery, 0) as average_mastery
      FROM date_series ds
      LEFT JOIN daily_progress dp ON dp.practice_date = ds.date
      ORDER BY ds.date
    `;

    const result = await this.pool.query(query, params);

    return result.rows.map(row => ({
      date: row.date,
      conceptsCompleted: parseInt(row.concepts_completed),
      averageMastery: parseFloat(row.average_mastery)
    }));
  }

  /**
   * Get detailed concept information
   */
  async getConceptDetails(
    userId: string,
    conceptId: string
  ): Promise<GrammarConcept | null> {
    const query = `
      SELECT
        gr.id,
        gr.title,
        gr.explanation as description,
        gr.cefr_level,
        gr.language,
        gr.category,
        COALESCE(gp.is_completed, false) as completed,
        COALESCE(gp.mastery_level, 0) as mastery_level,
        gp.last_practiced,
        COALESCE(gp.practice_count, 0) as practice_count
      FROM approved_grammar_rules gr
      LEFT JOIN grammar_progress gp ON gp.grammar_id = gr.id::text AND gp.user_id = $1
      WHERE gr.id = $2::uuid
    `;

    const result = await this.pool.query(query, [userId, conceptId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      cefrLevel: row.cefr_level,
      language: row.language,
      category: row.category,
      completed: row.completed,
      masteryLevel: parseInt(row.mastery_level),
      lastPracticed: row.last_practiced ? new Date(row.last_practiced) : null,
      practiceCount: parseInt(row.practice_count)
    };
  }

  /**
   * Helper: Get next CEFR level
   */
  private getNextCEFRLevel(currentLevel: string): string {
    const levels = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const currentIndex = levels.indexOf(currentLevel);
    return currentIndex < levels.length - 1 ? levels[currentIndex + 1] : currentLevel;
  }
}
```

**Database Schema Extension**:

```sql
-- Grammar progress tracking table
CREATE TABLE IF NOT EXISTS grammar_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grammar_id VARCHAR(100) NOT NULL, -- References approved_grammar_rules.id
  language VARCHAR(20) NOT NULL,

  -- Progress metrics
  is_completed BOOLEAN DEFAULT false,
  mastery_level INT DEFAULT 0 CHECK (mastery_level >= 0 AND mastery_level <= 100),
  practice_count INT DEFAULT 0,

  -- Timestamps
  first_practiced TIMESTAMP,
  last_practiced TIMESTAMP,
  completed_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, grammar_id)
);

CREATE INDEX idx_grammar_progress_user ON grammar_progress(user_id, language);
CREATE INDEX idx_grammar_progress_completed ON grammar_progress(user_id, is_completed);
CREATE INDEX idx_grammar_progress_mastery ON grammar_progress(user_id, mastery_level);
```

**Key Features**:
1. **Comprehensive Coverage**: Total, by CEFR level, by category, by language
2. **Gap Identification**: Shows uncompleted concepts prioritized by level
3. **Personalized Recommendations**: Based on user's current CEFR level
4. **Mastery Tracking**: 0-100 mastery score per concept
5. **Trend Analysis**: Progress over time with cumulative completion

---

### Task 2: Grammar Coverage API Endpoints

**File**: `packages/api/src/routes/analytics/grammar.routes.ts`

**Description**: RESTful API endpoints for grammar coverage statistics, recommendations, and concept details.

**Implementation**:

```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GrammarAnalyticsService } from '../../services/analytics/grammar-analytics.service.ts';

// Request/Response Schemas
const GetCoverageQuerySchema = z.object({
  language: z.string().optional()
});

const GetRecommendationsQuerySchema = z.object({
  language: z.string(),
  limit: z.string().transform(val => parseInt(val, 10)).optional()
});

const GetTrendsQuerySchema = z.object({
  language: z.string().optional(),
  days: z.string().transform(val => parseInt(val, 10)).optional()
});

const GetConceptParamsSchema = z.object({
  conceptId: z.string().uuid()
});

export async function grammarAnalyticsRoutes(fastify: FastifyInstance) {
  const grammarService = new GrammarAnalyticsService(fastify.pg.pool);

  /**
   * GET /analytics/grammar/coverage
   * Get grammar coverage statistics
   */
  fastify.get('/analytics/grammar/coverage', {
    schema: {
      querystring: GetCoverageQuerySchema,
      response: {
        200: z.object({
          totalConcepts: z.number(),
          completedConcepts: z.number(),
          coveragePercentage: z.number(),
          byCEFR: z.array(z.object({
            level: z.string(),
            total: z.number(),
            completed: z.number(),
            percentage: z.number()
          })),
          byCategory: z.array(z.object({
            category: z.string(),
            total: z.number(),
            completed: z.number(),
            percentage: z.number()
          })),
          byLanguage: z.array(z.object({
            language: z.string(),
            totalConcepts: z.number(),
            completedConcepts: z.number(),
            percentage: z.number()
          })),
          gaps: z.array(z.object({
            id: z.string(),
            title: z.string(),
            cefrLevel: z.string(),
            category: z.string()
          })),
          recentlyCompleted: z.array(z.object({
            id: z.string(),
            title: z.string(),
            cefrLevel: z.string(),
            lastPracticed: z.string()
          }))
        })
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = request.user.id;
    const { language } = request.query;

    try {
      const coverage = await grammarService.getGrammarCoverage(userId, language);

      return reply.status(200).send({
        totalConcepts: coverage.totalConcepts,
        completedConcepts: coverage.completedConcepts,
        coveragePercentage: coverage.coveragePercentage,
        byCEFR: coverage.byCEFR,
        byCategory: coverage.byCategory,
        byLanguage: coverage.byLanguage,
        gaps: coverage.gaps.map(g => ({
          id: g.id,
          title: g.title,
          cefrLevel: g.cefrLevel,
          category: g.category
        })),
        recentlyCompleted: coverage.recentlyCompleted.map(c => ({
          id: c.id,
          title: c.title,
          cefrLevel: c.cefrLevel,
          lastPracticed: c.lastPracticed!.toISOString()
        }))
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to fetch grammar coverage',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /analytics/grammar/recommendations
   * Get personalized grammar recommendations
   */
  fastify.get('/analytics/grammar/recommendations', {
    schema: {
      querystring: GetRecommendationsQuerySchema,
      response: {
        200: z.object({
          recommendations: z.array(z.object({
            conceptId: z.string(),
            title: z.string(),
            cefrLevel: z.string(),
            reason: z.string(),
            priority: z.enum(['high', 'medium', 'low'])
          }))
        })
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = request.user.id;
    const { language, limit } = request.query;

    try {
      const recommendations = await grammarService.getGrammarRecommendations(
        userId,
        language,
        limit || 5
      );

      return reply.status(200).send({ recommendations });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to generate recommendations',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /analytics/grammar/trends
   * Get grammar mastery trends over time
   */
  fastify.get('/analytics/grammar/trends', {
    schema: {
      querystring: GetTrendsQuerySchema,
      response: {
        200: z.object({
          trends: z.array(z.object({
            date: z.string(),
            conceptsCompleted: z.number(),
            averageMastery: z.number()
          }))
        })
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = request.user.id;
    const { language, days } = request.query;

    try {
      const trends = await grammarService.getGrammarMasteryTrends(
        userId,
        language,
        days || 30
      );

      return reply.status(200).send({ trends });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to fetch trends',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /analytics/grammar/concept/:conceptId
   * Get detailed information about a specific concept
   */
  fastify.get('/analytics/grammar/concept/:conceptId', {
    schema: {
      params: GetConceptParamsSchema,
      response: {
        200: z.object({
          id: z.string(),
          title: z.string(),
          description: z.string(),
          cefrLevel: z.string(),
          language: z.string(),
          category: z.string(),
          completed: z.boolean(),
          masteryLevel: z.number(),
          lastPracticed: z.string().nullable(),
          practiceCount: z.number()
        })
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = request.user.id;
    const { conceptId } = request.params;

    try {
      const concept = await grammarService.getConceptDetails(userId, conceptId);

      if (!concept) {
        return reply.status(404).send({ error: 'Concept not found' });
      }

      return reply.status(200).send({
        ...concept,
        lastPracticed: concept.lastPracticed?.toISOString() || null
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to fetch concept details',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
```

**API Endpoints Summary**:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/analytics/grammar/coverage` | Get grammar coverage statistics |
| GET | `/analytics/grammar/recommendations` | Get personalized recommendations |
| GET | `/analytics/grammar/trends` | Get mastery trends over time |
| GET | `/analytics/grammar/concept/:conceptId` | Get detailed concept information |

**Key Features**:
1. **Comprehensive Coverage**: Total, by CEFR, by category, by language
2. **Gap Identification**: Top 20 uncompleted concepts
3. **Smart Recommendations**: Based on user level and practice history
4. **Trend Tracking**: Completion and mastery over time
5. **Detailed Concept Info**: Full progress data per concept

---

### Task 3: Grammar Coverage Dashboard Component

**File**: `packages/web/src/pages/GrammarCoverageDashboard.tsx`

**Description**: React dashboard displaying grammar coverage with charts, gap analysis, and personalized recommendations.

**Implementation**:

```typescript
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
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

interface GrammarCoverage {
  totalConcepts: number;
  completedConcepts: number;
  coveragePercentage: number;
  byCEFR: Array<{
    level: string;
    total: number;
    completed: number;
    percentage: number;
  }>;
  byCategory: Array<{
    category: string;
    total: number;
    completed: number;
    percentage: number;
  }>;
  byLanguage: Array<{
    language: string;
    totalConcepts: number;
    completedConcepts: number;
    percentage: number;
  }>;
  gaps: Array<{
    id: string;
    title: string;
    cefrLevel: string;
    category: string;
  }>;
  recentlyCompleted: Array<{
    id: string;
    title: string;
    cefrLevel: string;
    lastPracticed: string;
  }>;
}

interface GrammarRecommendation {
  conceptId: string;
  title: string;
  cefrLevel: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

const LANGUAGE_NAMES: Record<string, string> = {
  'ru': 'Russian',
  'zh': 'Chinese',
  'ar': 'Arabic',
  'es': 'Spanish',
  'it': 'Italian',
  'fr': 'French'
};

const CEFR_COLORS: Record<string, string> = {
  'A0': '#E5E7EB',
  'A1': '#BFDBFE',
  'A2': '#93C5FD',
  'B1': '#60A5FA',
  'B2': '#3B82F6',
  'C1': '#2563EB',
  'C2': '#1E40AF'
};

const PRIORITY_COLORS = {
  high: 'bg-red-100 text-red-800 border-red-300',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  low: 'bg-blue-100 text-blue-800 border-blue-300'
};

export function GrammarCoverageDashboard() {
  const [selectedLanguage, setSelectedLanguage] = useState<string | undefined>(undefined);

  // Fetch coverage
  const { data: coverage, isLoading } = useQuery<GrammarCoverage>({
    queryKey: ['grammar-coverage', selectedLanguage],
    queryFn: async () => {
      const params = selectedLanguage ? `?language=${selectedLanguage}` : '';
      const response = await api.get(`/analytics/grammar/coverage${params}`);
      return response.data;
    }
  });

  // Fetch recommendations (only if language selected)
  const { data: recommendationsData } = useQuery<{ recommendations: GrammarRecommendation[] }>({
    queryKey: ['grammar-recommendations', selectedLanguage],
    queryFn: async () => {
      if (!selectedLanguage) return { recommendations: [] };
      const response = await api.get(`/analytics/grammar/recommendations?language=${selectedLanguage}`);
      return response.data;
    },
    enabled: !!selectedLanguage
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-gray-600">Loading grammar data...</div>
      </div>
    );
  }

  if (!coverage) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Grammar Coverage</h1>
          <p className="text-gray-600">Track your grammar learning progress</p>
        </div>

        {/* Language Filter */}
        {coverage.byLanguage.length > 0 && (
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
            {coverage.byLanguage.map(lang => (
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
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Total Concepts</div>
            <div className="text-3xl font-bold text-gray-900">{coverage.totalConcepts}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Completed</div>
            <div className="text-3xl font-bold text-green-600">{coverage.completedConcepts}</div>
            <div className="text-xs text-gray-500 mt-1">
              {coverage.totalConcepts > 0
                ? `${coverage.coveragePercentage}%`
                : '0%'}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Gaps Remaining</div>
            <div className="text-3xl font-bold text-orange-600">
              {coverage.totalConcepts - coverage.completedConcepts}
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* CEFR Coverage Bar Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Coverage by CEFR Level</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={coverage.byCEFR}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="level" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="completed" fill="#10B981" name="Completed" />
                <Bar dataKey="total" fill="#E5E7EB" name="Total" />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {coverage.byCEFR.map(level => (
                <div key={level.level} className="text-center">
                  <div className="text-xs text-gray-600">{level.level}</div>
                  <div className="text-sm font-semibold text-gray-900">{level.percentage}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Category Coverage */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Coverage by Category</h2>
            <div className="space-y-3">
              {coverage.byCategory.slice(0, 8).map(cat => {
                const completedPercent = cat.percentage;
                const remainingPercent = 100 - completedPercent;

                return (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">{cat.category}</span>
                      <span className="text-xs text-gray-600">
                        {cat.completed}/{cat.total}
                      </span>
                    </div>
                    <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden flex">
                      <div
                        className="bg-green-500"
                        style={{ width: `${completedPercent}%` }}
                        title={`${cat.completed} completed`}
                      />
                      <div
                        className="bg-gray-300"
                        style={{ width: `${remainingPercent}%` }}
                        title={`${cat.total - cat.completed} remaining`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recommendations */}
        {recommendationsData && recommendationsData.recommendations.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recommended Next Steps</h2>
            <div className="space-y-3">
              {recommendationsData.recommendations.map(rec => (
                <div
                  key={rec.conceptId}
                  className="flex items-start justify-between p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{rec.title}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[rec.priority]}`}>
                        {rec.priority}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mb-2">{rec.reason}</div>
                    <div className="text-xs text-gray-500">CEFR: {rec.cefrLevel}</div>
                  </div>
                  <button className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
                    Practice
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gaps (Uncompleted Concepts) */}
        {coverage.gaps.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Gaps to Fill ({coverage.gaps.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {coverage.gaps.slice(0, 12).map(gap => (
                <div
                  key={gap.id}
                  className="p-4 border border-orange-200 bg-orange-50 rounded-lg"
                >
                  <div className="font-semibold text-gray-900 mb-1">{gap.title}</div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">{gap.category}</span>
                    <span className="px-2 py-0.5 bg-white rounded text-gray-700">
                      {gap.cefrLevel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {coverage.gaps.length > 12 && (
              <div className="mt-4 text-center text-sm text-gray-600">
                + {coverage.gaps.length - 12} more concepts to learn
              </div>
            )}
          </div>
        )}

        {/* Recently Completed */}
        {coverage.recentlyCompleted.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recently Completed</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {coverage.recentlyCompleted.map(concept => (
                <div
                  key={concept.id}
                  className="p-4 border border-green-200 bg-green-50 rounded-lg"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-semibold text-gray-900">{concept.title}</div>
                    <span className="text-2xl">✓</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">{concept.cefrLevel}</span>
                    <span className="text-gray-500">
                      {new Date(concept.lastPracticed).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {coverage.totalConcepts === 0 && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-6xl mb-4">📚</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No Grammar Concepts Yet
            </h3>
            <p className="text-gray-600">
              Start learning grammar to see your progress here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Component Features**:
1. **Summary Cards**: Total concepts, completed, gaps remaining
2. **CEFR Bar Chart**: Completed vs total per level with percentages
3. **Category Progress Bars**: Horizontal bars showing completion per category
4. **Recommendations**: Personalized next steps with priority badges
5. **Gap Analysis**: Grid of uncompleted concepts (orange cards)
6. **Recently Completed**: Grid of recently mastered concepts (green cards)
7. **Language Filter**: Toggle between all languages or specific language
8. **Empty State**: Friendly message when no data available

---

## Open Questions

### 1. **Mastery Level Calculation**
- **Question**: How should mastery level (0-100) be calculated? Based on practice accuracy, review count, or combination?
- **Options**:
  - Simple accuracy average (% correct answers)
  - Weighted by recency (recent performance more important)
  - SRS-based (ease factor converted to 0-100 scale)
- **Recommendation**: Use weighted accuracy with recency decay: `mastery = (recent_accuracy * 0.7) + (historical_accuracy * 0.3)`

### 2. **Completion Criteria**
- **Question**: When is a grammar concept marked as "completed"? After how many successful practices?
- **Options**:
  - Single successful completion of lesson
  - 3+ successful practice sessions with >80% accuracy
  - Mastery level reaches 80+
- **Recommendation**: Mark completed after mastery level reaches 70%, encourage continued practice to 100%

### 3. **Gap Prioritization**
- **Question**: How should gaps be prioritized in the dashboard?
- **Options**:
  - CEFR level only (lower levels first)
  - Category (focus on weak categories)
  - Prerequisites (based on curriculum graph)
- **Recommendation**: Prioritize by CEFR level first, then by category diversity (spread across categories)

---

## Dependencies

- **Blocks**: None
- **Depends on**: F001 (Database Schema), F037 (Grammar Lesson Structure)

---

## Notes

- Coverage calculated as completed / total concepts per CEFR level
- Identifies weak areas by category and CEFR level
- Recommendations prioritize user's current level and one level above
- Mastery level (0-100) tracks proficiency per concept
- Grammar progress table tracks practice history per concept
- Recently completed shows concepts mastered in last 30 days
- Charts use Recharts library for consistency with F052
