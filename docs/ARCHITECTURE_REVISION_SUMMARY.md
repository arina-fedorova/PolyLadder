# Architecture Revision Summary

**Date**: 2025-12-21  
**Impact**: Major architectural change to content pipeline  
**Status**: Approved - new direction

---

## What Changed

### ❌ OLD Architecture (Problematic)

```
System decides what to generate
    ↓
LLM generates content from scratch ("Generate Spanish A1 word")
    ↓
Random word without context
    ↓
Operator approves/rejects
    ↓
If rejected → discarded (no learning)
```

**Problems:**

1. No pedagogical structure
2. Expensive (full generation)
3. Inconsistent quality
4. No operator control over curriculum
5. No connection to real teaching materials
6. Feedback not used for improvement

### ✅ NEW Architecture (Better)

```
Operator defines curriculum structure (topics per level)
    ↓
Operator uploads PDF textbook (Nuovo Espresso, Assimil, etc.)
    ↓
System parses PDF → extracts raw text chunks
    ↓
Semantic mapping: chunks → topics (LLM: "which topic?")
    ↓
LLM transforms raw text → structured format (NOT generation!)
    ↓
Pipeline: DRAFT → CANDIDATE → VALIDATED
    ↓
Operator reviews
    ├─ Approve → APPROVED
    └─ Reject with comment → Feedback stored
        ↓
        Retry with feedback → improved version
```

**Benefits:**

1. ✅ Real teaching materials (proven pedagogy)
2. ✅ Cheaper (transformation < generation)
3. ✅ Operator controls structure
4. ✅ Feedback loop → continuous improvement
5. ✅ Consistent with real textbooks
6. ✅ Traceable (item → chunk → document)

---

## Key Components

### 1. Curriculum Structure (Operator-Defined)

```sql
-- Pre-created levels
curriculum_levels: A0, A1, A2, B1, B2, C1, C2

-- Operator defines topics
curriculum_topics:
  - IT/A1/Greetings & Introductions (order: 1)
  - IT/A1/Numbers 0-100 (order: 2)
  - IT/A1/Family & Relationships (order: 3, prerequisites: [greetings])
```

**Operator UI:**

- Select language
- For each level, add topics
- Define order and prerequisites
- System enforces structure

### 2. Document Upload

```
Upload: Nuovo_Espresso_1_Libro.pdf
Language: Italian
Level: A1
Type: Textbook
```

**System:**

- Stores file (Fly Volumes / S3)
- Extracts text (pdf-parse)
- Detects structure (chapters, vocab sections, dialogues)
- Creates raw_content_chunks

### 3. Semantic Mapping

```
Chunk: "Ciao! Come ti chiami?"
    ↓
LLM: "Which topic does this match?"
    → Topic: "Greetings & Introductions"
    → Confidence: 0.95
    ↓
Operator confirms or corrects
```

### 4. LLM Transformation (NOT Generation!)

**OLD Prompt:**

```
"Generate a Spanish A1 vocabulary word"
→ Random word (expensive, no context)
```

**NEW Prompt:**

```
"Transform this extracted text into structured format:

Raw text: 'Ciao! Come ti chiami? Mi chiamo Marco.'
Topic: Greetings & Introductions
Source: Nuovo Espresso Unit 1, page 12

Return structured vocabulary entries as JSON."

→ Structured output from real textbook (cheaper, high quality)
```

### 5. Feedback Loop

**OLD:**

```
Operator rejects → item discarded
```

**NEW:**

```
Operator rejects → adds comment:
"Definition incomplete. Add that 'ciao' means goodbye too."
    ↓
System stores feedback
    ↓
Operator clicks "Retry"
    ↓
LLM re-transforms with feedback included:
"Previous rejection: 'Add that ciao means goodbye too.'
 Incorporate this feedback."
    ↓
Improved item → operator approves
```

---

## Database Changes

### New Tables

```sql
-- Pre-created CEFR levels
curriculum_levels (id, code, name, description, order_index)

-- Operator-defined topics
curriculum_topics (id, language, level_code, topic_name, order_index, prerequisites)

-- Uploaded documents
document_sources (id, filename, language, level_code, source_type, file_path, processing_status)

-- Raw extracted content
raw_content_chunks (id, document_id, chunk_type, raw_text, page_number)

-- Semantic mapping
content_topic_mappings (id, chunk_id, topic_id, confidence, operator_confirmed)

-- Operator feedback on rejections
operator_feedback (id, item_id, rejection_reason, suggested_improvement, operator_id)
```

### Modified Tables

