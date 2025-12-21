# PolyLadder - Local Development Guide

## Quick Start (Minimal Setup)

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker Desktop

### 1. Start Database

```powershell
cd G:\Arina_Repositories\PolyLadder
docker-compose -f docker/docker-compose.yml up db -d
```

Wait for PostgreSQL to be ready (10-15 seconds).

### 2. Run Migrations

```powershell
$env:DATABASE_URL = "postgres://dev:dev@localhost:5432/polyladder"
pnpm --filter @polyladder/db migrate up
```

### 3. Seed Test Data (Optional)

```powershell
Get-Content scripts/seed.sql | docker exec -i polyladder-db psql -U dev -d polyladder
```

### 4. Start API Server

```powershell
$env:DATABASE_URL = "postgres://dev:dev@localhost:5432/polyladder"
$env:JWT_SECRET = "dev-secret-change-in-production-min32chars"
$env:PORT = "3000"
pnpm --filter @polyladder/api dev
```

### 5. Start Frontend

Open a new terminal:

```powershell
cd G:\Arina_Repositories\PolyLadder
pnpm --filter @polyladder/web dev
```

### 6. Create Test Users

```powershell
# Operator user
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/register" -Method Post -ContentType "application/json" -Body '{"email": "operator@test.com", "password": "TestPass123!", "role": "operator"}'

# Learner user
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/register" -Method Post -ContentType "application/json" -Body '{"email": "learner@test.com", "password": "TestPass123!"}'
```

### 7. Access the App

- **Frontend**: http://localhost:5173
- **API**: http://localhost:3000
- **Login**: operator@test.com / TestPass123!

---

## Full Setup with Refinement Service

The Refinement Service generates learning content using LLM (Claude AI). It requires an Anthropic API key.

### Get Anthropic API Key

1. Go to https://console.anthropic.com/
2. Create an account / Sign in
3. Navigate to **API Keys**
4. Click **Create Key**
5. Copy the key (starts with `sk-ant-...`)

### Start Refinement Service

```powershell
$env:DATABASE_URL = "postgres://dev:dev@localhost:5432/polyladder"
$env:ANTHROPIC_API_KEY = "sk-ant-your-key-here"
pnpm --filter @polyladder/refinement-service dev
```

### What Refinement Service Does

The service is **autonomous** — it automatically finds what content is missing and generates it.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        REFINEMENT SERVICE LOOP                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 1: GAP ANALYSIS (WorkPlanner.getNextWork)                         │
│                                                                         │
│  Analyzes approved_* tables to find what's missing:                     │
│                                                                         │
│  Priority 1 (CRITICAL): Orthography gaps                                │
│    → "Spanish has no alphabet lessons" → generate ortho_ES              │
│                                                                         │
│  Priority 2 (HIGH): Vocabulary gaps                                     │
│    → "Spanish A1 has 0/100 meanings" → generate meaning_ES_A1           │
│                                                                         │
│  Priority 3 (MEDIUM): Utterance gaps                                    │
│    → "Meaning X has 0/3 example sentences" → generate utterance         │
│                                                                         │
│  Priority 4 (MEDIUM): Grammar gaps                                      │
│    → "Spanish A1 has 0/20 grammar rules" → generate grammar             │
│                                                                         │
│  Priority 5 (LOW): Exercise gaps                                        │
│    → "Spanish A1 has 0/50 exercises" → generate exercise                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Found gap?
                              ┌─────┴─────┐
                              │           │
                              ▼ YES       ▼ NO
┌──────────────────────────────┐    ┌──────────────────────┐
│  STEP 2: MARK IN PROGRESS    │    │  STEP: WAIT          │
│                              │    │  Sleep 5-30 seconds  │
│  INSERT INTO work_in_progress│    │  (adaptive backoff)  │
│  This prevents duplicate     │    └──────────┬───────────┘
│  processing                  │               │
└──────────────┬───────────────┘               │
               │                               │
               ▼                               │
┌──────────────────────────────┐               │
│  STEP 3: SELECT ADAPTER      │               │
│                              │               │
│  ┌────────────────────────┐  │               │
│  │ Rule-Based Adapter     │  │               │
│  │ (orthography, free)    │  │               │
│  └────────────────────────┘  │               │
│  ┌────────────────────────┐  │               │
│  │ Anthropic Claude       │  │               │
│  │ (meanings, grammar,    │  │               │
│  │  exercises - paid API) │  │               │
│  └────────────────────────┘  │               │
└──────────────┬───────────────┘               │
               │                               │
               ▼                               │
