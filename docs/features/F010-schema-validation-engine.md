# F010: Schema Validation Engine

**Feature Code**: F010
**Created**: 2025-12-17
**Phase**: 3 - Quality Assurance System
**Status**: Not Started

---

## Description

Implement comprehensive JSON schema validation for all data types. Validates required fields, types, formats, and constraints before content enters quality gates.

## Success Criteria

- [ ] Zod schemas defined for all domain entities
- [ ] Required field validation
- [ ] Type checking (string, number, boolean, arrays)
- [ ] Format validation (URLs, ISO codes, CEFR levels)
- [ ] Detailed validation error messages
- [ ] Validation integrated into ingestion pipeline

---

## Tasks

### Task 1: Define Core Validation Schemas

**Description**: Create Zod schemas for all content types.

**Implementation Plan**:

Create `packages/core/src/validation/schemas.ts`:
```typescript
import { z } from 'zod';

// Language codes (ISO 639-1)
export const LanguageCodeSchema = z.string().length(2).regex(/^[A-Z]{2}$/);

// CEFR levels
export const CEFRLevelSchema = z.enum(['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

// Meaning schema
export const MeaningSchema = z.object({
  id: z.string().uuid(),
  level: CEFRLevelSchema,
  tags: z.array(z.string()),
  semanticDomain: z.string().optional(),
  frequency: z.number().min(0).max(100).optional(),
});

// Utterance schema
export const UtteranceSchema = z.object({
  id: z.string().uuid(),
  meaningId: z.string().uuid(),
  language: LanguageCodeSchema,
  text: z.string().min(1).max(500),
  pronunciation: z.string().optional(),
  audioUrl: z.string().url().optional(),
  notes: z.string().optional(),
});

// Exercise schema
export const ExerciseSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['RECALL', 'RECOGNITION', 'CLOZE', 'DICTATION', 'TRANSLATION']),
  level: CEFRLevelSchema,
  languages: z.array(LanguageCodeSchema).min(1),
  prompt: z.string().min(1),
  correctAnswer: z.string().min(1),
  distractors: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

// Grammar rule schema
export const GrammarRuleSchema = z.object({
  id: z.string().uuid(),
  level: CEFRLevelSchema,
  category: z.string(),
  languages: z.array(LanguageCodeSchema),
  explanation: z.string().min(10),
  examples: z.array(z.string()).min(1),
  prerequisites: z.array(z.string().uuid()).optional(),
});
```

**Files Created**:
- `packages/core/src/validation/schemas.ts`

---

### Task 2: Create Validation Engine

**Description**: Service that validates data against schemas.

**Implementation Plan**:

Create `packages/core/src/validation/validator.ts`:
```typescript
import { z } from 'zod';

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Validate data against Zod schema
 */
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult {
  const result = schema.safeParse(data);

  if (result.success) {
    return { valid: true };
  }

  const errors: ValidationError[] = result.error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
  }));

  return {
    valid: false,
    errors,
  };
}

/**
 * Assert data is valid, throw if not
 */
export function assertValid<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): T {
  return schema.parse(data);
}
```

**Files Created**:
- `packages/core/src/validation/validator.ts`

---

### Task 3: Create Validation Tests

**Description**: Test validation engine with valid and invalid data.

**Implementation Plan**:

Create `packages/core/tests/validation/validator.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { validate, MeaningSchema } from '../../src/validation';

describe('Validation Engine', () => {
  it('should validate correct meaning', () => {
    const data = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      level: 'A1',
      tags: ['greetings'],
    };
    const result = validate(MeaningSchema, data);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid CEFR level', () => {
    const data = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      level: 'Z9', // Invalid
      tags: ['greetings'],
    };
    const result = validate(MeaningSchema, data);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });
});
```

**Files Created**:
- `packages/core/tests/validation/validator.test.ts`

---

## Dependencies

- **Blocks**: F011, F012, F016
- **Depends on**: F002

---

## Notes

- Validation happens before quality gates
- Clear error messages help debugging
- Schemas ensure type safety across system