```sql
-- drafts: add source tracking
ALTER TABLE drafts ADD COLUMN source_document_id UUID;
ALTER TABLE drafts ADD COLUMN source_chunk_id UUID;
ALTER TABLE drafts ADD COLUMN topic_id UUID;
ALTER TABLE drafts ADD COLUMN transformation_prompt TEXT;
ALTER TABLE drafts ADD COLUMN previous_feedback_ids UUID[];
```

---

## Feature Roadmap Changes

### Phase 4: Content Refinement Service (REVISED)

| Old Feature                   | New Feature                           | Change                                           |
| ----------------------------- | ------------------------------------- | ------------------------------------------------ |
| F014: Service Loop            | F014: Curriculum Structure Management | Operator defines topics                          |
| F015: Work Planner            | F015: Document Upload System          | Upload PDFs instead of "decide what to generate" |
| F016: Data Source Integration | F016: PDF Parsing Engine              | Extract text from documents                      |
| F017: Automated Pipeline      | F017: Semantic Mapping Engine         | Map chunks → topics                              |
| (new)                         | F018: LLM Transformation              | Transform (not generate!) raw → structured       |
| (new)                         | F019: Enhanced Pipeline               | Existing pipeline + source traceability          |
| (new)                         | F020: Feedback Loop                   | Reject with comments, retry with feedback        |

---

## Migration Path

### For Existing MVP Code:

1. **Keep existing pipeline**: DRAFT → CANDIDATE → VALIDATED → APPROVED ✅
2. **Keep quality gates**: Schema validation, language checks ✅
3. **Keep operator approval UI**: Browse, approve, reject ✅

### What Changes:

1. **Add curriculum management UI** (F014)
2. **Add document upload** (F015)
3. **Add PDF parser** (F016)
4. **Add semantic mapper** (F017)
5. **Change LLM prompts**: from generation → transformation (F018)
6. **Add feedback system** (F020)

### Backward Compatibility:

- Existing approved data stays unchanged
- Can still use old generation method temporarily
- Gradually migrate to document-based approach

---

## Cost Analysis

### OLD: Full LLM Generation

```
Generate 1000 vocabulary items:
- Prompt: 50 tokens × 1000 = 50k tokens
- Response: 200 tokens × 1000 = 200k tokens
- Total: 250k tokens
- Cost: ~$100 (Claude 3.5 Sonnet)
```

### NEW: Document Transformation

```
Buy textbook PDF: $30
Extract 1000 items from PDF: free (one-time parsing)

Transform 1000 items:
- Prompt: 100 tokens × 1000 = 100k tokens (includes raw text)
- Response: 200 tokens × 1000 = 200k tokens
- Total: 300k tokens
- Cost: ~$12 (Claude 3.5 Sonnet)

TOTAL: $30 (PDF) + $12 (LLM) = $42
vs $100 for generation alone

For multiple languages × multiple levels:
- 1 PDF covers entire A1 level (500+ items)
- 5 languages × 7 levels = 35 PDFs
- 35 × $42 = $1,470 for complete curriculum
vs $500/level × 35 = $17,500 for generation
```

**Savings: ~90% cost reduction**

---

## Quality Improvements

### Consistency

```
OLD: Each generated item independent
     → Inconsistent terminology
     → No coherent progression

NEW: All items from same textbook
     → Consistent terminology
     → Natural progression (as designed by pedagogy experts)
```

### Pedagogy

```
OLD: LLM decides what "A1" means
     → May not match CEFR standards

NEW: Content from established textbooks
     → Proven pedagogy
     → CEFR-aligned (textbooks are certified)
```

### Cultural Accuracy

```
OLD: LLM may generate culturally inappropriate content

NEW: Content from native speakers' textbooks
     → Culturally appropriate
     → Natural language usage
```

---

## Implementation Priority

### Immediate (MVP):

1. F014: Curriculum Structure Management
2. F015: Document Upload
3. F016: PDF Parsing
4. F017: Semantic Mapping

### Short-term:

5. F018: LLM Transformation
6. F019: Pipeline Enhancement
7. F020: Feedback Loop

### Future Enhancements:

- OCR for scanned PDFs
- Audio extraction from video sources
- Web scraping for corpus data
- Automatic quality assessment
- Multi-document synthesis

---

## Summary

**This is a MAJOR IMPROVEMENT!**

The new architecture:

- ✅ Uses real teaching materials
- ✅ 90% cost reduction
- ✅ Higher quality (proven pedagogy)
- ✅ Operator control
- ✅ Feedback-driven improvement
- ✅ Traceable provenance

**Old approach (LLM generation):**

- ❌ Random content
- ❌ Expensive
- ❌ No structure
- ❌ No feedback loop

**Decision: Proceed with new architecture.** 🚀