┌──────────────────────────────┐               │
│  STEP 4: GENERATE CONTENT    │               │
│                              │               │
│  LLM generates JSON:         │               │
│  {                           │               │
│    "word": "hola",           │               │
│    "definition": "hello",    │               │
│    "level": "A1"             │               │
│  }                           │               │
└──────────────┬───────────────┘               │
               │                               │
               ▼                               │
┌──────────────────────────────┐               │
│  STEP 5: INSERT DRAFT        │               │
│                              │               │
│  INSERT INTO drafts (...)    │               │
│                              │               │
└──────────────┬───────────────┘               │
               │                               │
               ▼                               │
┌──────────────────────────────┐               │
│  STEP 6: PIPELINE BATCH      │               │
│                              │               │
│  Process existing drafts:    │               │
│  DRAFT → CANDIDATE →         │               │
│  VALIDATED                   │               │
│                              │               │
└──────────────┬───────────────┘               │
               │                               │
               ▼                               │
┌──────────────────────────────┐               │
│  STEP 7: SAVE CHECKPOINT     │               │
│                              │               │
│  UPDATE service_state        │               │
│  SET last_checkpoint = NOW() │               │
└──────────────┬───────────────┘               │
               │                               │
               ▼                               │
┌──────────────────────────────┐               │
│  STEP 8: MARK COMPLETE       │               │
│                              │               │
│  DELETE FROM work_in_progress│               │
│  WHERE work_id = ...         │               │
└──────────────┬───────────────┘               │
               │                               │
               └───────────────┬───────────────┘
                               │
                               ▼
                         [REPEAT LOOP]
```

### Key Insight: Gap Analysis Creates Work Automatically

Work items are **NOT** stored in a queue. Instead:

1. **Gap Analysis** compares target counts vs actual counts
2. **Targets** are defined in code:
   - 100 meanings per language per CEFR level
   - 3 utterances per meaning
   - 20 grammar rules per level
   - 50 exercises per level
3. If `actual < target`, service creates work item **on the fly**

**Example**: If `approved_meanings` has 0 Spanish A1 words, and target is 100:

```
Gap detected: Spanish A1 needs 100 meanings (has 0)
→ Create work item: meaning_ES_A1
→ Call Claude: "Generate vocabulary word for Spanish A1"
→ Insert into drafts
→ Repeat until 100 meanings exist
```

### ⚠️ Current Limitation: No Curriculum Structure

**Проблема**: Сейчас система **НЕ ЗНАЕТ** правильную последовательность!

```
❌ Что происходит сейчас:
   - "Нужно 100 Spanish A1 слов"
   - Генерирует: "perro", "elefante", "subjuntivo", "метафора"...
   - Случайные слова БЕЗ логической структуры
   - Нет тем: greetings → numbers → family → food...
   - Нет последовательности грамматики: ser → estar → regular verbs...

✅ Что должно быть (F032 - Curriculum Graph):
   1. Orthography FIRST (alphabet, pronunciation)
   2. Then: Topic-based vocabulary
      - A0: greetings, numbers 0-10
      - A1: family, colors, food, animals
      - A2: weather, travel, hobbies
   3. Then: Grammar in order
      - Present tense → Past tense → Future
      - Regular verbs → Irregular verbs
   4. Prerequisites:
      - "Past tense" requires "Present tense" completed
      - "ser/estar" must be learned before "adjectives"
```

### Решения

**Временное (для MVP):**
Добавить темы и приоритеты вручную в LLM промпты:

```typescript
// В Anthropic adapter
buildMeaningPrompt(request) {
  const topics = {
    'A0': ['greetings', 'numbers_0_10', 'yes_no'],
    'A1': ['family', 'colors', 'food', 'animals', 'days_of_week'],
    'A2': ['weather', 'travel', 'hobbies', 'health']
  };

  const currentTopic = selectNextTopic(language, level);

  return `Generate vocabulary for Spanish ${level}.
          Topic: ${currentTopic}
          Choose a word commonly used when discussing ${currentTopic}.
          ...`;
}
```

**Правильное (F032 - Not Started):**
Реализовать Curriculum Graph:

```sql
-- Определить структуру заранее
INSERT INTO curriculum_graph (concept_id, prerequisites_and, priority_order) VALUES
  ('es_ortho_alphabet', '{}', 1),
  ('es_vocab_greetings', '{es_ortho_alphabet}', 2),
  ('es_vocab_numbers', '{es_ortho_alphabet}', 3),
  ('es_grammar_ser', '{es_vocab_greetings}', 4),
  ('es_grammar_estar', '{es_grammar_ser}', 5);
