# Revised Content Pipeline Architecture

## Current Problems

### ❌ What's Wrong Now:

```
LLM: "Generate Spanish A1 vocabulary word"
→ Random word without context
→ No connection to real teaching materials
→ Expensive API calls
→ No pedagogical structure
→ Operator has no control
```

## ✅ New Architecture: Document-Based Content Pipeline

### Core Principle

**LLM is a TRANSFORMER, not a GENERATOR**

```
Source: PDF textbook (Nuovo Espresso, Assimil, etc.)
       ↓
   PARSER extracts raw content
       ↓
   SEMANTIC MAPPER links to curriculum structure
       ↓
   LLM transforms raw → structured format
       ↓
   PIPELINE validates & refines
       ↓
   OPERATOR approves/rejects with feedback
       ↓
   APPROVED content ready for learners
```

---

## 1. Curriculum Structure Management (Operator-Defined)

### 1.1 Initial Setup Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   OPERATOR FIRST LOGIN                      │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Language Selection                                 │
│  Select languages to support: ☑ ES ☑ IT ☑ PT ☐ FR ☐ DE     │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Level Structure (Pre-created)                      │
│                                                             │
│  For each language, system creates:                         │
│  ┌────────────────────────────────────────────────┐        │
│  │ LEVEL: A0 (Complete Beginner)                  │        │
│  │ LEVEL: A1 (Elementary)                         │        │
│  │ LEVEL: A2 (Pre-Intermediate)                   │        │
│  │ LEVEL: B1 (Intermediate)                       │        │
│  │ LEVEL: B2 (Upper Intermediate)                 │        │
│  │ LEVEL: C1 (Advanced)                           │        │
│  │ LEVEL: C2 (Mastery)                            │        │
│  └────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: Topic Definition per Level                        │
│                                                             │
│  Language: Spanish | Level: A1                             │
│  ┌────────────────────────────────────────────────┐        │
│  │ Topic 1: Greetings & Introductions             │        │
│  │   Order: 1                                      │        │
│  │   Description: Basic hello, goodbye, names     │        │
│  │   Prerequisites: [orthography]                  │        │
│  │                                                  │        │
│  │ Topic 2: Numbers 0-100                          │        │
│  │   Order: 2                                      │        │
│  │   Description: Counting, prices, phone numbers │        │
│  │   Prerequisites: [greetings]                    │        │
│  │                                                  │        │
│  │ Topic 3: Family & Relationships                 │        │
│  │   Order: 3                                      │        │
│  │   Description: Family members, relationships    │        │
│  │   Prerequisites: [greetings, numbers]           │        │
│  │                                                  │        │
│  │ [+ Add Topic]                                   │        │
│  └────────────────────────────────────────────────┘        │
│                                                             │
│  [Save Structure]                                           │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Database Schema

```sql
-- Pre-created levels (system data)
CREATE TABLE curriculum_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(2) NOT NULL CHECK (code IN ('A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  name TEXT NOT NULL,
  description TEXT,
  order_index INT NOT NULL,
  UNIQUE(code)
);

INSERT INTO curriculum_levels (code, name, description, order_index) VALUES
  ('A0', 'Complete Beginner', 'Absolute basics, orthography, pronunciation', 1),
  ('A1', 'Elementary', 'Basic phrases, simple grammar, common vocabulary', 2),
  ('A2', 'Pre-Intermediate', 'Simple conversations, past/future tenses', 3),
  ('B1', 'Intermediate', 'Fluent simple conversations, complex grammar', 4),
  ('B2', 'Upper Intermediate', 'Most topics, nuanced expression', 5),
  ('C1', 'Advanced', 'Sophisticated expression, native-like fluency', 6),
  ('C2', 'Mastery', 'Near-native, literary/academic language', 7);

-- Operator-defined topics
CREATE TABLE curriculum_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language VARCHAR(2) NOT NULL,
  level_code VARCHAR(2) NOT NULL REFERENCES curriculum_levels(code),
  topic_name TEXT NOT NULL,
  topic_description TEXT,
  order_index INT NOT NULL,
  prerequisites UUID[], -- Array of topic IDs
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(language, level_code, topic_name)
);

CREATE INDEX idx_curriculum_topics_language_level ON curriculum_topics(language, level_code);
```

---

