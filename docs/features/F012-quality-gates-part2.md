# F012: Quality Gates Implementation (Part 2)

**Feature Code**: F012
**Created**: 2025-12-17
**Phase**: 3 - Quality Assurance System
**Status**: ✅ Completed
**Completed**: 2025-12-19
**PR**: #15

---

## Description

The second set of quality gates focuses on pedagogical correctness and content appropriateness. These gates validate CEFR level consistency (ensuring vocabulary/grammar matches claimed difficulty), prerequisite dependency validation (preventing circular dependencies and missing prerequisites), and content safety filtering (blocking profanity, violence, and inappropriate material). These gates work alongside Part 1 gates to ensure all approved content meets educational standards.

## Success Criteria

- [x] CEFR level consistency checker validates vocabulary frequency and grammar complexity
- [x] Prerequisite dependency validation prevents circular dependencies and orphaned content
- [x] Content safety filter blocks profanity, violence, and inappropriate content
- [ ] All gates integrated into validation pipeline with proper retry logic (→ F017)
- [x] Gates fail gracefully with detailed error messages for operators
- [ ] Performance optimized for batch validation (100+ items/minute) (→ F017)

---

## Tasks

### Task 1: CEFR Level Consistency Gate

**File**: `packages/api/src/services/quality-gates/cefr-consistency-gate.ts`

Create gate to validate that content matches its claimed CEFR level.

**Implementation Plan**:

```typescript
import { QualityGate, QualityGateResult } from './quality-gate.interface';
import { Pool } from 'pg';

interface CEFRFrequencyData {
  level: string;
  minFrequencyRank: number;
  maxFrequencyRank: number;
  maxWordLength: number;
}

// Based on CEFR guidelines and frequency data
const CEFR_VOCABULARY_CRITERIA: Record<string, CEFRFrequencyData> = {
  A0: { level: 'A0', minFrequencyRank: 1, maxFrequencyRank: 100, maxWordLength: 8 },
  A1: { level: 'A1', minFrequencyRank: 1, maxFrequencyRank: 1000, maxWordLength: 10 },
  A2: { level: 'A2', minFrequencyRank: 1, maxFrequencyRank: 3000, maxWordLength: 12 },
  B1: { level: 'B1', minFrequencyRank: 1, maxFrequencyRank: 5000, maxWordLength: 15 },
  B2: { level: 'B2', minFrequencyRank: 1, maxFrequencyRank: 8000, maxWordLength: 18 },
  C1: { level: 'C1', minFrequencyRank: 1, maxFrequencyRank: 15000, maxWordLength: 25 },
  C2: { level: 'C2', minFrequencyRank: 1, maxFrequencyRank: 50000, maxWordLength: 50 },
};

export class CEFRConsistencyGate implements QualityGate {
  name = 'cefr-level-check';

  constructor(private readonly pool: Pool) {}

  async validate(entityType: string, entityId: string): Promise<QualityGateResult> {
    try {
      if (entityType === 'vocabulary') {
        return await this.validateVocabulary(entityId);
      } else if (entityType === 'grammar') {
        return await this.validateGrammar(entityId);
      } else if (entityType === 'orthography') {
        // Orthography is always A0
        return { passed: true, gateName: this.name };
      } else if (entityType === 'curriculum') {
        return await this.validateCurriculum(entityId);
      }

      return {
        passed: false,
        gateName: this.name,
        errorMessage: `Unknown entity type: ${entityType}`,
      };
    } catch (error) {
      return {
        passed: false,
        gateName: this.name,
        errorMessage: `CEFR validation error: ${error.message}`,
        metadata: { error: error.stack },
      };
    }
  }

  private async validateVocabulary(vocabularyId: string): Promise<QualityGateResult> {
    // Get vocabulary item
    const result = await this.pool.query(
      `SELECT word_text, cefr_level, language, part_of_speech, frequency_rank
       FROM candidate_vocabulary
       WHERE id = $1`,
      [vocabularyId]
    );

    if (result.rows.length === 0) {
      return {
        passed: false,
        gateName: this.name,
        errorMessage: 'Vocabulary item not found',
      };
    }

    const vocab = result.rows[0];
    const criteria = CEFR_VOCABULARY_CRITERIA[vocab.cefr_level];

    if (!criteria) {
      return {
        passed: false,
        gateName: this.name,
        errorMessage: `Invalid CEFR level: ${vocab.cefr_level}`,
      };
    }

    const errors: string[] = [];

    // Check word length
    if (vocab.word_text.length > criteria.maxWordLength) {
      errors.push(
        `Word too long for ${vocab.cefr_level} (${vocab.word_text.length} chars, max ${criteria.maxWordLength})`
      );
    }

    // Check frequency rank (if available)
    if (vocab.frequency_rank) {
      if (vocab.frequency_rank > criteria.maxFrequencyRank) {
        errors.push(
          `Word too rare for ${vocab.cefr_level} (rank ${vocab.frequency_rank}, max ${criteria.maxFrequencyRank})`
        );
      }
    }

    // Check for complex morphology at low levels
    if (['A0', 'A1'].includes(vocab.cefr_level)) {
      // Avoid compound words, technical terms, etc. at low levels
      const wordComplexityPatterns = [
        /[A-Z]{2,}/, // Acronyms
        /\d{3,}/, // Large numbers
        /[^\w\s\-']{2,}/, // Multiple special characters
      ];

      for (const pattern of wordComplexityPatterns) {
        if (pattern.test(vocab.word_text)) {
          errors.push(`Word contains complex patterns not suitable for ${vocab.cefr_level}`);
          break;
        }
      }
    }

    if (errors.length > 0) {
      return {
        passed: false,
        gateName: this.name,
        errorMessage: errors.join('; '),
        metadata: {
          wordText: vocab.word_text,
          claimedLevel: vocab.cefr_level,
          criteria,
        },
      };
    }

    return { passed: true, gateName: this.name };
  }

  private async validateGrammar(grammarId: string): Promise<QualityGateResult> {
    // Get grammar lesson
    const result = await this.pool.query(
      `SELECT topic, cefr_level, explanation, example_sentences
       FROM candidate_grammar_lessons
       WHERE id = $1`,
      [grammarId]
    );

    if (result.rows.length === 0) {
      return {
        passed: false,
        gateName: this.name,
        errorMessage: 'Grammar lesson not found',
      };
    }

    const grammar = result.rows[0];
    const errors: string[] = [];

    // Grammar complexity by level
    const grammarComplexity: Record<string, string[]> = {
      A1: ['present tense', 'articles', 'basic pronouns', 'simple questions'],
      A2: ['past tense', 'future tense', 'comparatives', 'modal verbs'],
      B1: ['perfect tenses', 'conditional', 'passive voice', 'reported speech'],
      B2: ['subjunctive', 'complex conditionals', 'advanced passive', 'inversion'],
      C1: ['advanced subjunctive', 'cleft sentences', 'discourse markers'],
      C2: ['nuanced expressions', 'stylistic variations', 'register shifts'],
    };

    // Check if topic complexity matches level
    const topicLower = grammar.topic.toLowerCase();
    const expectedTopics = grammarComplexity[grammar.cefr_level] || [];

    // Very basic check - could be enhanced with NLP
    const containsExpectedConcept = expectedTopics.some((concept) =>
      topicLower.includes(concept.toLowerCase())
    );

    // Advanced topics appearing at low levels
    const advancedConcepts = ['subjunctive', 'conditional perfect', 'passive infinitive'];
    if (['A1', 'A2', 'B1'].includes(grammar.cefr_level)) {
      const containsAdvancedConcept = advancedConcepts.some((concept) =>
        topicLower.includes(concept.toLowerCase())
      );

      if (containsAdvancedConcept) {
        errors.push(`Topic contains advanced concepts not suitable for ${grammar.cefr_level}`);
      }
    }

    // Check explanation complexity (sentence count, word count)
    if (grammar.explanation) {
      const sentences = grammar.explanation.split(/[.!?]+/).filter((s) => s.trim().length > 0);
      const words = grammar.explanation.split(/\s+/).length;

      const maxExplanationLength: Record<string, { maxSentences: number; maxWords: number }> = {
        A1: { maxSentences: 3, maxWords: 50 },
        A2: { maxSentences: 5, maxWords: 100 },
        B1: { maxSentences: 8, maxWords: 150 },
        B2: { maxSentences: 12, maxWords: 250 },
        C1: { maxSentences: 20, maxWords: 400 },
        C2: { maxSentences: 30, maxWords: 600 },
      };

      const limits = maxExplanationLength[grammar.cefr_level];
      if (limits) {
        if (sentences.length > limits.maxSentences) {
          errors.push(
            `Explanation too complex for ${grammar.cefr_level} (${sentences.length} sentences, max ${limits.maxSentences})`
          );
        }
        if (words > limits.maxWords) {
          errors.push(
            `Explanation too long for ${grammar.cefr_level} (${words} words, max ${limits.maxWords})`
          );
        }
      }
    }

    if (errors.length > 0) {
      return {
        passed: false,
        gateName: this.name,
        errorMessage: errors.join('; '),
        metadata: {
          topic: grammar.topic,
          claimedLevel: grammar.cefr_level,
        },
      };
    }

    return { passed: true, gateName: this.name };
  }

  private async validateCurriculum(curriculumId: string): Promise<QualityGateResult> {
    // Get curriculum lesson
    const result = await this.pool.query(
      `SELECT lesson_name, cefr_level, prerequisites
       FROM candidate_curriculum_lessons
       WHERE id = $1`,
      [curriculumId]
    );

    if (result.rows.length === 0) {
      return {
        passed: false,
        gateName: this.name,
        errorMessage: 'Curriculum lesson not found',
      };
    }

    const curriculum = result.rows[0];

    // Verify all prerequisites have CEFR level <= current level
    if (curriculum.prerequisites && curriculum.prerequisites.length > 0) {
      const prerequisitesResult = await this.pool.query(
        `SELECT id, cefr_level
         FROM approved_curriculum_lessons
         WHERE id = ANY($1)`,
        [curriculum.prerequisites]
      );

      const currentLevelRank = this.getCEFRRank(curriculum.cefr_level);

      for (const prereq of prerequisitesResult.rows) {
        const prereqRank = this.getCEFRRank(prereq.cefr_level);

        if (prereqRank > currentLevelRank) {
          return {
            passed: false,
            gateName: this.name,
            errorMessage: `Prerequisite ${prereq.id} has higher CEFR level (${prereq.cefr_level}) than lesson (${curriculum.cefr_level})`,
            metadata: {
              prerequisite: prereq.id,
              prerequisiteLevel: prereq.cefr_level,
              lessonLevel: curriculum.cefr_level,
            },
          };
        }
      }
    }

    return { passed: true, gateName: this.name };
  }

  private getCEFRRank(level: string): number {
    const ranks: Record<string, number> = {
      A0: 0,
      A1: 1,
      A2: 2,
      B1: 3,
      B2: 4,
      C1: 5,
      C2: 6,
    };
    return ranks[level] ?? 999;
  }
}
```

