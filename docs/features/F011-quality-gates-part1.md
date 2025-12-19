# F011: Quality Gates Implementation (Part 1)

**Feature Code**: F011
**Created**: 2025-12-17
**Phase**: 3 - Quality Assurance System
**Status**: Not Started

---

## Description

Implement first set of quality gates: duplication detection, language standard enforcement, and orthography consistency checks. These gates filter out low-quality content before validation.

## Success Criteria

- [ ] Duplication gate detects identical/similar content
- [ ] Language standard gate enforces US English, PT-PT, etc.
- [ ] Orthography consistency gate checks correct alphabet usage
- [ ] Gates return pass/fail with detailed reasons
- [ ] Gates integrated into validation pipeline

---

## Tasks

### Task 1: Create Quality Gate Interface

**Description**: Define common interface for all quality gates.

**Implementation Plan**:

Create `packages/core/src/quality-gates/gate-interface.ts`:
```typescript
export interface QualityGateResult {
  passed: boolean;
  gateName: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface QualityGate {
  name: string;
  check(data: any): Promise<QualityGateResult>;
}
```

**Files Created**:
- `packages/core/src/quality-gates/gate-interface.ts`

---

### Task 2: Implement Duplication Detection Gate

**Description**: Detect duplicate or very similar content.

**Implementation Plan**:

Create `packages/core/src/quality-gates/duplication-gate.ts`:
```typescript
import { Pool } from 'pg';
import { QualityGate, QualityGateResult } from './gate-interface';

export class DuplicationGate implements QualityGate {
  name = 'duplication-detection';

  constructor(private pool: Pool) {}

  async check(data: { text: string; language: string }): Promise<QualityGateResult> {
    // Check for exact duplicates
    const exactMatch = await this.pool.query(
      `SELECT id FROM approved_utterances
       WHERE text = $1 AND language = $2 LIMIT 1`,
      [data.text, data.language]
    );

    if (exactMatch.rows.length > 0) {
      return {
        passed: false,
        gateName: this.name,
        reason: 'Exact duplicate found in approved content',
        metadata: { duplicateId: exactMatch.rows[0].id },
      };
    }

    // Could add fuzzy matching here (future enhancement)

    return {
      passed: true,
      gateName: this.name,
    };
  }
}
```

**Files Created**:
- `packages/core/src/quality-gates/duplication-gate.ts`

---

### Task 3: Implement Language Standard Gate

**Description**: Enforce specific language standards.

**Implementation Plan**:

Create `packages/core/src/quality-gates/language-standard-gate.ts`:
```typescript
import { QualityGate, QualityGateResult } from './gate-interface';

const LANGUAGE_STANDARDS = {
  EN: 'US', // US English
  PT: 'PT', // European Portuguese
  ES: 'ES', // European Spanish (Castilian)
  IT: 'IT', // Standard Italian
  FR: 'FR', // Standard French
};

export class LanguageStandardGate implements QualityGate {
  name = 'language-standard';

  async check(data: { text: string; language: string }): Promise<QualityGateResult> {
    const standard = LANGUAGE_STANDARDS[data.language as keyof typeof LANGUAGE_STANDARDS];

    if (!standard) {
      return {
        passed: false,
        gateName: this.name,
        reason: `No standard defined for language: ${data.language}`,
      };
    }

    // Check for common non-standard variations
    const violations = this.detectStandardViolations(data.text, data.language);

    if (violations.length > 0) {
      return {
        passed: false,
        gateName: this.name,
        reason: `Language standard violations detected`,
        metadata: { violations },
      };
    }

    return {
      passed: true,
      gateName: this.name,
    };
  }

  private detectStandardViolations(text: string, language: string): string[] {
    const violations: string[] = [];

    if (language === 'EN') {
      // Check for British spellings
      if (/\b(colour|favour|honour)\b/i.test(text)) {
        violations.push('British spelling detected (use US English)');
      }
    }

    if (language === 'PT') {
      // Check for Brazilian Portuguese indicators
      if (/\bvc\b/i.test(text)) {
        violations.push('Brazilian Portuguese detected (use European Portuguese)');
      }
    }

    return violations;
  }
}
```

