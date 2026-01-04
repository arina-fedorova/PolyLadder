# F050: Interference Detection & Remediation

**Feature Code**: F050
**Created**: 2025-12-17
**Phase**: 14 - Parallel Learning Support
**Status**: Implemented

---

## Description

Detect when users confuse similar words/grammar across languages and provide targeted remediation exercises.

## Success Criteria

- [x] Track error patterns (e.g., using Spanish word in Italian)
- [x] Detect interference based on answer analysis
- [x] Generate remediation exercises for confused pairs
- [x] Show warning when interference detected
- [x] Track interference reduction over time

---

## Tasks

### Task 1: Interference Detection Service

**File**: `packages/api/src/services/interference/interference-detection.service.ts`

**Description**: Service to detect linguistic interference by analyzing incorrect user answers and comparing them against vocabulary/grammar from other languages the user is studying. Tracks interference patterns and generates remediation exercises.

**Implementation**:

```typescript
import { Pool } from 'pg';
import { SRSService } from '../srs/srs.service.ts';

interface InterferencePattern {
  id: string;
  userId: string;
  targetLanguage: string; // Language user was practicing
  sourceLanguage: string; // Language the interference came from
  targetItemId: string; // Correct item ID
  targetText: string; // Correct text
  interferingItemId: string; // Interfering item from another language
  interferingText: string; // Text user incorrectly used
  interferenceType: 'vocabulary' | 'grammar' | 'syntax';
  confidenceScore: number; // 0-1, how confident we are this is interference
  occurrenceCount: number; // How many times this confusion occurred
  lastOccurrence: Date;
  remediationCompleted: boolean;
  createdAt: Date;
}

interface InterferenceDetectionResult {
  isInterference: boolean;
  confidenceScore: number;
  pattern: InterferencePattern | null;
  explanation: string;
}

interface RemediationExercise {
  id: string;
  patternId: string;
  exerciseType: 'contrast' | 'fill_blank' | 'multiple_choice';
  targetItem: {
    language: string;
    text: string;
    translation: string;
  };
  interferingItem: {
    language: string;
    text: string;
    translation: string;
  };
  prompt: string;
  correctAnswer: string;
  distractors: string[];
}

interface InterferenceSummary {
  totalPatterns: number;
  activePatterns: number;
  remediatedPatterns: number;
  topInterferenceLanguagePairs: Array<{
    targetLanguage: string;
    sourceLanguage: string;
    count: number;
  }>;
  recentPatterns: InterferencePattern[];
}

export class InterferenceDetectionService {
  constructor(
    private pool: Pool,
    private srsService: SRSService
  ) {}

  /**
   * Analyze an incorrect answer to detect potential interference
   * from other languages the user is studying
   */
  async analyzeForInterference(
    userId: string,
    targetLanguage: string,
    correctText: string,
    userAnswer: string,
    itemId: string,
    itemType: 'vocabulary' | 'grammar' | 'syntax'
  ): Promise<InterferenceDetectionResult> {
    // Get all other languages user is studying
    const otherLanguagesResult = await this.pool.query(
      `SELECT language
       FROM user_language_progress
       WHERE user_id = $1
         AND language != $2
         AND is_active = true`,
      [userId, targetLanguage]
    );

    const otherLanguages = otherLanguagesResult.rows.map((r) => r.language);

    if (otherLanguages.length === 0) {
      return {
        isInterference: false,
        confidenceScore: 0,
        pattern: null,
        explanation: 'User is not studying other languages',
      };
    }

    // Check if user's answer matches vocabulary from other languages
    let bestMatch: {
      language: string;
      itemId: string;
      matchedText: string;
      similarity: number;
    } | null = null;

    for (const language of otherLanguages) {
      const match = await this.findSimilarityInLanguage(userId, language, userAnswer, itemType);

      if (match && (!bestMatch || match.similarity > bestMatch.similarity)) {
        bestMatch = { language, ...match };
      }
    }

    // Threshold for considering it interference
    const INTERFERENCE_THRESHOLD = 0.8;

    if (bestMatch && bestMatch.similarity >= INTERFERENCE_THRESHOLD) {
      // Check if we already have this pattern
      const existingPatternResult = await this.pool.query(
        `SELECT * FROM interference_patterns
         WHERE user_id = $1
           AND target_language = $2
           AND source_language = $3
           AND target_item_id = $4
           AND interfering_item_id = $5`,
        [userId, targetLanguage, bestMatch.language, itemId, bestMatch.itemId]
      );

      let pattern: InterferencePattern;

      if (existingPatternResult.rows.length > 0) {
        // Update existing pattern
        const updateResult = await this.pool.query(
          `UPDATE interference_patterns
           SET occurrence_count = occurrence_count + 1,
               last_occurrence = NOW()
           WHERE id = $1
           RETURNING *`,
          [existingPatternResult.rows[0].id]
        );
        pattern = this.mapRowToPattern(updateResult.rows[0]);
      } else {
        // Create new pattern
        const insertResult = await this.pool.query(
          `INSERT INTO interference_patterns (
             user_id, target_language, source_language,
             target_item_id, target_text,
             interfering_item_id, interfering_text,
             interference_type, confidence_score,
             occurrence_count, last_occurrence, remediation_completed
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NOW(), false)
           RETURNING *`,
          [
            userId,
            targetLanguage,
            bestMatch.language,
            itemId,
            correctText,
            bestMatch.itemId,
            bestMatch.matchedText,
            itemType,
            bestMatch.similarity,
          ]
        );
        pattern = this.mapRowToPattern(insertResult.rows[0]);
      }

      return {
        isInterference: true,
        confidenceScore: bestMatch.similarity,
        pattern,
        explanation: this.generateExplanation(
          targetLanguage,
          correctText,
          bestMatch.language,
          bestMatch.matchedText
        ),
      };
    }

    return {
      isInterference: false,
      confidenceScore: bestMatch?.similarity || 0,
      pattern: null,
      explanation: 'No strong interference pattern detected',
    };
  }

  /**
   * Find similar words/phrases in a specific language
   */
  private async findSimilarityInLanguage(
    userId: string,
    language: string,
    userAnswer: string,
    itemType: 'vocabulary' | 'grammar' | 'syntax'
  ): Promise<{ itemId: string; matchedText: string; similarity: number } | null> {
    let query: string;
    let params: any[];

    if (itemType === 'vocabulary') {
      query = `
        SELECT
          u.id as item_id,
          u.text as matched_text,
          similarity(u.text, $3) as similarity_score
        FROM approved_utterances u
        JOIN srs_items si ON si.item_id = u.id::text
        WHERE si.user_id = $1
          AND u.language = $2
          AND u.text % $3  -- PostgreSQL trigram similarity operator
        ORDER BY similarity_score DESC
        LIMIT 1
      `;
      params = [userId, language, userAnswer];
    } else {
      // For grammar, check against example sentences
      query = `
        SELECT
          gr.id as item_id,
          gr.example_sentence as matched_text,
          similarity(gr.example_sentence, $3) as similarity_score
        FROM approved_grammar_rules gr
        JOIN srs_items si ON si.item_id = gr.id::text
        WHERE si.user_id = $1
          AND gr.language = $2
          AND gr.example_sentence % $3
        ORDER BY similarity_score DESC
        LIMIT 1
      `;
      params = [userId, language, userAnswer];
    }

    const result = await this.pool.query(query, params);

    if (result.rows.length === 0) {
      return null;
    }

    return {
      itemId: result.rows[0].item_id,
      matchedText: result.rows[0].matched_text,
      similarity: parseFloat(result.rows[0].similarity_score),
    };
  }

  /**
   * Generate human-readable explanation of interference
   */
  private generateExplanation(
    targetLanguage: string,
    targetText: string,
    sourceLanguage: string,
    interferingText: string
  ): string {
    const languageNames: Record<string, string> = {
      ru: 'Russian',
      zh: 'Chinese',
      ar: 'Arabic',
      es: 'Spanish',
      it: 'Italian',
      fr: 'French',
      de: 'German',
      pt: 'Portuguese',
      ja: 'Japanese',
      ko: 'Korean',
    };

    const targetLangName = languageNames[targetLanguage] || targetLanguage;
    const sourceLangName = languageNames[sourceLanguage] || sourceLanguage;

    return `You used "${interferingText}" from ${sourceLangName}, but the correct ${targetLangName} word is "${targetText}". This is a common interference pattern when studying multiple languages.`;
  }

  /**
   * Get all active interference patterns for a user
   */
  async getUserInterferencePatterns(
    userId: string,
    includeRemediated: boolean = false
  ): Promise<InterferencePattern[]> {
    let query = `
      SELECT * FROM interference_patterns
      WHERE user_id = $1
    `;

    if (!includeRemediated) {
      query += ` AND remediation_completed = false`;
    }

    query += ` ORDER BY occurrence_count DESC, last_occurrence DESC`;

    const result = await this.pool.query(query, [userId]);
    return result.rows.map((row) => this.mapRowToPattern(row));
  }

  /**
   * Generate remediation exercises for an interference pattern
   */
  async generateRemediationExercises(patternId: string): Promise<RemediationExercise[]> {
    // Get pattern details
    const patternResult = await this.pool.query(
      `SELECT * FROM interference_patterns WHERE id = $1`,
      [patternId]
    );

    if (patternResult.rows.length === 0) {
      throw new Error('Pattern not found');
    }

    const pattern = this.mapRowToPattern(patternResult.rows[0]);

    // Fetch full details for target item
    const targetDetails = await this.fetchItemDetails(
      pattern.targetItemId,
      pattern.targetLanguage,
      pattern.interferenceType
    );

    // Fetch full details for interfering item
    const interferingDetails = await this.fetchItemDetails(
      pattern.interferingItemId,
      pattern.sourceLanguage,
      pattern.interferenceType
    );

    const exercises: RemediationExercise[] = [];

    // Exercise 1: Direct Contrast
    exercises.push({
      id: `${patternId}-contrast-1`,
      patternId,
      exerciseType: 'contrast',
      targetItem: {
        language: pattern.targetLanguage,
        text: targetDetails.text,
        translation: targetDetails.translation,
      },
      interferingItem: {
        language: pattern.sourceLanguage,
        text: interferingDetails.text,
        translation: interferingDetails.translation,
      },
      prompt: `Which word means "${targetDetails.translation}" in ${this.getLanguageName(pattern.targetLanguage)}?`,
      correctAnswer: targetDetails.text,
      distractors: [interferingDetails.text],
    });

    // Exercise 2: Fill in the blank (target language)
    exercises.push({
      id: `${patternId}-fill-blank-target`,
      patternId,
      exerciseType: 'fill_blank',
      targetItem: {
        language: pattern.targetLanguage,
        text: targetDetails.text,
        translation: targetDetails.translation,
      },
      interferingItem: {
        language: pattern.sourceLanguage,
        text: interferingDetails.text,
        translation: interferingDetails.translation,
      },
      prompt: `Complete this ${this.getLanguageName(pattern.targetLanguage)} sentence: "${targetDetails.exampleSentence}"`,
      correctAnswer: targetDetails.text,
      distractors: [
        interferingDetails.text,
        ...(await this.getDistractors(pattern.targetLanguage, 2)),
      ],
    });

    // Exercise 3: Fill in the blank (source language)
    exercises.push({
      id: `${patternId}-fill-blank-source`,
      patternId,
      exerciseType: 'fill_blank',
      targetItem: {
        language: pattern.targetLanguage,
        text: targetDetails.text,
        translation: targetDetails.translation,
      },
      interferingItem: {
        language: pattern.sourceLanguage,
        text: interferingDetails.text,
        translation: interferingDetails.translation,
      },
      prompt: `Complete this ${this.getLanguageName(pattern.sourceLanguage)} sentence: "${interferingDetails.exampleSentence}"`,
      correctAnswer: interferingDetails.text,
      distractors: [targetDetails.text, ...(await this.getDistractors(pattern.sourceLanguage, 2))],
    });

    // Exercise 4: Multiple choice - Language identification
    exercises.push({
      id: `${patternId}-identify-lang`,
      patternId,
      exerciseType: 'multiple_choice',
      targetItem: {
        language: pattern.targetLanguage,
        text: targetDetails.text,
        translation: targetDetails.translation,
      },
      interferingItem: {
        language: pattern.sourceLanguage,
        text: interferingDetails.text,
        translation: interferingDetails.translation,
      },
      prompt: `Which language is "${targetDetails.text}" from?`,
      correctAnswer: this.getLanguageName(pattern.targetLanguage),
      distractors: [this.getLanguageName(pattern.sourceLanguage)],
    });

    return exercises;
  }

  /**
   * Mark remediation as completed for a pattern
   */
  async markRemediationCompleted(patternId: string): Promise<void> {
    await this.pool.query(
      `UPDATE interference_patterns
       SET remediation_completed = true
       WHERE id = $1`,
      [patternId]
    );
  }

  /**
   * Get interference summary statistics
   */
  async getInterferenceSummary(userId: string): Promise<InterferenceSummary> {
    // Total patterns
    const totalResult = await this.pool.query(
      `SELECT COUNT(*) as total FROM interference_patterns WHERE user_id = $1`,
      [userId]
    );

    // Active patterns
    const activeResult = await this.pool.query(
      `SELECT COUNT(*) as active
       FROM interference_patterns
       WHERE user_id = $1 AND remediation_completed = false`,
      [userId]
    );

    // Remediated patterns
    const remediatedResult = await this.pool.query(
      `SELECT COUNT(*) as remediated
       FROM interference_patterns
       WHERE user_id = $1 AND remediation_completed = true`,
      [userId]
    );

    // Top interference language pairs
    const topPairsResult = await this.pool.query(
      `SELECT
         target_language,
         source_language,
         COUNT(*) as count
       FROM interference_patterns
       WHERE user_id = $1
       GROUP BY target_language, source_language
       ORDER BY count DESC
       LIMIT 5`,
      [userId]
    );

    // Recent patterns
    const recentResult = await this.pool.query(
      `SELECT * FROM interference_patterns
       WHERE user_id = $1
       ORDER BY last_occurrence DESC
       LIMIT 10`,
      [userId]
    );

    return {
      totalPatterns: parseInt(totalResult.rows[0].total),
      activePatterns: parseInt(activeResult.rows[0].active),
      remediatedPatterns: parseInt(remediatedResult.rows[0].remediated),
      topInterferenceLanguagePairs: topPairsResult.rows.map((r) => ({
        targetLanguage: r.target_language,
        sourceLanguage: r.source_language,
        count: parseInt(r.count),
      })),
      recentPatterns: recentResult.rows.map((r) => this.mapRowToPattern(r)),
    };
  }

  /**
   * Calculate interference reduction rate over time
   */
  async calculateInterferenceReduction(
    userId: string,
    patternId: string,
    periodDays: number = 30
  ): Promise<{ rate: number; trend: 'improving' | 'stable' | 'worsening' }> {
    const result = await this.pool.query(
      `WITH time_periods AS (
         SELECT
           DATE_TRUNC('week', created_at) AS week,
           COUNT(*) as occurrences
         FROM practice_attempts pa
         JOIN interference_patterns ip ON ip.target_item_id = pa.item_id::text
         WHERE ip.id = $1
           AND pa.user_id = $2
           AND pa.created_at >= NOW() - INTERVAL '${periodDays} days'
           AND pa.is_correct = false
         GROUP BY week
         ORDER BY week
       )
       SELECT
         COALESCE(
           REGR_SLOPE(occurrences::numeric, EXTRACT(EPOCH FROM week)::numeric),
           0
         ) as slope
       FROM time_periods`,
      [patternId, userId]
    );

    const slope = parseFloat(result.rows[0]?.slope || '0');

    // Negative slope means fewer occurrences over time (improvement)
    // Positive slope means more occurrences (worsening)
    let trend: 'improving' | 'stable' | 'worsening';
    if (slope < -0.1) {
      trend = 'improving';
    } else if (slope > 0.1) {
      trend = 'worsening';
    } else {
      trend = 'stable';
    }

    // Convert slope to reduction percentage
    const reductionRate = Math.min(100, Math.max(-100, -slope * 100));

    return { rate: reductionRate, trend };
  }

  /**
   * Helper: Fetch item details
   */
  private async fetchItemDetails(
    itemId: string,
    language: string,
    itemType: 'vocabulary' | 'grammar' | 'syntax'
  ): Promise<{ text: string; translation: string; exampleSentence: string }> {
    if (itemType === 'vocabulary') {
      const result = await this.pool.query(
        `SELECT text, translations[1] as translation, context_sentence as example
         FROM approved_utterances
         WHERE id = $1`,
        [itemId]
      );
      return {
        text: result.rows[0].text,
        translation: result.rows[0].translation,
        exampleSentence: result.rows[0].example || '',
      };
    } else {
      const result = await this.pool.query(
        `SELECT title as text, explanation as translation, example_sentence
         FROM approved_grammar_rules
         WHERE id = $1`,
        [itemId]
      );
      return {
        text: result.rows[0].text,
        translation: result.rows[0].translation,
        exampleSentence: result.rows[0].example_sentence || '',
      };
    }
  }

  /**
   * Helper: Get random distractors
   */
  private async getDistractors(language: string, count: number): Promise<string[]> {
    const result = await this.pool.query(
      `SELECT text FROM approved_utterances
       WHERE language = $1
       ORDER BY RANDOM()
       LIMIT $2`,
      [language, count]
    );
    return result.rows.map((r) => r.text);
  }

  /**
   * Helper: Get language name
   */
  private getLanguageName(code: string): string {
    const names: Record<string, string> = {
      ru: 'Russian',
      zh: 'Chinese',
      ar: 'Arabic',
      es: 'Spanish',
      it: 'Italian',
      fr: 'French',
      de: 'German',
      pt: 'Portuguese',
      ja: 'Japanese',
      ko: 'Korean',
    };
    return names[code] || code;
  }

  /**
   * Helper: Map database row to pattern object
   */
  private mapRowToPattern(row: any): InterferencePattern {
    return {
      id: row.id,
      userId: row.user_id,
      targetLanguage: row.target_language,
      sourceLanguage: row.source_language,
      targetItemId: row.target_item_id,
      targetText: row.target_text,
      interferingItemId: row.interfering_item_id,
      interferingText: row.interfering_text,
      interferenceType: row.interference_type,
      confidenceScore: parseFloat(row.confidence_score),
      occurrenceCount: parseInt(row.occurrence_count),
      lastOccurrence: new Date(row.last_occurrence),
      remediationCompleted: row.remediation_completed,
      createdAt: new Date(row.created_at),
    };
  }
}
```