**Dependencies**: PostgreSQL pool, QualityGate interface (F010)

---

### Task 2: Prerequisite Dependency Validation Gate

**File**: `packages/api/src/services/quality-gates/prerequisite-gate.ts`

Create gate to validate prerequisite relationships and prevent circular dependencies.

**Implementation Plan**:

```typescript
import { QualityGate, QualityGateResult } from './quality-gate.interface';
import { Pool } from 'pg';

export class PrerequisiteValidationGate implements QualityGate {
  name = 'dependency-validation';

  constructor(private readonly pool: Pool) {}

  async validate(entityType: string, entityId: string): Promise<QualityGateResult> {
    try {
      // Only curriculum and grammar lessons have prerequisites
      if (entityType === 'curriculum') {
        return await this.validateCurriculumPrerequisites(entityId);
      } else if (entityType === 'grammar') {
        return await this.validateGrammarPrerequisites(entityId);
      }

      // Other entity types don't have prerequisites
      return { passed: true, gateName: this.name };
    } catch (error) {
      return {
        passed: false,
        gateName: this.name,
        errorMessage: `Prerequisite validation error: ${error.message}`,
        metadata: { error: error.stack },
      };
    }
  }

  private async validateCurriculumPrerequisites(curriculumId: string): Promise<QualityGateResult> {
    // Get curriculum lesson
    const result = await this.pool.query(
      `SELECT id, lesson_name, prerequisites, language
       FROM candidate_curriculum_lessons
       WHERE id = $1`,
      [curriculumId]
    );

    if (result.rows.length === 0) {
      return {
        passed: false,
        gateName: this.name,
        errorMessage: 'Curriculum lesson not found',
      };
    }

    const lesson = result.rows[0];
    const prerequisites = lesson.prerequisites || [];

    if (prerequisites.length === 0) {
      // No prerequisites - always valid
      return { passed: true, gateName: this.name };
    }

    const errors: string[] = [];

    // 1. Check all prerequisites exist in approved curriculum
    const existingPrereqsResult = await this.pool.query(
      `SELECT id FROM approved_curriculum_lessons WHERE id = ANY($1)`,
      [prerequisites]
    );

    const existingIds = new Set(existingPrereqsResult.rows.map((row) => row.id));
    const missingIds = prerequisites.filter((id: string) => !existingIds.has(id));

    if (missingIds.length > 0) {
      errors.push(`Missing prerequisites: ${missingIds.join(', ')}`);
    }

    // 2. Check for self-reference
    if (prerequisites.includes(curriculumId)) {
      errors.push('Lesson cannot be its own prerequisite');
    }

    // 3. Check for circular dependencies
    const circularCheck = await this.detectCircularDependency(
      curriculumId,
      prerequisites,
      'curriculum'
    );

    if (circularCheck) {
      errors.push(`Circular dependency detected: ${circularCheck}`);
    }

    // 4. Verify same language
    if (existingIds.size > 0) {
      const langCheckResult = await this.pool.query(
        `SELECT id, language
         FROM approved_curriculum_lessons
         WHERE id = ANY($1) AND language != $2`,
        [prerequisites, lesson.language]
      );

      if (langCheckResult.rows.length > 0) {
        const wrongLangIds = langCheckResult.rows.map((r) => `${r.id} (${r.language})`);
        errors.push(`Prerequisites from different language: ${wrongLangIds.join(', ')}`);
      }
    }

    if (errors.length > 0) {
      return {
        passed: false,
        gateName: this.name,
        errorMessage: errors.join('; '),
        metadata: {
          lessonId: curriculumId,
          prerequisites,
          missingIds,
        },
      };
    }

    return { passed: true, gateName: this.name };
  }

  private async validateGrammarPrerequisites(grammarId: string): Promise<QualityGateResult> {
    // Get grammar lesson
    const result = await this.pool.query(
      `SELECT id, topic, prerequisite_grammar_ids, language
       FROM candidate_grammar_lessons
       WHERE id = $1`,
      [grammarId]
    );

    if (result.rows.length === 0) {
      return {
        passed: false,
        gateName: this.name,
        errorMessage: 'Grammar lesson not found',
      };
    }

    const lesson = result.rows[0];
    const prerequisites = lesson.prerequisite_grammar_ids || [];

    if (prerequisites.length === 0) {
      return { passed: true, gateName: this.name };
    }

    const errors: string[] = [];

    // Check all prerequisites exist
    const existingPrereqsResult = await this.pool.query(
      `SELECT id FROM approved_grammar_lessons WHERE id = ANY($1)`,
      [prerequisites]
    );

    const existingIds = new Set(existingPrereqsResult.rows.map((row) => row.id));
    const missingIds = prerequisites.filter((id: string) => !existingIds.has(id));

    if (missingIds.length > 0) {
      errors.push(`Missing grammar prerequisites: ${missingIds.join(', ')}`);
    }

    // Check for self-reference
    if (prerequisites.includes(grammarId)) {
      errors.push('Grammar lesson cannot be its own prerequisite');
    }

    // Check for circular dependencies
    const circularCheck = await this.detectCircularDependency(grammarId, prerequisites, 'grammar');

    if (circularCheck) {
      errors.push(`Circular dependency in grammar: ${circularCheck}`);
    }

    if (errors.length > 0) {
      return {
        passed: false,
        gateName: this.name,
        errorMessage: errors.join('; '),
        metadata: {
          grammarId,
          prerequisites,
          missingIds,
        },
      };
    }

    return { passed: true, gateName: this.name };
  }

  /**
   * Detect circular dependencies using depth-first search
   */
  private async detectCircularDependency(
    itemId: string,
    directPrereqs: string[],
    type: 'curriculum' | 'grammar'
  ): Promise<string | null> {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const table =
      type === 'curriculum' ? 'approved_curriculum_lessons' : 'approved_grammar_lessons';

    const prereqColumn = type === 'curriculum' ? 'prerequisites' : 'prerequisite_grammar_ids';

    const dfs = async (currentId: string, path: string[]): Promise<string | null> => {
      if (recursionStack.has(currentId)) {
        // Found a cycle
        return [...path, currentId].join(' -> ');
      }

      if (visited.has(currentId)) {
        // Already explored this branch
        return null;
      }

      visited.add(currentId);
      recursionStack.add(currentId);

      // Get prerequisites of current item
      const result = await this.pool.query(`SELECT ${prereqColumn} FROM ${table} WHERE id = $1`, [
        currentId,
      ]);

      if (result.rows.length > 0) {
        const prereqs = result.rows[0][prereqColumn] || [];

        for (const prereqId of prereqs) {
          const cycle = await dfs(prereqId, [...path, currentId]);
          if (cycle) {
            return cycle;
          }
        }
      }

      recursionStack.delete(currentId);
      return null;
    };

    // Check each direct prerequisite
    for (const prereqId of directPrereqs) {
      const cycle = await dfs(prereqId, [itemId]);
      if (cycle) {
        return cycle;
      }
    }

    return null;
  }
}
```