## 2. Document Upload & Parsing

### 2.1 Upload Flow

```
┌─────────────────────────────────────────────────────────────┐
│  OPERATOR UI: Content Sources                               │
│                                                             │
│  [Upload Document]                                          │
│                                                             │
│  File: Nuovo_Espresso_1_Libro.pdf                          │
│  Language: Italian                                          │
│  Target Level: A1                                           │
│  Source Type: [Textbook ▼]                                  │
│                                                             │
│  Description: Official Nuovo Espresso textbook, Level 1    │
│                                                             │
│  [Upload & Process]                                         │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  DOCUMENT PROCESSOR                                         │
│                                                             │
│  1. PDF → Text extraction (pdf-parse, pdfjs)               │
│  2. Structure detection:                                    │
│     - Chapters / Units                                      │
│     - Vocabulary sections                                   │
│     - Grammar explanations                                  │
│     - Exercises                                             │
│     - Dialogues                                             │
│  3. Create raw content chunks                               │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  RAW CONTENT STORAGE                                        │
│                                                             │
│  document_sources table:                                    │
│  - id: uuid                                                 │
│  - filename: "Nuovo_Espresso_1_Libro.pdf"                  │
│  - language: "IT"                                           │
│  - level: "A1"                                              │
│  - uploaded_by: operator_id                                 │
│  - processing_status: "extracting"                          │
│  - total_pages: 200                                         │
│                                                             │
│  raw_content_chunks table:                                  │
│  - id: uuid                                                 │
│  - document_id: references document_sources                 │
│  - chunk_type: "vocabulary" | "grammar" | "dialogue"       │
│  - raw_text: "Unità 1: Primi contatti..."                  │
│  - page_number: 12                                          │
│  - order_index: 1                                           │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Database Schema

```sql
-- Uploaded documents
CREATE TABLE document_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  language VARCHAR(2) NOT NULL,
  level_code VARCHAR(2) NOT NULL,
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('textbook', 'grammar_guide', 'vocabulary_list', 'corpus')),
  description TEXT,
  file_path TEXT NOT NULL, -- S3/Fly Volumes path
  file_size_bytes BIGINT,
  total_pages INT,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  processing_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'extracting', 'mapping', 'complete', 'error')),
  processing_error TEXT
);

-- Raw extracted content
CREATE TABLE raw_content_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES document_sources(id) ON DELETE CASCADE,
  chunk_type VARCHAR(50) NOT NULL CHECK (chunk_type IN ('vocabulary', 'grammar', 'dialogue', 'exercise', 'text', 'unknown')),
  raw_text TEXT NOT NULL,
  page_number INT,
  order_index INT NOT NULL,
  metadata JSONB, -- OCR confidence, formatting, etc.
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_raw_chunks_document ON raw_content_chunks(document_id);
CREATE INDEX idx_raw_chunks_type ON raw_content_chunks(chunk_type);
```

---

## 3. Semantic Mapping

### 3.1 Mapping Flow

```
┌─────────────────────────────────────────────────────────────┐
│  SEMANTIC MAPPER                                            │
│                                                             │
│  Input: raw_content_chunks from Nuovo Espresso             │
│  Curriculum: IT/A1 topics (defined by operator)            │
│                                                             │
│  For each chunk:                                            │
│  1. Extract keywords/phrases                                │
│  2. Semantic similarity to topic descriptions               │
│  3. LLM: "Which topic does this belong to?"                 │
│  4. Link chunk → topic                                      │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
Example:
┌─────────────────────────────────────────────────────────────┐
│  Chunk: "Ciao! Come ti chiami? Mi chiamo Marco."           │
│         "Hello! What's your name? My name is Marco."        │
│                                                             │
│  LLM Prompt:                                                │
│  "Analyze this text. Which curriculum topic does it match?"│
│                                                             │
│  Available topics for IT/A1:                                │
│  1. Greetings & Introductions                               │
│  2. Numbers 0-100                                           │
│  3. Family & Relationships                                  │
│                                                             │
│  LLM Response: "Topic 1: Greetings & Introductions"        │
│  Confidence: 0.95                                           │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  MAPPED CONTENT                                             │
│                                                             │
│  content_topic_mappings table:                              │
│  - chunk_id: uuid                                           │
│  - topic_id: uuid (references curriculum_topics)            │
│  - confidence: 0.95                                         │
│  - mapping_method: "llm_semantic"                           │
│  - operator_confirmed: false (requires review)              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Database Schema