```

Тогда Work Planner будет генерировать в правильном порядке:

1. Проверяет: "es_ortho_alphabet completed?" → NO → generate
2. Проверяет: "es_vocab_greetings ready?" → prerequisites met? → generate
3. И так далее по графу зависимостей

**Подробнее**: См. `docs/CURRICULUM_PLANNING.md` для полного объяснения с примерами.

### work_in_progress Table

This table is **NOT** a work queue. It's a **lock table** to prevent duplicate processing:

```sql
-- When service starts processing meaning_ES_A1:
INSERT INTO work_in_progress (work_id, started_at)
VALUES ('meaning_ES_A1', NOW());

-- When complete:
DELETE FROM work_in_progress WHERE work_id = 'meaning_ES_A1';
```

If service crashes, stale entries (>1 hour old) are automatically cleaned up.

### Monitoring & Operator Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         OPERATOR WORKFLOW                               │
└─────────────────────────────────────────────────────────────────────────┘

1. DASHBOARD (/operator/dashboard)
   ┌───────────────────────────────────────────────────────────┐
   │  Pipeline Health                                          │
   │  ┌─────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐    │
   │  │ Drafts  │→│ Candidates│→│ Validated │→│ Approved │    │
   │  │   15    │ │     5     │ │     3     │ │    3     │    │
   │  └─────────┘ └───────────┘ └───────────┘ └──────────┘    │
   │                                                           │
   │  Refinement Service: 🟢 Running / 🔴 Stopped              │
   │  Items processed today: 47                                │
   │  Error rate: 2.3%                                         │
   └───────────────────────────────────────────────────────────┘

2. REVIEW QUEUE (/operator/review-queue)
   ┌───────────────────────────────────────────────────────────┐
   │  Items awaiting approval (from VALIDATED stage)           │
   │                                                           │
   │  ☐ "hola" - Spanish A1 vocabulary                         │
   │      Definition: "hello, greeting"                        │
   │      [✓ Approve] [✗ Reject] [View Details]               │
   │                                                           │
   │  ☐ "buenos días" - Spanish A1 vocabulary                  │
   │      Definition: "good morning"                           │
   │      [✓ Approve] [✗ Reject] [View Details]               │
   └───────────────────────────────────────────────────────────┘

   Approve → moves to approved_meanings
   Reject → records in pipeline_failures

3. FAILURES (/operator/failures)
   ┌───────────────────────────────────────────────────────────┐
   │  Failed Items                                             │
   │                                                           │
   │  ⚠ Schema validation failed                               │
   │    "Missing required field: level"                        │
   │    Stage: DRAFT → CANDIDATE                               │
   │    [Retry] [View Raw Data]                                │
   │                                                           │
   │  ⚠ LLM returned invalid JSON                              │
   │    "Unexpected token at position 45"                      │
   │    Stage: Generation                                      │
   │    [View Prompt] [Regenerate]                             │
   └───────────────────────────────────────────────────────────┘

4. CORPUS EXPLORER (/operator/corpus)
   ┌───────────────────────────────────────────────────────────┐
   │  Approved Content Browser                                 │
   │                                                           │
   │  Filter: [Spanish ▼] [A1 ▼] [Vocabulary ▼]               │
   │  Search: [________________]                               │
   │                                                           │
   │  Results (127 items):                                     │
   │  • hola (hello) - A1                                      │
   │  • adiós (goodbye) - A1                                   │
   │  • gracias (thank you) - A1                               │
   │  ...                                                      │
   │                                                           │
   │  [Export CSV] [Export JSON]                               │
   └───────────────────────────────────────────────────────────┘
```

### Database Monitoring

