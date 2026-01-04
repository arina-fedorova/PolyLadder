# F048: Comparative Grammar Presentation

**Feature Code**: F048
**Created**: 2025-12-17
**Phase**: 14 - Parallel Learning Support
**Status**: Completed

---

## Description

Implement side-by-side grammar comparisons between languages the user is studying (e.g., Russian vs Arabic case systems, Chinese vs Arabic sentence structure). This feature leverages parallel language learning by helping users identify similarities and differences across languages, improving transfer of grammatical knowledge and avoiding interference patterns. The system matches equivalent grammar concepts across languages and presents them with highlighted similarities, differences, and cross-linguistic insights.

## Success Criteria

- [x] Grammar rules compared across 2-3 languages side-by-side
- [x] Automatic concept matching (e.g., "past tense" → past tense in all languages)
- [x] Visual highlighting of similarities (green) and differences (orange)
- [x] Cross-linguistic insights and transfer tips
- [x] User selects languages to compare (from studied languages)
- [x] Comparison templates for common grammar categories
- [x] Examples shown for each language in comparison

---

## Tasks

### Task 1: Create Comparative Grammar Service

**File**: `packages/api/src/services/comparative/comparative-grammar.service.ts`

Create backend service that:

- Fetches grammar rules for a specific concept across multiple languages
- Matches equivalent grammar concepts using metadata tags
- Identifies similarities and differences between language implementations
- Generates cross-linguistic insights
- Tracks which comparisons users have viewed

**Implementation**:

```typescript
// packages/api/src/services/comparative/comparative-grammar.service.ts
import { Pool } from 'pg';

interface GrammarComparison {
  conceptKey: string; // e.g., "past_tense", "plural_formation"
  conceptName: string; // e.g., "Past Tense", "Plural Formation"
  languages: LanguageGrammarData[];
  similarities: string[]; // List of similarities across languages
  differences: ComparisonDifference[];
  crossLinguisticInsights: string[];
}

interface LanguageGrammarData {
  language: string;
  ruleId: string;
  ruleName: string;
  explanation: string;
  examples: GrammarExample[];
  conjugationTable?: ConjugationTable;
  metadata: Record<string, any>; // Concept tags, difficulty, etc.
}

interface GrammarExample {
  sentence: string;
  translation: string;
  highlighted?: string; // Which part to highlight
}

interface ConjugationTable {
  tableType: string; // 'verb', 'noun', 'adjective'
  headers: string[];
  rows: { label: string; cells: string[] }[];
}

interface ComparisonDifference {
  aspect: string; // e.g., "Formation method", "Irregular patterns"
  descriptions: { language: string; description: string }[];
}

export class ComparativeGrammarService {
  constructor(private pool: Pool) {}

  /**
   * Get available grammar concepts for comparison
   * Only returns concepts that exist in at least 2 of user's languages
   */
  async getAvailableConcepts(
    userId: string,
    languages: string[]
  ): Promise<{ conceptKey: string; conceptName: string; languageCount: number }[]> {
    // Get all grammar rules for user's languages
    const result = await this.pool.query(
      `SELECT
         DISTINCT (metadata->>'concept_key') AS concept_key,
         (metadata->>'concept_name') AS concept_name,
         COUNT(DISTINCT language) AS language_count
       FROM approved_grammar_rules
       WHERE language = ANY($1::varchar[])
         AND metadata->>'concept_key' IS NOT NULL
       GROUP BY concept_key, concept_name
       HAVING COUNT(DISTINCT language) >= 2
       ORDER BY language_count DESC, concept_name ASC`,
      [languages]
    );

    return result.rows.map((row) => ({
      conceptKey: row.concept_key,
      conceptName: row.concept_name,
      languageCount: parseInt(row.language_count),
    }));
  }

  /**
   * Get detailed grammar comparison for a specific concept across languages
   */
  async getGrammarComparison(
    userId: string,
    conceptKey: string,
    languages: string[]
  ): Promise<GrammarComparison> {
    // Fetch grammar rules for this concept in all specified languages
    const rulesResult = await this.pool.query(
      `SELECT
         agr.id,
         agr.language,
         agr.rule_name,
         agr.explanation,
         agr.examples,
         agr.metadata
       FROM approved_grammar_rules agr
       WHERE agr.language = ANY($1::varchar[])
         AND agr.metadata->>'concept_key' = $2
       ORDER BY agr.language ASC`,
      [languages, conceptKey]
    );

    if (rulesResult.rows.length === 0) {
      throw new Error(`No grammar rules found for concept: ${conceptKey}`);
    }

    // Fetch conjugation tables if available
    const languagesData: LanguageGrammarData[] = [];
    for (const rule of rulesResult.rows) {
      const tableResult = await this.pool.query(
        `SELECT table_type, headers, rows
         FROM grammar_conjugation_tables
         WHERE grammar_rule_id = $1
         LIMIT 1`,
        [rule.id]
      );

      languagesData.push({
        language: rule.language,
        ruleId: rule.id,
        ruleName: rule.rule_name,
        explanation: rule.explanation,
        examples: rule.examples || [], // JSONB array
        conjugationTable: tableResult.rows[0] || undefined,
        metadata: rule.metadata || {},
      });
    }

    // Analyze similarities and differences
    const { similarities, differences } = this.analyzeCrossLinguisticPatterns(
      conceptKey,
      languagesData
    );

    // Generate cross-linguistic insights
    const insights = this.generateCrossLinguisticInsights(
      conceptKey,
      languagesData,
      similarities,
      differences
    );

    // Record that user viewed this comparison
    await this.pool.query(
      `INSERT INTO user_grammar_comparisons_viewed
         (user_id, concept_key, languages, viewed_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, concept_key, languages) DO UPDATE
       SET viewed_at = NOW()`,
      [userId, conceptKey, languages.sort()]
    );

    return {
      conceptKey,
      conceptName: rulesResult.rows[0].metadata?.concept_name || conceptKey,
      languages: languagesData,
      similarities,
      differences,
      crossLinguisticInsights: insights,
    };
  }

  /**
   * Analyze cross-linguistic patterns to identify similarities and differences
   */
  private analyzeCrossLinguisticPatterns(
    conceptKey: string,
    languagesData: LanguageGrammarData[]
  ): { similarities: string[]; differences: ComparisonDifference[] } {
    const similarities: string[] = [];
    const differences: ComparisonDifference[] = [];

    // Extract metadata features for comparison
    const features = languagesData.map((lang) => ({
      language: lang.language,
      hasIrregular: lang.metadata.has_irregular_forms || false,
      formationMethod: lang.metadata.formation_method || 'unknown',
      complexity: lang.metadata.complexity || 'medium',
      usesAuxiliary: lang.metadata.uses_auxiliary || false,
    }));

    // Check for similarities
    const allHaveIrregular = features.every((f) => f.hasIrregular);
    const allLackIrregular = features.every((f) => !f.hasIrregular);
    const allUseAuxiliary = features.every((f) => f.usesAuxiliary);

    if (allHaveIrregular) {
      similarities.push('All languages have irregular forms for this concept');
    } else if (allLackIrregular) {
      similarities.push('Regular formation pattern in all languages');
    }

    if (allUseAuxiliary) {
      similarities.push('All languages use auxiliary verbs/particles');
    }

    // Identify formation method differences
    const formationMethods = features.map((f) => ({
      language: f.language,
      description: this.getFormationMethodDescription(f.formationMethod),
    }));

    const uniqueMethods = new Set(formationMethods.map((f) => f.description));
    if (uniqueMethods.size > 1) {
      differences.push({
        aspect: 'Formation Method',
        descriptions: formationMethods,
      });
    }

    // Identify complexity differences
    const complexities = features.map((f) => ({
      language: f.language,
      description: `${f.complexity.charAt(0).toUpperCase() + f.complexity.slice(1)} complexity`,
    }));

    const uniqueComplexities = new Set(complexities.map((c) => c.description));
    if (uniqueComplexities.size > 1) {
      differences.push({
        aspect: 'Complexity Level',
        descriptions: complexities,
      });
    }

    return { similarities, differences };
  }

  /**
   * Get human-readable formation method description
   */
  private getFormationMethodDescription(method: string): string {
    const descriptions: Record<string, string> = {
      suffix: 'Adds suffix to base form',
      prefix: 'Adds prefix to base form',
      stem_change: 'Changes stem vowel/consonant',
      auxiliary: 'Uses auxiliary verb + participle',
      tonal: 'Changes tone/pitch',
      particle: 'Uses grammatical particle',
      infixation: 'Inserts infix within stem',
      reduplication: 'Repeats part of the word',
      unknown: 'Formation method not documented',
    };

    return descriptions[method] || method;
  }

  /**
   * Generate cross-linguistic insights and learning tips
   */
  private generateCrossLinguisticInsights(
    conceptKey: string,
    languagesData: LanguageGrammarData[],
    similarities: string[],
    differences: ComparisonDifference[]
  ): string[] {
    const insights: string[] = [];

    // Insight: Transfer strategy
    if (similarities.length > 0) {
      insights.push(
        `💡 Transfer Strategy: ${similarities[0]} - You can apply similar learning strategies across these languages.`
      );
    }

    // Insight: Interference warning
    if (differences.length > 0) {
      const formationDiff = differences.find((d) => d.aspect === 'Formation Method');
      if (formationDiff) {
        insights.push(
          `⚠️ Interference Alert: Different formation methods mean you need to consciously switch strategies when changing languages.`
        );
      }
    }

    // Insight: Learning order recommendation
    const complexities = languagesData.map((lang) => lang.metadata.complexity || 'medium');
    const hasEasy = complexities.includes('easy');
    const hasHard = complexities.includes('hard');

    if (hasEasy && hasHard) {
      const easyLang = languagesData.find((l) => l.metadata.complexity === 'easy')?.language;
      insights.push(
        `📚 Learning Order: Master this concept in ${easyLang} first, then transfer to more complex languages.`
      );
    }

    // Insight: Practice recommendation
    if (languagesData.length === 2) {
      insights.push(
        `🎯 Practice Tip: Alternate between languages when practicing this concept to strengthen cross-linguistic connections.`
      );
    }

    return insights;
  }

  /**
   * Get user's comparison history
   */
  async getUserComparisonHistory(
    userId: string,
    limit: number = 10
  ): Promise<{ conceptKey: string; conceptName: string; languages: string[]; viewedAt: Date }[]> {
    const result = await this.pool.query(
      `SELECT
         ugcv.concept_key,
         agr.metadata->>'concept_name' AS concept_name,
         ugcv.languages,
         ugcv.viewed_at
       FROM user_grammar_comparisons_viewed ugcv
       JOIN approved_grammar_rules agr ON agr.metadata->>'concept_key' = ugcv.concept_key
       WHERE ugcv.user_id = $1
       GROUP BY ugcv.concept_key, concept_name, ugcv.languages, ugcv.viewed_at
       ORDER BY ugcv.viewed_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map((row) => ({
      conceptKey: row.concept_key,
      conceptName: row.concept_name || row.concept_key,
      languages: row.languages,
      viewedAt: row.viewed_at,
    }));
  }
}
```

**Database Schema Addition**:

```sql
-- Track which grammar comparisons users have viewed
CREATE TABLE user_grammar_comparisons_viewed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  concept_key VARCHAR(100) NOT NULL,
  languages VARCHAR(20)[] NOT NULL, -- Array of language codes
  viewed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, concept_key, languages)
);

