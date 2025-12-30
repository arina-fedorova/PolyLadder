# Revised Content Pipeline Architecture

**Document type**: Architecture Specification
**Status**: Authoritative (v2.0)
**Date**: 2025-12-30
**Language**: English

---

## 1. Overview

PolyLadder uses a **document-based content pipeline** where educational content is extracted from real textbooks and transformed (not generated) by LLMs into structured learning materials.

### Key Principle

**LLM is a SPLITTER and TRANSFORMER, not a GENERATOR**

```
Source: PDF textbook (Nuovo Espresso, Assimil, etc.)
       ↓
   CHUNKER extracts raw text
       ↓
   SEMANTIC SPLIT (LLM #1) categorizes content into drafts
       ↓
   DRAFT REVIEW (Operator) approves/rejects/re-runs
       ↓
   TRANSFORM (LLM #2) creates structured lessons
       ↓
   VALIDATED items enter Review Queue
       ↓
   FINAL REVIEW (Operator) approves → APPROVED content
```

---

## 2. Pipeline Flow Diagram

```
PDF Document
     │
     ▼
┌──────────────────────┐
│ CHUNK                │  ChunkerService (no LLM)
│                      │  - PDF → raw text pages
└──────────────────────┘  - Basic section detection
     │
     ▼
┌──────────────────────┐
│ SEMANTIC SPLIT       │  LLM #1:
│ (LLM #1)             │  - Splits chunk into items
└──────────────────────┘  - Maps each to topic + level
     │                    - Determines content_type
     │                    - Does NOT change content
     ▼
┌──────────────────────┐
│ DRAFTS               │  original_content +
│                      │  topic_id + level + type
└──────────────────────┘
     │
     ▼
┌──────────────────────┐
│ DRAFT REVIEW         │  Operator:
│ (Operator UI)        │  ✓ Approve / ✗ Reject / ↻ Re-run
│                      │  ✎ Override topic/level
│                      │  ✓✓ Bulk Approve
└──────────────────────┘
     │
     ▼ (approved only)
┌──────────────────────┐
│ CANDIDATES           │  Basic normalization
└──────────────────────┘  (trim, validate fields)
     │
     ▼
┌──────────────────────┐
│ TRANSFORM            │  LLM #2:
│ (LLM #2)             │  - explanation (base language)
└──────────────────────┘  - examples (target language)
     │                    - commonMistakes
     ▼
┌──────────────────────┐
│ VALIDATED            │  Complete lesson item
│ + Review Queue       │
└──────────────────────┘
     │
     ▼
┌──────────────────────┐
│ FINAL REVIEW         │  Operator:
│ (Operator UI)        │  ✓ Approve → Approved Content
│                      │  ✗ Reject → Deleted (permanent)
└──────────────────────┘
```

---

## 3. Stage Details

### 3.1 Chunking (No LLM)

**Service**: `ChunkerService`
**Input**: PDF file
**Output**: `raw_content_chunks` table entries

The chunker:

1. Extracts text from PDF pages
2. Detects basic structure (chapters, sections)
3. Splits into semantic paragraphs
4. Classifies chunk type heuristically (vocabulary_section, grammar_explanation, dialogue, etc.)

**No LLM calls at this stage** - pure text processing.

### 3.2 Semantic Split (LLM #1)

**Service**: `SemanticSplitService`
**Input**: Raw content chunk + curriculum schema
**Output**: Multiple `drafts` entries

This is the **first LLM call**. The LLM:

1. Receives the raw chunk text
2. Receives the full curriculum schema (all levels, all topics, all types)
3. Identifies distinct learning items within the chunk
4. For EACH item:
   - Assigns `topic_id` from curriculum
   - Assigns `level` (A0-C2)
   - Assigns `content_type` (vocabulary, grammar, orthography, mixed)
   - Preserves `original_content` verbatim

**CRITICAL**: LLM does NOT modify content at this stage. It only categorizes and splits.

```typescript
interface SemanticSplitResult {
  items: Array<{
    original_content: string; // Exact text from chunk (no changes)
    suggested_topic_id: string; // UUID from curriculum_topics
    suggested_level: string; // A0-C2
    content_type: 'vocabulary' | 'grammar' | 'orthography' | 'mixed';
    reasoning: string; // Why this mapping
  }>;
}
```

