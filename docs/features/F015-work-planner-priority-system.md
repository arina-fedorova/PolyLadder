# F015: Work Planner & Priority System

**Feature Code**: F015
**Created**: 2025-12-17
**Phase**: 4 - Content Refinement Service
**Status**: Not Started

---

## Description

Determines what content to generate next based on database state, gaps in coverage, and priorities (orthography first, then meanings, etc.).

## Success Criteria

- [ ] Priority rules defined (orthography → meanings → utterances → exercises)
- [ ] Gap detection identifies missing content
- [ ] Work queue managed efficiently
- [ ] Avoids duplicate work

---

## Tasks

### Task 1: Define Content Priority Rules

**Description**: Establish clear priority order for content generation.

**Implementation Plan**:

Create `packages/refinement-service/src/services/work-planner.service.ts`:
```typescript
import { Pool } from 'pg';
import { Language, CEFRLevel } from '@polyladder/core';

export enum ContentType {
  ORTHOGRAPHY = 'orthography',
  MEANING = 'meaning',
  UTTERANCE = 'utterance',
  GRAMMAR_RULE = 'grammar',
  EXERCISE = 'exercise',
}

export enum WorkPriority {
  CRITICAL = 1,    // Orthography (blocks everything)
  HIGH = 2,        // Meanings (foundational vocabulary)
  MEDIUM = 3,      // Utterances & Grammar Rules
  LOW = 4,         // Exercises (practice content)
}

interface WorkItem {
  id: string;
  type: ContentType;
  language: Language;
  level: CEFRLevel;
  priority: WorkPriority;
  metadata: Record<string, unknown>;
}

export class WorkPlanner {
  constructor(private readonly pool: Pool) {}

  async getNextWork(): Promise<WorkItem | null> {
    // Priority 1: Check for missing orthography
    const orthographyGap = await this.findOrthographyGaps();
    if (orthographyGap) {
      return {
        id: `ortho_${orthographyGap.language}`,
        type: ContentType.ORTHOGRAPHY,
        language: orthographyGap.language,
        level: CEFRLevel.A0,
        priority: WorkPriority.CRITICAL,
        metadata: orthographyGap,
      };
    }

    // Priority 2: Check for meaning gaps (vocabulary)
    const meaningGap = await this.findMeaningGaps();
    if (meaningGap) {
      return {
        id: `meaning_${meaningGap.language}_${meaningGap.level}`,
        type: ContentType.MEANING,
        language: meaningGap.language,
        level: meaningGap.level,
        priority: WorkPriority.HIGH,
        metadata: meaningGap,
      };
    }

    // Priority 3: Check for utterance gaps (examples for meanings)
    const utteranceGap = await this.findUtteranceGaps();
    if (utteranceGap) {
      return {
        id: `utterance_${utteranceGap.meaningId}`,
        type: ContentType.UTTERANCE,
        language: utteranceGap.language,
        level: utteranceGap.level,
        priority: WorkPriority.MEDIUM,
        metadata: utteranceGap,
      };
    }

    // Priority 4: Check for grammar rule gaps
    const grammarGap = await this.findGrammarGaps();
    if (grammarGap) {
      return {
        id: `grammar_${grammarGap.language}_${grammarGap.category}`,
        type: ContentType.GRAMMAR_RULE,
        language: grammarGap.language,
        level: grammarGap.level,
        priority: WorkPriority.MEDIUM,
        metadata: grammarGap,
      };
    }

    // Priority 5: Check for exercise gaps
    const exerciseGap = await this.findExerciseGaps();
    if (exerciseGap) {
      return {
        id: `exercise_${exerciseGap.language}_${exerciseGap.level}`,
        type: ContentType.EXERCISE,
        language: exerciseGap.language,
        level: exerciseGap.level,
        priority: WorkPriority.LOW,
        metadata: exerciseGap,
      };
    }

    // No gaps found
    return null;
  }

  private async findOrthographyGaps() {
    // Check which languages are missing orthography content
    const result = await this.pool.query(`
      SELECT lang.language
      FROM (
        SELECT unnest(enum_range(NULL::language_enum)) AS language
      ) lang
      LEFT JOIN curriculum_graph cg
        ON cg.language = lang.language AND cg.concept_type = 'orthography'
      WHERE cg.concept_id IS NULL
      LIMIT 1
    `);

    if (result.rows.length > 0) {
      return {
        language: result.rows[0].language as Language,
        reason: 'No orthography content exists for this language',
      };
    }

    return null;
  }

  private async findMeaningGaps() {
    // Find languages/levels with insufficient meaning coverage
    const result = await this.pool.query(`
      SELECT language, level, COUNT(*) as count
      FROM approved_meanings
      GROUP BY language, level
      HAVING COUNT(*) < $1
      ORDER BY level ASC, COUNT(*) ASC
      LIMIT 1
    `, [100]); // Target: 100 meanings per level

    if (result.rows.length > 0) {
      return {
        language: result.rows[0].language as Language,
        level: result.rows[0].level as CEFRLevel,
        currentCount: parseInt(result.rows[0].count),
        targetCount: 100,
      };
    }

    return null;
  }

  private async findUtteranceGaps() {
    // Find meanings that have fewer than 3 utterances
    const result = await this.pool.query(`
      SELECT m.id as meaning_id, m.level, COUNT(u.id) as utterance_count
      FROM approved_meanings m
      LEFT JOIN approved_utterances u ON u.meaning_id = m.id
      GROUP BY m.id, m.level
      HAVING COUNT(u.id) < 3
      ORDER BY m.level ASC, COUNT(u.id) ASC
      LIMIT 1
    `);

    if (result.rows.length > 0) {
      return {
        meaningId: result.rows[0].meaning_id,
        level: result.rows[0].level as CEFRLevel,
        currentUtterances: parseInt(result.rows[0].utterance_count),
        targetUtterances: 3,
      };
    }

    return null;
  }

  private async findGrammarGaps() {
    // Find languages/levels with insufficient grammar coverage
    const result = await this.pool.query(`
      SELECT language, level, COUNT(*) as count
      FROM approved_rules
      GROUP BY language, level
      HAVING COUNT(*) < $1
      ORDER BY level ASC, COUNT(*) ASC
      LIMIT 1
    `, [20]); // Target: 20 grammar rules per level

    if (result.rows.length > 0) {
      return {
        language: result.rows[0].language as Language,
        level: result.rows[0].level as CEFRLevel,
        category: 'general', // TODO: More sophisticated category selection
        currentCount: parseInt(result.rows[0].count),
        targetCount: 20,
      };
    }

    return null;
  }

  private async findExerciseGaps() {
    // Find languages/levels with insufficient exercise coverage
    const result = await this.pool.query(`
      SELECT language, level, COUNT(*) as count
      FROM approved_exercises
      WHERE language = ANY($1)
      GROUP BY language, level
      HAVING COUNT(*) < $2
      ORDER BY level ASC, COUNT(*) ASC
      LIMIT 1
    `, [['EN', 'ES', 'IT', 'PT', 'SL'], 50]); // Target: 50 exercises per level

    if (result.rows.length > 0) {
      return {
        language: result.rows[0].language as Language,
        level: result.rows[0].level as CEFRLevel,
        currentCount: parseInt(result.rows[0].count),
        targetCount: 50,
      };
    }

    return null;
  }
}
```

