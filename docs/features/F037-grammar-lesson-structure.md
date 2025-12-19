# F037: Grammar Lesson Structure

**Feature Code**: F037
**Created**: 2025-12-17
**Phase**: 11 - Grammar Learning
**Status**: Not Started

---

## Description

Implement comprehensive grammar lesson presentation system that displays grammar rules with clear explanations, authentic examples, visual aids (tables/diagrams), and cross-linguistic comparisons for users studying multiple languages. Grammar lessons are sequenced by curriculum graph (e.g., present tense before subjunctive), follow CEFR progression, and include metalinguistic terminology in learner's base language. The system supports comparative grammar mode for parallel language learners, highlighting similarities and differences across language families.

## Success Criteria

- [ ] Grammar lessons fetched from approved_rules with associated examples
- [ ] Rule explanation in base language with clear metalinguistic terminology
- [ ] Example sentences in target language with translations and annotations
- [ ] Cross-linguistic comparisons when user studies multiple languages
- [ ] CEFR level filtering ensures appropriate difficulty progression
- [ ] Lesson completion tracked in user_concept_progress (curriculum integration)
- [ ] Grammar tables/charts displayed (e.g., verb conjugation tables)
- [ ] Interactive examples with highlighted grammar features
- [ ] Progressive disclosure (basic explanation → advanced details on demand)
- [ ] Links to related grammar concepts (e.g., "See also: Subjunctive Mood")

---

## Tasks

### Task 1: Grammar Lesson Service

**Implementation Plan**:

Create `packages/api/src/services/grammar/lesson.service.ts`:

