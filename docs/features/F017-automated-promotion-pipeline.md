# F017: Automated Promotion Pipeline

**Feature Code**: F017
**Created**: 2025-12-17
**Phase**: 4 - Content Refinement Service
**Status**: Not Started

---

## Description

Orchestrates content progression through lifecycle states: DRAFT → CANDIDATE (normalization) → VALIDATED (quality gates) → APPROVED (optional auto-approval).

## Success Criteria

- [ ] DRAFT → CANDIDATE normalization
- [ ] CANDIDATE → VALIDATED validation (runs all quality gates)
- [ ] VALIDATED → APPROVED promotion (configurable)
- [ ] Pipeline error handling
- [ ] Throughput metrics tracked

---

## Tasks

### Task 1: Create Pipeline Orchestrator

**Description**: Orchestrates content progression through lifecycle states with error handling and retry logic.

**Implementation Plan**:

Create `packages/refinement-service/src/pipeline/pipeline-orchestrator.ts`:
```typescript
import { Pool } from 'pg';
import { NormalizationStep } from './steps/normalization.step';
import { ValidationStep } from './steps/validation.step';
import { ApprovalStep } from './steps/approval.step';
import { logger } from '../utils/logger';

export enum PipelineStage {
  DRAFT = 'DRAFT',
  CANDIDATE = 'CANDIDATE',
  VALIDATED = 'VALIDATED',
  APPROVED = 'APPROVED',
}

export interface PipelineItem {
  id: string;
  tableName: string; // 'meanings', 'utterances', 'rules', 'exercises'
  currentState: PipelineStage;
  data: Record<string, unknown>;
}

export interface PipelineResult {
  success: boolean;
  newState: PipelineStage;
  errors?: string[];
  metrics?: {
    durationMs: number;
    stage: string;
  };
}

export class PipelineOrchestrator {
  private normalization: NormalizationStep;
  private validation: ValidationStep;
  private approval: ApprovalStep;

  constructor(
    private readonly pool: Pool,
    private readonly config: {
      autoApproval: boolean;
      retryAttempts: number;
    }
  ) {
    this.normalization = new NormalizationStep(pool);
    this.validation = new ValidationStep(pool);
    this.approval = new ApprovalStep(pool, config.autoApproval);
  }

  async processBatch(batchSize: number = 10): Promise<void> {
    // Fetch DRAFT items
    const draftItems = await this.fetchItemsByState(PipelineStage.DRAFT, batchSize);
    for (const item of draftItems) {
      await this.processItem(item);
    }

    // Fetch CANDIDATE items
    const candidateItems = await this.fetchItemsByState(PipelineStage.CANDIDATE, batchSize);
    for (const item of candidateItems) {
      await this.processItem(item);
    }

    // Fetch VALIDATED items (if auto-approval enabled)
    if (this.config.autoApproval) {
      const validatedItems = await this.fetchItemsByState(PipelineStage.VALIDATED, batchSize);
      for (const item of validatedItems) {
        await this.processItem(item);
      }
    }
  }

  async processItem(item: PipelineItem): Promise<PipelineResult> {
    const startTime = Date.now();
    let attempts = 0;

    while (attempts < this.config.retryAttempts) {
      try {
        logger.info({ itemId: item.id, state: item.currentState }, 'Processing pipeline item');

        switch (item.currentState) {
          case PipelineStage.DRAFT:
            return await this.promoteToCandidateWithRetry(item, startTime);

          case PipelineStage.CANDIDATE:
            return await this.promoteToValidatedWithRetry(item, startTime);

          case PipelineStage.VALIDATED:
            return await this.promoteToApprovedWithRetry(item, startTime);

          default:
            throw new Error(`Unknown pipeline state: ${item.currentState}`);
        }
      } catch (error) {
        attempts++;
        logger.warn(
          { itemId: item.id, attempt: attempts, error },
          'Pipeline step failed, retrying'
        );

        if (attempts >= this.config.retryAttempts) {
          // Log failure and move on
          await this.recordPipelineFailure(item, error as Error);
          return {
            success: false,
            newState: item.currentState,
            errors: [(error as Error).message],
            metrics: { durationMs: Date.now() - startTime, stage: item.currentState },
          };
        }

        // Exponential backoff
        await this.sleep(Math.pow(2, attempts) * 1000);
      }
    }

    throw new Error('Pipeline processing failed after max retries');
  }

  private async promoteToCandidateWithRetry(item: PipelineItem, startTime: number): Promise<PipelineResult> {
    const normalized = await this.normalization.normalize(item);

    if (!normalized.success) {
      return {
        success: false,
        newState: PipelineStage.DRAFT,
        errors: normalized.errors,
        metrics: { durationMs: Date.now() - startTime, stage: 'normalization' },
      };
    }

    // Update state to CANDIDATE
    await this.updateItemState(item, PipelineStage.CANDIDATE);

    logger.info({ itemId: item.id }, 'Promoted to CANDIDATE');

    return {
      success: true,
      newState: PipelineStage.CANDIDATE,
      metrics: { durationMs: Date.now() - startTime, stage: 'normalization' },
    };
  }

  private async promoteToValidatedWithRetry(item: PipelineItem, startTime: number): Promise<PipelineResult> {
    const validated = await this.validation.validate(item);

    if (!validated.success) {
      return {
        success: false,
        newState: PipelineStage.CANDIDATE,
        errors: validated.errors,
        metrics: { durationMs: Date.now() - startTime, stage: 'validation' },
      };
    }

    // Update state to VALIDATED
    await this.updateItemState(item, PipelineStage.VALIDATED);

    logger.info({ itemId: item.id }, 'Promoted to VALIDATED');

    return {
      success: true,
      newState: PipelineStage.VALIDATED,
      metrics: { durationMs: Date.now() - startTime, stage: 'validation' },
    };
  }

  private async promoteToApprovedWithRetry(item: PipelineItem, startTime: number): Promise<PipelineResult> {
    const approved = await this.approval.approve(item);

    if (!approved.success) {
      return {
        success: false,
        newState: PipelineStage.VALIDATED,
        errors: approved.errors,
        metrics: { durationMs: Date.now() - startTime, stage: 'approval' },
      };
    }

    // Copy to approved_* table and update state
    await this.copyToApprovedTable(item);
    await this.updateItemState(item, PipelineStage.APPROVED);

    logger.info({ itemId: item.id }, 'Promoted to APPROVED');

    return {
      success: true,
      newState: PipelineStage.APPROVED,
      metrics: { durationMs: Date.now() - startTime, stage: 'approval' },
    };
  }

  private async fetchItemsByState(state: PipelineStage, limit: number): Promise<PipelineItem[]> {
    const tables = ['meanings', 'utterances', 'rules', 'exercises'];
    const items: PipelineItem[] = [];

    for (const table of tables) {
      const result = await this.pool.query(
        `SELECT id, * FROM ${table} WHERE state = $1 LIMIT $2`,
        [state, limit]
      );

      items.push(...result.rows.map(row => ({
        id: row.id,
        tableName: table,
        currentState: state,
        data: row,
      })));
    }

    return items;
  }

  private async updateItemState(item: PipelineItem, newState: PipelineStage): Promise<void> {
    await this.pool.query(
      `UPDATE ${item.tableName} SET state = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newState, item.id]
    );
  }

  private async copyToApprovedTable(item: PipelineItem): Promise<void> {
    const approvedTable = `approved_${item.tableName}`;

    // Copy all columns except id and state
    const columns = Object.keys(item.data).filter(k => k !== 'id' && k !== 'state');
    const values = columns.map(k => item.data[k]);

    await this.pool.query(
      `INSERT INTO ${approvedTable} (${columns.join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      values
    );
  }

  private async recordPipelineFailure(item: PipelineItem, error: Error): Promise<void> {
    await this.pool.query(
      `INSERT INTO pipeline_failures (item_id, table_name, state, error_message, failed_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [item.id, item.tableName, item.currentState, error.message]
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

**Files Created**: `packages/refinement-service/src/pipeline/pipeline-orchestrator.ts`

---

### Task 2: Implement Normalization Step

**Description**: Clean, format, and standardize DRAFT content before validation.

**Implementation Plan**:

Create `packages/refinement-service/src/pipeline/steps/normalization.step.ts`:
```typescript
import { Pool } from 'pg';
import { PipelineItem } from '../pipeline-orchestrator';

interface NormalizationResult {
  success: boolean;
  errors?: string[];
}

export class NormalizationStep {
  constructor(private readonly pool: Pool) {}

  async normalize(item: PipelineItem): Promise<NormalizationResult> {
    const errors: string[] = [];

    try {
      switch (item.tableName) {
        case 'meanings':
          return this.normalizeMeaning(item);
        case 'utterances':
          return this.normalizeUtterance(item);
        case 'rules':
          return this.normalizeRule(item);
        case 'exercises':
          return this.normalizeExercise(item);
        default:
          errors.push(`Unknown table: ${item.tableName}`);
          return { success: false, errors };
      }
    } catch (error) {
      errors.push((error as Error).message);
      return { success: false, errors };
    }
  }

  private async normalizeMeaning(item: PipelineItem): Promise<NormalizationResult> {
    const errors: string[] = [];
    const updates: Record<string, unknown> = {};

    // Trim whitespace
    if (item.data.word) {
      updates.word = String(item.data.word).trim();
    }

    if (item.data.definition) {
      updates.definition = String(item.data.definition).trim();
    }

    // Capitalize first letter of definition
    if (updates.definition) {
      updates.definition = this.capitalizeFirstLetter(String(updates.definition));
    }

    // Validate required fields
    if (!updates.word || String(updates.word).length === 0) {
      errors.push('Word is required');
    }

    if (!updates.definition || String(updates.definition).length === 0) {
      errors.push('Definition is required');
    }

    // Check word length (reasonable limits)
    if (String(updates.word).length > 100) {
      errors.push('Word is too long (max 100 characters)');
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    // Apply updates
    await this.applyUpdates(item, updates);

    return { success: true };
  }

  private async normalizeUtterance(item: PipelineItem): Promise<NormalizationResult> {
    const errors: string[] = [];
    const updates: Record<string, unknown> = {};

    // Trim whitespace
    if (item.data.text) {
      updates.text = String(item.data.text).trim();
    }

    if (item.data.translation) {
      updates.translation = String(item.data.translation).trim();
    }

    // Capitalize first letter
    if (updates.text) {
      updates.text = this.capitalizeFirstLetter(String(updates.text));
    }

    if (updates.translation) {
      updates.translation = this.capitalizeFirstLetter(String(updates.translation));
    }

    // Add ending punctuation if missing
    if (updates.text && !this.hasPunctuation(String(updates.text))) {
      updates.text = String(updates.text) + '.';
    }

    // Validate required fields
    if (!updates.text || String(updates.text).length === 0) {
      errors.push('Text is required');
    }

    if (!item.data.meaning_id) {
      errors.push('Meaning ID is required');
    }

    // Check sentence length (reasonable limits)
    const wordCount = String(updates.text).split(/\s+/).length;
    if (wordCount < 3) {
      errors.push('Utterance too short (min 3 words)');
    }

    if (wordCount > 50) {
      errors.push('Utterance too long (max 50 words)');
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    // Apply updates
    await this.applyUpdates(item, updates);

    return { success: true };
  }

  private async normalizeRule(item: PipelineItem): Promise<NormalizationResult> {
    const errors: string[] = [];
    const updates: Record<string, unknown> = {};

    // Trim whitespace
    if (item.data.title) {
      updates.title = String(item.data.title).trim();
    }

    if (item.data.explanation) {
      updates.explanation = String(item.data.explanation).trim();
    }

    // Validate required fields
    if (!updates.title || String(updates.title).length === 0) {
      errors.push('Title is required');
    }

    if (!updates.explanation || String(updates.explanation).length === 0) {
      errors.push('Explanation is required');
    }

    // Validate examples (should be array)
    if (item.data.examples) {
      try {
        const examples = typeof item.data.examples === 'string'
          ? JSON.parse(String(item.data.examples))
          : item.data.examples;

        if (!Array.isArray(examples) || examples.length === 0) {
          errors.push('At least one example is required');
        }
      } catch {
        errors.push('Examples must be valid JSON array');
      }
    } else {
      errors.push('Examples are required');
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    // Apply updates
    await this.applyUpdates(item, updates);

    return { success: true };
  }

  private async normalizeExercise(item: PipelineItem): Promise<NormalizationResult> {
    const errors: string[] = [];
    const updates: Record<string, unknown> = {};

    // Trim whitespace
    if (item.data.prompt) {
      updates.prompt = String(item.data.prompt).trim();
    }

    // Validate required fields
    if (!updates.prompt || String(updates.prompt).length === 0) {
      errors.push('Prompt is required');
    }

    // Validate options (should be array of 2-6 options)
    if (item.data.options) {
      try {
        const options = typeof item.data.options === 'string'
          ? JSON.parse(String(item.data.options))
          : item.data.options;

        if (!Array.isArray(options)) {
          errors.push('Options must be an array');
        } else if (options.length < 2) {
          errors.push('At least 2 options required');
        } else if (options.length > 6) {
          errors.push('Maximum 6 options allowed');
        }
      } catch {
        errors.push('Options must be valid JSON array');
      }
    } else {
      errors.push('Options are required');
    }

    // Validate correct_answer index
    if (item.data.correct_answer === undefined || item.data.correct_answer === null) {
      errors.push('Correct answer index is required');
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    // Apply updates
    await this.applyUpdates(item, updates);

    return { success: true };
  }

  private async applyUpdates(item: PipelineItem, updates: Record<string, unknown>): Promise<void> {
    if (Object.keys(updates).length === 0) {
      return;
    }

    const setClause = Object.keys(updates)
      .map((key, i) => `${key} = $${i + 1}`)
      .join(', ');

    const values = Object.values(updates);
    values.push(item.id);

    await this.pool.query(
      `UPDATE ${item.tableName} SET ${setClause} WHERE id = $${values.length}`,
      values
    );
  }

  private capitalizeFirstLetter(text: string): string {
    if (text.length === 0) return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  private hasPunctuation(text: string): boolean {
    return /[.!?]$/.test(text);
  }
}
```

**Files Created**: `packages/refinement-service/src/pipeline/steps/normalization.step.ts`

---

### Task 3: Implement Validation Step

**Description**: Run quality gates from F011-F013 to validate content before approval.

**Implementation Plan**:

Create `packages/refinement-service/src/pipeline/steps/validation.step.ts`:
```typescript
import { Pool } from 'pg';
import { PipelineItem } from '../pipeline-orchestrator';
import { runQualityGates } from '../../quality-gates/gate-runner';

interface ValidationResult {
  success: boolean;
  errors?: string[];
}

export class ValidationStep {
  constructor(private readonly pool: Pool) {}

  async validate(item: PipelineItem): Promise<ValidationResult> {
    const errors: string[] = [];

    try {
      // Run quality gates from F011-F013
      const gateResults = await runQualityGates(item, this.pool);

      // Check if all gates passed
      const failedGates = gateResults.filter(r => !r.passed);

      if (failedGates.length > 0) {
        errors.push(...failedGates.map(g => `${g.gateName}: ${g.reason}`));
        return { success: false, errors };
      }

      // Additional table-specific validation
      switch (item.tableName) {
        case 'meanings':
          return await this.validateMeaning(item);
        case 'utterances':
          return await this.validateUtterance(item);
        case 'rules':
          return await this.validateRule(item);
        case 'exercises':
          return await this.validateExercise(item);
        default:
          errors.push(`Unknown table: ${item.tableName}`);
          return { success: false, errors };
      }
    } catch (error) {
      errors.push((error as Error).message);
      return { success: false, errors };
    }
  }

  private async validateMeaning(item: PipelineItem): Promise<ValidationResult> {
    const errors: string[] = [];

    // Check for duplicate words at same level
    const duplicate = await this.pool.query(
      `SELECT id FROM meanings
       WHERE word = $1 AND language = $2 AND level = $3 AND id != $4 AND state != 'DRAFT'
       LIMIT 1`,
      [item.data.word, item.data.language, item.data.level, item.id]
    );

    if (duplicate.rows.length > 0) {
      errors.push(`Duplicate word "${item.data.word}" already exists for this level`);
    }

    // Check definition quality (basic heuristics)
    const definition = String(item.data.definition);
    if (definition.length < 10) {
      errors.push('Definition too short (min 10 characters)');
    }

    if (definition.length > 500) {
      errors.push('Definition too long (max 500 characters)');
    }

    // Check that definition doesn't just repeat the word
    if (definition.toLowerCase().includes(String(item.data.word).toLowerCase())) {
      // This is actually often valid, so just a warning - not blocking
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true };
  }

  private async validateUtterance(item: PipelineItem): Promise<ValidationResult> {
    const errors: string[] = [];

    // Check that meaning_id exists
    const meaningExists = await this.pool.query(
      `SELECT id FROM meanings WHERE id = $1`,
      [item.data.meaning_id]
    );

    if (meaningExists.rows.length === 0) {
      errors.push(`Meaning ID ${item.data.meaning_id} does not exist`);
    }

    // Check for duplicate utterances
    const duplicate = await this.pool.query(
      `SELECT id FROM utterances
       WHERE text = $1 AND language = $2 AND id != $3 AND state != 'DRAFT'
       LIMIT 1`,
      [item.data.text, item.data.language, item.id]
    );

    if (duplicate.rows.length > 0) {
      errors.push('Duplicate utterance text already exists');
    }

    // Basic language detection (check for non-Latin characters for non-Latin languages)
    // This is a simplistic check - real implementation would use a proper language detector
    const text = String(item.data.text);
    if (item.data.language === 'SL' && !/[čćđšžČĆĐŠŽ]/.test(text)) {
      // Slovenian should contain some diacritics - this is just a basic check
      // Not blocking, just informational
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true };
  }

  private async validateRule(item: PipelineItem): Promise<ValidationResult> {
    const errors: string[] = [];

    // Check for duplicate rules (same title and level)
    const duplicate = await this.pool.query(
      `SELECT id FROM rules
       WHERE title = $1 AND language = $2 AND level = $3 AND id != $4 AND state != 'DRAFT'
       LIMIT 1`,
      [item.data.title, item.data.language, item.data.level, item.id]
    );

    if (duplicate.rows.length > 0) {
      errors.push(`Duplicate grammar rule "${item.data.title}" already exists`);
    }

    // Validate examples structure
    try {
      const examples = typeof item.data.examples === 'string'
        ? JSON.parse(String(item.data.examples))
        : item.data.examples;

      if (!Array.isArray(examples) || examples.length < 2) {
        errors.push('Grammar rule must have at least 2 examples');
      }

      // Check each example has required fields
      for (const example of examples) {
        if (!example.correct) {
          errors.push('Each example must have a "correct" field');
        }
      }
    } catch {
      errors.push('Examples must be valid JSON');
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true };
  }

  private async validateExercise(item: PipelineItem): Promise<ValidationResult> {
    const errors: string[] = [];

    // Validate options and correct_answer
    try {
      const options = typeof item.data.options === 'string'
        ? JSON.parse(String(item.data.options))
        : item.data.options;

      const correctIndex = Number(item.data.correct_answer);

      if (correctIndex < 0 || correctIndex >= options.length) {
        errors.push(`Correct answer index ${correctIndex} is out of range for ${options.length} options`);
      }

      // Check that options are unique
      const uniqueOptions = new Set(options);
      if (uniqueOptions.size !== options.length) {
        errors.push('Exercise options must be unique');
      }

      // Check that all options are non-empty strings
      for (const option of options) {
        if (typeof option !== 'string' || option.trim().length === 0) {
          errors.push('All exercise options must be non-empty strings');
          break;
        }
      }
    } catch {
      errors.push('Exercise options must be valid JSON array');
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true };
  }
}
```

Create `packages/refinement-service/src/quality-gates/gate-runner.ts`:
```typescript
import { Pool } from 'pg';
import { PipelineItem } from '../pipeline/pipeline-orchestrator';

export interface GateResult {
  gateName: string;
  passed: boolean;
  reason?: string;
}

export async function runQualityGates(item: PipelineItem, pool: Pool): Promise<GateResult[]> {
  const results: GateResult[] = [];

  // Gate 1: Schema validation (from F010)
  results.push(await validateSchema(item));

  // Gate 2: Required fields check
  results.push(await validateRequiredFields(item));

  // Gate 3: Language-specific checks (from F011-F012)
  results.push(await validateLanguageSpecific(item, pool));

  return results;
}

async function validateSchema(item: PipelineItem): Promise<GateResult> {
  // Basic schema validation - check data types
  try {
    if (item.tableName === 'meanings') {
      if (typeof item.data.word !== 'string') {
        return { gateName: 'SchemaValidation', passed: false, reason: 'Word must be a string' };
      }
    }

    if (item.tableName === 'exercises') {
      if (typeof item.data.correct_answer !== 'number') {
        return { gateName: 'SchemaValidation', passed: false, reason: 'Correct answer must be a number' };
      }
    }

    return { gateName: 'SchemaValidation', passed: true };
  } catch (error) {
    return { gateName: 'SchemaValidation', passed: false, reason: (error as Error).message };
  }
}

async function validateRequiredFields(item: PipelineItem): Promise<GateResult> {
  const requiredFields: Record<string, string[]> = {
    meanings: ['word', 'definition', 'language', 'level'],
    utterances: ['text', 'language', 'meaning_id'],
    rules: ['title', 'explanation', 'language', 'level'],
    exercises: ['prompt', 'options', 'correct_answer', 'language', 'level'],
  };

  const required = requiredFields[item.tableName];
  if (!required) {
    return { gateName: 'RequiredFields', passed: false, reason: `Unknown table: ${item.tableName}` };
  }

  for (const field of required) {
    if (!item.data[field]) {
      return { gateName: 'RequiredFields', passed: false, reason: `Missing required field: ${field}` };
    }
  }

  return { gateName: 'RequiredFields', passed: true };
}

async function validateLanguageSpecific(item: PipelineItem, pool: Pool): Promise<GateResult> {
  // Language-specific validation
  // For MVP, just check that language is valid
  const validLanguages = ['EN', 'ES', 'IT', 'PT', 'SL'];

  if (!validLanguages.includes(String(item.data.language))) {
    return { gateName: 'LanguageSpecific', passed: false, reason: `Invalid language: ${item.data.language}` };
  }

  return { gateName: 'LanguageSpecific', passed: true };
}
```

**Files Created**:
- `packages/refinement-service/src/pipeline/steps/validation.step.ts`
- `packages/refinement-service/src/quality-gates/gate-runner.ts`

---

### Task 4: Implement Approval Step

**Description**: Configurable auto-approval or manual review queue.

**Implementation Plan**:

Create `packages/refinement-service/src/pipeline/steps/approval.step.ts`:
```typescript
import { Pool } from 'pg';
import { PipelineItem } from '../pipeline-orchestrator';
import { logger } from '../../utils/logger';

interface ApprovalResult {
  success: boolean;
  errors?: string[];
  requiresManualReview?: boolean;
}

export class ApprovalStep {
  constructor(
    private readonly pool: Pool,
    private readonly autoApprovalEnabled: boolean
  ) {}

  async approve(item: PipelineItem): Promise<ApprovalResult> {
    const errors: string[] = [];

    try {
      // Check if manual review required
      const needsReview = await this.requiresManualReview(item);

      if (needsReview && !this.autoApprovalEnabled) {
        // Queue for manual review
        await this.queueForReview(item);

        logger.info({ itemId: item.id }, 'Queued for manual review');

        return {
          success: false,
          requiresManualReview: true,
          errors: ['Item requires manual operator review'],
        };
      }

      // Auto-approve
      logger.info({ itemId: item.id }, 'Auto-approved');

      return { success: true };
    } catch (error) {
      errors.push((error as Error).message);
      return { success: false, errors };
    }
  }

  private async requiresManualReview(item: PipelineItem): Promise<boolean> {
    // Criteria for requiring manual review:

    // 1. Low confidence score (if available from source metadata)
    if (item.data.source_confidence && Number(item.data.source_confidence) < 0.7) {
      return true;
    }

    // 2. Expensive content (grammar rules, exercises)
    if (item.tableName === 'rules' || item.tableName === 'exercises') {
      // Always review grammar and exercises for MVP
      return true;
    }

    // 3. First N items of each type (bootstrapping quality)
    const count = await this.pool.query(
      `SELECT COUNT(*) as count FROM approved_${item.tableName}
       WHERE language = $1`,
      [item.data.language]
    );

    const approvedCount = parseInt(count.rows[0].count);
    if (approvedCount < 10) {
      // Review first 10 items per language to establish quality baseline
      return true;
    }

    // 4. Random sampling (10% of auto-approved items)
    if (Math.random() < 0.1) {
      return true;
    }

    return false;
  }

  private async queueForReview(item: PipelineItem): Promise<void> {
    await this.pool.query(
      `INSERT INTO review_queue (item_id, table_name, queued_at, priority)
       VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
       ON CONFLICT (item_id) DO NOTHING`,
      [item.id, item.tableName, this.calculatePriority(item)]
    );
  }

  private calculatePriority(item: PipelineItem): number {
    // Higher priority = lower number (1 = highest)

    // Orthography is critical (blocks learner progress)
    if (item.tableName === 'curriculum_graph' && item.data.concept_type === 'orthography') {
      return 1;
    }

    // Meanings are foundational vocabulary
    if (item.tableName === 'meanings') {
      return 2;
    }

    // Utterances provide examples
    if (item.tableName === 'utterances') {
      return 3;
    }

    // Grammar rules
    if (item.tableName === 'rules') {
      return 4;
    }

    // Exercises are lowest priority (practice content)
    if (item.tableName === 'exercises') {
      return 5;
    }

    return 10; // Default low priority
  }
}
```

**Files Created**: `packages/refinement-service/src/pipeline/steps/approval.step.ts`

---

### Task 5: Add Pipeline Tables and Monitoring

**Description**: Database tables for pipeline tracking and failure logging.

**Implementation Plan**:

Create `packages/db/migrations/011-pipeline-tables.sql`:
```sql
-- Pipeline failure log
CREATE TABLE pipeline_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  state lifecycle_state_enum NOT NULL,
  error_message TEXT NOT NULL,
  failed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pipeline_failures_item ON pipeline_failures(item_id);
CREATE INDEX idx_pipeline_failures_date ON pipeline_failures(failed_at);

-- Manual review queue
CREATE TABLE review_queue (
  item_id UUID PRIMARY KEY,
  table_name VARCHAR(100) NOT NULL,
  queued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  priority INTEGER NOT NULL DEFAULT 5,
  assigned_to UUID REFERENCES users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_decision VARCHAR(20) CHECK (review_decision IN ('approve', 'reject', 'revise'))
);

CREATE INDEX idx_review_queue_priority ON review_queue(priority, queued_at);
CREATE INDEX idx_review_queue_assigned ON review_queue(assigned_to);

-- Pipeline metrics (for monitoring throughput)
CREATE TABLE pipeline_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage VARCHAR(50) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  items_processed INTEGER NOT NULL DEFAULT 0,
  items_failed INTEGER NOT NULL DEFAULT 0,
  avg_duration_ms INTEGER,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pipeline_metrics_date ON pipeline_metrics(recorded_at);

-- View for pipeline health dashboard
CREATE VIEW pipeline_health AS
SELECT
  table_name,
  COUNT(*) FILTER (WHERE state = 'DRAFT') as draft_count,
  COUNT(*) FILTER (WHERE state = 'CANDIDATE') as candidate_count,
  COUNT(*) FILTER (WHERE state = 'VALIDATED') as validated_count,
  COUNT(*) FILTER (WHERE state = 'APPROVED') as approved_count
FROM (
  SELECT 'meanings' as table_name, state FROM meanings
  UNION ALL
  SELECT 'utterances', state FROM utterances
  UNION ALL
  SELECT 'rules', state FROM rules
  UNION ALL
  SELECT 'exercises', state FROM exercises
) combined
GROUP BY table_name;
```

**Files Created**: `packages/db/migrations/011-pipeline-tables.sql`

---

### Task 6: Integrate Pipeline into Main Service Loop

**Description**: Update main refinement service loop to run pipeline processing.

**Implementation Plan**:

Update `packages/refinement-service/src/main.ts`:
```typescript
import { PipelineOrchestrator } from './pipeline/pipeline-orchestrator';

async function mainLoop() {
  const workPlanner = new WorkPlanner(pool);
  const processor = new ContentProcessor(pool);
  const checkpoint = new CheckpointService(pool);

  // Initialize pipeline
  const pipeline = new PipelineOrchestrator(pool, {
    autoApproval: process.env.AUTO_APPROVAL === 'true',
    retryAttempts: 3,
  });

  logger.info('Refinement Service started');

  await checkpoint.restoreState();

  while (!isShuttingDown) {
    try {
      // Step 1: Generate new DRAFT content from work planner
      const workItem = await workPlanner.getNextWork();

      if (workItem) {
        await processor.process(workItem);
        await checkpoint.saveState({
          lastProcessedId: workItem.id,
          timestamp: new Date(),
        });
      }

      // Step 2: Process existing content through pipeline
      await pipeline.processBatch(10); // Process up to 10 items per cycle

      // Wait before next cycle
      await sleep(LOOP_INTERVAL_MS);
    } catch (error) {
      logger.error({ error }, 'Error in main loop');
      await checkpoint.saveErrorState(error);
      await sleep(LOOP_INTERVAL_MS);
    }
  }
}
```

**Files Created**: None (update existing)

---

## Open Questions

### Question 1: Auto-Approval Strategy (DECISION NEEDED for MVP)
**Context**: Should VALIDATED content be automatically promoted to APPROVED, or require manual operator review?

**Options**:
1. **Full Auto-Approval** (development/staging only)
   - Pros: Fast iteration, no manual bottleneck
   - Cons: Quality risk, errors reach learners
   - Use case: Development environment for testing

2. **Selective Auto-Approval**
   - Auto-approve: High-confidence items (>90% confidence score), simple content (meanings, utterances)
   - Manual review: Low-confidence items, grammar rules, exercises
   - Pros: Balance speed and quality
   - Cons: Requires confidence scoring from LLM

3. **Manual Review Only**
   - All VALIDATED content goes to review queue
   - Operators approve/reject via F025-F028 UI
   - Pros: Highest quality control
   - Cons: Slow throughput, requires operator time

**Questions**:
1. What's acceptable error rate for MVP? (1%, 5%, 10%?)
2. How many operator hours available for review per day?
3. Should strategy differ by content type? (meanings auto-approved, grammar manual?)

**Decision Needed**: Before MVP launch.

**Temporary Plan**: Use manual review only (option 3) for MVP. Track review time and quality metrics. Implement selective auto-approval post-MVP based on data.

---

### Question 2: Pipeline Retry Logic
**Context**: What should happen when a pipeline step fails?

**Current Implementation**: 3 retry attempts with exponential backoff, then log failure and move on.

**Alternative Options**:
1. **Dead Letter Queue**
   - Move failed items to separate "failed" table
   - Operator investigates and manually fixes
   - Re-submit to pipeline
   - Pros: Nothing lost
   - Cons: Requires manual intervention

2. **Automatic Regeneration**
   - If normalization/validation fails, delete DRAFT and regenerate
   - Useful if LLM generated bad data
   - Pros: Self-healing
   - Cons: Wastes API costs

**Questions**:
1. Is current retry logic sufficient?
2. Should we implement dead letter queue?

**Decision Needed**: Can be deferred to post-MVP.

**Temporary Plan**: Current retry logic with failure logging is sufficient for MVP. Add dead letter queue if failure rate > 5%.

---

### Question 3: Pipeline Throughput Targets
**Context**: How many items should pipeline process per hour?

**Current State**: Batch size = 10 items per cycle, cycle interval = 5 seconds.

**Calculations**:
- Max throughput: 10 items/cycle × 12 cycles/minute × 60 minutes = 7,200 items/hour
- Realistic throughput: ~1,000-2,000 items/hour (accounting for validation, DB queries)

**Questions**:
1. How much content needed for MVP launch?
   - 5 languages × 6 levels × 100 meanings = 3,000 meanings
   - 3,000 meanings × 3 utterances = 9,000 utterances
   - 5 languages × 6 levels × 20 rules = 600 rules
   - 5 languages × 6 levels × 50 exercises = 1,500 exercises
   - **Total: ~14,100 items**

2. Timeline for content generation?
   - At 1,000 items/hour: 14-15 hours of continuous pipeline processing
   - At 2,000 items/hour: 7-8 hours

3. Should we increase batch size or reduce cycle interval?

**Decision Needed**: Before MVP content generation starts.

**Temporary Plan**: Current settings (batch=10, interval=5s) are sufficient. Monitor throughput metrics. Increase batch size if needed.

---

## Dependencies

- **Blocks**: F020
- **Depends on**: F007, F011, F012, F014, F015, F016

---

## Notes

- Auto-approval configurable via `AUTO_APPROVAL` environment variable
- Production should always use manual review (set `AUTO_APPROVAL=false`)
- Development can enable auto-approval for speed (set `AUTO_APPROVAL=true`)
- Pipeline processes content in parallel with new DRAFT generation
- Retry logic prevents transient failures from blocking pipeline