**Dependencies**: PostgreSQL pool, QualityGate interface (F010)

---

### Task 3: Content Safety Gate

**File**: `packages/api/src/services/quality-gates/content-safety-gate.ts`

Create gate to filter profanity, violence, and inappropriate content.

**Implementation Plan**:

```typescript
import { QualityGate, QualityGateResult } from './quality-gate.interface';
import { Pool } from 'pg';

// Profanity word lists (example - would need comprehensive lists per language)
const PROFANITY_PATTERNS_EN = [
  /\bf+u+c+k+/i,
  /\bs+h+i+t+/i,
  /\bb+i+t+c+h+/i,
  /\ba+s+s+h+o+l+e+/i,
  // Add more patterns
];

const VIOLENCE_PATTERNS = [
  /\b(kill|murder|attack|stab|shoot|rape)\s+(someone|people|person)/i,
  /\b(graphic|explicit)\s+(violence|gore|blood)/i,
  /\b(torture|mutilate|dismember)/i,
];

const INAPPROPRIATE_PATTERNS = [
  /\b(sexual|explicit|pornographic)\s+(content|material)/i,
  /\b(drug\s+use|substance\s+abuse)/i,
  /\b(hate\s+speech|racial\s+slur)/i,
];

export class ContentSafetyGate implements QualityGate {
  name = 'content-safety';

  constructor(private readonly pool: Pool) {}

  async validate(entityType: string, entityId: string): Promise<QualityGateResult> {
    try {
      if (entityType === 'vocabulary') {
        return await this.validateVocabulary(entityId);
      } else if (entityType === 'grammar') {
        return await this.validateGrammar(entityId);
      } else if (entityType === 'curriculum') {
        return await this.validateCurriculum(entityId);
      }

      // Orthography is usually safe (just letters)
      return { passed: true, gateName: this.name };
    } catch (error) {
      return {
        passed: false,
        gateName: this.name,
        errorMessage: `Content safety check error: ${error.message}`,
        metadata: { error: error.stack },
      };
    }
  }

  private async validateVocabulary(vocabularyId: string): Promise<QualityGateResult> {
    const result = await this.pool.query(
      `SELECT word_text, translation, example_sentence, notes
       FROM candidate_vocabulary
       WHERE id = $1`,
      [vocabularyId]
    );

    if (result.rows.length === 0) {
      return {
        passed: false,
        gateName: this.name,
        errorMessage: 'Vocabulary item not found',
      };
    }

    const vocab = result.rows[0];
    const textsToCheck = [
      vocab.word_text,
      vocab.translation,
      vocab.example_sentence,
      vocab.notes,
    ].filter(Boolean);

    const safetyIssues = this.checkTextSafety(textsToCheck.join(' '));

    if (safetyIssues.length > 0) {
      return {
        passed: false,
        gateName: this.name,
        errorMessage: `Content safety violations: ${safetyIssues.join(', ')}`,
        metadata: {
          wordText: vocab.word_text,
          violations: safetyIssues,
        },
      };
    }

    return { passed: true, gateName: this.name };
  }

  private async validateGrammar(grammarId: string): Promise<QualityGateResult> {
    const result = await this.pool.query(
      `SELECT topic, explanation, example_sentences
       FROM candidate_grammar_lessons
       WHERE id = $1`,
      [grammarId]
    );

    if (result.rows.length === 0) {
      return {
        passed: false,
        gateName: this.name,
        errorMessage: 'Grammar lesson not found',
      };
    }

    const grammar = result.rows[0];
    const textsToCheck = [
      grammar.topic,
      grammar.explanation,
      ...(grammar.example_sentences || []),
    ].filter(Boolean);

    const safetyIssues = this.checkTextSafety(textsToCheck.join(' '));

    if (safetyIssues.length > 0) {
      return {
        passed: false,
        gateName: this.name,
        errorMessage: `Content safety violations: ${safetyIssues.join(', ')}`,
        metadata: {
          topic: grammar.topic,
          violations: safetyIssues,
        },
      };
    }

    return { passed: true, gateName: this.name };
  }

  private async validateCurriculum(curriculumId: string): Promise<QualityGateResult> {
    const result = await this.pool.query(
      `SELECT lesson_name, description, learning_objectives
       FROM candidate_curriculum_lessons
       WHERE id = $1`,
      [curriculumId]
    );

    if (result.rows.length === 0) {
      return {
        passed: false,
        gateName: this.name,
        errorMessage: 'Curriculum lesson not found',
      };
    }

    const curriculum = result.rows[0];
    const textsToCheck = [
      curriculum.lesson_name,
      curriculum.description,
      ...(curriculum.learning_objectives || []),
    ].filter(Boolean);

    const safetyIssues = this.checkTextSafety(textsToCheck.join(' '));

    if (safetyIssues.length > 0) {
      return {
        passed: false,
        gateName: this.name,
        errorMessage: `Content safety violations: ${safetyIssues.join(', ')}`,
        metadata: {
          lessonName: curriculum.lesson_name,
          violations: safetyIssues,
        },
      };
    }

    return { passed: true, gateName: this.name };
  }

  /**
   * Check text for safety violations
   */
  private checkTextSafety(text: string): string[] {
    const violations: string[] = [];

    // Check profanity
    for (const pattern of PROFANITY_PATTERNS_EN) {
      if (pattern.test(text)) {
        violations.push('profanity');
        break;
      }
    }

    // Check violence
    for (const pattern of VIOLENCE_PATTERNS) {
      if (pattern.test(text)) {
        violations.push('violence');
        break;
      }
    }

    // Check inappropriate content
    for (const pattern of INAPPROPRIATE_PATTERNS) {
      if (pattern.test(text)) {
        violations.push('inappropriate');
        break;
      }
    }

    return violations;
  }
}
```