```sql
-- Semantic mapping between raw content and curriculum
CREATE TABLE content_topic_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES raw_content_chunks(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE,
  confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  mapping_method VARCHAR(50) NOT NULL CHECK (mapping_method IN ('llm_semantic', 'operator_manual', 'keyword_match')),
  operator_confirmed BOOLEAN NOT NULL DEFAULT false,
  confirmed_by UUID REFERENCES users(id),
  confirmed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(chunk_id, topic_id)
);

CREATE INDEX idx_mappings_chunk ON content_topic_mappings(chunk_id);
CREATE INDEX idx_mappings_topic ON content_topic_mappings(topic_id);
CREATE INDEX idx_mappings_unconfirmed ON content_topic_mappings(operator_confirmed) WHERE operator_confirmed = false;
```

---

## 4. LLM Transformation (NOT Generation!)

### 4.1 Transformation Flow

```
┌─────────────────────────────────────────────────────────────┐
│  LLM TRANSFORMER (not generator!)                          │
│                                                             │
│  Input:                                                     │
│  - Raw chunk: "Ciao! Come ti chiami?"                      │
│  - Topic: IT/A1/Greetings                                  │
│  - Document context: Nuovo Espresso Unit 1                 │
│                                                             │
│  LLM Prompt:                                                │
│  "Transform this raw text into structured vocabulary entry."│
│                                                             │
│  Raw text: "Ciao! Come ti chiami? Mi chiamo Marco."        │
│  Topic: Greetings & Introductions                          │
│  Language: Italian, Level: A1                               │
│                                                             │
│  Extract vocabulary words and create structured entries:    │
│                                                             │
│  Return JSON array:                                         │
│  [                                                          │
│    {                                                        │
│      "word": "ciao",                                        │
│      "definition": "hello, hi, bye (informal)",            │
│      "part_of_speech": "interjection",                     │
│      "example_sentence": "Ciao! Come stai?",               │
│      "translation": "Hi! How are you?",                     │
│      "usage_notes": "Informal greeting, use with friends"  │
│    },                                                       │
│    {                                                        │
│      "word": "chiamarsi",                                   │
│      "definition": "to be called, to be named",            │
│      "part_of_speech": "verb (reflexive)",                 │
│      "example_sentence": "Come ti chiami?",                │
│      "translation": "What's your name?",                    │
│      "conjugation": {"io": "mi chiamo", "tu": "ti chiami"}│
│    }                                                        │
│  ]                                                          │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  DRAFT CREATION                                             │
│                                                             │
│  INSERT INTO drafts (data_type, raw_data, source) VALUES   │
│    ('meaning', '{"word": "ciao", ...}', 'transform:doc123')│
│                                                             │
│  Metadata includes:                                         │
│  - source_document_id                                       │
│  - source_chunk_id                                          │
│  - topic_id                                                 │
│  - transformation_prompt (for debugging)                    │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Key Difference: Transform vs Generate

```
❌ OLD (Generation):
LLM Prompt: "Generate a Spanish A1 vocabulary word"
Result: Random word, no context, expensive

✅ NEW (Transformation):
LLM Prompt: "Transform this extracted text into structured format:
             Raw: 'Ciao! Come ti chiami?'
             Context: Nuovo Espresso Unit 1, Greetings topic"
Result: Structured vocabulary from real textbook content, cheaper
```

---

## 5. Operator Feedback Loop

### 5.1 Rejection with Comments

```
┌─────────────────────────────────────────────────────────────┐
│  OPERATOR REVIEW QUEUE                                      │
│                                                             │
│  Item: "ciao" - Italian A1 vocabulary                      │
│  Definition: "hello, hi, bye (informal)"                    │
│  Source: Nuovo Espresso Unit 1, page 12                    │
│                                                             │
│  [✓ Approve] [✗ Reject]                                    │
└─────────────────────────────────────────────────────────────┘
                         │ Reject clicked
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  REJECTION DIALOG                                           │
│                                                             │
│  Why are you rejecting this item?                          │
│                                                             │
│  ┌────────────────────────────────────────────────┐        │
│  │ Definition is incomplete. "Ciao" is used for   │        │
│  │ both greeting AND goodbye. This is important   │        │
│  │ for learners to understand. Also add that it's │        │
│  │ more common in Northern Italy.                 │        │
│  └────────────────────────────────────────────────┘        │
│                                                             │
│  [Submit Rejection]                                         │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  FEEDBACK STORAGE                                           │
│                                                             │
│  operator_feedback table:                                   │
│  - item_id: uuid (validated item)                           │
│  - rejection_reason: "Definition is incomplete..."          │
│  - operator_id: uuid                                        │
│  - rejected_at: timestamp                                   │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Feedback in Next Iteration

