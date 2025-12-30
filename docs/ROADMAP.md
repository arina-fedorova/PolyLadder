# PolyLadder Roadmap

This document tracks planned improvements and feature ideas that are not yet scheduled for implementation.

---

## Content Processing Pipeline

### Embedding-Based Deduplication

**Problem:** Similar content from different pages/chunks can create duplicate drafts mapped to different topics/levels.

**Example:**

- "Buenos días (good morning) Buenas tardes..." → mapped to A0 "Saludos y despedidas básicas"
- Same content with slight variation → mapped to A1 "Saludos y presentaciones"

**Proposed Solution:**

1. **Generate embeddings** for each draft's `original_content` using a lightweight embedding model (e.g., OpenAI `text-embedding-3-small` or local model)

2. **Store embeddings** in a vector column or separate table:

   ```sql
   ALTER TABLE drafts ADD COLUMN content_embedding vector(1536);
   ```

3. **Before creating a new draft**, compute similarity with existing drafts:

   ```sql
   SELECT id, original_content, 1 - (content_embedding <=> $1) as similarity
   FROM drafts
   WHERE document_id = $2
     AND 1 - (content_embedding <=> $1) > 0.85
   ORDER BY similarity DESC
   LIMIT 5;
   ```

4. **If similarity > threshold (0.85)**:
   - Skip draft creation, OR
   - Create with `is_potential_duplicate = true` flag
   - Link to similar draft for operator review

**Benefits:**

- Catches semantic duplicates (not just exact matches)
- Low cost (~$0.0001 per embedding)
- Fast vector search with pgvector extension

**Implementation Notes:**

- Requires `pgvector` PostgreSQL extension
- Can use OpenAI embeddings or self-hosted model (e.g., sentence-transformers)
- Consider batching embeddings for efficiency

**Priority:** Medium  
**Complexity:** Medium  
**Status:** Planned

---

### PDF Content Cleaning

**Problem:** PDFs contain non-educational content (headers, footers, page numbers, copyright notices, decorative elements) that wastes tokens during processing.

**Proposed Solutions:**

1. **Rule-based filtering at PDF parsing stage:**
   - Filter by position on page (top/bottom margins)
   - Remove repeating patterns across pages
   - Regex for common patterns (page numbers, copyright)

2. **Dedicated cleaning LLM step:**
   - Quick LLM call to extract only educational content
   - Before Semantic Split

3. **Operator configuration:**
   - UI to specify patterns to ignore
   - Presets for book types (textbook, phrasebook, etc.)

**Priority:** Low  
**Complexity:** Low-Medium  
**Status:** Idea

---

## Quality Improvements

### Re-introduce Quality Gates (Optional)

Quality gates were removed to simplify the pipeline. Consider re-introducing as optional checks:

- Content safety validation
- CEFR level consistency check
- Language standard validation
- Duplicate detection gate

**Priority:** Low  
**Complexity:** Medium  
**Status:** On Hold

---

## UI/UX Improvements

### Bulk Operations in Draft Review

- Select multiple drafts for batch approve/reject
- Filters by content type, topic, similarity score

### Content Diff View

- Side-by-side comparison of similar drafts
- Highlight differences

### Pipeline Progress Visualization

- Real-time progress bar
- Estimated time remaining
- Cost tracking (tokens used)

---

## Infrastructure

### Separate E2E Test Database

E2E tests should run in isolated container, not affecting development database.

**Priority:** High  
**Complexity:** Low  
**Status:** Planned

---

_Last updated: 2024-12-30_