**If no matching topic found**: Item is NOT created (skipped entirely).

### 3.3 Draft Review (Operator UI)

**UI Page**: `DraftReviewPage`
**Actions per draft**:

- **Approve**: Draft moves to Candidate stage
- **Reject**: Draft is deleted (no re-processing)
- **Re-run**: Draft is deleted and chunk is re-processed with optional operator comment
- **Override**: Change suggested topic/level before approving

**Bulk Actions**:

- **Bulk Approve**: Approve all selected drafts at once
- **Bulk Reject**: Delete all selected drafts

**Display**:

- Show `original_content` preview
- Show `suggested_topic_id` with topic name
- Show `suggested_level`
- Show `reasoning` from LLM
- Allow filtering by level, topic, document

### 3.4 Candidate Normalization (No LLM)

**Service**: `NormalizationService`
**Input**: Approved draft
**Output**: `candidates` table entry

Simple normalization:

- Trim whitespace
- Validate required fields exist
- Validate topic_id references valid curriculum_topics

**No LLM calls** - just data cleanup.

### 3.5 Transform (LLM #2)

**Service**: `ContentTransformerService`
**Input**: Candidate with original_content + topic context
**Output**: `validated` table entry with structured lesson

This is the **second LLM call**. The LLM:

1. Receives the `original_content`
2. Receives topic name, level, content_type
3. Creates a structured lesson:

For **vocabulary**:

```json
{
  "word": "ciao",
  "definition": "hello or goodbye (informal)",
  "partOfSpeech": "interjection",
  "examples": [{ "target": "Ciao! Come stai?", "translation": "Hi! How are you?" }],
  "usageNotes": "Used for both greeting and farewell with friends"
}
```

For **grammar**:

```json
{
  "title": "Present Tense of 'essere'",
  "explanation": "The verb 'essere' means 'to be' and is irregular...",
  "examples": [
    { "correct": "Io sono italiano", "translation": "I am Italian" },
    { "incorrect": "Io essere italiano", "note": "Missing conjugation" }
  ],
  "commonMistakes": "Confusing 'essere' with 'stare' for temporary states"
}
```

**Language Rule**:

- `explanation`, `notes`, `commonMistakes` → Base language (English)
- `examples`, `word`, `target sentences` → Target language (Spanish/Italian/etc.)

### 3.6 Final Review (Operator UI)

**UI**: `ReviewQueuePage` / `PipelineReviewQueue`
**Input**: Validated items
**Actions**:

- **Approve**: Item moves to `approved_*` tables (immutable)
- **Reject**: Item is deleted permanently (added to `rejected_items` to prevent re-creation)

---

## 4. Database Schema Additions

### 4.1 Drafts Table Updates

```sql
ALTER TABLE drafts ADD COLUMN approval_status VARCHAR(20)
  DEFAULT 'pending'
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE drafts ADD COLUMN approved_by UUID REFERENCES users(id);
ALTER TABLE drafts ADD COLUMN approved_at TIMESTAMPTZ;
ALTER TABLE drafts ADD COLUMN rejection_reason TEXT;

ALTER TABLE drafts ADD COLUMN suggested_topic_id UUID REFERENCES curriculum_topics(id);
ALTER TABLE drafts ADD COLUMN suggested_level VARCHAR(2);
ALTER TABLE drafts ADD COLUMN original_content TEXT;
ALTER TABLE drafts ADD COLUMN llm_reasoning TEXT;
```

### 4.2 Draft Review Queue

```sql
CREATE TABLE draft_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  pipeline_id UUID REFERENCES pipelines(id),
  priority INT DEFAULT 5,
  queued_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMPTZ,
  UNIQUE(draft_id)
);

CREATE INDEX idx_draft_review_queue_draft ON draft_review_queue(draft_id);
CREATE INDEX idx_draft_review_queue_reviewed ON draft_review_queue(reviewed_at) WHERE reviewed_at IS NULL;
```

---

## 5. API Endpoints

### 5.1 Draft Review Endpoints

