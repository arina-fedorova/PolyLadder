# F002: Core Domain Model & Types

**Feature Code**: F002
**Created**: 2025-12-17
**Phase**: 0 - Foundation & Infrastructure
**Status**: ✅ Completed
**Completed**: 2025-12-19
**PR**: #5

---

## Description

Define comprehensive TypeScript types and domain entities for the entire PolyLadder system. This establishes the type-safe foundation that all other packages will depend on.

## Success Criteria

- [x] All domain entities defined with TypeScript types
- [x] Zod schemas created for runtime validation
- [x] Enums for lifecycle states, CEFR levels, languages
- [x] Types exported and consumable by other packages
- [x] 100% type coverage (no `any` types)
- [x] Types match database schema from F001

---

## Tasks

### Task 1: Define Language & Level Enums

**Implementation Plan**:

```typescript
// packages/core/src/domain/enums.ts

export enum Language {
  EN = 'EN', // English (US)
  IT = 'IT', // Italian
  PT = 'PT', // Portuguese (Portugal)
  SL = 'SL', // Slovenian
  ES = 'ES', // Spanish (Spain)
}

export enum CEFRLevel {
  A0 = 'A0', // Pre-A1 (orthography/phonetics)
  A1 = 'A1', // Beginner
  A2 = 'A2', // Elementary
  B1 = 'B1', // Intermediate
  B2 = 'B2', // Upper Intermediate
  C1 = 'C1', // Advanced
  C2 = 'C2', // Proficient
}

export enum LifecycleState {
  DRAFT = 'DRAFT',
  CANDIDATE = 'CANDIDATE',
  VALIDATED = 'VALIDATED',
  APPROVED = 'APPROVED',
}

export enum UserRole {
  LEARNER = 'learner',
  OPERATOR = 'operator',
}

export enum VocabularyState {
  UNKNOWN = 'unknown',
  LEARNING = 'learning',
  KNOWN = 'known',
}

export enum ExerciseType {
  FLASHCARD = 'flashcard',
  MULTIPLE_CHOICE = 'multiple_choice',
  CLOZE = 'cloze',
  TRANSLATION = 'translation',
  DICTATION = 'dictation',
}
```

**Files Created**: `packages/core/src/domain/enums.ts`

---

### Task 2: Define User Domain Model

**Implementation Plan**:

```typescript
// packages/core/src/domain/user.ts

import { z } from 'zod';
import { Language, UserRole } from './enums';

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  passwordHash: z.string(),
  role: z.nativeEnum(UserRole),
  baseLanguage: z.nativeEnum(Language),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

export const UserPreferencesSchema = z.object({
  userId: z.string().uuid(),
  studiedLanguages: z.array(z.nativeEnum(Language)),
  focusModeEnabled: z.boolean(),
  focusLanguage: z.nativeEnum(Language).nullable(),
  onboardingCompleted: z.boolean(),
  settings: z.record(z.unknown()),
  updatedAt: z.date(),
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
```

**Files Created**: `packages/core/src/domain/user.ts`

---

### Task 3: Define Approved Knowledge Base Types

**Implementation Plan**:

```typescript
// packages/core/src/domain/meaning.ts

import { z } from 'zod';
import { CEFRLevel } from './enums';

export const MeaningSchema = z.object({
  id: z.string().max(100),
  level: z.nativeEnum(CEFRLevel),
  tags: z.array(z.string()),
  createdAt: z.date(),
});

export type Meaning = z.infer<typeof MeaningSchema>;

// packages/core/src/domain/utterance.ts

import { z } from 'zod';
import { Language } from './enums';

export const UtteranceSchema = z.object({
  id: z.string().uuid(),
  meaningId: z.string().max(100),
  language: z.nativeEnum(Language),
  text: z.string().min(1),
  register: z.string().nullable(),
  usageNotes: z.string().nullable(),
  audioUrl: z.string().url().nullable(),
  createdAt: z.date(),
});

export type Utterance = z.infer<typeof UtteranceSchema>;

// packages/core/src/domain/grammar-rule.ts

export const GrammarRuleSchema = z.object({
  id: z.string().max(100),
  language: z.nativeEnum(Language),
  level: z.nativeEnum(CEFRLevel),
  category: z.string().max(50),
  title: z.string(),
  explanation: z.string(),
  examples: z.array(z.string()),
  createdAt: z.date(),
});

export type GrammarRule = z.infer<typeof GrammarRuleSchema>;

// packages/core/src/domain/exercise.ts

export const ExerciseSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(ExerciseType),
  level: z.nativeEnum(CEFRLevel),
  languages: z.array(z.nativeEnum(Language)),
  prompt: z.string(),
  correctAnswer: z.string(),
  options: z.array(z.string()).nullable(),
  metadata: z.record(z.unknown()),
  createdAt: z.date(),
});

export type Exercise = z.infer<typeof ExerciseSchema>;
```

**Files Created**:

- `packages/core/src/domain/meaning.ts`
- `packages/core/src/domain/utterance.ts`
- `packages/core/src/domain/grammar-rule.ts`
- `packages/core/src/domain/exercise.ts`

---

### Task 4: Define Pipeline Types

**Implementation Plan**:

```typescript
// packages/core/src/domain/pipeline.ts

import { z } from 'zod';
import { LifecycleState } from './enums';

export const DraftSchema = z.object({
  id: z.string().uuid(),
  dataType: z.enum(['meaning', 'utterance', 'rule', 'exercise']),
  rawData: z.record(z.unknown()),
  source: z.string().max(100),
  createdAt: z.date(),
});

export type Draft = z.infer<typeof DraftSchema>;

export const CandidateSchema = z.object({
  id: z.string().uuid(),
  dataType: z.enum(['meaning', 'utterance', 'rule', 'exercise']),
  normalizedData: z.record(z.unknown()),
  draftId: z.string().uuid(),
  createdAt: z.date(),
});

export type Candidate = z.infer<typeof CandidateSchema>;

export const ValidationResultSchema = z.object({
  gateName: z.string(),
  passed: z.boolean(),
  message: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export const ValidatedSchema = z.object({
  id: z.string().uuid(),
  dataType: z.enum(['meaning', 'utterance', 'rule', 'exercise']),
  validatedData: z.record(z.unknown()),
  candidateId: z.string().uuid(),
  validationResults: z.array(ValidationResultSchema),
  createdAt: z.date(),
});

export type Validated = z.infer<typeof ValidatedSchema>;

export const ApprovalEventSchema = z.object({
  id: z.string().uuid(),
  validatedId: z.string().uuid(),
  approvedTable: z.string(),
  approvedId: z.string(),
  operatorId: z.string().uuid().nullable(),
  approvalType: z.enum(['automatic', 'manual']),
  notes: z.string().nullable(),
  createdAt: z.date(),
});

export type ApprovalEvent = z.infer<typeof ApprovalEventSchema>;
```

**Files Created**: `packages/core/src/domain/pipeline.ts`

---

### Task 5: Define User Progress Types

**Implementation Plan**:

```typescript
// packages/core/src/domain/progress.ts

import { z } from 'zod';
import { Language, VocabularyState } from './enums';

export const UserProgressSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  conceptId: z.string().max(100),
  status: z.enum(['not_started', 'in_progress', 'completed']),
  completionDate: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type UserProgress = z.infer<typeof UserProgressSchema>;

export const UserVocabularySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  word: z.string().max(100),
  language: z.nativeEnum(Language),
  state: z.nativeEnum(VocabularyState),
  firstSeen: z.date(),
  lastReviewed: z.date().nullable(),
  reviewCount: z.number().int().nonnegative(),
  updatedAt: z.date(),
});

export type UserVocabulary = z.infer<typeof UserVocabularySchema>;

export const SRSScheduleSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  itemType: z.enum(['vocabulary', 'grammar', 'sentence', 'exercise']),
  itemId: z.string().max(100),
  dueDate: z.date(),
  intervalDays: z.number().int().positive(),
  easeFactor: z.number().min(1.3).max(3.0),
  repetitions: z.number().int().nonnegative(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type SRSSchedule = z.infer<typeof SRSScheduleSchema>;
```