**Files Created**: `packages/refinement-service/src/services/work-planner.service.ts`

---

### Task 2: Create Gap Analysis Dashboard Query

**Description**: API endpoint for operators to see content gaps.

**Implementation Plan**:

Create `packages/api/src/routes/operational/content-gaps.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { Language, CEFRLevel } from '@polyladder/core';

export const contentGapsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/operational/content-gaps', {
    preHandler: [authMiddleware, requireOperator()],
  }, async (request, reply) => {
    // Get coverage stats for all languages and levels
    const coverage = await fastify.pg.query(`
      SELECT
        lang.language,
        lvl.level,
        COUNT(DISTINCT m.id) as meanings_count,
        COUNT(DISTINCT u.id) as utterances_count,
        COUNT(DISTINCT r.id) as rules_count,
        COUNT(DISTINCT e.id) as exercises_count
      FROM
        (SELECT unnest(enum_range(NULL::language_enum)) AS language) lang
      CROSS JOIN
        (SELECT unnest(enum_range(NULL::cefr_level_enum)) AS level) lvl
      LEFT JOIN approved_meanings m
        ON m.level = lvl.level
      LEFT JOIN approved_utterances u
        ON u.language = lang.language
      LEFT JOIN approved_rules r
        ON r.language = lang.language AND r.level = lvl.level
      LEFT JOIN approved_exercises e
        ON e.language = ANY(ARRAY[lang.language]::language_enum[])
           AND e.level = lvl.level
      GROUP BY lang.language, lvl.level
      ORDER BY lvl.level ASC, lang.language ASC
    `);

    // Calculate gaps
    const gaps = coverage.rows.map(row => {
      const targets = {
        meanings: 100,
        utterances: 300, // 100 meanings * 3 utterances
        rules: 20,
        exercises: 50,
      };

      return {
        language: row.language,
        level: row.level,
        gaps: {
          meanings: Math.max(0, targets.meanings - row.meanings_count),
          utterances: Math.max(0, targets.utterances - row.utterances_count),
          rules: Math.max(0, targets.rules - row.rules_count),
          exercises: Math.max(0, targets.exercises - row.exercises_count),
        },
        coverage: {
          meanings: `${row.meanings_count}/${targets.meanings}`,
          utterances: `${row.utterances_count}/${targets.utterances}`,
          rules: `${row.rules_count}/${targets.rules}`,
          exercises: `${row.exercises_count}/${targets.exercises}`,
        },
      };
    });

    return reply.status(200).send({ gaps });
  });
};
```

**Files Created**: `packages/api/src/routes/operational/content-gaps.ts`

---