```powershell
# Check recent drafts
docker exec polyladder-db psql -U dev -d polyladder -c "SELECT id, data_type, source, created_at FROM drafts ORDER BY created_at DESC LIMIT 5"

# Check pipeline counts
docker exec polyladder-db psql -U dev -d polyladder -c "
SELECT 'drafts' as stage, COUNT(*) FROM drafts
UNION ALL SELECT 'candidates', COUNT(*) FROM candidates
UNION ALL SELECT 'validated', COUNT(*) FROM validated
UNION ALL SELECT 'approved_meanings', COUNT(*) FROM approved_meanings"

# Check service status
docker exec polyladder-db psql -U dev -d polyladder -c "SELECT * FROM service_state WHERE service_name = 'refinement_service'"

# Check recent failures
docker exec polyladder-db psql -U dev -d polyladder -c "SELECT error_type, error_message, failed_at FROM pipeline_failures ORDER BY failed_at DESC LIMIT 5"
```

---

## How PolyLadder Works (Big Picture)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          THE CONTENT FACTORY                            │
│                                                                         │
│  PolyLadder automatically generates language learning content using AI. │
│  The system works like a factory with quality control at every step.    │
└─────────────────────────────────────────────────────────────────────────┘

                    AUTOMATIC GENERATION
                    ═══════════════════
                           │
      ┌────────────────────┼────────────────────┐
      │                    │                    │
      ▼                    ▼                    ▼
  ┌────────┐          ┌────────┐          ┌────────┐
  │ Claude │          │ Claude │          │ Rules  │
  │  API   │          │  API   │          │ Engine │
  │        │          │        │          │        │
  │"Create │          │"Create │          │Spanish │
  │Spanish │          │grammar │          │alphabet│
  │vocab"  │          │ rule"  │          │ data   │
  └───┬────┘          └───┬────┘          └───┬────┘
      │                   │                   │
      └─────────┬─────────┴─────────┬─────────┘
                │                   │
                ▼                   ▼
        ┌───────────────────────────────────┐
        │            DRAFTS TABLE            │
        │  Raw generated content (unverified)│
        │  • May have errors                 │
        │  • May have wrong format           │
        │  • May be low quality              │
        └─────────────────┬─────────────────┘
                          │
                          ▼
                    QUALITY GATES
                    ═════════════
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
  ┌──────────┐    ┌───────────┐    ┌───────────┐
  │  Schema  │    │ Language  │    │  Quality  │
  │Validation│    │   Check   │    │   Score   │
  │          │    │           │    │           │
  │Has all   │    │Is Spanish │    │Is content │
  │required  │    │actually   │    │useful for │
  │fields?   │    │Spanish?   │    │learners?  │
  └────┬─────┘    └─────┬─────┘    └─────┬─────┘
       │                │                │
       │  ❌ Fail       │  ❌ Fail       │  ❌ Fail
       │    ↓           │    ↓           │    ↓
       │ [pipeline_     │ [pipeline_     │ [pipeline_
       │  failures]     │  failures]     │  failures]
       │                │                │
       └────────┬───────┴────────┬───────┘
                │                │
                ▼ ✅ Pass        │
        ┌───────────────────────────────────┐
        │         CANDIDATES TABLE           │
        │  Normalized, structurally valid    │
        └─────────────────┬─────────────────┘
                          │
                          ▼
        ┌───────────────────────────────────┐
        │         VALIDATED TABLE            │
        │  Passed all automated checks       │
        └─────────────────┬─────────────────┘
                          │
                          ▼
                   HUMAN REVIEW
                   ════════════
                          │
        ┌─────────────────┼─────────────────┐
        │                                   │
        ▼                                   ▼
  ┌──────────────┐                  ┌──────────────┐
  │   OPERATOR   │                  │   OPERATOR   │
  │   APPROVES   │                  │   REJECTS    │
  │   ✅         │                  │   ❌         │
  └──────┬───────┘                  └──────┬───────┘
         │                                 │
         ▼                                 ▼
  ┌──────────────┐                  ┌──────────────┐
  │  APPROVED    │                  │  FAILURES    │
  │  TABLES      │                  │  TABLE       │
  │              │                  │              │
  │ Ready for    │                  │ Needs fix    │
  │ learners!    │                  │ or discard   │
  └──────────────┘                  └──────────────┘