**Files Created**: `packages/core/src/domain/progress.ts`

---

### Task 6: Define Curriculum Types

**Implementation Plan**:

```typescript
// packages/core/src/domain/curriculum.ts

import { z } from 'zod';
import { Language } from './enums';

export const CurriculumNodeSchema = z.object({
  id: z.string().uuid(),
  conceptId: z.string().max(100),
  conceptType: z.enum(['orthography', 'grammar', 'meaning', 'exercise_bundle']),
  language: z.nativeEnum(Language).nullable(),
  prerequisites: z.array(z.string().max(100)),
  metadata: z.record(z.unknown()),
  createdAt: z.date(),
});

export type CurriculumNode = z.infer<typeof CurriculumNodeSchema>;
```

**Files Created**: `packages/core/src/domain/curriculum.ts`

---

### Task 7: Create Index & Exports

**Implementation Plan**:

```typescript
// packages/core/src/index.ts

// Enums
export * from './domain/enums';

// Domain Models
export * from './domain/user';
export * from './domain/meaning';
export * from './domain/utterance';
export * from './domain/grammar-rule';
export * from './domain/exercise';
export * from './domain/pipeline';
export * from './domain/progress';
export * from './domain/curriculum';

// Re-export Zod for consumers
export { z } from 'zod';
```

**Files Created**: `packages/core/src/index.ts`

---

### Task 8: Add Zod Dependency & Configure

**Implementation Plan**:

1. Install Zod:

   ```bash
   cd packages/core
   pnpm add zod
   ```

2. Update `package.json`:

   ```json
   {
     "name": "@polyladder/core",
     "dependencies": {
       "zod": "^3.22.0"
     }
   }
   ```

3. Build and test:
   ```bash
   pnpm --filter @polyladder/core build
   ```

---

## Dependencies

- **Blocks**: F004-F060 (all features depend on these types)
- **Depends on**: F000 (Project Setup), F001 (Database Schema)

---

## Notes

- All types are runtime-validated with Zod
- Types match database schema exactly (field names, constraints)
- No `any` types allowed - use `unknown` + validation
- Dates are TypeScript `Date` objects (converted from DB timestamps)
- UUIDs are strings (validated with `.uuid()`)
- Enums use TypeScript enums + Zod `.nativeEnum()`

---

## Open Questions

### 1. Runtime Validation Strategy: Zod vs TypeScript Types

**Question**: Should we enforce runtime validation with Zod for all domain objects, or use TypeScript types for compile-time safety and only validate at system boundaries?

**Current Approach**: All domain types defined as Zod schemas AND TypeScript types (via `z.infer<typeof Schema>`). This provides both compile-time and runtime validation but requires maintaining parallel definitions.

**Alternatives**:

1. **Zod everywhere** (current): Every domain object is a Zod schema. Runtime validation everywhere but verbose and slower. Example: `UserSchema.parse(data)` throws on invalid data.
2. **TypeScript types only**: Use plain TypeScript interfaces. Fast and clean but no runtime safety - invalid data from database/API can break type assumptions.
3. **Boundary validation**: TypeScript types for internal code, Zod only at boundaries (API requests, database reads). Balances performance with safety.
4. **Branded types**: Use TypeScript branded types (`type UUID = string & { __brand: 'UUID' }`) for compile-time safety, validation helpers for runtime checks.

**Recommendation**: Use **boundary validation** (Option 3) with smart caching. Strategy:

- **API layer**: Zod validation on all requests (`RequestSchema.parse(req.body)`)
- **Database layer**: Zod validation when reading from DB (untrusted source)
- **Internal code**: TypeScript types only (trusted, already validated)
- **Serialization**: Zod validation when preparing responses

Implement validation caching for immutable objects - once an `ApprovedMeaning` is validated, it stays valid. Add `Validated<T>` wrapper type to mark validated objects. This reduces validation overhead while maintaining safety.

---

### 2. Domain Events and Immutability Patterns

**Question**: Should domain objects be immutable (functional style) or mutable (OOP style), and how should state changes be tracked?

**Current Approach**: Domain objects are plain TypeScript interfaces (no methods). Mutations happen via service layer functions. No explicit immutability enforcement or event tracking in the domain model itself.

**Alternatives**:

1. **Mutable objects** (current): Plain objects modified in-place. Simple but prone to bugs (accidental mutations, unclear state transitions).
2. **Immutable objects**: Use `readonly` modifiers and return new objects for changes. Functional style, safer but more verbose.
3. **Domain events**: Rich domain objects with methods that emit events (`Utterance.approve()` emits `UtteranceApprovedEvent`). Clear semantics but more complex.
4. **Copy-on-write with Immer**: Use Immer library for immutable updates with mutable syntax. Best of both worlds but adds dependency.
5. **Hybrid**: Immutable for shared knowledge base (approved content), mutable for user-specific data (SRS items).

**Recommendation**: Implement **immutable objects with domain events** (Option 3 + 2 hybrid). Define domain objects as:

```typescript
export class ApprovedMeaning {
  constructor(private readonly data: ApprovedMeaningData) {}

  deprecate(reason: string): [ApprovedMeaning, MeaningDeprecatedEvent] {
    const updated = new ApprovedMeaning({
      ...this.data,
      status: 'deprecated',
      deprecationReason: reason,
      deprecatedAt: new Date(),
    });
    const event = new MeaningDeprecatedEvent(this.data.id, reason);
    return [updated, event];
  }
}
```

This makes state transitions explicit, enables event sourcing for audit trails (F009), and prevents accidental mutations. Use classes for core domain entities (`ApprovedMeaning`, `Utterance`, `SRSItem`), plain interfaces for value objects (`CEFRLevel`, `Language`).

---

### 3. Error Handling: Exceptions vs Result Types

**Question**: Should domain operations throw exceptions on errors, or return Result<T, E> types for explicit error handling?

**Current Approach**: Not explicitly defined. Likely uses TypeScript exceptions (standard JavaScript pattern). Errors bubble up to API layer where they're caught and converted to HTTP responses.

**Alternatives**:

1. **Exceptions** (current TypeScript default): `throw new Error()` for errors. Simple and idiomatic but makes error cases invisible in type signatures.
2. **Result types**: Return `Result<T, Error>` (success or failure). Explicit error handling, forces callers to handle errors, but verbose.
3. **Hybrid**: Exceptions for truly exceptional cases (programming errors), Result types for expected failures (validation, business rules).
4. **Option types**: Use `T | null` or `T | undefined` for optional results. Lightweight but loses error information.

**Recommendation**: Implement **Result types for domain operations** (Option 2). Create utility types:

```typescript
export type Success<T> = { ok: true; value: T };
export type Failure<E> = { ok: false; error: E };
export type Result<T, E = Error> = Success<T> | Failure<E>;

// Domain operation example
class UtteranceValidator {
  validate(text: string): Result<ValidatedUtterance, ValidationError> {
    if (text.length === 0) {
      return { ok: false, error: new ValidationError('Empty text') };
    }
    return { ok: true, value: new ValidatedUtterance(text) };
  }
}
```

This makes error cases explicit in types, forces error handling at call sites, and enables better error messages. Reserve exceptions for truly unexpected errors (database connection failures, out of memory). Use pattern matching libraries (ts-pattern) for ergonomic Result handling.