### Task 3: Add Work Item Deduplication

**Description**: Prevent refinement service from working on duplicate content.

**Implementation Plan**:

Add deduplication check to WorkPlanner:
```typescript
export class WorkPlanner {
  // ... existing code ...

  async markWorkInProgress(workId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO work_in_progress (work_id, started_at)
       VALUES ($1, CURRENT_TIMESTAMP)
       ON CONFLICT (work_id) DO NOTHING`,
      [workId]
    );
  }

  async isWorkInProgress(workId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM work_in_progress
       WHERE work_id = $1
         AND started_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'`,
      [workId]
    );

    return result.rows.length > 0;
  }

  async markWorkComplete(workId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM work_in_progress WHERE work_id = $1',
      [workId]
    );
  }

  async getNextWork(): Promise<WorkItem | null> {
    const work = await this._findNextWork(); // Original logic

    if (!work) return null;

    // Check if already in progress
    if (await this.isWorkInProgress(work.id)) {
      // Skip this item, try next
      return this.getNextWork();
    }

    // Mark as in progress
    await this.markWorkInProgress(work.id);

    return work;
  }
}
```

Add table migration in `packages/db/migrations/009-work-in-progress.sql`:
```sql
CREATE TABLE work_in_progress (
  work_id VARCHAR(200) PRIMARY KEY,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_work_in_progress_started ON work_in_progress(started_at);
```

**Files Created**:
- Update `work-planner.service.ts`
- `packages/db/migrations/009-work-in-progress.sql`

---

### Task 4: Update Main Loop to Use Work Planner

**Description**: Integrate WorkPlanner into the main service loop from F014.

**Implementation Plan**:

Update `packages/refinement-service/src/main.ts`:
```typescript
async function mainLoop() {
  const workPlanner = new WorkPlanner(pool);
  const processor = new ContentProcessor(pool);
  const checkpoint = new CheckpointService(pool);

  while (!isShuttingDown) {
    try {
      const workItem = await workPlanner.getNextWork();

      if (!workItem) {
        logger.info('No work available, waiting...');
        await sleep(LOOP_INTERVAL_MS);
        continue;
      }

      logger.info({ workItem }, 'Processing work item');

      // Process based on work type
      switch (workItem.type) {
        case ContentType.ORTHOGRAPHY:
          await processor.generateOrthography(workItem);
          break;
        case ContentType.MEANING:
          await processor.generateMeaning(workItem);
          break;
        case ContentType.UTTERANCE:
          await processor.generateUtterance(workItem);
          break;
        case ContentType.GRAMMAR_RULE:
          await processor.generateGrammarRule(workItem);
          break;
        case ContentType.EXERCISE:
          await processor.generateExercise(workItem);
          break;
      }

      // Mark work complete
      await workPlanner.markWorkComplete(workItem.id);

      // Save checkpoint
      await checkpoint.saveState({
        lastProcessedId: workItem.id,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error({ error }, 'Error processing work');
      await sleep(LOOP_INTERVAL_MS);
    }
  }
}
```

**Files Created**: None (update existing F014 file)

---

## Open Questions

### Question 1: Content Target Quantities (BLOCKER for accurate planning)
**Context**: How much content is needed per language/level?

**Current Assumptions** (in code above):
- Meanings: 100 per level
- Utterances: 3 per meaning (300 per level)
- Grammar Rules: 20 per level
- Exercises: 50 per level

**Questions**:
1. Are these targets realistic for MVP?
2. Should targets vary by level? (A1 might need more, C2 less?)
3. Should targets vary by language? (Popular languages need more?)

**Decision Needed**: Finalize target quantities before implementing data source integration (F016).

**Temporary Plan**: Use assumptions above for MVP, adjust based on user feedback.

---

### Question 2: Grammar Rule Categorization
**Context**: Grammar rules need categories (e.g., "verbs", "pronouns", "tenses").

**Current State**: Code uses placeholder `category: 'general'`.

**Questions**:
1. What are the grammar categories for each language?
2. How many rules per category?
3. Should categories be standardized across languages or language-specific?

**Decision Needed**: Define grammar taxonomy before generating grammar content.

**Temporary Plan**: Start with simple categories: "verbs", "nouns", "pronouns", "prepositions", "syntax". Refine later.

---

### Question 3: Work Priority Algorithm Sophistication
**Context**: Current algorithm is simple FIFO with priority tiers.

**Potential Enhancements**:
1. Weight by user demand (which languages/levels are users studying?)
2. Time-based balancing (ensure all languages get some work each day)
3. Dependency-aware (don't generate exercises before meanings exist)

**Questions**:
1. Is simple priority sufficient for MVP?
2. Should we track user learning patterns to prioritize?

**Decision Needed**: Before scaling to production.

**Temporary Plan**: Simple priority tiers are sufficient for MVP. Add analytics-driven prioritization in post-MVP.

---

## Dependencies

- **Blocks**: F016, F017
- **Depends on**: F014

---

## Notes

- Orthography must be complete before other content
- Balances coverage across languages
