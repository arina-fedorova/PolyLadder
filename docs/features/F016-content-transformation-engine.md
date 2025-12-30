# F016: Content Transformation Engine

**Feature Code**: F016
**Created**: 2025-12-21
**Revised**: 2025-12-30
**Phase**: 4 - Content Refinement Service
**Status**: 🔄 In Progress (v2.0 Revision)
**Replaces**: F016 v1.0 (single-stage transformation)

---

## Description

Two-stage LLM pipeline that processes raw document chunks into structured learning content. Stage 1 (Semantic Split) categorizes content into drafts. After operator review, Stage 2 (Transform) converts approved content into lessons.

## Success Criteria

- [ ] Semantic Split (LLM #1): chunks → categorized drafts
- [ ] Draft Review UI: approve/reject/re-run drafts
- [ ] Bulk operations for draft approval
- [ ] Transform (LLM #2): approved candidates → structured lessons
- [ ] Full source traceability: chunk → draft → candidate → validated
- [ ] Cost optimization: only transform approved content

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    DOCUMENT CHUNK                             │
│                  (raw_content_chunks)                         │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                  SEMANTIC SPLIT (LLM #1)                      │
│                                                               │
│  Input:                                                       │
│    - chunk.cleaned_text                                       │
│    - Full curriculum schema (all levels, topics, types)       │
│                                                               │
│  Output (per identified item):                                │
│    - original_content (verbatim from chunk)                   │
│    - suggested_topic_id                                       │
│    - suggested_level (A0-C2)                                  │
│    - content_type (vocabulary/grammar/orthography/mixed)      │
│    - reasoning                                                │
│                                                               │
│  Rules:                                                       │
│    - Do NOT modify content                                    │
│    - One draft per distinct learning item                     │
│    - Skip if no matching topic found                          │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                        DRAFTS                                 │
│                                                               │
│  Fields:                                                      │
│    - id, document_id, chunk_id                                │
│    - original_content                                         │
│    - suggested_topic_id, suggested_level                      │
│    - data_type, llm_reasoning                                 │
│    - approval_status: pending | approved | rejected           │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                   DRAFT REVIEW (Operator)                     │
│                                                               │
│  Actions:                                                     │
│    ✓ Approve  → Draft becomes Candidate                       │
│    ✗ Reject   → Draft deleted (no re-processing)              │
│    ↻ Re-run   → Delete & re-process chunk with comment        │
│    ✎ Override → Change topic/level before approving           │
│                                                               │
│  Bulk Actions:                                                │
│    ✓✓ Bulk Approve selected drafts                            │
│    ✗✗ Bulk Reject selected drafts                             │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼ (approved only)
┌──────────────────────────────────────────────────────────────┐
│                      CANDIDATES                               │
│                                                               │
│  Normalization:                                               │
│    - Trim whitespace                                          │
│    - Validate topic_id exists                                 │
│    - Validate level is valid CEFR                             │
│    - Set status = 'pending'                                   │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                   TRANSFORM (LLM #2)                          │
│                                                               │
│  Input:                                                       │
│    - candidate.original_content                               │
│    - topic name, level, content_type                          │
│                                                               │
│  Output:                                                      │
│    - Structured lesson (JSON)                                 │
│    - explanation (English)                                    │
│    - examples (target language)                               │
│    - commonMistakes (English)                                 │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                       VALIDATED                               │
│                    + review_queue                             │
│                                                               │
│  Awaits final operator approval                               │
└──────────────────────────────────────────────────────────────┘
```

---

## Tasks

### Task 1: Database Schema Updates

**Description**: Add fields for draft approval workflow.

**Migration**:

```sql
-- Draft approval fields
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20)
  DEFAULT 'pending'
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE drafts ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- LLM suggestions (can be overridden by operator)
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS suggested_topic_id UUID REFERENCES curriculum_topics(id);
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS suggested_level VARCHAR(2);
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS original_content TEXT;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS llm_reasoning TEXT;

-- Draft review queue
CREATE TABLE IF NOT EXISTS draft_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  pipeline_id UUID REFERENCES pipelines(id),
  priority INT DEFAULT 5,
  queued_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMPTZ,
  UNIQUE(draft_id)
);

CREATE INDEX IF NOT EXISTS idx_draft_review_queue_draft ON draft_review_queue(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_review_queue_reviewed ON draft_review_queue(reviewed_at) WHERE reviewed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_drafts_approval_status ON drafts(approval_status);
```

**Files**: `packages/db/src/migrations/031_draft_approval.ts`

---

### Task 2: Semantic Split Service (LLM #1)

**Description**: Service that analyzes chunks and creates categorized drafts.

**Implementation**:

```typescript
// packages/refinement-service/src/services/semantic-split.service.ts

interface SemanticSplitResult {
  items: Array<{
    original_content: string;
    suggested_topic_id: string;
    suggested_level: string;
    content_type: 'vocabulary' | 'grammar' | 'orthography' | 'mixed';
    reasoning: string;
  }>;
}

export class SemanticSplitService {
  constructor(
    private readonly pool: Pool,
    private readonly anthropic: Anthropic
  ) {}

  async splitChunk(chunkId: string, pipelineId: string): Promise<void> {
    const chunk = await this.getChunk(chunkId);
    const curriculum = await this.getFullCurriculum(chunk.language);

    const result = await this.callLLM(chunk, curriculum);

    for (const item of result.items) {
      if (!item.suggested_topic_id) continue; // Skip if no topic match

      await this.createDraft(item, chunkId, pipelineId);
    }
  }

  private buildPrompt(chunk: Chunk, curriculum: Curriculum): string {
    return `You are analyzing educational content for language learning.
Split this text into distinct learning items and categorize each.

## Curriculum Structure:
${JSON.stringify(curriculum, null, 2)}

## Source Document:
Language: ${chunk.language}
Chunk Type: ${chunk.chunkType}

## Raw Text:
"${chunk.cleanedText}"

## Instructions:
1. Identify EACH distinct learning item in the text
2. For each item:
   - Assign to ONE curriculum topic (use topic_id)
   - Determine CEFR level (A0-C2)
   - Determine content_type (vocabulary/grammar/orthography/mixed)
3. If no suitable topic exists, skip that item
4. Do NOT modify content - preserve exact text
5. One draft per topic - avoid duplicates

## Output (JSON):
{
  "items": [
    {
      "original_content": "exact text from chunk",
      "suggested_topic_id": "uuid-here",
      "suggested_level": "A1",
      "content_type": "vocabulary",
      "reasoning": "why this categorization"
    }
  ]
}`;
  }
}
```

**Files**: `packages/refinement-service/src/services/semantic-split.service.ts`

---

### Task 3: Draft Review API Endpoints

**Description**: REST API for draft approval workflow.

**Endpoints**:

```typescript
// GET /operational/drafts/review
// Query: page, limit, level, topic_id, pipeline_id
// Returns paginated drafts pending review

// POST /operational/drafts/:id/approve
// Body: { overrideTopicId?, overrideLevel? }
// Creates candidate from draft

// POST /operational/drafts/:id/reject
// Body: { reason?: string }
// Marks draft as rejected

// POST /operational/drafts/:id/rerun
// Body: { comment?: string }
// Deletes draft, re-queues chunk for processing

// POST /operational/drafts/bulk-approve
// Body: { ids: string[] }
// Bulk approve drafts

// POST /operational/drafts/bulk-reject
// Body: { ids: string[], reason?: string }
// Bulk reject drafts
```

**Files**: `packages/api/src/routes/operational/drafts.ts`

---

### Task 4: Draft Review UI

**Description**: React page for reviewing and approving drafts.

**Components**:

```typescript
// packages/web/src/pages/operator/DraftReviewPage.tsx

export function DraftReviewPage() {
  // Features:
  // - List of pending drafts with filters
  // - Preview original_content
  // - Show suggested topic/level with override option
  // - Show LLM reasoning
  // - Approve/Reject/Re-run buttons
  // - Bulk selection and actions
  // - Pagination
}
```

**Files**: `packages/web/src/pages/operator/DraftReviewPage.tsx`

---

### Task 5: Update Transform Service (LLM #2)

**Description**: Modify transformer to work with approved candidates.

**Changes**:

- Input: `candidates` table (approved drafts)
- Use `original_content` as source
- Output: `validated` table with structured lesson

**Files**: `packages/refinement-service/src/services/content-transformer.service.ts`

---

### Task 6: Remove Quality Gates

**Description**: Remove quality gate execution from pipeline.

**Changes**:

- Remove `runGatesByTier` calls from PromotionWorker
- Keep gate code for potential future use
- Candidate → Validated transition is direct (after LLM transform)

**Files**:

- `packages/refinement-service/src/services/promotion-worker.service.ts`
- `packages/refinement-service/src/pipeline/steps/validation.step.ts`

---

## API Reference

### GET /operational/drafts/review

**Query Parameters**:

- `page` (number, default: 1)
- `limit` (number, default: 20)
- `level` (string, optional): Filter by CEFR level
- `topic_id` (string, optional): Filter by topic
- `pipeline_id` (string, optional): Filter by pipeline

**Response**:

```json
{
  "drafts": [
    {
      "id": "uuid",
      "original_content": "text from chunk",
      "suggested_topic_id": "uuid",
      "suggested_topic_name": "Greetings",
      "suggested_level": "A1",
      "content_type": "vocabulary",
      "llm_reasoning": "Contains greeting phrases",
      "document_name": "textbook.pdf",
      "created_at": "2025-12-30T10:00:00Z"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

### POST /operational/drafts/:id/approve

**Request Body**:

```json
{
  "overrideTopicId": "uuid (optional)",
  "overrideLevel": "A2 (optional)"
}
```

**Response**:

```json
{
  "success": true,
  "candidateId": "uuid"
}
```

### POST /operational/drafts/bulk-approve

**Request Body**:

```json
{
  "ids": ["uuid1", "uuid2", "uuid3"]
}
```

**Response**:

```json
{
  "approved": 3
}
```

---

## LLM Prompts

### Semantic Split Prompt (LLM #1)

See Task 2 implementation.

Key requirements:

- Receive full curriculum schema
- Identify distinct learning items
- Map each to exactly one topic
- Preserve original text verbatim
- Skip items with no topic match

### Transform Prompt (LLM #2)

```
You are creating a structured language lesson from raw content.

## Context:
- Target Language: {language}
- Base Language: English (for explanations)
- CEFR Level: {level}
- Topic: {topic_name}
- Content Type: {content_type}

## Original Content:
"{original_content}"

## Instructions:
1. Create structured lesson from this content
2. Explanations, notes, commonMistakes → in English
3. Examples, words, target sentences → in {language}
4. Match complexity to CEFR level
5. Include practical usage context

## Output Format:
{JSON structure based on content_type}
```

---

## Dependencies

- **Blocks**: F025-F028 (Operational UI)
- **Depends on**: F014 (Curriculum), F015 (Document Processing)

---

## Migration from v1.0

### What Changed

| Aspect        | v1.0                        | v2.0                               |
| ------------- | --------------------------- | ---------------------------------- |
| Mapping       | SemanticMapper (all topics) | SemanticSplit (one draft per item) |
| Review Point  | After transformation        | Before transformation              |
| Quality Gates | Automatic                   | Removed (manual review)            |
| LLM Calls     | 1 (mapping+transform)       | 2 (split, then transform)          |
| Cost          | Transform all mapped        | Transform only approved            |

### Migration Steps

1. Run migration to add draft approval fields
2. Deploy SemanticSplitService
3. Update UI to include DraftReviewPage
4. Remove quality gate calls from PromotionWorker
5. Update existing drafts to `approval_status = 'pending'`

---

## Notes

- Drafts pending review are NOT automatically processed
- Operator must explicitly approve before transformation
- Rejected drafts are deleted, not archived
- Re-run action deletes draft and creates new split request
- Bulk approve is the expected workflow for high-confidence items