CREATE INDEX idx_user_comparisons_user ON user_grammar_comparisons_viewed(user_id);
CREATE INDEX idx_user_comparisons_viewed_at ON user_grammar_comparisons_viewed(viewed_at DESC);
```

**Metadata Schema for Grammar Rules** (update to F037):

```typescript
// Add to approved_grammar_rules.metadata JSONB structure
interface GrammarRuleMetadata {
  concept_key: string; // e.g., "past_tense", "plural_formation"
  concept_name: string; // e.g., "Past Tense", "Plural Formation"
  formation_method: string; // 'suffix', 'prefix', 'auxiliary', 'tonal', etc.
  has_irregular_forms: boolean;
  uses_auxiliary: boolean;
  complexity: 'easy' | 'medium' | 'hard';
  cognates?: string[]; // Related concepts in other languages
  false_friends?: string[]; // Deceptive similarities to avoid
}
```

**Open Questions**:

1. **Concept Taxonomy**: Should we create a formal taxonomy of grammar concepts that works across all languages, or use ad-hoc tagging?
   - **Formal taxonomy**: Consistent, scalable, requires linguistic expertise
   - **Ad-hoc tagging**: Flexible, but may have inconsistencies
   - **Recommendation**: Start with common concepts (tense, mood, case, number, gender), expand iteratively

2. **Maximum Languages in Comparison**: Should we limit comparisons to 2-3 languages to avoid cognitive overload?
   - **2 languages**: Clear comparison, easy to digest
   - **3 languages**: Shows patterns across language families
   - **4+**: Information overload
   - **Recommendation**: Max 3 languages in MVP

3. **Automatic Insight Generation**: Should we use LLMs to generate cross-linguistic insights automatically, or curate them manually?
   - **Manual curation**: High quality, but time-consuming
   - **LLM-generated**: Scalable, may have errors
   - **Recommendation**: Manual for MVP, explore LLM assistance later

---

### Task 2: Create Comparative Grammar API Endpoints

**File**: `packages/api/src/routes/comparative/grammar.ts`

Add REST endpoints for:

- GET `/comparative/grammar/concepts` - Get available concepts for comparison
- GET `/comparative/grammar/compare` - Get detailed comparison for a concept
- GET `/comparative/grammar/history` - Get user's comparison history

**Implementation**:

```typescript
// packages/api/src/routes/comparative/grammar.ts
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ComparativeGrammarService } from '../../services/comparative/comparative-grammar.service';