**Database Schema**:

```sql
-- Enable PostgreSQL trigram similarity extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Interference patterns table
CREATE TABLE interference_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Target language (what user was practicing)
  target_language VARCHAR(20) NOT NULL,
  target_item_id VARCHAR(100) NOT NULL,
  target_text TEXT NOT NULL,

  -- Source language (where interference came from)
  source_language VARCHAR(20) NOT NULL,
  interfering_item_id VARCHAR(100) NOT NULL,
  interfering_text TEXT NOT NULL,

  -- Pattern metadata
  interference_type VARCHAR(20) CHECK (interference_type IN ('vocabulary', 'grammar', 'syntax')),
  confidence_score FLOAT NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  occurrence_count INT NOT NULL DEFAULT 1,
  last_occurrence TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Remediation
  remediation_completed BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, target_language, source_language, target_item_id, interfering_item_id)
);

-- Indexes for performance
CREATE INDEX idx_interference_patterns_user_target ON interference_patterns(user_id, target_language);
CREATE INDEX idx_interference_patterns_active ON interference_patterns(user_id, remediation_completed);
CREATE INDEX idx_interference_patterns_occurrence ON interference_patterns(user_id, occurrence_count DESC);

-- Remediation exercises table
CREATE TABLE remediation_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID NOT NULL REFERENCES interference_patterns(id) ON DELETE CASCADE,
  exercise_type VARCHAR(20) CHECK (exercise_type IN ('contrast', 'fill_blank', 'multiple_choice')),
  prompt TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  distractors JSONB NOT NULL, -- Array of incorrect options
  metadata JSONB, -- Additional exercise data
  created_at TIMESTAMP DEFAULT NOW()
);

-- Remediation attempts table
CREATE TABLE remediation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES remediation_exercises(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  time_spent INT NOT NULL, -- seconds
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_remediation_attempts_user ON remediation_attempts(user_id, created_at DESC);
CREATE INDEX idx_remediation_attempts_exercise ON remediation_attempts(exercise_id);
```