**Dependencies**: PostgreSQL pool, QualityGate interface (F010)

---

### Task 4: Gate Registration and Integration

**File**: `packages/api/src/services/quality-gates/gate-registry.ts`

Update gate registry to include new gates.

**Implementation Plan**:

```typescript
import { Pool } from 'pg';
import { QualityGate } from './quality-gate.interface';
import { SchemaValidationGate } from './schema-validation-gate';
import { DuplicationCheckGate } from './duplication-check-gate';
import { ContentCompletenessGate } from './content-completeness-gate';
import { CEFRConsistencyGate } from './cefr-consistency-gate';
import { PrerequisiteValidationGate } from './prerequisite-gate';
import { ContentSafetyGate } from './content-safety-gate';

export class QualityGateRegistry {
  private gates: QualityGate[];

  constructor(pool: Pool) {
    this.gates = [
      // Part 1 gates (from F011)
      new SchemaValidationGate(pool),
      new DuplicationCheckGate(pool),
      new ContentCompletenessGate(pool),

      // Part 2 gates (F012)
      new CEFRConsistencyGate(pool),
      new PrerequisiteValidationGate(pool),
      new ContentSafetyGate(pool),
    ];
  }

  getGates(): QualityGate[] {
    return this.gates;
  }

  getGateByName(name: string): QualityGate | undefined {
    return this.gates.find((gate) => gate.name === name);
  }

  /**
   * Run all gates for an entity
   */
  async validateAll(
    entityType: string,
    entityId: string
  ): Promise<{
    passed: boolean;
    results: Array<{ gateName: string; passed: boolean; errorMessage?: string }>;
  }> {
    const results = [];
    let allPassed = true;

    for (const gate of this.gates) {
      const result = await gate.validate(entityType, entityId);
      results.push({
        gateName: result.gateName,
        passed: result.passed,
        errorMessage: result.errorMessage,
      });

      if (!result.passed) {
        allPassed = false;
      }
    }

    return { passed: allPassed, results };
  }
}
```

