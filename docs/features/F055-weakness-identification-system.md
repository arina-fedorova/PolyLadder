# F055: Weakness Identification System

**Feature Code**: F055
**Created**: 2025-12-17
**Phase**: 15 - Progress Tracking & Analytics
**Status**: Not Started

---

## Description

Implement system that identifies user's weak areas based on exercise performance across vocabulary, grammar, and other learning dimensions, then suggests targeted practice to improve identified weaknesses.

## Success Criteria

- [ ] Analyze exercise performance by concept (vocabulary, grammar, syntax)
- [ ] Identify concepts with <70% accuracy over last 10 attempts
- [ ] Rank weaknesses by severity (accuracy, recency, frequency)
- [ ] Suggest targeted practice exercises for weak areas
- [ ] Track improvement over time with before/after metrics
- [ ] Filter weaknesses by language, CEFR level, or category
- [ ] Provide visual weakness heatmap

---

## Tasks

### Task 1: Implement Weakness Identification Service

**File**: `packages/api/src/services/analytics/weakness-identification.service.ts`

Create a comprehensive service for analyzing user performance and identifying weak areas that need additional practice.

```typescript
import { Pool, PoolClient } from 'pg';

/**
 * Weakness Identification Service
 *
 * Identifies user's weak areas based on performance metrics:
 * 1. Vocabulary items with low accuracy or high lapse rate
 * 2. Grammar concepts with poor mastery scores
 * 3. Syntax patterns with repeated mistakes
 * 4. Orthography errors (recurrent misspellings)
 *
 * Weakness Criteria:
 * - Accuracy < 70% over last 10 attempts
 * - OR ease factor < 2.0 (SRS metric indicating difficulty)
 * - OR recent failures (≥3 failures in last 7 days)
 *
 * Ranking Algorithm:
 * - Severity = (1 - accuracy) * 0.5 + (recency_weight) * 0.3 + (frequency_weight) * 0.2
 * - Recency: More recent mistakes weighted higher
 * - Frequency: More frequent practice items ranked higher (more important to fix)
 */

interface WeaknessItem {
  itemId: string;
  itemType: 'vocabulary' | 'grammar' | 'syntax' | 'orthography';
  itemText: string;
  language: string;
  cefrLevel: string;
  category?: string;
  accuracy: number;
  totalAttempts: number;
  recentAttempts: number;
  failureCount: number;
  lastAttemptDate: Date;
  severityScore: number;
  improvementPotential: number;
}

interface WeaknessAnalysis {
  userId: string;
  language?: string;
  totalWeaknesses: number;
  weaknessesByType: {
    vocabulary: number;
    grammar: number;
    syntax: number;
    orthography: number;
  };
  weaknessesByCEFR: Record<string, number>;
  topWeaknesses: WeaknessItem[];
  analyzedAt: Date;
}

interface WeaknessRecommendation {
  itemId: string;
  itemType: string;
  itemText: string;
  reason: string;
  practiceType: 'recall' | 'recognition' | 'production' | 'mixed';
  estimatedPracticeTime: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

interface ImprovementTracking {
  itemId: string;
  itemType: string;
  itemText: string;
  beforeAccuracy: number;
  afterAccuracy: number;
  improvementPercentage: number;
  practiceSessionsCompleted: number;
  status: 'improving' | 'stagnant' | 'regressing';
}

export class WeaknessIdentificationService {
  private pool: Pool;
  private readonly WEAKNESS_ACCURACY_THRESHOLD = 0.70; // 70%
  private readonly MIN_ATTEMPTS_FOR_ANALYSIS = 5;
  private readonly ANALYSIS_WINDOW_DAYS = 30;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Analyze user's performance to identify weaknesses
   */
  async analyzeWeaknesses(
    userId: string,
    language?: string,
    cefrLevel?: string
  ): Promise<WeaknessAnalysis> {
    const client = await this.pool.connect();

    try {
      // Get vocabulary weaknesses
      const vocabWeaknesses = await this.getVocabularyWeaknesses(
        client,
        userId,
        language,
        cefrLevel
      );

      // Get grammar weaknesses
      const grammarWeaknesses = await this.getGrammarWeaknesses(
        client,
        userId,
        language,
        cefrLevel
      );

      // Get syntax weaknesses
      const syntaxWeaknesses = await this.getSyntaxWeaknesses(
        client,
        userId,
        language,
        cefrLevel
      );

      // Combine all weaknesses
      const allWeaknesses = [
        ...vocabWeaknesses,
        ...grammarWeaknesses,
        ...syntaxWeaknesses
      ];

      // Sort by severity score (highest first)
      allWeaknesses.sort((a, b) => b.severityScore - a.severityScore);

      // Count by type
      const weaknessesByType = {
        vocabulary: vocabWeaknesses.length,
        grammar: grammarWeaknesses.length,
        syntax: syntaxWeaknesses.length,
        orthography: 0 // Calculated separately if needed
      };

      // Count by CEFR level
      const weaknessesByCEFR: Record<string, number> = {};
      allWeaknesses.forEach(w => {
        weaknessesByCEFR[w.cefrLevel] = (weaknessesByCEFR[w.cefrLevel] || 0) + 1;
      });

      return {
        userId,
        language,
        totalWeaknesses: allWeaknesses.length,
        weaknessesByType,
        weaknessesByCEFR,
        topWeaknesses: allWeaknesses.slice(0, 50), // Top 50 weaknesses
        analyzedAt: new Date()
      };

    } finally {
      client.release();
    }
  }

  /**
   * Get vocabulary weaknesses based on SRS performance
   */
  private async getVocabularyWeaknesses(
    client: PoolClient,
    userId: string,
    language?: string,
    cefrLevel?: string
  ): Promise<WeaknessItem[]> {
    const query = `
      WITH vocab_performance AS (
        SELECT
          si.item_id,
          u.text as item_text,
          u.language,
          u.cefr_level,
          ws.ease_factor,
          ws.review_count,
          ws.last_reviewed,
          COUNT(sr.id) FILTER (WHERE sr.created_at >= NOW() - INTERVAL '${this.ANALYSIS_WINDOW_DAYS} days') as recent_attempts,
          COUNT(sr.id) FILTER (WHERE sr.quality < 3 AND sr.created_at >= NOW() - INTERVAL '${this.ANALYSIS_WINDOW_DAYS} days') as recent_failures,
          AVG(CASE WHEN sr.quality >= 3 THEN 1.0 ELSE 0.0 END) as accuracy,
          COUNT(sr.id) as total_attempts
        FROM srs_items si
        JOIN approved_utterances u ON u.id::text = si.item_id
        LEFT JOIN word_states ws ON ws.word_id = si.item_id AND ws.user_id = si.user_id
        LEFT JOIN srs_reviews sr ON sr.item_id = si.item_id AND sr.user_id = si.user_id
        WHERE si.user_id = $1
          AND si.item_type = 'vocabulary'
          ${language ? 'AND u.language = $2' : ''}
          ${cefrLevel ? 'AND u.cefr_level = $3' : ''}
        GROUP BY si.item_id, u.text, u.language, u.cefr_level, ws.ease_factor, ws.review_count, ws.last_reviewed
        HAVING COUNT(sr.id) >= ${this.MIN_ATTEMPTS_FOR_ANALYSIS}
      )
      SELECT
        item_id,
        item_text,
        language,
        cefr_level,
        COALESCE(accuracy, 0) as accuracy,
        total_attempts,
        recent_attempts,
        recent_failures,
        last_reviewed,
        ease_factor
      FROM vocab_performance
      WHERE COALESCE(accuracy, 0) < ${this.WEAKNESS_ACCURACY_THRESHOLD}
         OR ease_factor < 2.0
         OR recent_failures >= 3
      ORDER BY accuracy ASC, recent_failures DESC
    `;

    const params = [userId];
    if (language) params.push(language);
    if (cefrLevel) params.push(cefrLevel);

    const result = await client.query(query, params);

    return result.rows.map(row => {
      const accuracy = parseFloat(row.accuracy);
      const recencyWeight = this.calculateRecencyWeight(new Date(row.last_reviewed));
      const frequencyWeight = Math.min(parseInt(row.total_attempts) / 50, 1.0);

      const severityScore = (1 - accuracy) * 0.5 + recencyWeight * 0.3 + frequencyWeight * 0.2;

      return {
        itemId: row.item_id,
        itemType: 'vocabulary',
        itemText: row.item_text,
        language: row.language,
        cefrLevel: row.cefr_level,
        accuracy: Math.round(accuracy * 1000) / 10, // Convert to percentage
        totalAttempts: parseInt(row.total_attempts),
        recentAttempts: parseInt(row.recent_attempts),
        failureCount: parseInt(row.recent_failures),
        lastAttemptDate: new Date(row.last_reviewed),
        severityScore: Math.round(severityScore * 1000) / 10,
        improvementPotential: this.calculateImprovementPotential(accuracy, parseInt(row.total_attempts))
      };
    });
  }

  /**
   * Get grammar weaknesses based on mastery scores
   */
  private async getGrammarWeaknesses(
    client: PoolClient,
    userId: string,
    language?: string,
    cefrLevel?: string
  ): Promise<WeaknessItem[]> {
    const query = `
      WITH grammar_performance AS (
        SELECT
          gp.grammar_id as item_id,
          gr.title as item_text,
          gr.language,
          gr.cefr_level,
          gr.category,
          gp.mastery_level,
          gp.practice_count,
          gp.last_practiced,
          COUNT(pe.id) FILTER (WHERE pe.created_at >= NOW() - INTERVAL '${this.ANALYSIS_WINDOW_DAYS} days') as recent_attempts,
          COUNT(pe.id) FILTER (WHERE pe.is_correct = false AND pe.created_at >= NOW() - INTERVAL '${this.ANALYSIS_WINDOW_DAYS} days') as recent_failures,
          AVG(CASE WHEN pe.is_correct = true THEN 1.0 ELSE 0.0 END) as accuracy
        FROM grammar_progress gp
        JOIN approved_grammar_rules gr ON gr.id::text = gp.grammar_id
        LEFT JOIN practice_exercises pe ON pe.item_id = gp.grammar_id AND pe.user_id = gp.user_id AND pe.item_type = 'grammar'
        WHERE gp.user_id = $1
          ${language ? 'AND gr.language = $2' : ''}
          ${cefrLevel ? 'AND gr.cefr_level = $3' : ''}
        GROUP BY gp.grammar_id, gr.title, gr.language, gr.cefr_level, gr.category, gp.mastery_level, gp.practice_count, gp.last_practiced
        HAVING COUNT(pe.id) >= ${this.MIN_ATTEMPTS_FOR_ANALYSIS}
      )
      SELECT
        item_id,
        item_text,
        language,
        cefr_level,
        category,
        COALESCE(accuracy, 0) as accuracy,
        practice_count as total_attempts,
        recent_attempts,
        recent_failures,
        last_practiced,
        mastery_level
      FROM grammar_performance
      WHERE mastery_level < 70
         OR COALESCE(accuracy, 0) < ${this.WEAKNESS_ACCURACY_THRESHOLD}
         OR recent_failures >= 3
      ORDER BY accuracy ASC, mastery_level ASC
    `;

    const params = [userId];
    if (language) params.push(language);
    if (cefrLevel) params.push(cefrLevel);

    const result = await client.query(query, params);

    return result.rows.map(row => {
      const accuracy = parseFloat(row.accuracy);
      const recencyWeight = this.calculateRecencyWeight(new Date(row.last_practiced));
      const frequencyWeight = Math.min(parseInt(row.total_attempts) / 30, 1.0);

      const severityScore = (1 - accuracy) * 0.5 + recencyWeight * 0.3 + frequencyWeight * 0.2;

      return {
        itemId: row.item_id,
        itemType: 'grammar',
        itemText: row.item_text,
        language: row.language,
        cefrLevel: row.cefr_level,
        category: row.category,
        accuracy: Math.round(accuracy * 1000) / 10,
        totalAttempts: parseInt(row.total_attempts),
        recentAttempts: parseInt(row.recent_attempts),
        failureCount: parseInt(row.recent_failures),
        lastAttemptDate: new Date(row.last_practiced),
        severityScore: Math.round(severityScore * 1000) / 10,
        improvementPotential: this.calculateImprovementPotential(accuracy, parseInt(row.total_attempts))
      };
    });
  }

  /**
   * Get syntax weaknesses (placeholder - depends on syntax tracking implementation)
   */
  private async getSyntaxWeaknesses(
    client: PoolClient,
    userId: string,
    language?: string,
    cefrLevel?: string
  ): Promise<WeaknessItem[]> {
    // Syntax tracking not yet implemented
    // Would query syntax_progress table similar to grammar_progress
    return [];
  }

  /**
   * Calculate recency weight (more recent = higher weight)
   * Returns value between 0 and 1
   */
  private calculateRecencyWeight(lastAttemptDate: Date): number {
    const daysSinceAttempt = Math.floor(
      (Date.now() - lastAttemptDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceAttempt <= 1) return 1.0;
    if (daysSinceAttempt <= 3) return 0.8;
    if (daysSinceAttempt <= 7) return 0.6;
    if (daysSinceAttempt <= 14) return 0.4;
    if (daysSinceAttempt <= 30) return 0.2;
    return 0.1;
  }

  /**
   * Calculate improvement potential (lower accuracy + more attempts = higher potential)
   */
  private calculateImprovementPotential(accuracy: number, totalAttempts: number): number {
    const accuracyGap = 1.0 - accuracy;
    const attemptFactor = Math.min(totalAttempts / 20, 1.0);
    return Math.round((accuracyGap * 0.7 + attemptFactor * 0.3) * 100);
  }

  /**
   * Generate practice recommendations for identified weaknesses
   */
  async getWeaknessRecommendations(
    userId: string,
    language?: string,
    limit: number = 10
  ): Promise<WeaknessRecommendation[]> {
    const analysis = await this.analyzeWeaknesses(userId, language);

    const recommendations: WeaknessRecommendation[] = [];

    for (const weakness of analysis.topWeaknesses.slice(0, limit)) {
      let practiceType: 'recall' | 'recognition' | 'production' | 'mixed';
      let estimatedTime: number;
      let priority: 'critical' | 'high' | 'medium' | 'low';

      // Determine practice type based on accuracy level
      if (weakness.accuracy < 40) {
        practiceType = 'recognition'; // Easiest for very weak areas
        estimatedTime = 15;
      } else if (weakness.accuracy < 60) {
        practiceType = 'mixed';
        estimatedTime = 10;
      } else {
        practiceType = 'recall'; // Harder practice for near-threshold items
        estimatedTime = 5;
      }

      // Determine priority
      if (weakness.severityScore >= 80) priority = 'critical';
      else if (weakness.severityScore >= 60) priority = 'high';
      else if (weakness.severityScore >= 40) priority = 'medium';
      else priority = 'low';

      recommendations.push({
        itemId: weakness.itemId,
        itemType: weakness.itemType,
        itemText: weakness.itemText,
        reason: this.generateRecommendationReason(weakness),
        practiceType,
        estimatedPracticeTime: estimatedTime,
        priority
      });
    }

    return recommendations;
  }

  /**
   * Generate human-readable reason for recommendation
   */
  private generateRecommendationReason(weakness: WeaknessItem): string {
    if (weakness.accuracy < 50) {
      return `Low accuracy (${weakness.accuracy.toFixed(1)}%) - needs fundamental review`;
    } else if (weakness.failureCount >= 5) {
      return `${weakness.failureCount} recent failures - persistent difficulty`;
    } else if (weakness.recentAttempts > 10 && weakness.accuracy < 70) {
      return `Practiced frequently but accuracy still low - needs different approach`;
    } else {
      return `Below target accuracy (${weakness.accuracy.toFixed(1)}%) - needs reinforcement`;
    }
  }

  /**
   * Track improvement for previously identified weaknesses
   */
  async trackImprovements(
    userId: string,
    language?: string,
    daysSince: number = 14
  ): Promise<ImprovementTracking[]> {
    const client = await this.pool.connect();

    try {
      // Get current weaknesses
      const currentAnalysis = await this.analyzeWeaknesses(userId, language);
      const currentWeaknesses = new Map(
        currentAnalysis.topWeaknesses.map(w => [w.itemId, w])
      );

      // Get historical performance from N days ago
      const historicalQuery = `
        WITH historical_performance AS (
          SELECT
            si.item_id,
            si.item_type,
            AVG(CASE WHEN sr.quality >= 3 THEN 1.0 ELSE 0.0 END) as accuracy,
            COUNT(sr.id) as attempts
          FROM srs_items si
          LEFT JOIN srs_reviews sr ON sr.item_id = si.item_id AND sr.user_id = si.user_id
          WHERE si.user_id = $1
            AND sr.created_at BETWEEN NOW() - INTERVAL '${daysSince + 30} days' AND NOW() - INTERVAL '${daysSince} days'
          GROUP BY si.item_id, si.item_type
          HAVING COUNT(sr.id) >= 3
        )
        SELECT * FROM historical_performance
      `;

      const historicalResult = await client.query(historicalQuery, [userId]);
      const historicalPerformance = new Map(
        historicalResult.rows.map(row => [
          row.item_id,
          { accuracy: parseFloat(row.accuracy), attempts: parseInt(row.attempts) }
        ])
      );

      const improvements: ImprovementTracking[] = [];

      // Compare historical vs current
      for (const [itemId, current] of currentWeaknesses.entries()) {
        const historical = historicalPerformance.get(itemId);

        if (historical) {
          const beforeAccuracy = historical.accuracy * 100;
          const afterAccuracy = current.accuracy;
          const improvementPct = ((afterAccuracy - beforeAccuracy) / beforeAccuracy) * 100;

          let status: 'improving' | 'stagnant' | 'regressing';
          if (improvementPct > 10) status = 'improving';
          else if (improvementPct < -10) status = 'regressing';
          else status = 'stagnant';

          improvements.push({
            itemId: current.itemId,
            itemType: current.itemType,
            itemText: current.itemText,
            beforeAccuracy: Math.round(beforeAccuracy * 10) / 10,
            afterAccuracy: Math.round(afterAccuracy * 10) / 10,
            improvementPercentage: Math.round(improvementPct * 10) / 10,
            practiceSessionsCompleted: current.recentAttempts,
            status
          });
        }
      }

      return improvements.sort((a, b) => b.improvementPercentage - a.improvementPercentage);

    } finally {
      client.release();
    }
  }
}
```