```
GET    /operational/drafts/review
       Query params: page, limit, level, topic_id, pipeline_id
       Returns: paginated drafts pending review

POST   /operational/drafts/:id/approve
       Body: { overrideTopicId?, overrideLevel? }
       Returns: { success: true, candidateId: string }

POST   /operational/drafts/:id/reject
       Body: { reason?: string }
       Returns: { success: true }

POST   /operational/drafts/:id/rerun
       Body: { comment?: string }
       Returns: { success: true }

POST   /operational/drafts/bulk-approve
       Body: { ids: string[] }
       Returns: { approved: number }

POST   /operational/drafts/bulk-reject
       Body: { ids: string[], reason?: string }
       Returns: { rejected: number }
```

---

## 6. LLM Prompts

### 6.1 Semantic Split Prompt (LLM #1)

```
You are analyzing educational content for language learning.
Split this text into distinct learning items and categorize each.

## Curriculum Structure:
{JSON of all levels, topics, types}

## Source Document:
Language: {language}
Document Type: {textbook/grammar_guide/etc}

## Raw Text Chunk:
"{chunk_text}"

## Instructions:
1. Identify EACH distinct learning item in the text
2. For each item, determine:
   - Which curriculum topic it belongs to
   - Which CEFR level (A0-C2)
   - Content type (vocabulary/grammar/orthography/mixed)
3. If no suitable topic exists, skip that item
4. Do NOT modify the content - preserve exact text
5. One item per topic - don't duplicate

## Output (JSON):
{
  "items": [
    {
      "original_content": "exact text from chunk",
      "topic_id": "uuid",
      "level": "A1",
      "content_type": "vocabulary",
      "reasoning": "why this categorization"
    }
  ]
}
```

### 6.2 Transform Prompt (LLM #2)

```
You are creating a structured language lesson from raw content.

## Context:
- Language: {target_language}
- Base Language: English (for explanations)
- Level: {cefr_level}
- Topic: {topic_name}
- Content Type: {vocabulary/grammar/orthography}

## Original Content:
"{original_content}"

## Instructions:
1. Create a structured lesson from this content
2. Explanations, notes, commonMistakes → in English
3. Examples, words, target text → in {target_language}
4. Match complexity to CEFR level {level}
5. Include practical usage context

## Output (JSON for {content_type}):
{appropriate structure based on content_type}
```

---

## 7. Benefits

### 7.1 Cost Efficiency

- **Previous**: LLM called for mapping + transformation in one go
- **Now**: LLM #1 (cheap categorization) + manual gate + LLM #2 (only for approved)
- **Savings**: ~50-70% fewer transformation calls (many drafts rejected before transform)

### 7.2 Quality Control

- Operator reviews mappings BEFORE expensive transformation
- No wasted tokens on incorrectly mapped content
- Clear audit trail: chunk → draft → candidate → validated → approved

### 7.3 Deduplication

- Draft review catches duplicates before transformation
- One topic = one draft (no multiple mappings to same content)
- `rejected_items` table prevents re-creation

### 7.4 Transparency

- Every stage visible to operator
- Clear separation: categorization (LLM#1) vs content creation (LLM#2)
- Easier debugging when something goes wrong

---

## 8. Migration Notes

### 8.1 Removed: Quality Gates

Quality Gates (`ContentSafetyGate`, `CEFRConsistencyGate`, `DuplicationGate`, `LanguageStandardGate`) are **removed** from the pipeline.

Reasons:

- Draft Review provides manual quality control
- Gates were adding complexity without proportional value
- Can be reintroduced later if needed

### 8.2 Removed: Auto-Mapping

SemanticMapper's "find ALL relevant topics" approach is replaced by SemanticSplit which creates exactly one draft per identified item.

### 8.3 Changed: Pipeline Flow

```
OLD: Chunk → Map (all topics) → Transform → Validate → Review → Approve
NEW: Chunk → Split (drafts) → Draft Review → Candidate → Transform → Review → Approve
```

---

## 9. Implementation Checklist

- [ ] Migration: Add draft approval fields
- [ ] Migration: Create draft_review_queue table
- [ ] Service: SemanticSplitService (LLM #1)
- [ ] Service: Update ContentTransformerService for Candidate → Validated
- [ ] Service: Remove Quality Gates from PromotionWorker
- [ ] API: Draft review endpoints
- [ ] UI: DraftReviewPage component
- [ ] Tests: Update existing tests
- [ ] Tests: Add new tests for draft review flow

---

END OF DOCUMENT