```
┌─────────────────────────────────────────────────────────────┐
│  RE-TRANSFORMATION WITH FEEDBACK                            │
│                                                             │
│  When operator clicks "Retry" or system re-processes:       │
│                                                             │
│  LLM Prompt:                                                │
│  "Transform this text into structured vocabulary entry.     │
│                                                             │
│  Raw text: 'Ciao! Come ti chiami?'                         │
│  Topic: Greetings                                           │
│                                                             │
│  PREVIOUS REJECTION FEEDBACK:                               │
│  'Definition is incomplete. Ciao is used for both greeting  │
│   AND goodbye. Add that it's more common in Northern Italy.'│
│                                                             │
│  Incorporate this feedback in your response."               │
│                                                             │
│  LLM Response (improved):                                   │
│  {                                                          │
│    "word": "ciao",                                          │
│    "definition": "hello OR goodbye (informal, flexible)",  │
│    "usage_notes": "Used for both greetings and farewells.  │
│                    More common in Northern Italy.",         │
│    ...                                                      │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Database Schema

```sql
-- Operator feedback on rejections
CREATE TABLE operator_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL, -- validated item
  item_type VARCHAR(50) NOT NULL CHECK (item_type IN ('meaning', 'utterance', 'rule', 'exercise')),
  rejection_reason TEXT NOT NULL,
  suggested_improvement TEXT,
  operator_id UUID NOT NULL REFERENCES users(id),
  rejected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  applied_in_retry BOOLEAN NOT NULL DEFAULT false,
  retry_item_id UUID -- Link to retried item
);

CREATE INDEX idx_feedback_item ON operator_feedback(item_id);
CREATE INDEX idx_feedback_unapplied ON operator_feedback(applied_in_retry) WHERE applied_in_retry = false;

-- Link drafts to source documents
ALTER TABLE drafts ADD COLUMN source_document_id UUID REFERENCES document_sources(id);
ALTER TABLE drafts ADD COLUMN source_chunk_id UUID REFERENCES raw_content_chunks(id);
ALTER TABLE drafts ADD COLUMN topic_id UUID REFERENCES curriculum_topics(id);
ALTER TABLE drafts ADD COLUMN transformation_prompt TEXT;
ALTER TABLE drafts ADD COLUMN previous_feedback_ids UUID[]; -- Feedback incorporated
```

---

## 6. Complete Flow Example

```
STEP 1: Operator Setup
  ├─ Define topics for IT/A1:
  │  ├─ Greetings & Introductions (order: 1)
  │  ├─ Numbers 0-100 (order: 2)
  │  └─ Family & Relationships (order: 3)

STEP 2: Document Upload
  ├─ Upload: Nuovo_Espresso_1_Libro.pdf
  ├─ Language: IT, Level: A1
  └─ Processing status: "extracting"

STEP 3: PDF Parsing
  ├─ Extract text from Unit 1, pages 10-20
  ├─ Identify structure:
  │  ├─ Chapter title: "Primi contatti"
  │  ├─ Dialogue: "Ciao! Come ti chiami? Mi chiamo Marco."
  │  ├─ Vocabulary list: ciao, chiamarsi, nome, essere
  │  └─ Grammar: Present tense of "essere"
  └─ Create 47 raw_content_chunks

STEP 4: Semantic Mapping
  ├─ Chunk 1: "Ciao! Come ti chiami?"
  │  └─ LLM maps to → Topic: "Greetings & Introductions" (confidence: 0.95)
  ├─ Chunk 2: "uno, due, tre, quattro..."
  │  └─ LLM maps to → Topic: "Numbers 0-100" (confidence: 0.98)
  └─ Operator reviews mappings, confirms or corrects