```

### The Key Insight

**Without Refinement Service:** Database stays empty. No content for learners.

**With Refinement Service running:**

1. Service checks: "Do we have 100 Spanish A1 words?" → No, only 3
2. Service calls Claude: "Generate a Spanish A1 vocabulary word"
3. Claude returns: `{"word": "agua", "definition": "water", ...}`
4. Service saves to `drafts`
5. Pipeline validates and moves to `candidates` → `validated`
6. Operator sees in Review Queue, clicks Approve
7. Word moves to `approved_meanings`
8. Learner can now study "agua"!

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        User Browser                          │
│                    http://localhost:5173                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Vite)                         │
│                    @polyladder/web                           │
│              React + TanStack Query + Tailwind               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Server                              │
│                    @polyladder/api                           │
│                  Fastify + JWT Auth                          │
│                  http://localhost:3000                       │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌──────────────────────┐        ┌──────────────────────────────┐
│     PostgreSQL       │        │    Refinement Service        │
│   localhost:5432     │◄───────│  @polyladder/refinement      │
│                      │        │  (background process)        │
└──────────────────────┘        └──────────────────────────────┘
                                              │
                                              ▼
                                ┌──────────────────────────────┐
                                │      Anthropic Claude        │
                                │      (External API)          │
                                └──────────────────────────────┘
```

---

## Content Pipeline Flow

```
Source (LLM/Manual)
       │
       ▼
  ┌─────────┐
  │  DRAFT  │  Raw generated content
  └────┬────┘
       │ Normalization
       ▼
┌──────────────┐
│  CANDIDATE   │  Normalized, ready for validation
└──────┬───────┘
       │ Quality Gates (schema, language, etc.)
       ▼
┌──────────────┐
│  VALIDATED   │  Passed all checks
└──────┬───────┘
       │ Human Approval (via Operator UI)
       ▼
┌──────────────┐
│  APPROVED    │  Ready for learners
└──────────────┘
```

---

## Database Tables

| Table                 | Purpose                        |
| --------------------- | ------------------------------ |
| `users`               | User accounts                  |
| `drafts`              | Raw generated content          |
| `candidates`          | Normalized content             |
| `validated`           | Quality-checked content        |
| `approved_meanings`   | Approved vocabulary            |
| `approved_utterances` | Approved example sentences     |
| `approved_rules`      | Approved grammar rules         |
| `approved_exercises`  | Approved exercises             |
| `pipeline_failures`   | Failed processing attempts     |
| `service_state`       | Refinement service checkpoints |
| `work_in_progress`    | Pending generation tasks       |

---

## Common Commands

### Database

```powershell
# Connect to database
docker exec -it polyladder-db psql -U dev -d polyladder

# View tables
\dt

# View table structure
\d table_name

# Count items
SELECT 'drafts' as t, COUNT(*) FROM drafts
UNION ALL SELECT 'candidates', COUNT(*) FROM candidates
UNION ALL SELECT 'validated', COUNT(*) FROM validated;
```

### Logs

```powershell
# API logs - check terminal running API
# Or read from terminal file
Get-Content c:\Users\...\terminals\*.txt -Tail 50
```

### Reset Database

```powershell
docker-compose -f docker/docker-compose.yml down -v
docker-compose -f docker/docker-compose.yml up db -d
pnpm --filter @polyladder/db migrate up
```

---

## Environment Variables

| Variable            | Required       | Description                              |
| ------------------- | -------------- | ---------------------------------------- |
| `DATABASE_URL`      | Yes            | PostgreSQL connection string             |
| `JWT_SECRET`        | Yes            | Secret for JWT tokens (min 32 chars)     |
| `PORT`              | No             | API server port (default: 3000)          |
| `ANTHROPIC_API_KEY` | For Refinement | Anthropic Claude API key                 |
| `LOG_LEVEL`         | No             | Logging level (debug, info, warn, error) |

---

## Troubleshooting

### "Connection refused" to database

```powershell
# Check if container is running
docker ps

# Start if not running
docker-compose -f docker/docker-compose.yml up db -d
```

### "Failed to load dashboard metrics"

Check if API is running and no errors in API terminal. Common causes:

- Database tables don't exist (run migrations)
- Wrong DATABASE_URL

### API returns 500 errors

Check the API terminal for detailed error messages. Common causes:

- Missing JWT_SECRET
- Database connection issues
- Schema mismatch (run migrations)

### Frontend not loading

```powershell
# Check if port 5173 is in use
netstat -ano | findstr :5173

# Kill process if needed
taskkill /F /PID <pid>
```