const GetAvailableConceptsSchema = z.object({
  languages: z.string().transform((str) => str.split(',')),
});

const GetComparisonSchema = z.object({
  conceptKey: z.string().min(1),
  languages: z.string().transform((str) => str.split(',')),
});

const GetHistorySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const comparativeGrammarRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new ComparativeGrammarService(fastify.db.pool);

  /**
   * GET /comparative/grammar/concepts
   * Get available grammar concepts for comparison
   */
  fastify.get(
    '/concepts',
    {
      onRequest: [fastify.authenticate],
      schema: {
        querystring: GetAvailableConceptsSchema,
        response: {
          200: z.object({
            concepts: z.array(
              z.object({
                conceptKey: z.string(),
                conceptName: z.string(),
                languageCount: z.number(),
              })
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const { languages } = GetAvailableConceptsSchema.parse(request.query);
      const userId = request.user.userId;

      if (languages.length < 2) {
        return reply.status(400).send({
          error: 'At least 2 languages required for comparison',
        });
      }

      const concepts = await service.getAvailableConcepts(userId, languages);

      return reply.send({ concepts });
    }
  );

  /**
   * GET /comparative/grammar/compare
   * Get detailed grammar comparison for a concept
   */
  fastify.get(
    '/compare',
    {
      onRequest: [fastify.authenticate],
      schema: {
        querystring: GetComparisonSchema,
        response: {
          200: z.object({
            comparison: z.object({
              conceptKey: z.string(),
              conceptName: z.string(),
              languages: z.array(
                z.object({
                  language: z.string(),
                  ruleId: z.string(),
                  ruleName: z.string(),
                  explanation: z.string(),
                  examples: z.array(
                    z.object({
                      sentence: z.string(),
                      translation: z.string(),
                      highlighted: z.string().optional(),
                    })
                  ),
                  conjugationTable: z
                    .object({
                      tableType: z.string(),
                      headers: z.array(z.string()),
                      rows: z.array(
                        z.object({
                          label: z.string(),
                          cells: z.array(z.string()),
                        })
                      ),
                    })
                    .optional(),
                  metadata: z.record(z.any()),
                })
              ),
              similarities: z.array(z.string()),
              differences: z.array(
                z.object({
                  aspect: z.string(),
                  descriptions: z.array(
                    z.object({
                      language: z.string(),
                      description: z.string(),
                    })
                  ),
                })
              ),
              crossLinguisticInsights: z.array(z.string()),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const { conceptKey, languages } = GetComparisonSchema.parse(request.query);
      const userId = request.user.userId;

      if (languages.length < 2 || languages.length > 3) {
        return reply.status(400).send({
          error: 'Comparison requires 2-3 languages',
        });
      }

      const comparison = await service.getGrammarComparison(userId, conceptKey, languages);

      return reply.send({ comparison });
    }
  );

  /**
   * GET /comparative/grammar/history
   * Get user's comparison viewing history
   */
  fastify.get(
    '/history',
    {
      onRequest: [fastify.authenticate],
      schema: {
        querystring: GetHistorySchema,
        response: {
          200: z.object({
            history: z.array(
              z.object({
                conceptKey: z.string(),
                conceptName: z.string(),
                languages: z.array(z.string()),
                viewedAt: z.date(),
              })
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const { limit } = GetHistorySchema.parse(request.query);
      const userId = request.user.userId;

      const history = await service.getUserComparisonHistory(userId, limit);

      return reply.send({ history });
    }
  );
};

export default comparativeGrammarRoutes;
```

**Integration**: Register in `packages/api/src/routes/index.ts`:

```typescript
import comparativeGrammarRoutes from './comparative/grammar';

export const routes: FastifyPluginAsync = async (fastify) => {
  // ... existing routes
  fastify.register(comparativeGrammarRoutes, { prefix: '/comparative/grammar' });
};
```

**Open Questions**:

1. **Real-time Comparison Updates**: Should the comparison data update automatically if grammar rules are modified by operators?
   - **Static snapshot**: Simple, user sees what they saw before
   - **Dynamic updates**: Always current, but may confuse users
   - **Recommendation**: Static snapshot with "Updated available" notification

2. **Comparison Caching Strategy**: Comparisons are computationally expensive. Should we cache results?
   - **No cache**: Always fresh, but slow
   - **Redis cache**: Fast, but requires infrastructure
   - **Database cache**: Moderate speed, simpler
   - **Recommendation**: Database cache with 1-hour TTL

3. **Comparison Permissions**: Should all comparisons be available to all users, or only after they've learned the concept in at least one language?
   - **Unrestricted**: Exploratory learning, may overwhelm beginners
   - **Restricted**: Ensures foundation before comparison
   - **Recommendation**: Unrestricted, but mark concepts as "Not yet studied"

---

### Task 3: Create Comparative Grammar React Component

**File**: `packages/web/src/components/comparative/ComparativeGrammar.tsx`

Create UI component with:

- Language selector (choose 2-3 from studied languages)
- Concept selector (dropdown of available concepts)
- Side-by-side grammar presentation with synchronized scrolling
- Visual highlighting of similarities (green) and differences (orange)
- Cross-linguistic insights panel
- Example sentences aligned across languages
- Conjugation tables side-by-side (if available)

**Implementation**:

```tsx
// packages/web/src/components/comparative/ComparativeGrammar.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

interface GrammarComparison {
  conceptKey: string;
  conceptName: string;
  languages: LanguageGrammarData[];
  similarities: string[];
  differences: ComparisonDifference[];
  crossLinguisticInsights: string[];
}

interface LanguageGrammarData {
  language: string;
  ruleId: string;
  ruleName: string;
  explanation: string;
  examples: { sentence: string; translation: string; highlighted?: string }[];
  conjugationTable?: {
    tableType: string;
    headers: string[];
    rows: { label: string; cells: string[] }[];
  };
  metadata: Record<string, any>;
}

interface ComparisonDifference {
  aspect: string;
  descriptions: { language: string; description: string }[];
}

interface Props {
  availableLanguages: string[]; // User's studied languages
}

const LANGUAGE_NAMES: Record<string, string> = {
  russian: 'Russian',
  chinese: 'Chinese',
  arabic: 'Arabic',
  english: 'English',
};

export const ComparativeGrammar: React.FC<Props> = ({ availableLanguages }) => {
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedConcept, setSelectedConcept] = useState<string>('');

  const scrollRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Fetch available concepts for comparison
  const { data: conceptsData } = useQuery({
    queryKey: ['comparative-concepts', selectedLanguages],
    queryFn: async () => {
      if (selectedLanguages.length < 2) return { concepts: [] };

      const response = await apiClient.get('/comparative/grammar/concepts', {
        params: { languages: selectedLanguages.join(',') },
      });
      return response.data;
    },
    enabled: selectedLanguages.length >= 2,
  });

  // Fetch detailed comparison
  const { data: comparisonData, isLoading } = useQuery({
    queryKey: ['comparative-grammar', selectedConcept, selectedLanguages],
    queryFn: async () => {
      const response = await apiClient.get('/comparative/grammar/compare', {
        params: {
          conceptKey: selectedConcept,
          languages: selectedLanguages.join(','),
        },
      });
      return response.data;
    },
    enabled: !!selectedConcept && selectedLanguages.length >= 2,
  });

  const comparison: GrammarComparison | null = comparisonData?.comparison || null;

  const handleLanguageToggle = (language: string) => {
    setSelectedLanguages((prev) => {
      if (prev.includes(language)) {
        return prev.filter((l) => l !== language);
      } else if (prev.length < 3) {
        return [...prev, language];
      }
      return prev;
    });
    setSelectedConcept(''); // Reset concept when languages change
  };

  // Synchronized scrolling
  const handleScroll = (sourceLanguage: string) => {
    const sourceRef = scrollRefs.current[sourceLanguage];
    if (!sourceRef) return;

    const scrollPercentage =
      sourceRef.scrollTop / (sourceRef.scrollHeight - sourceRef.clientHeight);

    Object.keys(scrollRefs.current).forEach((lang) => {
      if (lang !== sourceLanguage && scrollRefs.current[lang]) {
        const targetRef = scrollRefs.current[lang]!;
        targetRef.scrollTop = scrollPercentage * (targetRef.scrollHeight - targetRef.clientHeight);
      }
    });
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-2xl font-bold mb-2">Comparative Grammar</h2>
        <p className="text-gray-600">
          Compare grammar concepts across languages you're studying to identify patterns and avoid
          interference.
        </p>
      </div>

      {/* Language Selector */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4">Select Languages to Compare (2-3)</h3>
        <div className="flex flex-wrap gap-3">
          {availableLanguages.map((language) => {
            const isSelected = selectedLanguages.includes(language);
            const isDisabled = !isSelected && selectedLanguages.length >= 3;

            return (
              <button
                key={language}
                onClick={() => handleLanguageToggle(language)}
                disabled={isDisabled}
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : isDisabled
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {LANGUAGE_NAMES[language]}
                {isSelected && ' ✓'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Concept Selector */}
      {selectedLanguages.length >= 2 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">Select Grammar Concept</h3>
          {conceptsData && conceptsData.concepts.length > 0 ? (
            <select
              value={selectedConcept}
              onChange={(e) => setSelectedConcept(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            >
              <option value="">-- Choose a concept --</option>
              {conceptsData.concepts.map((concept: any) => (
                <option key={concept.conceptKey} value={concept.conceptKey}>
                  {concept.conceptName} ({concept.languageCount} languages)
                </option>
              ))}
            </select>
          ) : (
            <div className="text-gray-600">
              No comparable grammar concepts found for these languages yet.
            </div>
          )}
        </div>
      )}

      {/* Comparison Display */}
      {isLoading && (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center text-gray-600">
          Loading comparison...
        </div>
      )}

      {comparison && (
        <div className="space-y-6">
          {/* Similarities */}
          {comparison.similarities.length > 0 && (
            <div className="bg-green-50 border-l-4 border-green-400 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-green-900 mb-3">✓ Similarities</h3>
              <ul className="space-y-2">
                {comparison.similarities.map((similarity, idx) => (
                  <li key={idx} className="text-green-800">
                    • {similarity}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Differences */}
          {comparison.differences.length > 0 && (
            <div className="bg-orange-50 border-l-4 border-orange-400 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-orange-900 mb-3">⚠️ Differences</h3>
              <div className="space-y-4">
                {comparison.differences.map((diff, idx) => (
                  <div key={idx}>
                    <div className="font-semibold text-orange-900 mb-2">{diff.aspect}:</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {diff.descriptions.map((desc, descIdx) => (
                        <div
                          key={descIdx}
                          className="bg-white p-3 rounded border border-orange-200"
                        >
                          <div className="font-medium text-gray-900 mb-1">
                            {LANGUAGE_NAMES[desc.language]}
                          </div>
                          <div className="text-sm text-gray-700">{desc.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cross-Linguistic Insights */}
          {comparison.crossLinguisticInsights.length > 0 && (
            <div className="bg-blue-50 border-l-4 border-blue-400 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-blue-900 mb-3">💡 Learning Insights</h3>
              <div className="space-y-2">
                {comparison.crossLinguisticInsights.map((insight, idx) => (
                  <div key={idx} className="text-blue-800">
                    {insight}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Side-by-Side Grammar Details */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-xl font-bold mb-6">
              {comparison.conceptName} - Detailed Comparison
            </h3>

            <div className={`grid grid-cols-1 md:grid-cols-${comparison.languages.length} gap-6`}>
              {comparison.languages.map((langData, idx) => (
                <div
                  key={langData.language}
                  className="border-2 border-gray-200 rounded-lg p-4 space-y-4"
                  style={{ minHeight: '400px' }}
                >
                  {/* Language Header */}
                  <div className="bg-blue-600 text-white px-4 py-2 rounded font-bold text-center">
                    {LANGUAGE_NAMES[langData.language]}
                  </div>

                  {/* Scrollable Content */}
                  <div
                    ref={(el) => (scrollRefs.current[langData.language] = el)}
                    onScroll={() => handleScroll(langData.language)}
                    className="overflow-y-auto"
                    style={{ maxHeight: '600px' }}
                  >
                    {/* Rule Name */}
                    <h4 className="font-semibold text-lg mb-2">{langData.ruleName}</h4>

                    {/* Explanation */}
                    <div className="text-gray-700 mb-4">{langData.explanation}</div>

                    {/* Conjugation Table */}
                    {langData.conjugationTable && (
                      <div className="mb-4 overflow-x-auto">
                        <table className="min-w-full border border-gray-300">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="border border-gray-300 px-2 py-1"></th>
                              {langData.conjugationTable.headers.map((header, hIdx) => (
                                <th key={hIdx} className="border border-gray-300 px-2 py-1 text-sm">
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {langData.conjugationTable.rows.map((row, rIdx) => (
                              <tr key={rIdx}>
                                <td className="border border-gray-300 px-2 py-1 font-medium text-sm">
                                  {row.label}
                                </td>
                                {row.cells.map((cell, cIdx) => (
                                  <td
                                    key={cIdx}
                                    className="border border-gray-300 px-2 py-1 text-sm"
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Examples */}
                    <div className="space-y-3">
                      <h5 className="font-semibold text-sm text-gray-600">Examples:</h5>
                      {langData.examples.map((example, exIdx) => (
                        <div key={exIdx} className="bg-gray-50 p-3 rounded">
                          <div className="font-medium text-gray-900">{example.sentence}</div>
                          <div className="text-sm text-gray-600 mt-1">→ {example.translation}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
```

**Integration**: Add route in `packages/web/src/App.tsx`:

```tsx
import { ComparativeGrammar } from './components/comparative/ComparativeGrammar';

// In route configuration:
<Route
  path="/comparative/grammar"
  element={<ComparativeGrammar availableLanguages={userLanguages} />}
/>;
```

**Open Questions**:

1. **Print/Export Functionality**: Should users be able to export comparisons as PDF for offline study?
   - Would require PDF generation library (e.g., jsPDF)
   - Recommendation: Add in future iteration if users request

2. **Comparison Sharing**: Should users be able to share comparison links with other learners?
   - Useful for study groups
   - Privacy concerns (reveals which languages user studies)
   - Recommendation: Add optional share feature with privacy controls

3. **Interactive Exercises**: Should we add practice exercises that leverage the comparison (e.g., "Translate this Russian sentence pattern to Arabic")?
   - High value for learning
   - Significant development effort
   - Recommendation: Separate feature (F049 could extend this)

---

## Dependencies

- **Blocks**: None
- **Depends on**:
  - F001 (Database Schema) - `approved_grammar_rules`, `grammar_conjugation_tables`
  - F037 (Grammar Lesson Structure) - Grammar rules and conjugation tables
  - F018 (API Infrastructure) - Fastify setup, authentication
  - F022 (React Setup) - React 18, TanStack Query, Tailwind CSS

---

## Notes

### Concept Matching Strategy

- Grammar rules must have `metadata.concept_key` to enable comparison
- Common concept keys should follow consistent naming:
  - Tense: `present_tense`, `past_tense`, `future_tense`
  - Mood: `indicative`, `subjunctive`, `imperative`
  - Case: `nominative`, `accusative`, `genitive`, etc.
  - Number: `singular`, `plural`, `dual`
  - Gender: `masculine`, `feminine`, `neuter`

### Visual Design Principles

- **Green highlighting**: Universal similarities (positive transfer)
- **Orange highlighting**: Important differences (potential interference)
- **Blue highlighting**: Cross-linguistic insights (actionable tips)
- **Side-by-side layout**: Enables direct visual comparison
- **Synchronized scrolling**: Keep related content aligned

### Cognitive Load Management

- Limit to 2-3 languages maximum to avoid overwhelming users
- Present similarities before differences (positive framing)
- Provide actionable insights, not just data
- Use visual cues (colors, icons) to guide attention

### Metadata Requirements for Operators

When creating grammar rules, operators should include:

```json
{
  "concept_key": "past_tense",
  "concept_name": "Past Tense",
  "formation_method": "suffix",
  "has_irregular_forms": true,
  "uses_auxiliary": false,
  "complexity": "medium"
}
```

### Future Enhancements (Out of Scope)

- **Automated Concept Mapping**: Use NLP to suggest concept mappings
- **Visualizations**: Graphs showing language similarity clusters
- **Historical Linguistics**: Show etymology and language family relationships
- **Typological Insights**: Compare language typology (analytic vs synthetic, etc.)
- **Community Annotations**: Allow users to add their own insights
- **Quiz Mode**: Test knowledge of cross-linguistic patterns

---

## Open Questions

### 1. Grammar Concept Matching Algorithm

**Question**: How should the system match equivalent grammar concepts across languages - manual tagging by operators, automated NLP analysis, or crowdsourced mapping?

**Current Approach**: Manual concept tagging using `metadata.concept_key` field in `approved_grammar_rules`. Operators assign standardized keys (e.g., "past_tense", "nominative_case") when creating grammar rules. System matches rules across languages by identical `concept_key` values.

**Alternatives**:

1. **Manual tagging only** (current): Operators assign concept keys when creating grammar content. High quality but labor-intensive, requires linguistic expertise, and may have gaps in coverage.
2. **Automated NLP matching**: Use multilingual language models (mBERT, XLM-RoBerta) to compute semantic similarity between grammar rule descriptions and auto-suggest matches. Fast but may produce false positives.
3. **Taxonomy-based mapping**: Use existing linguistic typology databases (WALS - World Atlas of Language Structures, GRAMBANK) to pre-populate concept mappings for common language pairs. Comprehensive but requires integration with external databases.
4. **Crowdsourced validation**: Allow advanced users or linguist contributors to suggest concept mappings, with voting/moderation system. Scales well but requires quality control.
5. **Hybrid approach**: Operators manually tag core concepts, NLP suggests additional mappings for review, community can flag incorrect matches.

**Recommendation**: Implement **hybrid approach** (Option 5) with staged rollout. Phase 1: Manual tagging by operators for high-priority concepts (tenses, cases, moods - ~50 common concepts). Phase 2: Use mBERT embeddings to compute similarity between untag ged grammar rules and suggest potential matches (similarity > 0.85 threshold). Operators review suggestions and approve/reject. Phase 3: Add community flagging - users can report incorrect mappings. Store mapping confidence scores in `grammar_concept_mappings` table: `{concept_key, language_a, language_b, match_confidence, mapping_source}`. This balances quality with scalability.

---

### 2. Language Pair Prioritization and Display Order

**Question**: When a user studies N languages (N > 2), which language pairs should be compared, and in what order should they be displayed?

**Current Approach**: Comparison triggered when user viewing grammar lesson for language A can compare with any other studied language. UI allows selecting comparison language from dropdown. No prioritization logic - all studied languages equally available.

**Alternatives**:

1. **User chooses freely** (current): Dropdown shows all studied languages, user manually selects which to compare. Maximum flexibility but no intelligent suggestions.
2. **Same language family first**: Prioritize comparisons within language families (e.g., if studying Russian + Arabic + Spanish, suggest Russian-Spanish first as both Indo-European). Leverages linguistic similarity.
3. **CEFR level similarity**: Compare languages at similar proficiency levels. If user is B1 in Russian and A2 in Chinese, suggest comparing those rather than Russian vs C1 English.
4. **Interference patterns**: Prioritize comparing languages that user historically confuses (detected by F050 interference detection). Most pedagogically relevant.
5. **Curriculum graph proximity**: Compare concepts that appear at similar points in curriculum graph. Temporal alignment in learning journey.

**Recommendation**: Implement **intelligent prioritization** combining multiple signals (Options 2-5). In comparison language dropdown, sort by composite score:

- **Weight 40%**: Interference score (from F050 - languages user actually confuses)
- **Weight 30%**: CEFR proximity (closer levels = more comparable learning stage)
- **Weight 20%**: Language family similarity (same family = easier to find patterns)
- **Weight 10%**: Curriculum proximity (learning similar concepts concurrently)

Display top 3 suggested comparisons with reasoning badges: "🔥 Common confusion", "📊 Similar level (B1)", "🌍 Same family". User can still select any language. Store comparison choices analytics to validate if suggestions improve engagement.

---

### 3. Presentation Format: Side-by-Side vs Sequential

**Question**: Should comparative grammar be presented side-by-side (columns) or sequentially (tabs/toggle), especially on mobile devices?

**Current Approach**: Side-by-side column layout with synchronized scrolling. Language A in left column, Language B in right column. Works well on desktop (>1024px width) but may be cramped on mobile.

**Alternatives**:

1. **Side-by-side always** (current): Desktop and mobile both use columns, mobile gets horizontal scroll or very narrow columns. Consistent but poor mobile UX.
2. **Responsive toggle**: Desktop uses side-by-side, mobile uses tab-based toggle ("Language A" / "Language B" tabs). Adaptive but loses direct comparison on mobile.
3. **Accordion**: Desktop side-by-side, mobile uses expandable accordions (tap to expand Language B section below Language A). Preserves context but requires more scrolling.
4. **Swipeable cards**: Mobile uses swipeable cards (swipe left/right to switch languages), desktop uses side-by-side. Modern UX but may be unintuitive.
5. **Picture-in-picture**: Desktop side-by-side, mobile shows primary language fullscreen with floating comparison bubble that expands on tap. Innovative but complex.

**Recommendation**: Implement **responsive toggle with comparison highlights** (Option 2 enhanced). Desktop (>768px): Side-by-side columns with synchronized scrolling. Mobile/Tablet (<768px): Tab interface with **persistent comparison indicators**. When viewing Language A tab, show inline badges next to relevant grammar points: "✓ Similar in Russian", "⚠ Different in Russian". Tap badge to switch to Language B tab with that section highlighted. This preserves mobile usability while maintaining cross-linguistic awareness. Add "Compare side-by-side" button on mobile that opens modal with horizontal scrollable columns for users who want direct comparison. Track tab-switching patterns to measure engagement with comparative features on mobile.