**Files Created**:
- `packages/core/src/quality-gates/language-standard-gate.ts`

---

### Task 4: Implement Orthography Consistency Gate

**Description**: Check correct alphabet and character usage per language.

**Implementation Plan**:

Create `packages/core/src/quality-gates/orthography-gate.ts`:
```typescript
import { QualityGate, QualityGateResult } from './gate-interface';

const VALID_ALPHABETS = {
  EN: /^[A-Za-z0-9\s.,!?;:'"()\-]+$/,
  ES: /^[A-Za-zÁÉÍÓÚÑáéíóúñ¿¡0-9\s.,!?;:'"()\-]+$/,
  IT: /^[A-Za-zÀÈÉÌÒÙàèéìòù0-9\s.,!?;:'"()\-]+$/,
  PT: /^[A-Za-zÁÂÃÀÇÉÊÍÓÔÕÚáâãàçéêíóôõú0-9\s.,!?;:'"()\-]+$/,
  FR: /^[A-Za-zÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸàâæçéèêëîïôœùûüÿ0-9\s.,!?;:'"()\-]+$/,
};

export class OrthographyGate implements QualityGate {
  name = 'orthography-consistency';

  async check(data: { text: string; language: string }): Promise<QualityGateResult> {
    const validPattern = VALID_ALPHABETS[data.language as keyof typeof VALID_ALPHABETS];

    if (!validPattern) {
      return {
        passed: false,
        gateName: this.name,
        reason: `No orthography rules defined for language: ${data.language}`,
      };
    }

    if (!validPattern.test(data.text)) {
      return {
        passed: false,
        gateName: this.name,
        reason: 'Text contains invalid characters for this language',
      };
    }

    return {
      passed: true,
      gateName: this.name,
    };
  }
}
```

**Files Created**:
- `packages/core/src/quality-gates/orthography-gate.ts`

---

### Task 5: Create Gate Runner

**Description**: Orchestrate running multiple gates.

**Implementation Plan**:

Create `packages/core/src/quality-gates/gate-runner.ts`:
```typescript
import { QualityGate, QualityGateResult } from './gate-interface';

/**
 * Run all gates and collect results
 */
export async function runGates(
  gates: QualityGate[],
  data: any
): Promise<{ allPassed: boolean; results: QualityGateResult[] }> {
  const results: QualityGateResult[] = [];

  for (const gate of gates) {
    const result = await gate.check(data);
    results.push(result);

    // Fail fast: stop on first failure
    if (!result.passed) {
      break;
    }
  }

  const allPassed = results.every((r) => r.passed);

  return { allPassed, results };
}
```

**Files Created**:
- `packages/core/src/quality-gates/gate-runner.ts`

---

## Dependencies

- **Blocks**: F012, F013, F017
- **Depends on**: F001, F010

---

## Notes

- Gates run sequentially, fail fast
- More gates added in F012
- Extensible design for future gates

---

## Open Questions

### 1. Gate Execution Strategy: Fail-Fast vs Fail-All

**Question**: When multiple quality gates run on content, should we stop at first failure (fail-fast) or run all gates and collect all failures (fail-all)?

**Current Approach**: Fail-fast implementation in `runGates()` - stops checking after first gate fails:
```typescript
if (!result.passed) {
  break;  // Stop on first failure
}
```

**Alternatives**:
1. **Fail-fast** (current): Stop at first failure, return immediately. Faster execution, less processing, but operator only sees one error at a time (must fix → resubmit → see next error).
2. **Fail-all**: Run every gate regardless of failures, return complete error list. Slower but shows all problems in one pass. Better developer experience - fix all issues at once.
3. **Configurable**: Add `mode: 'fast' | 'thorough'` parameter. Fast for automated pipeline, thorough for manual operator review.
4. **Tiered**: Run fast gates first (in-memory checks), only run expensive gates (database queries, API calls) if fast gates pass.