**Key Features**:

1. **Interference Detection**: Compares incorrect answers against vocabulary from other studied languages using PostgreSQL trigram similarity
2. **Pattern Tracking**: Records and updates interference patterns with occurrence counts
3. **Remediation Generation**: Creates 4 types of exercises (contrast, fill-blank target/source, language identification)
4. **Confidence Scoring**: Uses similarity scores to determine interference confidence
5. **Trend Analysis**: Calculates interference reduction rate using linear regression

---

### Task 2: Interference Detection API Endpoints

**File**: `packages/api/src/routes/interference/interference.routes.ts`

**Description**: RESTful API endpoints for interference detection, pattern retrieval, remediation exercise generation, and progress tracking.

**Implementation**:

```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { InterferenceDetectionService } from '../../services/interference/interference-detection.service.ts';

// Request/Response Schemas
const AnalyzeInterferenceSchema = z.object({
  targetLanguage: z.string().min(2).max(20),
  correctText: z.string().min(1),
  userAnswer: z.string().min(1),
  itemId: z.string().uuid(),
  itemType: z.enum(['vocabulary', 'grammar', 'syntax']),
});

const GetPatternsQuerySchema = z.object({
  includeRemediated: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
});

const GenerateRemediationSchema = z.object({
  patternId: z.string().uuid(),
});

const SubmitRemediationAttemptSchema = z.object({
  exerciseId: z.string().uuid(),
  userAnswer: z.string().min(1),
  timeSpent: z.number().int().min(0),
});

const GetReductionQuerySchema = z.object({
  patternId: z.string().uuid(),
  periodDays: z
    .string()
    .transform((val) => parseInt(val, 10))
    .optional(),
});

export async function interferenceRoutes(fastify: FastifyInstance) {
  const interferenceService = new InterferenceDetectionService(fastify.pg.pool, fastify.srsService);

  /**
   * POST /interference/analyze
   * Analyze an incorrect answer for potential interference
   */
  fastify.post(
    '/interference/analyze',
    {
      schema: {
        body: AnalyzeInterferenceSchema,
        response: {
          200: z.object({
            isInterference: z.boolean(),
            confidenceScore: z.number(),
            pattern: z
              .object({
                id: z.string(),
                targetLanguage: z.string(),
                sourceLanguage: z.string(),
                targetText: z.string(),
                interferingText: z.string(),
                occurrenceCount: z.number(),
              })
              .nullable(),
            explanation: z.string(),
          }),
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.id;
      const { targetLanguage, correctText, userAnswer, itemId, itemType } = request.body;

      try {
        const result = await interferenceService.analyzeForInterference(
          userId,
          targetLanguage,
          correctText,
          userAnswer,
          itemId,
          itemType
        );

        return reply.status(200).send({
          isInterference: result.isInterference,
          confidenceScore: result.confidenceScore,
          pattern: result.pattern
            ? {
                id: result.pattern.id,
                targetLanguage: result.pattern.targetLanguage,
                sourceLanguage: result.pattern.sourceLanguage,
                targetText: result.pattern.targetText,
                interferingText: result.pattern.interferingText,
                occurrenceCount: result.pattern.occurrenceCount,
              }
            : null,
          explanation: result.explanation,
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to analyze interference',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /interference/patterns
   * Get all interference patterns for the current user
   */
  fastify.get(
    '/interference/patterns',
    {
      schema: {
        querystring: GetPatternsQuerySchema,
        response: {
          200: z.object({
            patterns: z.array(
              z.object({
                id: z.string(),
                targetLanguage: z.string(),
                sourceLanguage: z.string(),
                targetText: z.string(),
                interferingText: z.string(),
                interferenceType: z.enum(['vocabulary', 'grammar', 'syntax']),
                confidenceScore: z.number(),
                occurrenceCount: z.number(),
                lastOccurrence: z.string(),
                remediationCompleted: z.boolean(),
              })
            ),
          }),
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.id;
      const { includeRemediated } = request.query;

      try {
        const patterns = await interferenceService.getUserInterferencePatterns(
          userId,
          includeRemediated || false
        );

        return reply.status(200).send({
          patterns: patterns.map((p) => ({
            id: p.id,
            targetLanguage: p.targetLanguage,
            sourceLanguage: p.sourceLanguage,
            targetText: p.targetText,
            interferingText: p.interferingText,
            interferenceType: p.interferenceType,
            confidenceScore: p.confidenceScore,
            occurrenceCount: p.occurrenceCount,
            lastOccurrence: p.lastOccurrence.toISOString(),
            remediationCompleted: p.remediationCompleted,
          })),
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to fetch patterns',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /interference/remediation/generate
   * Generate remediation exercises for a specific pattern
   */
  fastify.post(
    '/interference/remediation/generate',
    {
      schema: {
        body: GenerateRemediationSchema,
        response: {
          200: z.object({
            exercises: z.array(
              z.object({
                id: z.string(),
                exerciseType: z.enum(['contrast', 'fill_blank', 'multiple_choice']),
                targetItem: z.object({
                  language: z.string(),
                  text: z.string(),
                  translation: z.string(),
                }),
                interferingItem: z.object({
                  language: z.string(),
                  text: z.string(),
                  translation: z.string(),
                }),
                prompt: z.string(),
                correctAnswer: z.string(),
                distractors: z.array(z.string()),
              })
            ),
          }),
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { patternId } = request.body;

      try {
        const exercises = await interferenceService.generateRemediationExercises(patternId);

        return reply.status(200).send({ exercises });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to generate remediation exercises',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /interference/remediation/submit
   * Submit an answer for a remediation exercise
   */
  fastify.post(
    '/interference/remediation/submit',
    {
      schema: {
        body: SubmitRemediationAttemptSchema,
        response: {
          200: z.object({
            isCorrect: z.boolean(),
            correctAnswer: z.string(),
            feedback: z.string(),
          }),
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.id;
      const { exerciseId, userAnswer, timeSpent } = request.body;

      try {
        // Fetch exercise details
        const exerciseResult = await fastify.pg.pool.query(
          `SELECT re.*, ip.target_text, ip.interfering_text, ip.id as pattern_id
         FROM remediation_exercises re
         JOIN interference_patterns ip ON ip.id = re.pattern_id
         WHERE re.id = $1`,
          [exerciseId]
        );

        if (exerciseResult.rows.length === 0) {
          return reply.status(404).send({ error: 'Exercise not found' });
        }

        const exercise = exerciseResult.rows[0];
        const isCorrect =
          userAnswer.trim().toLowerCase() === exercise.correct_answer.trim().toLowerCase();

        // Record attempt
        await fastify.pg.pool.query(
          `INSERT INTO remediation_attempts (exercise_id, user_id, user_answer, is_correct, time_spent)
         VALUES ($1, $2, $3, $4, $5)`,
          [exerciseId, userId, userAnswer, isCorrect, timeSpent]
        );

        // If all exercises for this pattern are completed successfully, mark pattern as remediated
        if (isCorrect) {
          const attemptsResult = await fastify.pg.pool.query(
            `SELECT COUNT(*) as total, SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct
           FROM remediation_attempts ra
           JOIN remediation_exercises re ON re.id = ra.exercise_id
           WHERE ra.user_id = $1 AND re.pattern_id = $2`,
            [userId, exercise.pattern_id]
          );

          const stats = attemptsResult.rows[0];

          // Mark as remediated if user got at least 3 exercises correct
          if (parseInt(stats.correct) >= 3) {
            await interferenceService.markRemediationCompleted(exercise.pattern_id);
          }
        }

        const feedback = isCorrect
          ? `Correct! You're successfully distinguishing between "${exercise.target_text}" and "${exercise.interfering_text}".`
          : `Not quite. The correct answer is "${exercise.correct_answer}". Remember: "${exercise.target_text}" is used in the target language, while "${exercise.interfering_text}" is from the interfering language.`;

        return reply.status(200).send({
          isCorrect,
          correctAnswer: exercise.correct_answer,
          feedback,
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to submit remediation attempt',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /interference/summary
   * Get summary statistics for user's interference patterns
   */
  fastify.get(
    '/interference/summary',
    {
      schema: {
        response: {
          200: z.object({
            totalPatterns: z.number(),
            activePatterns: z.number(),
            remediatedPatterns: z.number(),
            topInterferenceLanguagePairs: z.array(
              z.object({
                targetLanguage: z.string(),
                sourceLanguage: z.string(),
                count: z.number(),
              })
            ),
            recentPatterns: z.array(
              z.object({
                id: z.string(),
                targetLanguage: z.string(),
                sourceLanguage: z.string(),
                targetText: z.string(),
                interferingText: z.string(),
                occurrenceCount: z.number(),
              })
            ),
          }),
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.id;

      try {
        const summary = await interferenceService.getInterferenceSummary(userId);

        return reply.status(200).send({
          totalPatterns: summary.totalPatterns,
          activePatterns: summary.activePatterns,
          remediatedPatterns: summary.remediatedPatterns,
          topInterferenceLanguagePairs: summary.topInterferenceLanguagePairs,
          recentPatterns: summary.recentPatterns.map((p) => ({
            id: p.id,
            targetLanguage: p.targetLanguage,
            sourceLanguage: p.sourceLanguage,
            targetText: p.targetText,
            interferingText: p.interferingText,
            occurrenceCount: p.occurrenceCount,
          })),
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to fetch summary',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /interference/reduction
   * Get interference reduction statistics for a pattern
   */
  fastify.get(
    '/interference/reduction',
    {
      schema: {
        querystring: GetReductionQuerySchema,
        response: {
          200: z.object({
            rate: z.number(),
            trend: z.enum(['improving', 'stable', 'worsening']),
          }),
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.id;
      const { patternId, periodDays } = request.query;

      try {
        const result = await interferenceService.calculateInterferenceReduction(
          userId,
          patternId,
          periodDays || 30
        );

        return reply.status(200).send(result);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to calculate reduction',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
}
```

**API Endpoints Summary**:

| Method | Endpoint                             | Description                               |
| ------ | ------------------------------------ | ----------------------------------------- |
| POST   | `/interference/analyze`              | Analyze incorrect answer for interference |
| GET    | `/interference/patterns`             | Get all user's interference patterns      |
| POST   | `/interference/remediation/generate` | Generate remediation exercises            |
| POST   | `/interference/remediation/submit`   | Submit remediation exercise answer        |
| GET    | `/interference/summary`              | Get summary statistics                    |
| GET    | `/interference/reduction`            | Get reduction rate for pattern            |

**Key Features**:

1. **Automatic Analysis**: Called whenever user submits incorrect answer
2. **Pattern Tracking**: Lists all active/remediated patterns
3. **Exercise Generation**: Creates 4 targeted exercises per pattern
4. **Progress Tracking**: Marks patterns as remediated after 3+ correct exercises
5. **Trend Analysis**: Shows whether interference is reducing over time

---

### Task 3: Interference Alert UI Component

**File**: `packages/web/src/pages/InterferenceDashboard.tsx`

**Description**: React component displaying interference patterns, alerts during practice, and remediation exercises.

**Implementation**:

```typescript
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';

interface InterferencePattern {
  id: string;
  targetLanguage: string;
  sourceLanguage: string;
  targetText: string;
  interferingText: string;
  interferenceType: 'vocabulary' | 'grammar' | 'syntax';
  confidenceScore: number;
  occurrenceCount: number;
  lastOccurrence: string;
  remediationCompleted: boolean;
}

interface RemediationExercise {
  id: string;
  exerciseType: 'contrast' | 'fill_blank' | 'multiple_choice';
  targetItem: {
    language: string;
    text: string;
    translation: string;
  };
  interferingItem: {
    language: string;
    text: string;
    translation: string;
  };
  prompt: string;
  correctAnswer: string;
  distractors: string[];
}

interface InterferenceSummary {
  totalPatterns: number;
  activePatterns: number;
  remediatedPatterns: number;
  topInterferenceLanguagePairs: Array<{
    targetLanguage: string;
    sourceLanguage: string;
    count: number;
  }>;
  recentPatterns: InterferencePattern[];
}

const LANGUAGE_NAMES: Record<string, string> = {
  'ru': 'Russian',
  'zh': 'Chinese',
  'ar': 'Arabic',
  'es': 'Spanish',
  'it': 'Italian',
  'fr': 'French',
  'de': 'German',
  'pt': 'Portuguese',
  'ja': 'Japanese',
  'ko': 'Korean'
};

const LANGUAGE_COLORS: Record<string, string> = {
  'ru': 'bg-red-100 text-red-800 border-red-300',
  'zh': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'ar': 'bg-green-100 text-green-800 border-green-300',
  'es': 'bg-orange-100 text-orange-800 border-orange-300',
  'it': 'bg-blue-100 text-blue-800 border-blue-300',
  'fr': 'bg-purple-100 text-purple-800 border-purple-300',
  'de': 'bg-indigo-100 text-indigo-800 border-indigo-300',
  'pt': 'bg-pink-100 text-pink-800 border-pink-300'
};

export function InterferenceDashboard() {
  const [selectedPattern, setSelectedPattern] = useState<InterferencePattern | null>(null);
  const [showRemediation, setShowRemediation] = useState(false);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');

  // Fetch summary
  const { data: summary, isLoading: summaryLoading } = useQuery<InterferenceSummary>({
    queryKey: ['interference-summary'],
    queryFn: async () => {
      const response = await api.get('/interference/summary');
      return response.data;
    }
  });

  // Fetch all patterns
  const { data: patternsData, refetch: refetchPatterns } = useQuery<{ patterns: InterferencePattern[] }>({
    queryKey: ['interference-patterns'],
    queryFn: async () => {
      const response = await api.get('/interference/patterns');
      return response.data;
    }
  });

  // Generate remediation exercises
  const { data: exercisesData, refetch: refetchExercises } = useQuery<{ exercises: RemediationExercise[] }>({
    queryKey: ['remediation-exercises', selectedPattern?.id],
    queryFn: async () => {
      if (!selectedPattern) return { exercises: [] };
      const response = await api.post('/interference/remediation/generate', {
        patternId: selectedPattern.id
      });
      return response.data;
    },
    enabled: showRemediation && !!selectedPattern
  });

  // Submit remediation answer
  const submitAnswer = useMutation({
    mutationFn: async ({ exerciseId, userAnswer, timeSpent }: {
      exerciseId: string;
      userAnswer: string;
      timeSpent: number;
    }) => {
      const response = await api.post('/interference/remediation/submit', {
        exerciseId,
        userAnswer,
        timeSpent
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.isCorrect) {
        // Move to next exercise
        if (exercisesData && currentExerciseIndex < exercisesData.exercises.length - 1) {
          setCurrentExerciseIndex(currentExerciseIndex + 1);
          setUserAnswer('');
        } else {
          // Completed all exercises
          setShowRemediation(false);
          setSelectedPattern(null);
          setCurrentExerciseIndex(0);
          refetchPatterns();
        }
      }
    }
  });

  const handleStartRemediation = (pattern: InterferencePattern) => {
    setSelectedPattern(pattern);
    setShowRemediation(true);
    setCurrentExerciseIndex(0);
    setUserAnswer('');
  };

  const handleSubmitAnswer = () => {
    if (!exercisesData || !userAnswer.trim()) return;

    const exercise = exercisesData.exercises[currentExerciseIndex];
    submitAnswer.mutate({
      exerciseId: exercise.id,
      userAnswer: userAnswer.trim(),
      timeSpent: 10 // Simplified for now
    });
  };

  if (summaryLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-gray-600">Loading interference data...</div>
      </div>
    );
  }

  if (showRemediation && selectedPattern && exercisesData) {
    const exercise = exercisesData.exercises[currentExerciseIndex];
    const allOptions = [exercise.correctAnswer, ...exercise.distractors].sort(() => Math.random() - 0.5);

    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Remediation Exercise</h1>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>Pattern: {selectedPattern.targetText} ↔ {selectedPattern.interferingText}</span>
              <span>Exercise {currentExerciseIndex + 1} of {exercisesData.exercises.length}</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${((currentExerciseIndex + 1) / exercisesData.exercises.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Exercise */}
          <div className="bg-white rounded-lg shadow p-8">
            {/* Language labels */}
            <div className="flex gap-4 mb-6">
              <span className={`px-4 py-2 rounded-lg font-semibold border-2 ${LANGUAGE_COLORS[exercise.targetItem.language]}`}>
                Target: {LANGUAGE_NAMES[exercise.targetItem.language]}
              </span>
              <span className={`px-4 py-2 rounded-lg font-semibold border-2 ${LANGUAGE_COLORS[exercise.interferingItem.language]}`}>
                Interfering: {LANGUAGE_NAMES[exercise.interferingItem.language]}
              </span>
            </div>

            {/* Prompt */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">{exercise.prompt}</h2>
            </div>

            {/* Answer input */}
            {exercise.exerciseType === 'fill_blank' && (
              <div className="mb-6">
                <input
                  type="text"
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSubmitAnswer()}
                  placeholder="Type your answer..."
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-lg focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>
            )}

            {/* Multiple choice options */}
            {(exercise.exerciseType === 'contrast' || exercise.exerciseType === 'multiple_choice') && (
              <div className="space-y-3 mb-6">
                {allOptions.map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => setUserAnswer(option)}
                    className={`w-full px-6 py-4 rounded-lg border-2 text-left text-lg transition-all ${
                      userAnswer === option
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}

            {/* Submit button */}
            <button
              onClick={handleSubmitAnswer}
              disabled={!userAnswer.trim() || submitAnswer.isPending}
              className="w-full py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {submitAnswer.isPending ? 'Checking...' : 'Submit Answer'}
            </button>

            {/* Feedback */}
            {submitAnswer.data && (
              <div className={`mt-6 p-4 rounded-lg ${
                submitAnswer.data.isCorrect
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}>
                <p className="font-semibold mb-2">
                  {submitAnswer.data.isCorrect ? '✓ Correct!' : '✗ Incorrect'}
                </p>
                <p>{submitAnswer.data.feedback}</p>
              </div>
            )}
          </div>

          {/* Cancel button */}
          <button
            onClick={() => {
              setShowRemediation(false);
              setSelectedPattern(null);
              setCurrentExerciseIndex(0);
            }}
            className="mt-4 text-gray-600 hover:text-gray-800"
          >
            Cancel remediation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Interference Detection</h1>
          <p className="text-gray-600">
            Track and remediate language confusion patterns
          </p>
        </div>

        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-1">Total Patterns</div>
              <div className="text-3xl font-bold text-gray-900">{summary.totalPatterns}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-1">Active Patterns</div>
              <div className="text-3xl font-bold text-orange-600">{summary.activePatterns}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-1">Remediated</div>
              <div className="text-3xl font-bold text-green-600">{summary.remediatedPatterns}</div>
            </div>
          </div>
        )}

        {/* Top Interference Pairs */}
        {summary && summary.topInterferenceLanguagePairs.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Top Interference Pairs</h2>
            <div className="space-y-3">
              {summary.topInterferenceLanguagePairs.map((pair, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded border ${LANGUAGE_COLORS[pair.targetLanguage]}`}>
                      {LANGUAGE_NAMES[pair.targetLanguage]}
                    </span>
                    <span className="text-gray-400">←</span>
                    <span className={`px-3 py-1 rounded border ${LANGUAGE_COLORS[pair.sourceLanguage]}`}>
                      {LANGUAGE_NAMES[pair.sourceLanguage]}
                    </span>
                  </div>
                  <div className="text-lg font-semibold text-gray-700">
                    {pair.count} {pair.count === 1 ? 'pattern' : 'patterns'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Patterns List */}
        {patternsData && patternsData.patterns.length > 0 ? (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Interference Patterns</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {patternsData.patterns.map((pattern) => (
                <div key={pattern.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded border text-sm font-semibold ${LANGUAGE_COLORS[pattern.targetLanguage]}`}>
                        {LANGUAGE_NAMES[pattern.targetLanguage]}
                      </span>
                      <span className="text-gray-400">←</span>
                      <span className={`px-3 py-1 rounded border text-sm font-semibold ${LANGUAGE_COLORS[pattern.sourceLanguage]}`}>
                        {LANGUAGE_NAMES[pattern.sourceLanguage]}
                      </span>
                      {pattern.remediationCompleted && (
                        <span className="px-3 py-1 bg-green-100 text-green-800 rounded text-sm font-medium">
                          ✓ Remediated
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      {pattern.occurrenceCount} {pattern.occurrenceCount === 1 ? 'occurrence' : 'occurrences'}
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="text-lg">
                      <span className="text-gray-600">Confused: </span>
                      <span className="font-semibold text-red-600">{pattern.interferingText}</span>
                      <span className="text-gray-400 mx-2">→</span>
                      <span className="font-semibold text-green-600">{pattern.targetText}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                      Last occurred: {new Date(pattern.lastOccurrence).toLocaleDateString()}
                    </div>
                    {!pattern.remediationCompleted && (
                      <button
                        onClick={() => handleStartRemediation(pattern)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Start Remediation
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Interference Detected</h3>
            <p className="text-gray-600">
              You're doing great! No language confusion patterns detected yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Component Features**:

1. **Summary Dashboard**: Shows total, active, and remediated patterns with statistics
2. **Top Interference Pairs**: Displays most common language confusion pairs
3. **Pattern List**: Shows all detected patterns with occurrence counts
4. **Remediation Flow**: Interactive exercises with progress tracking
5. **Real-time Feedback**: Immediate feedback on exercise answers
6. **Color Coding**: Language-specific colors for easy visual distinction

**Additional Component**: Inline Interference Alert

```typescript
// packages/web/src/components/InterferenceAlert.tsx
import React from 'react';

interface InterferenceAlertProps {
  isInterference: boolean;
  confidenceScore: number;
  explanation: string;
  onStartRemediation: () => void;
}

export function InterferenceAlert({
  isInterference,
  confidenceScore,
  explanation,
  onStartRemediation
}: InterferenceAlertProps) {
  if (!isInterference) return null;

  return (
    <div className="bg-orange-100 border-2 border-orange-400 rounded-lg p-4 my-4">
      <div className="flex items-start gap-3">
        <div className="text-2xl">⚠️</div>
        <div className="flex-1">
          <h4 className="font-semibold text-orange-900 mb-2">
            Interference Detected (Confidence: {Math.round(confidenceScore * 100)}%)
          </h4>
          <p className="text-orange-800 mb-3">{explanation}</p>
          <button
            onClick={onStartRemediation}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
          >
            Practice This Now
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Integration Point**: This alert component should be shown immediately after submitting an incorrect answer during practice sessions when interference is detected.

---

## Open Questions

### 1. **False Positive Handling**

- **Question**: How do we handle false positives where similarity is high but not actual interference (e.g., user simply made a typo)?
- **Options**:
  - Require minimum occurrence count (e.g., 2+) before showing pattern
  - Add user feedback "This is not interference" button to dismiss patterns
  - Use additional heuristics (edit distance, keystroke patterns)
- **Recommendation**: Start with occurrence threshold of 2, add user dismissal in later iteration

### 2. **Remediation Exercise Difficulty**

- **Question**: Should remediation exercises adapt difficulty based on user performance?
- **Options**:
  - Fixed set of 4 exercises per pattern
  - Generate more exercises if user struggles (incorrect answers)
  - Increase distractor similarity for advanced learners
- **Recommendation**: Start with fixed 4 exercises, require 3/4 correct to mark as remediated

### 3. **Proactive Interference Warnings**

- **Question**: Should we show warnings BEFORE user makes an interference error (e.g., "Watch out: Spanish 'embarazada' looks like English 'embarrassed' but means 'pregnant'")?
- **Options**:
  - Passive: Only detect after errors occur
  - Proactive: Show warnings during practice for known difficult pairs
  - Predictive: Analyze user's language combinations and pre-warn about common false friends
- **Recommendation**: Start passive, add proactive warnings in phase 2 based on common interference patterns

---

## Dependencies

- **Blocks**: None
- **Depends on**: F001 (SRS System), F046 (Language Progress Tracking)

---

## Notes

- Interference detected by analyzing incorrect answers using Levenshtein distance similarity
- False friends and cognates are the most common source of interference
- Uses JavaScript Levenshtein algorithm for portability (no PostgreSQL extension required)
- Remediation exercises automatically mark patterns as resolved after 3+ correct answers
- System tracks interference reduction over time based on occurrence count changes

## Implementation Summary

**Backend**:

- Migration: `packages/db/src/migrations/043_create_interference_detection.ts`
- Service: `packages/api/src/services/interference/interference-detection.service.ts`
- Routes: `packages/api/src/routes/learning/interference.ts`
- Tests: 18 unit tests covering all service methods

**Frontend**:

- Dashboard: `packages/web/src/components/interference/InterferenceDashboard.tsx`
- Alert: `packages/web/src/components/interference/InterferenceAlert.tsx`
- Page: `/learning/interference`

**API Endpoints**:

- POST `/learning/interference/analyze` - Analyze incorrect answer for interference
- GET `/learning/interference/patterns` - Get user's interference patterns
- GET `/learning/interference/remediation/:patternId` - Generate remediation exercises
- POST `/learning/interference/remediation/submit` - Submit remediation attempt
- GET `/learning/interference/summary` - Get interference summary stats
- GET `/learning/interference/reduction/:patternId` - Calculate reduction trends
- POST `/learning/interference/patterns/:patternId/complete` - Mark pattern complete