```typescript
import { Pool } from 'pg';
import { Language, CEFRLevel } from '@polyladder/core';

interface GrammarRule {
  ruleId: string;
  grammarCategory: string; // e.g., "present_tense", "accusative_case"
  topic: string; // Human-readable title
  cefrLevel: CEFRLevel;
  explanation: string; // Markdown format
  usageNotes: string | null;
  difficulty: number; // 1-5 scale
  estimatedMinutes: number | null;
}

interface GrammarExample {
  exampleId: string;
  sentenceText: string;
  translation: string | null;
  annotation: string | null; // Highlights which part demonstrates the rule
  audioUrl: string | null;
}

interface GrammarLessonData {
  rule: GrammarRule;
  examples: GrammarExample[];
  relatedRules: Array<{
    ruleId: string;
    topic: string;
    relationshipType: 'prerequisite' | 'related' | 'advanced';
  }>;
  conjugationTable: ConjugationTableData | null;
}

interface ConjugationTableData {
  type: 'verb' | 'noun' | 'adjective';
  headers: string[]; // e.g., ['Singular', 'Plural'] or ['I', 'You', 'He/She']
  rows: Array<{
    label: string; // e.g., 'Nominative', 'Present'
    cells: string[];
  }>;
}

export class GrammarLessonService {
  constructor(private readonly pool: Pool) {}

  /**
   * Get grammar lesson data for a specific rule
   */
  async getGrammarLesson(
    ruleId: string,
    baseLanguage: Language
  ): Promise<GrammarLessonData | null> {
    // Fetch grammar rule
    const ruleResult = await this.pool.query<GrammarRule>(
      `SELECT
        id as "ruleId",
        grammar_category as "grammarCategory",
        topic,
        cefr_level as "cefrLevel",
        explanation,
        usage_notes as "usageNotes",
        difficulty,
        estimated_minutes as "estimatedMinutes"
       FROM approved_grammar_rules
       WHERE id = $1`,
      [ruleId]
    );

    if (ruleResult.rows.length === 0) return null;

    const rule = ruleResult.rows[0];

    // Fetch examples
    const examplesResult = await this.pool.query<GrammarExample>(
      `SELECT
        id as "exampleId",
        sentence_text as "sentenceText",
        translation,
        annotation,
        audio_url as "audioUrl"
       FROM approved_grammar_examples
       WHERE grammar_rule_id = $1
       ORDER BY example_order ASC
       LIMIT 10`,
      [ruleId]
    );

    const examples = examplesResult.rows;

    // Fetch related rules
    const relatedResult = await this.pool.query(
      `SELECT
        related_rule_id as "ruleId",
        agr.topic,
        grr.relationship_type as "relationshipType"
       FROM grammar_rule_relationships grr
       JOIN approved_grammar_rules agr ON grr.related_rule_id = agr.id
       WHERE grr.rule_id = $1
       ORDER BY
         CASE grr.relationship_type
           WHEN 'prerequisite' THEN 1
           WHEN 'related' THEN 2
           WHEN 'advanced' THEN 3
         END ASC
       LIMIT 5`,
      [ruleId]
    );

    const relatedRules = relatedResult.rows;

    // Fetch conjugation table if exists
    const conjugationTable = await this.getConjugationTable(ruleId);

    return {
      rule,
      examples,
      relatedRules,
      conjugationTable,
    };
  }

  /**
   * Get conjugation/declension table for grammar rule
   */
  private async getConjugationTable(ruleId: string): Promise<ConjugationTableData | null> {
    const result = await this.pool.query(
      `SELECT
        table_type as "type",
        headers,
        rows
       FROM grammar_conjugation_tables
       WHERE grammar_rule_id = $1`,
      [ruleId]
    );

    if (result.rows.length === 0) return null;

    return result.rows[0];
  }

  /**
   * Get next grammar lessons for user (unlocked by curriculum)
   */
  async getNextGrammarLessons(
    userId: string,
    language: Language,
    limit: number = 10
  ): Promise<GrammarRule[]> {
    const result = await this.pool.query<GrammarRule>(
      `SELECT
        agr.id as "ruleId",
        agr.grammar_category as "grammarCategory",
        agr.topic,
        agr.cefr_level as "cefrLevel",
        agr.explanation,
        agr.usage_notes as "usageNotes",
        agr.difficulty,
        agr.estimated_minutes as "estimatedMinutes"
       FROM approved_grammar_rules agr
       JOIN curriculum_graph cg ON cg.concept_id = CONCAT('grammar_', agr.grammar_category)
       JOIN user_concept_progress ucp ON ucp.concept_id = cg.concept_id AND ucp.language = cg.language
       WHERE agr.language = $1
         AND ucp.user_id = $2
         AND ucp.status IN ('unlocked', 'in_progress')
       ORDER BY
         CASE agr.cefr_level
           WHEN 'A1' THEN 1
           WHEN 'A2' THEN 2
           WHEN 'B1' THEN 3
           WHEN 'B2' THEN 4
           WHEN 'C1' THEN 5
           WHEN 'C2' THEN 6
         END ASC,
         agr.difficulty ASC,
         agr.topic ASC
       LIMIT $3`,
      [language, userId, limit]
    );

    return result.rows;
  }

  /**
   * Mark grammar lesson as completed
   */
  async markLessonComplete(
    userId: string,
    ruleId: string,
    language: Language
  ): Promise<void> {
    // Get grammar category to find curriculum concept
    const categoryResult = await this.pool.query<{ grammarCategory: string }>(
      `SELECT grammar_category as "grammarCategory"
       FROM approved_grammar_rules
       WHERE id = $1`,
      [ruleId]
    );

    if (categoryResult.rows.length === 0) return;

    const conceptId = `grammar_${categoryResult.rows[0].grammarCategory}`;

    // Update curriculum progress
    await this.pool.query(
      `UPDATE user_concept_progress
       SET status = 'completed',
           completed_at = NOW(),
           progress_percentage = 100
       WHERE user_id = $1 AND concept_id = $2 AND language = $3`,
      [userId, conceptId, language]
    );
  }
}
```

**Files Created**:
- `packages/api/src/services/grammar/lesson.service.ts`

**Database Assumptions**:
- `approved_grammar_rules` - Grammar rules with explanations
- `approved_grammar_examples` - Example sentences for rules
- `grammar_rule_relationships` - Links between related rules
- `grammar_conjugation_tables` - Structured tables (JSONB columns for headers/rows)

---

### Task 2: Cross-Linguistic Comparison Service

**Implementation Plan**:

Create `packages/api/src/services/grammar/comparison.service.ts`:

```typescript
import { Pool } from 'pg';
import { Language } from '@polyladder/core';

interface GrammarComparison {
  grammarCategory: string;
  languages: Array<{
    language: Language;
    ruleId: string;
    topic: string;
    explanation: string;
    example: string | null;
  }>;
  similarities: string[]; // e.g., "Both use SVO word order"
  differences: string[]; // e.g., "German has grammatical gender, English doesn't"
}

export class GrammarComparisonService {
  constructor(private readonly pool: Pool) {}

  /**
   * Get cross-linguistic comparison for a grammar concept
   * Only returns data if user is studying multiple languages
   */
  async getComparison(
    userId: string,
    grammarCategory: string,
    baseLanguage: Language
  ): Promise<GrammarComparison | null> {
    // Get all languages user is studying
    const userLanguages = await this.getUserLanguages(userId);

    if (userLanguages.length < 2) {
      return null; // No comparison if studying only one language
    }

    // Fetch grammar rules for this category across all user's languages
    const rulesResult = await this.pool.query(
      `SELECT
        agr.language,
        agr.id as "ruleId",
        agr.topic,
        agr.explanation,
        (SELECT sentence_text FROM approved_grammar_examples WHERE grammar_rule_id = agr.id LIMIT 1) as example
       FROM approved_grammar_rules agr
       WHERE agr.grammar_category = $1
         AND agr.language = ANY($2::text[])
       ORDER BY agr.language ASC`,
      [grammarCategory, userLanguages]
    );

    if (rulesResult.rows.length < 2) {
      return null; // Need at least 2 languages for comparison
    }

    const languages = rulesResult.rows;

    // Fetch comparison notes (curated similarities/differences)
    const comparisonResult = await this.pool.query<{
      similarities: string[];
      differences: string[];
    }>(
      `SELECT
        similarities,
        differences
       FROM grammar_cross_linguistic_notes
       WHERE grammar_category = $1
         AND language_pair @> $2::jsonb
       LIMIT 1`,
      [
        grammarCategory,
        JSON.stringify({ languages: userLanguages.sort() }),
      ]
    );

    const notes = comparisonResult.rows[0] || {
      similarities: [],
      differences: [],
    };

    return {
      grammarCategory,
      languages,
      similarities: notes.similarities,
      differences: notes.differences,
    };
  }

  /**
   * Get all languages user is actively studying
   */
  private async getUserLanguages(userId: string): Promise<Language[]> {
    const result = await this.pool.query<{ language: Language }>(
      `SELECT DISTINCT language
       FROM user_language_learning
       WHERE user_id = $1 AND status = 'active'
       ORDER BY language ASC`,
      [userId]
    );

    return result.rows.map(r => r.language);
  }
}
```

**Files Created**:
- `packages/api/src/services/grammar/comparison.service.ts`

**Technical Notes**:
- Comparison only shown when user studies 2+ languages
- Curated notes ensure pedagogically useful comparisons (not auto-generated)
- Language pair matching uses JSONB operators for flexible queries

---

### Task 3: API Endpoints for Grammar Lessons

**Implementation Plan**:

Create `packages/api/src/routes/learning/grammar.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Language } from '@polyladder/core';
import { GrammarLessonService } from '../../services/grammar/lesson.service';
import { GrammarComparisonService } from '../../services/grammar/comparison.service';
import { authMiddleware } from '../../middleware/auth';

const LanguageQuerySchema = z.object({
  language: z.nativeEnum(Language),
  baseLanguage: z.nativeEnum(Language),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

const RuleIdParamSchema = z.object({
  ruleId: z.string().uuid(),
});

export const grammarRoutes: FastifyPluginAsync = async (fastify) => {
  const lessonService = new GrammarLessonService(fastify.pg.pool);
  const comparisonService = new GrammarComparisonService(fastify.pg.pool);

  /**
   * GET /learning/grammar/next
   * Get next grammar lessons for user
   */
  fastify.get('/learning/grammar/next', {
    preHandler: authMiddleware,
    schema: {
      querystring: LanguageQuerySchema,
    },
  }, async (request, reply) => {
    const { language, limit } = LanguageQuerySchema.parse(request.query);
    const userId = request.user!.userId;

    const lessons = await lessonService.getNextGrammarLessons(userId, language, limit);

    return reply.status(200).send({ lessons });
  });

  /**
   * GET /learning/grammar/:ruleId/lesson
   * Get full grammar lesson data
   */
  fastify.get('/learning/grammar/:ruleId/lesson', {
    preHandler: authMiddleware,
    schema: {
      params: RuleIdParamSchema,
      querystring: z.object({
        baseLanguage: z.nativeEnum(Language),
      }),
    },
  }, async (request, reply) => {
    const { ruleId } = RuleIdParamSchema.parse(request.params);
    const { baseLanguage } = request.query as { baseLanguage: Language };

    const lesson = await lessonService.getGrammarLesson(ruleId, baseLanguage);

    if (!lesson) {
      return reply.status(404).send({ error: 'Grammar rule not found' });
    }

    return reply.status(200).send({ lesson });
  });

  /**
   * GET /learning/grammar/:ruleId/comparison
   * Get cross-linguistic comparison for grammar rule
   */
  fastify.get('/learning/grammar/:ruleId/comparison', {
    preHandler: authMiddleware,
    schema: {
      params: RuleIdParamSchema,
      querystring: z.object({
        baseLanguage: z.nativeEnum(Language),
      }),
    },
  }, async (request, reply) => {
    const { ruleId } = RuleIdParamSchema.parse(request.params);
    const { baseLanguage } = request.query as { baseLanguage: Language };
    const userId = request.user!.userId;

    // Get grammar category from rule
    const ruleResult = await fastify.pg.pool.query<{ grammarCategory: string }>(
      `SELECT grammar_category as "grammarCategory"
       FROM approved_grammar_rules
       WHERE id = $1`,
      [ruleId]
    );

    if (ruleResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Grammar rule not found' });
    }

    const grammarCategory = ruleResult.rows[0].grammarCategory;

    const comparison = await comparisonService.getComparison(
      userId,
      grammarCategory,
      baseLanguage
    );

    return reply.status(200).send({ comparison });
  });

  /**
   * POST /learning/grammar/:ruleId/complete
   * Mark grammar lesson as completed
   */
  fastify.post('/learning/grammar/:ruleId/complete', {
    preHandler: authMiddleware,
    schema: {
      params: RuleIdParamSchema,
      body: z.object({
        language: z.nativeEnum(Language),
      }),
    },
  }, async (request, reply) => {
    const { ruleId } = RuleIdParamSchema.parse(request.params);
    const { language } = request.body as { language: Language };
    const userId = request.user!.userId;

    await lessonService.markLessonComplete(userId, ruleId, language);

    return reply.status(200).send({ success: true });
  });
};
```

**Files Created**:
- `packages/api/src/routes/learning/grammar.ts`

**API Summary**:
- `GET /learning/grammar/next` - List next grammar lessons
- `GET /learning/grammar/:ruleId/lesson` - Full lesson with examples
- `GET /learning/grammar/:ruleId/comparison` - Cross-linguistic comparison
- `POST /learning/grammar/:ruleId/complete` - Mark lesson complete

---

### Task 4: Grammar Lesson React Component

**Implementation Plan**:

Create `packages/web/src/components/grammar/GrammarLesson.tsx`:

```typescript
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { apiClient } from '../../lib/api-client';
import { Language } from '@polyladder/core';

interface GrammarLessonProps {
  language: Language;
  baseLanguage: Language;
}

export function GrammarLesson({ language, baseLanguage }: GrammarLessonProps) {
  const { ruleId } = useParams<{ ruleId: string }>();
  const queryClient = useQueryClient();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  const { data: lessonData, isLoading } = useQuery({
    queryKey: ['grammar-lesson', ruleId, baseLanguage],
    queryFn: async () => {
      const response = await apiClient.get(
        `/learning/grammar/${ruleId}/lesson?baseLanguage=${baseLanguage}`
      );
      return response.data.lesson;
    },
    enabled: !!ruleId,
  });

  const { data: comparisonData } = useQuery({
    queryKey: ['grammar-comparison', ruleId, baseLanguage],
    queryFn: async () => {
      const response = await apiClient.get(
        `/learning/grammar/${ruleId}/comparison?baseLanguage=${baseLanguage}`
      );
      return response.data.comparison;
    },
    enabled: !!ruleId && showComparison,
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post(`/learning/grammar/${ruleId}/complete`, {
        language,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grammar-next'] });
      queryClient.invalidateQueries({ queryKey: ['curriculum-stats'] });
    },
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading grammar lesson...</div>;
  }

  if (!lessonData) {
    return <div className="text-center py-8">Grammar lesson not found</div>;
  }

  const { rule, examples, relatedRules, conjugationTable } = lessonData;

  return (
    <div className="grammar-lesson max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="card p-8 mb-6">
        <h1 className="text-4xl font-bold mb-4">{rule.topic}</h1>

        <div className="flex gap-3 items-center mb-4">
          <span className="badge badge-blue">{rule.cefrLevel}</span>
          <span className="badge badge-purple">Difficulty: {rule.difficulty}/5</span>
          {rule.estimatedMinutes && (
            <span className="text-gray-600">~{rule.estimatedMinutes} min</span>
          )}
        </div>

        {comparisonData && (
          <button
            onClick={() => setShowComparison(!showComparison)}
            className="btn btn-secondary btn-sm"
          >
            {showComparison ? 'Hide' : 'Show'} Cross-Language Comparison
          </button>
        )}
      </div>

      {/* Cross-Linguistic Comparison */}
      {showComparison && comparisonData && (
        <div className="card p-6 mb-6 bg-blue-50 border-blue-200">
          <h2 className="text-2xl font-bold mb-4">Comparison Across Languages</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {comparisonData.languages.map((lang: any) => (
              <div key={lang.language} className="card p-4">
                <h3 className="font-bold text-lg mb-2">{lang.language}</h3>
                <p className="text-sm text-gray-700 mb-2">{lang.topic}</p>
                {lang.example && (
                  <p className="text-sm italic text-gray-600">"{lang.example}"</p>
                )}
              </div>
            ))}
          </div>

          {comparisonData.similarities.length > 0 && (
            <div className="mb-4">
              <h3 className="font-bold mb-2 text-green-700">✓ Similarities:</h3>
              <ul className="list-disc list-inside space-y-1">
                {comparisonData.similarities.map((sim: string, idx: number) => (
                  <li key={idx} className="text-gray-700">{sim}</li>
                ))}
              </ul>
            </div>
          )}

          {comparisonData.differences.length > 0 && (
            <div>
              <h3 className="font-bold mb-2 text-orange-700">⚠ Differences:</h3>
              <ul className="list-disc list-inside space-y-1">
                {comparisonData.differences.map((diff: string, idx: number) => (
                  <li key={idx} className="text-gray-700">{diff}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Explanation */}
      <div className="card p-6 mb-6">
        <h2 className="text-2xl font-bold mb-4">Explanation</h2>
        <div className="prose max-w-none">
          <ReactMarkdown>{rule.explanation}</ReactMarkdown>
        </div>

        {rule.usageNotes && (
          <div className="mt-4 p-4 bg-yellow-50 border-l-4 border-yellow-500">
            <p className="text-sm font-semibold text-yellow-800 mb-1">Usage Note:</p>
            <p className="text-sm text-yellow-900">{rule.usageNotes}</p>
          </div>
        )}
      </div>

      {/* Conjugation Table */}
      {conjugationTable && (
        <div className="card p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4">
            {conjugationTable.type.charAt(0).toUpperCase() + conjugationTable.type.slice(1)} Table
          </h2>

          <div className="overflow-x-auto">
            <table className="table-auto w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-4 py-2"></th>
                  {conjugationTable.headers.map((header: string, idx: number) => (
                    <th key={idx} className="border border-gray-300 px-4 py-2 font-semibold">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {conjugationTable.rows.map((row: any, idx: number) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="border border-gray-300 px-4 py-2 font-semibold">
                      {row.label}
                    </td>
                    {row.cells.map((cell: string, cellIdx: number) => (
                      <td key={cellIdx} className="border border-gray-300 px-4 py-2">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Examples */}
      <div className="card p-6 mb-6">
        <h2 className="text-2xl font-bold mb-4">Examples</h2>

        <div className="space-y-4">
          {examples.map((example: any, idx: number) => (
            <div key={example.exampleId} className="border-l-4 border-green-500 pl-4">
              <div className="flex items-start gap-3">
                <span className="text-lg font-bold text-gray-400">{idx + 1}.</span>
                <div className="flex-1">
                  <p className="text-lg font-medium mb-1">{example.sentenceText}</p>
                  {example.translation && (
                    <p className="text-gray-600 italic mb-1">{example.translation}</p>
                  )}
                  {example.annotation && (
                    <p className="text-sm text-green-700 bg-green-50 p-2 rounded">
                      💡 {example.annotation}
                    </p>
                  )}
                </div>
                {example.audioUrl && (
                  <button className="btn btn-sm btn-circle" title="Play audio">
                    🔊
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Related Rules */}
      {relatedRules.length > 0 && (
        <div className="card p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4">Related Topics</h2>

          <div className="space-y-2">
            {relatedRules.map((related: any) => (
              <div
                key={related.ruleId}
                className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded cursor-pointer"
              >
                <span className={`badge badge-sm ${
                  related.relationshipType === 'prerequisite' ? 'badge-blue' :
                  related.relationshipType === 'advanced' ? 'badge-red' :
                  'badge-gray'
                }`}>
                  {related.relationshipType}
                </span>
                <span className="text-lg">{related.topic}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between mt-8">
        <button className="btn btn-secondary">← Previous Lesson</button>
        <button
          onClick={() => completeMutation.mutate()}
          className="btn btn-primary"
          disabled={completeMutation.isPending}
        >
          {completeMutation.isPending ? 'Completing...' : 'Complete Lesson →'}
        </button>
      </div>
    </div>
  );
}
```