---

### Task 2: Create Weakness Identification API Endpoints

**File**: `packages/api/src/routes/analytics/weakness.routes.ts`

Create REST API endpoints for weakness analysis and recommendations.

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { WeaknessIdentificationService } from '../../services/analytics/weakness-identification.service.ts';
import { Pool } from 'pg';

// Request schemas
const weaknessQuerySchema = z.object({
  language: z.string().min(2).max(20).optional(),
  cefrLevel: z.enum(['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional()
});

const recommendationsQuerySchema = z.object({
  language: z.string().min(2).max(20).optional(),
  limit: z.coerce.number().int().positive().max(50).optional().default(10)
});

const improvementQuerySchema = z.object({
  language: z.string().min(2).max(20).optional(),
  daysSince: z.coerce.number().int().positive().max(90).optional().default(14)
});

export async function weaknessRoutes(fastify: FastifyInstance) {
  const pool: Pool = fastify.db;
  const weaknessService = new WeaknessIdentificationService(pool);

  /**
   * GET /api/weakness/analysis?language=es&cefrLevel=B1
   *
   * Analyze user weaknesses with optional filters
   *
   * Response:
   * {
   *   userId: string,
   *   language?: string,
   *   totalWeaknesses: number,
   *   weaknessesByType: { vocabulary: number, grammar: number, syntax: number, orthography: number },
   *   weaknessesByCEFR: Record<string, number>,
   *   topWeaknesses: Array<WeaknessItem>,
   *   analyzedAt: Date
   * }
   */
  fastify.get(
    '/analysis',
    {
      schema: {
        querystring: weaknessQuerySchema,
        response: {
          200: z.object({
            userId: z.string().uuid(),
            language: z.string().optional(),
            totalWeaknesses: z.number(),
            weaknessesByType: z.object({
              vocabulary: z.number(),
              grammar: z.number(),
              syntax: z.number(),
              orthography: z.number()
            }),
            weaknessesByCEFR: z.record(z.number()),
            topWeaknesses: z.array(z.object({
              itemId: z.string(),
              itemType: z.string(),
              itemText: z.string(),
              language: z.string(),
              cefrLevel: z.string(),
              category: z.string().optional(),
              accuracy: z.number(),
              totalAttempts: z.number(),
              recentAttempts: z.number(),
              failureCount: z.number(),
              lastAttemptDate: z.date(),
              severityScore: z.number(),
              improvementPotential: z.number()
            })),
            analyzedAt: z.date()
          })
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { language, cefrLevel } = weaknessQuerySchema.parse(request.query);
        const userId = request.user.id;

        const analysis = await weaknessService.analyzeWeaknesses(
          userId,
          language,
          cefrLevel
        );

        return reply.code(200).send(analysis);

      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'Failed to analyze weaknesses',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * GET /api/weakness/recommendations?language=es&limit=10
   *
   * Get practice recommendations for identified weaknesses
   *
   * Response:
   * {
   *   recommendations: Array<{
   *     itemId: string,
   *     itemType: string,
   *     itemText: string,
   *     reason: string,
   *     practiceType: 'recall' | 'recognition' | 'production' | 'mixed',
   *     estimatedPracticeTime: number,
   *     priority: 'critical' | 'high' | 'medium' | 'low'
   *   }>
   * }
   */
  fastify.get(
    '/recommendations',
    {
      schema: {
        querystring: recommendationsQuerySchema,
        response: {
          200: z.object({
            recommendations: z.array(z.object({
              itemId: z.string(),
              itemType: z.string(),
              itemText: z.string(),
              reason: z.string(),
              practiceType: z.enum(['recall', 'recognition', 'production', 'mixed']),
              estimatedPracticeTime: z.number(),
              priority: z.enum(['critical', 'high', 'medium', 'low'])
            }))
          })
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { language, limit } = recommendationsQuerySchema.parse(request.query);
        const userId = request.user.id;

        const recommendations = await weaknessService.getWeaknessRecommendations(
          userId,
          language,
          limit
        );

        return reply.code(200).send({ recommendations });

      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'Failed to get recommendations',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * GET /api/weakness/improvements?language=es&daysSince=14
   *
   * Track improvement for previously identified weaknesses
   *
   * Response:
   * {
   *   improvements: Array<{
   *     itemId: string,
   *     itemType: string,
   *     itemText: string,
   *     beforeAccuracy: number,
   *     afterAccuracy: number,
   *     improvementPercentage: number,
   *     practiceSessionsCompleted: number,
   *     status: 'improving' | 'stagnant' | 'regressing'
   *   }>
   * }
   */
  fastify.get(
    '/improvements',
    {
      schema: {
        querystring: improvementQuerySchema,
        response: {
          200: z.object({
            improvements: z.array(z.object({
              itemId: z.string(),
              itemType: z.string(),
              itemText: z.string(),
              beforeAccuracy: z.number(),
              afterAccuracy: z.number(),
              improvementPercentage: z.number(),
              practiceSessionsCompleted: z.number(),
              status: z.enum(['improving', 'stagnant', 'regressing'])
            }))
          })
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { language, daysSince } = improvementQuerySchema.parse(request.query);
        const userId = request.user.id;

        const improvements = await weaknessService.trackImprovements(
          userId,
          language,
          daysSince
        );

        return reply.code(200).send({ improvements });

      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'Failed to track improvements',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );
}
```

---

### Task 3: Create Weakness Dashboard Component

**File**: `packages/web/src/pages/WeaknessDashboard.tsx`

Create a React dashboard to display identified weaknesses with severity heatmap and practice recommendations.

```typescript
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';

interface WeaknessItem {
  itemId: string;
  itemType: string;
  itemText: string;
  language: string;
  cefrLevel: string;
  category?: string;
  accuracy: number;
  totalAttempts: number;
  recentAttempts: number;
  failureCount: number;
  lastAttemptDate: Date;
  severityScore: number;
  improvementPotential: number;
}

interface WeaknessAnalysis {
  userId: string;
  language?: string;
  totalWeaknesses: number;
  weaknessesByType: {
    vocabulary: number;
    grammar: number;
    syntax: number;
    orthography: number;
  };
  weaknessesByCEFR: Record<string, number>;
  topWeaknesses: WeaknessItem[];
  analyzedAt: Date;
}

interface WeaknessRecommendation {
  itemId: string;
  itemType: string;
  itemText: string;
  reason: string;
  practiceType: 'recall' | 'recognition' | 'production' | 'mixed';
  estimatedPracticeTime: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

interface ImprovementTracking {
  itemId: string;
  itemType: string;
  itemText: string;
  beforeAccuracy: number;
  afterAccuracy: number;
  improvementPercentage: number;
  practiceSessionsCompleted: number;
  status: 'improving' | 'stagnant' | 'regressing';
}

const SEVERITY_COLORS = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#fbbf24',
  low: '#a3a3a3'
};

export const WeaknessDashboard: React.FC = () => {
  const [selectedLanguage, setSelectedLanguage] = useState<string | undefined>(undefined);
  const [selectedCEFR, setSelectedCEFR] = useState<string | undefined>(undefined);

  // Fetch weakness analysis
  const { data: analysis, isLoading } = useQuery<WeaknessAnalysis>({
    queryKey: ['weakness-analysis', selectedLanguage, selectedCEFR],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedLanguage) params.set('language', selectedLanguage);
      if (selectedCEFR) params.set('cefrLevel', selectedCEFR);

      const response = await fetch(`/api/weakness/analysis?${params}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch weakness analysis');
      return response.json();
    }
  });

  // Fetch recommendations
  const { data: recommendationsData } = useQuery<{ recommendations: WeaknessRecommendation[] }>({
    queryKey: ['weakness-recommendations', selectedLanguage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedLanguage) params.set('language', selectedLanguage);
      params.set('limit', '10');

      const response = await fetch(`/api/weakness/recommendations?${params}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch recommendations');
      return response.json();
    }
  });

  // Fetch improvements
  const { data: improvementsData } = useQuery<{ improvements: ImprovementTracking[] }>({
    queryKey: ['weakness-improvements', selectedLanguage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedLanguage) params.set('language', selectedLanguage);

      const response = await fetch(`/api/weakness/improvements?${params}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch improvements');
      return response.json();
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Analyzing weaknesses...</div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">No weakness data available</div>
      </div>
    );
  }

  // Prepare chart data
  const typeChartData = Object.entries(analysis.weaknessesByType).map(([type, count]) => ({
    name: type.charAt(0).toUpperCase() + type.slice(1),
    value: count
  }));

  const cefrChartData = Object.entries(analysis.weaknessesByCEFR).map(([level, count]) => ({
    level,
    count
  }));

  const getPriorityColor = (priority: string) => {
    return SEVERITY_COLORS[priority as keyof typeof SEVERITY_COLORS] || SEVERITY_COLORS.low;
  };

  const getPriorityBadge = (priority: string) => {
    const colors = {
      critical: 'bg-red-100 text-red-800',
      high: 'bg-orange-100 text-orange-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-gray-100 text-gray-800'
    };
    return colors[priority as keyof typeof colors] || colors.low;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'improving': return 'text-green-600';
      case 'regressing': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'improving': return '↑';
      case 'regressing': return '↓';
      default: return '→';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Weakness Identification</h1>
            <p className="mt-1 text-sm text-gray-600">
              Identify and improve your weak areas
            </p>
          </div>

          {/* Filters */}
          <div className="flex gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Language
              </label>
              <select
                value={selectedLanguage || ''}
                onChange={(e) => setSelectedLanguage(e.target.value || undefined)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Languages</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CEFR Level
              </label>
              <select
                value={selectedCEFR || ''}
                onChange={(e) => setSelectedCEFR(e.target.value || undefined)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Levels</option>
                <option value="A1">A1</option>
                <option value="A2">A2</option>
                <option value="B1">B1</option>
                <option value="B2">B2</option>
                <option value="C1">C1</option>
                <option value="C2">C2</option>
              </select>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Total Weaknesses</div>
            <div className="mt-2 text-4xl font-bold text-red-600">
              {analysis.totalWeaknesses}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Vocabulary Issues</div>
            <div className="mt-2 text-4xl font-bold text-blue-600">
              {analysis.weaknessesByType.vocabulary}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Grammar Issues</div>
            <div className="mt-2 text-4xl font-bold text-purple-600">
              {analysis.weaknessesByType.grammar}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Last Analyzed</div>
            <div className="mt-2 text-lg font-semibold text-gray-900">
              {new Date(analysis.analyzedAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Weaknesses by Type */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Weaknesses by Type</h2>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={typeChartData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={80}
                  label
                >
                  {typeChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981'][index]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Weaknesses by CEFR Level */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Weaknesses by CEFR Level</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={cefrChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="level" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Weaknesses Table */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Top 20 Weaknesses</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">CEFR</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Accuracy</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attempts</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Failures</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Severity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Potential</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {analysis.topWeaknesses.slice(0, 20).map((weakness, idx) => (
                  <tr key={weakness.itemId} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {weakness.itemText}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {weakness.itemType}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {weakness.cefrLevel}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`font-semibold ${weakness.accuracy < 50 ? 'text-red-600' : 'text-orange-600'}`}>
                        {weakness.accuracy.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {weakness.totalAttempts}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="text-red-600 font-semibold">
                        {weakness.failureCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${weakness.severityScore}%`,
                            backgroundColor: weakness.severityScore >= 80 ? '#ef4444' : weakness.severityScore >= 60 ? '#f97316' : '#fbbf24'
                          }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{weakness.severityScore.toFixed(0)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {weakness.improvementPotential}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Practice Recommendations */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Practice Recommendations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recommendationsData?.recommendations.map((rec, idx) => (
              <div
                key={rec.itemId}
                className="border-2 rounded-lg p-4 hover:shadow-md transition-shadow"
                style={{ borderColor: getPriorityColor(rec.priority) }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="font-semibold text-gray-900">{rec.itemText}</div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityBadge(rec.priority)}`}>
                    {rec.priority}
                  </span>
                </div>

                <div className="text-sm text-gray-600 mb-3">{rec.reason}</div>

                <div className="flex items-center justify-between text-sm">
                  <div className="text-gray-700">
                    <span className="font-medium">Practice type:</span> {rec.practiceType}
                  </div>
                  <div className="text-gray-500">
                    ~{rec.estimatedPracticeTime} min
                  </div>
                </div>

                <button className="mt-3 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  Start Practice
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Improvement Tracking */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Improvement Tracking (Last 14 Days)</h2>
          <div className="space-y-3">
            {improvementsData?.improvements.slice(0, 10).map((improvement) => (
              <div key={improvement.itemId} className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-gray-900">{improvement.itemText}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      {improvement.practiceSessionsCompleted} practice sessions completed
                    </div>
                  </div>

                  <div className="text-right">
                    <div className={`text-2xl font-bold ${getStatusColor(improvement.status)}`}>
                      {getStatusIcon(improvement.status)} {improvement.improvementPercentage > 0 ? '+' : ''}
                      {improvement.improvementPercentage.toFixed(1)}%
                    </div>
                    <div className="text-sm text-gray-500">
                      {improvement.beforeAccuracy.toFixed(1)}% → {improvement.afterAccuracy.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {(!improvementsData?.improvements || improvementsData.improvements.length === 0) && (
              <div className="text-center text-gray-500 py-8">
                No improvement data available yet. Keep practicing!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
```

---

## Open Questions

### 1. Weakness Threshold Calibration

**Question**: What should be the accuracy threshold for identifying a concept as a "weakness"?

**Current Approach**: 70% accuracy threshold, requiring minimum 5 attempts for reliable data

**Alternatives**:
1. **Adaptive Thresholds**: Different thresholds per CEFR level (80% for A1, 70% for B2, 65% for C2)
2. **Confidence Intervals**: Use statistical confidence intervals instead of fixed threshold
3. **Percentile-Based**: Mark bottom 20% of user's performance as weaknesses (relative, not absolute)
4. **Time-Decay Weighted**: Recent performance weighted higher than old performance

**Recommendation**: Start with fixed 70% threshold. Add time-decay weighting where performance from last 7 days counts 2x more than older data to focus on current struggles rather than past issues.

---

### 2. Practice Recommendation Algorithm

**Question**: How should we prioritize which weaknesses to recommend for practice?

**Current Approach**: Sort by severity score (weighted combination of accuracy, recency, frequency)

**Alternatives**:
1. **Spaced Repetition Integration**: Coordinate with SRS algorithm to avoid conflicting schedules
2. **Skill Tree Dependencies**: Prioritize foundational weaknesses that block higher-level concepts
3. **User Preference**: Let users choose between "hardest first" vs "quick wins first"
4. **Session Length Optimization**: Build practice sessions of optimal length (15-20 min) by combining multiple weaknesses

**Recommendation**: Implement severity-based ranking with user-selectable sorting (hardest first / easiest first / balanced mix). Add session builder that creates 15-minute focused practice sessions targeting 3-5 related weaknesses.

---

### 3. Improvement Tracking Methodology

**Question**: How should we measure and display improvement for identified weaknesses?

**Current Approach**: Compare accuracy from 14 days ago vs current, mark as improving/stagnant/regressing based on ±10% change

**Alternatives**:
1. **Continuous Tracking**: Show full improvement curve over time (line chart)
2. **Milestone-Based**: Define clear milestones (50% → 60% → 70% → mastered) and celebrate transitions
3. **Effort-Adjusted**: Factor in practice time - 5% improvement with 20 sessions is different from 5% with 2 sessions
4. **Peer Comparison**: Show how user's improvement compares to other learners with similar weaknesses

**Recommendation**: Use milestone-based tracking with visual progress bars showing "50% → 70% mastery". Add "effort score" showing practice sessions needed per 10% improvement. Avoid peer comparison to prevent discouragement.

---