**Recommendation**: Use **tiered approach** (Option 4) with fail-all within each tier. Structure:

**Tier 1 (Fast - in-memory)**: Run all and collect failures
- Orthography consistency (regex check)
- Language standard enforcement (pattern matching)
- Text length validation (character count)

**Tier 2 (Medium - database queries)**: Only if Tier 1 passes
- Duplication detection (SELECT query)
- Reference validation (foreign key checks)

**Tier 3 (Expensive - external services)**: Only if Tier 1-2 pass
- Grammar validation (external API)
- Semantic coherence (LLM call)

Implementation:
```typescript
export async function runGatesByTier(
  gates: Array<QualityGate & { tier: number }>,
  data: any
): Promise<{ allPassed: boolean; results: QualityGateResult[] }> {
  const tiers = groupBy(gates, 'tier');
  const allResults: QualityGateResult[] = [];

  for (const [tier, tierGates] of tiers) {
    // Run all gates in tier concurrently
    const results = await Promise.all(tierGates.map(g => g.check(data)));
    allResults.push(...results);

    // Stop if any gate in tier failed
    if (results.some(r => !r.passed)) break;
  }

  return { allPassed: allResults.every(r => r.passed), results: allResults };
}
```

This provides complete feedback within each tier while avoiding expensive operations when basic validation fails.

---

### 2. Fuzzy Duplication Detection Threshold

**Question**: For detecting near-duplicate content (similar but not identical), what similarity threshold should trigger rejection?

**Current Approach**: Only exact duplicate detection (`text = $1`). Comment notes "Could add fuzzy matching here (future enhancement)" but no threshold defined.

**Alternatives**:
1. **No fuzzy matching** (current): Only block exact duplicates. Simple but misses near-duplicates (typos, reformatting, minor word changes).
2. **High threshold (95%+ similarity)**: Very similar content rejected. Catches typo variants but may miss paraphrases.
3. **Medium threshold (85-95%)**: Moderately similar content rejected. Catches paraphrases but may have false positives (legitimately different content).
4. **Low threshold (70-85%)**: Even loosely similar content rejected. Aggressive deduplication but high false positive rate.
5. **Context-dependent**: Different thresholds for different content types (sentences: 90%, vocabulary: 95%, grammar examples: 85%).

**Recommendation**: Implement **medium threshold with manual review** (Option 3 enhanced). Use Levenshtein distance normalized to 0-1 similarity:

```typescript
async check(data: { text: string; language: string }): Promise<QualityGateResult> {
  // Exact match (keep existing)
  const exactMatch = await this.checkExact(data);
  if (!exactMatch.passed) return exactMatch;

  // Fuzzy match using pg_trgm extension
  const fuzzyMatches = await this.pool.query(
    `SELECT id, text, similarity(text, $1) AS sim
     FROM approved_utterances
     WHERE language = $2 AND text % $1
     ORDER BY sim DESC LIMIT 5`,
    [data.text, data.language]
  );

  const SIMILARITY_THRESHOLD = 0.85; // 85% similarity = likely duplicate
  const highSimilarity = fuzzyMatches.rows.filter(r => r.sim >= SIMILARITY_THRESHOLD);

  if (highSimilarity.length > 0) {
    return {
      passed: false,
      gateName: this.name,
      reason: `Similar content found (${Math.round(highSimilarity[0].sim * 100)}% match)`,
      metadata: {
        similarTo: highSimilarity[0].id,
        similarity: highSimilarity[0].sim,
        matchedText: highSimilarity[0].text
      }
    };
  }

  return { passed: true, gateName: this.name };
}
```

Enable PostgreSQL trigram extension in migration:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_approved_utterances_text_trgm ON approved_utterances USING gin (text gin_trgm_ops);
```

Show matched text to operator in UI - allow override with "These are genuinely different" button that whitelists the pair. Track override decisions for threshold tuning.