**Files Created**:
- `packages/web/src/components/grammar/GrammarLesson.tsx`

**UI Features**:
- Markdown rendering for grammar explanations
- Conjugation/declension tables with responsive design
- Annotated examples with audio playback
- Cross-linguistic comparison panel (toggleable)
- Related rules navigation
- Progressive disclosure (advanced notes on demand)

---

### Task 5: Grammar List Component

**Implementation Plan**:

Create `packages/web/src/components/grammar/GrammarList.tsx`:

```typescript
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../lib/api-client';
import { Language } from '@polyladder/core';

interface GrammarListProps {
  language: Language;
  baseLanguage: Language;
}

export function GrammarList({ language, baseLanguage }: GrammarListProps) {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['grammar-next', language, baseLanguage],
    queryFn: async () => {
      const response = await apiClient.get(
        `/learning/grammar/next?language=${language}&baseLanguage=${baseLanguage}&limit=20`
      );
      return response.data;
    },
  });

  if (isLoading) {
    return <div className="text-center">Loading grammar lessons...</div>;
  }

  if (!data?.lessons || data.lessons.length === 0) {
    return (
      <div className="card p-8 text-center">
        <h3 className="text-xl font-bold text-gray-600">No Grammar Lessons Available</h3>
        <p className="text-gray-500 mt-2">
          Complete prerequisite concepts to unlock grammar lessons.
        </p>
      </div>
    );
  }

  const handleLessonClick = (ruleId: string) => {
    navigate(`/learn/${language}/grammar/${ruleId}`);
  };

  // Group by CEFR level
  const lessonsByCEFR = data.lessons.reduce((acc: any, lesson: any) => {
    if (!acc[lesson.cefrLevel]) acc[lesson.cefrLevel] = [];
    acc[lesson.cefrLevel].push(lesson);
    return acc;
  }, {});

  const cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

  return (
    <div className="grammar-list">
      <h2 className="text-2xl font-bold mb-6">Grammar Lessons</h2>

      {cefrLevels.map(level => {
        const lessons = lessonsByCEFR[level];
        if (!lessons || lessons.length === 0) return null;

        return (
          <div key={level} className="mb-8">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span className="badge badge-blue">{level}</span>
              <span className="text-gray-600">({lessons.length} lessons)</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lessons.map((lesson: any) => (
                <div
                  key={lesson.ruleId}
                  onClick={() => handleLessonClick(lesson.ruleId)}
                  className="card p-4 cursor-pointer hover:shadow-lg transition-shadow"
                >
                  <h4 className="text-lg font-bold mb-2">{lesson.topic}</h4>

                  <div className="flex gap-2 mb-3">
                    <span className="badge badge-sm badge-purple">
                      Difficulty: {lesson.difficulty}/5
                    </span>
                    {lesson.estimatedMinutes && (
                      <span className="text-sm text-gray-600">
                        ~{lesson.estimatedMinutes} min
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-gray-700 line-clamp-2">
                    {lesson.explanation.substring(0, 100)}...
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

**Files Created**:
- `packages/web/src/components/grammar/GrammarList.tsx`

**UI Features**:
- Grouped by CEFR level
- Difficulty and duration indicators
- Preview of explanation
- Click to navigate to full lesson

---

## Dependencies

- **Blocks**: F038 (Grammar Practice Exercises)
- **Depends on**:
  - F001 (Database Schema - approved_grammar_rules, approved_grammar_examples)
  - F018 (API Infrastructure)
  - F022 (React Application Setup)
  - F032 (Curriculum Graph - for grammar sequencing)

---

## Open Questions

### Question 1: Conjugation Table Data Structure

**Context**: How should conjugation/declension tables be stored in the database for flexible rendering?

**Options**:
1. **JSONB Column** (Headers + rows as JSON)
   - Pros: Flexible schema, supports any table structure
   - Cons: Hard to query, no type safety
2. **Separate Table** (grammar_conjugation_cells with row/column indices)
   - Pros: Queryable, normalized
   - Cons: Complex joins, harder to render
3. **Pre-rendered HTML** (Store as HTML string)
   - Pros: Fast rendering, exact control
   - Cons: Not accessible, hard to style dynamically
4. **Markdown Table** (Store as markdown text)
   - Pros: Human-readable, version-controllable
   - Cons: Limited styling, parsing required

**Current Decision**: Option 1 (JSONB) for MVP. Allows flexible table structures (2D, 3D, irregular).

**Impact**: Medium - affects rendering performance and query flexibility. JSONB is good balance.

---

### Question 2: Grammar Category Taxonomy

**Context**: How to standardize grammar_category values across languages with different grammatical structures?

**Options**:
1. **Universal Categories** (e.g., "present_tense", "nominative_case")
   - Pros: Enables cross-linguistic comparison, consistent
   - Cons: Doesn't fit all languages (e.g., no cases in Chinese)
2. **Language-Specific Categories** (e.g., "de_nominativ", "fr_passé_composé")
   - Pros: Accurate to each language
   - Cons: Hard to compare across languages
3. **Hierarchical Taxonomy** (e.g., "tense.present", "case.nominative")
   - Pros: Flexible, allows partial matching
   - Cons: Complex, requires consistent naming
4. **Mixed Approach** (Universal + language-specific extensions)
   - Pros: Balances comparability and accuracy
   - Cons: Inconsistent, hard to enforce

**Current Decision**: Option 3 (hierarchical taxonomy with dot notation). Allows both exact and partial matches.

**Impact**: High - affects all grammar comparison logic. Must be consistent from MVP onward.

---

### Question 3: Explanation Depth Levels

**Context**: Should grammar explanations have multiple depth levels (basic, intermediate, advanced)?

**Options**:
1. **Single Explanation** (One explanation fits all)
   - Pros: Simple, less content needed
   - Cons: Too detailed for beginners or too shallow for advanced learners
2. **Two Levels** (Basic + advanced toggle)
   - Pros: Balances simplicity and depth
   - Cons: Hard to decide what goes in each level
3. **Three Levels** (Beginner, intermediate, advanced)
   - Pros: Fine-grained control
   - Cons: Too much content duplication, maintenance burden
4. **Progressive Disclosure** (Start simple, expand on demand)
   - Pros: User controls depth, single content source
   - Cons: Requires UI design for expandable sections

**Current Decision**: Option 4 (progressive disclosure). Use Markdown headers/sections to create expandable segments.

**Impact**: Low - affects content structure but not data model. Can refine post-MVP.

---

## Notes

- **Grammar Sequencing**: Curriculum graph enforces prerequisite order (e.g., present tense before subjunctive)
- **Markdown Support**: Grammar explanations use Markdown for formatting (bold, lists, links)
- **Cross-Language Comparison**: Only shown when user studies 2+ languages with matching categories
- **Conjugation Tables**: JSONB format allows flexible table structures (verbs, nouns, adjectives)
- **Audio Examples**: Same audio playback system as vocabulary lessons
- **Annotations**: Highlight which part of example demonstrates the grammar rule
- **Related Rules**: Three types: prerequisite, related, advanced (links to other lessons)
- **Completion Tracking**: Updates curriculum_graph progress when lesson completed
- **Metalinguistic Terminology**: Uses grammatical terms in base language (e.g., "nominative case" in English)
- **Future Enhancement**: Add interactive exercises directly in lesson (drag-and-drop conjugation practice)
- **Future Enhancement**: Add user-generated examples (learners submit sentences using the rule)