**Dependencies**: All quality gates (F011, F012)

---

### Task 5: Integration Tests

**File**: `packages/api/src/services/quality-gates/__tests__/gates-integration.test.ts`

Create integration tests for all gates working together.

**Implementation Plan**:

```typescript
import { Pool } from 'pg';
import { QualityGateRegistry } from '../gate-registry';
import { setupTestDatabase, teardownTestDatabase } from '../../../test-helpers/db';

describe('Quality Gates Integration', () => {
  let pool: Pool;
  let gateRegistry: QualityGateRegistry;

  beforeAll(async () => {
    pool = await setupTestDatabase();
    gateRegistry = new QualityGateRegistry(pool);
  });

  afterAll(async () => {
    await teardownTestDatabase(pool);
  });

  describe('Vocabulary Validation', () => {
    it('should pass valid A1 vocabulary through all gates', async () => {
      // Insert test vocabulary
      const result = await pool.query(
        `INSERT INTO candidate_vocabulary
         (word_text, translation, cefr_level, language, part_of_speech, frequency_rank)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        ['hello', 'hola', 'A1', 'es', 'interjection', 5]
      );

      const vocabularyId = result.rows[0].id;

      const validation = await gateRegistry.validateAll('vocabulary', vocabularyId);

      expect(validation.passed).toBe(true);
      expect(validation.results).toHaveLength(6); // All 6 gates
      expect(validation.results.every((r) => r.passed)).toBe(true);
    });

    it('should fail vocabulary with profanity', async () => {
      const result = await pool.query(
        `INSERT INTO candidate_vocabulary
         (word_text, translation, cefr_level, language, part_of_speech)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['badword', 'inappropriate translation with fuck', 'A1', 'es', 'noun']
      );

      const vocabularyId = result.rows[0].id;

      const validation = await gateRegistry.validateAll('vocabulary', vocabularyId);

      expect(validation.passed).toBe(false);

      const safetyResult = validation.results.find((r) => r.gateName === 'content-safety');
      expect(safetyResult?.passed).toBe(false);
      expect(safetyResult?.errorMessage).toContain('profanity');
    });

    it('should fail vocabulary with wrong CEFR level', async () => {
      const result = await pool.query(
        `INSERT INTO candidate_vocabulary
         (word_text, translation, cefr_level, language, part_of_speech, frequency_rank)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        ['antidisestablishmentarianism', 'very long word', 'A1', 'en', 'noun', 50000]
      );

      const vocabularyId = result.rows[0].id;

      const validation = await gateRegistry.validateAll('vocabulary', vocabularyId);

      expect(validation.passed).toBe(false);

      const cefrResult = validation.results.find((r) => r.gateName === 'cefr-level-check');
      expect(cefrResult?.passed).toBe(false);
      expect(cefrResult?.errorMessage).toContain('too long');
    });
  });

  describe('Curriculum Validation', () => {
    it('should fail curriculum with circular dependencies', async () => {
      // Create lesson A that depends on B
      const lessonA = await pool.query(
        `INSERT INTO approved_curriculum_lessons
         (lesson_name, cefr_level, language, prerequisites)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['Lesson A', 'A2', 'es', []]
      );

      const lessonAId = lessonA.rows[0].id;

      // Create lesson B that depends on A (circular)
      const lessonB = await pool.query(
        `INSERT INTO approved_curriculum_lessons
         (lesson_name, cefr_level, language, prerequisites)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['Lesson B', 'A2', 'es', [lessonAId]]
      );

      const lessonBId = lessonB.rows[0].id;

      // Update A to depend on B (creates cycle)
      await pool.query(
        `UPDATE approved_curriculum_lessons
         SET prerequisites = $1
         WHERE id = $2`,
        [[lessonBId], lessonAId]
      );

      // Now try to validate a new lesson C that depends on A
      const lessonC = await pool.query(
        `INSERT INTO candidate_curriculum_lessons
         (lesson_name, cefr_level, language, prerequisites)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['Lesson C', 'A2', 'es', [lessonAId]]
      );

      const lessonCId = lessonC.rows[0].id;

      const validation = await gateRegistry.validateAll('curriculum', lessonCId);

      const prereqResult = validation.results.find((r) => r.gateName === 'dependency-validation');
      expect(prereqResult?.passed).toBe(false);
      expect(prereqResult?.errorMessage).toContain('Circular dependency');
    });

    it('should fail curriculum with higher-level prerequisites', async () => {
      // Create B2 lesson
      const advancedLesson = await pool.query(
        `INSERT INTO approved_curriculum_lessons
         (lesson_name, cefr_level, language, prerequisites)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['Advanced Lesson', 'B2', 'es', []]
      );

      const advancedId = advancedLesson.rows[0].id;

      // Try to create A1 lesson that requires B2 lesson
      const beginnerLesson = await pool.query(
        `INSERT INTO candidate_curriculum_lessons
         (lesson_name, cefr_level, language, prerequisites)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['Beginner Lesson', 'A1', 'es', [advancedId]]
      );

      const beginnerId = beginnerLesson.rows[0].id;

      const validation = await gateRegistry.validateAll('curriculum', beginnerId);

      const cefrResult = validation.results.find((r) => r.gateName === 'cefr-level-check');
      expect(cefrResult?.passed).toBe(false);
      expect(cefrResult?.errorMessage).toContain('higher CEFR level');
    });
  });
});
```

**Dependencies**: Jest, test database setup, all quality gates

---

## Open Questions

### Question 1: CEFR Frequency Data Source

**Context**: CEFR level validation uses word frequency data. Where should this data come from?

**Options**:

1. **Manual frequency lists** per language
   - Pros: Full control, can curate for educational purposes
   - Cons: Labor-intensive, may become outdated
2. **Corpus-based frequency** (e.g., OpenSubtitles, Wikipedia)
   - Pros: Data-driven, comprehensive
   - Cons: May include informal language, slang
3. **Commercial CEFR databases** (e.g., English Vocabulary Profile)
   - Pros: Professionally curated, pedagogically sound
   - Cons: Licensing costs, limited languages

**Decision Needed**: Choose frequency data source for each supported language.

**Temporary Plan**: Use manual frequency lists for MVP (top 1000 words per language). Add corpus data in Phase 2.

---

### Question 2: Content Safety False Positives

**Context**: Pattern-based profanity detection may flag legitimate words (e.g., "assassinate" contains "ass").

**Options**:

1. **Whitelist legitimate words** that match patterns
   - Pros: Prevents false positives
   - Cons: Maintenance overhead, language-specific
2. **Context-aware filtering** using NLP
   - Pros: More accurate, fewer false positives
   - Cons: Complex implementation, requires ML models
3. **Manual review for flagged items**
   - Pros: Human judgment, catches edge cases
   - Cons: Slows down pipeline, operator workload

**Decision Needed**: Choose safety filtering strategy.

**Temporary Plan**: Use pattern matching with manual review (Option 3) for MVP. All flagged items go to operator review queue.

---

### Question 3: Gate Execution Order

**Context**: Should gates run sequentially or in parallel? Does order matter?

**Options**:

1. **Sequential execution** (current approach)
   - Pros: Predictable, can short-circuit on first failure
   - Cons: Slower for items that pass all gates
2. **Parallel execution** (Promise.all)
   - Pros: Faster, better throughput
   - Cons: All gates run even if one fails
3. **Tiered execution** (cheap gates first, expensive gates if passed)
   - Pros: Optimal performance, fail fast
   - Cons: More complex orchestration

**Decision Needed**: Choose gate execution strategy based on performance needs.

**Temporary Plan**: Use sequential execution (Option 1) for MVP. Can optimize to tiered execution in Phase 2.

---

## Dependencies

**Blocks**:

- F013: Quality Gates Part 3 (final gate implementations)
- F017: Automated Promotion Pipeline (uses all gates)

**Depends on**:

- F010: Schema Validation Engine (QualityGate interface)
- F011: Quality Gates Part 1 (schema, duplication, completeness gates)
- F001: Database Schema (tables for validation)

**Optional**:

- Word frequency databases per language
- NLP libraries for context-aware filtering
- Commercial CEFR datasets

---

## Notes

### Implementation Priority

1. Implement CEFR consistency gate (Task 1)
2. Implement prerequisite validation gate (Task 2)
3. Implement content safety gate (Task 3)
4. Update gate registry (Task 4)
5. Write integration tests (Task 5)

### Gate Logic Summary

**CEFR Consistency Gate**:

- Validates word length, frequency rank, and complexity
- Different criteria per CEFR level (A1 vs C2)
- Grammar validation checks explanation complexity
- Curriculum validation ensures prerequisites are lower/equal level

**Prerequisite Validation Gate**:

- Checks all prerequisites exist in approved tables
- Detects circular dependencies via DFS
- Prevents self-referencing
- Validates same-language prerequisites

**Content Safety Gate**:

- Pattern-based profanity detection
- Violence and inappropriate content filtering
- Checks all text fields (word, translation, examples, explanations)
- Language-agnostic patterns (can be extended per language)

### Performance Considerations

- Gate execution is synchronous (awaits each gate)
- Could parallelize for better throughput
- CEFR gate queries can be cached
- Circular dependency detection is O(V+E) worst case

### Security Considerations

- All gates run server-side (never trust client)
- Content safety patterns are comprehensive but not exhaustive
- Operators can manually override gate failures if justified
- All gate results logged for audit trail