STEP 5: LLM Transformation
  ├─ For each confirmed mapping:
  │  ├─ Chunk: "Ciao! Come ti chiami?"
  │  ├─ Topic: Greetings
  │  └─ LLM transforms → 3 vocabulary entries (ciao, chiamarsi, nome)
  └─ Creates 3 DRAFT items

STEP 6: Pipeline Processing
  ├─ DRAFT → CANDIDATE (normalization)
  ├─ CANDIDATE → VALIDATED (quality gates)
  └─ Items appear in operator review queue

STEP 7: Operator Review
  ├─ Reviews "ciao" definition
  ├─ Finds incomplete: missing "used for goodbye too"
  └─ Rejects with comment: "Add goodbye meaning, mention Northern Italy"

STEP 8: Retry with Feedback
  ├─ Operator clicks "Retry" on rejected item
  ├─ System re-transforms same chunk
  ├─ LLM receives:
  │  ├─ Raw text: "Ciao! Come ti chiami?"
  │  └─ Feedback: "Add goodbye meaning..."
  ├─ LLM creates improved version
  └─ New DRAFT with feedback incorporated

STEP 9: Approval
  ├─ Improved item passes review
  ├─ Operator approves
  └─ Item moves to approved_meanings table

RESULT:
  From 1 PDF (Nuovo Espresso):
  ├─ 47 raw chunks extracted
  ├─ 23 vocabulary items
  ├─ 8 grammar rules
  ├─ 12 dialogues/utterances
  └─ 4 exercises
  Total: 47 work items → pipeline → operator approval
```

---

## 7. Benefits of New Architecture

### 7.1 Quality

```
OLD: LLM generates "agua" for Spanish A1
     → May not match pedagogical sequence
     → May not align with learner's textbook
     → Inconsistent across topics

NEW: LLM transforms from Nuevo Prisma textbook
     → Content matches established pedagogy
     → Aligns with real teaching materials
     → Consistent structure
```

### 7.2 Cost

```
OLD: LLM Generation
     Prompt: "Generate Spanish A1 word" (50 tokens)
     Response: 200 tokens
     Cost per item: ~$0.01

NEW: LLM Transformation
     Prompt: "Transform: 'Hola, ¿cómo estás?'" (100 tokens)
     Response: 200 tokens
     Cost per item: ~$0.015

     BUT: From 1 textbook → 500+ items
     Total cost: 1 textbook ($30) → 500 items → $7.50 LLM cost
     vs generating 500 items from scratch → $500+
```

### 7.3 Control

```
OLD: System decides structure randomly
     → Operator has no control
     → No guarantee of coherent curriculum

NEW: Operator defines structure explicitly
     → Topics ordered by pedagogy
     → Prerequisites clear
     → Curriculum coherent
```

### 7.4 Feedback Loop

```
OLD: Rejected item discarded

NEW: Rejected item → feedback → retry → improved
     → System learns from operator
     → Quality improves iteratively
     → Operator expertise captured
```

---

## 8. Implementation Phases

### Phase 1: Foundation

- F0XX: Curriculum Structure Management UI
- F0XX: Document Upload System
- Update database schema

### Phase 2: Parsing

- F0XX: PDF Text Extraction Engine
- F0XX: Structure Detection (chapters, vocab, grammar)
- F0XX: Raw Content Storage

### Phase 3: Mapping

- F0XX: Semantic Mapping Engine
- F0XX: LLM-based Topic Classification
- F0XX: Operator Mapping Confirmation UI

### Phase 4: Transformation

- F0XX: LLM Transformation Engine (not generation!)
- Update existing pipeline to handle transformed content
- Source tracking (document → chunk → draft)

### Phase 5: Feedback

- F0XX: Rejection with Comments
- F0XX: Feedback Storage & Retrieval
- F0XX: Retry with Feedback Incorporated

---

## Summary

**Old Flow:**

```
Gap Analysis → LLM generates random → Pipeline → Operator approves
```

**New Flow:**

```
Operator defines topics → Upload PDF → Parse → Map to topics →
LLM transforms (not generates!) → Pipeline → Operator approves/rejects with feedback →
Retry incorporates feedback → Improved item
```

This is **significantly better** for language learning content!
