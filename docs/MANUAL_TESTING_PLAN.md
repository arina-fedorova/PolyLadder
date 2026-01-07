# PolyLadder Manual Testing Plan

**Created**: 2026-01-06
**Purpose**: Comprehensive manual testing guide with fast testing strategies

---

## Table of Contents

1. [Analysis Summary: Potential Issues](#1-analysis-summary-potential-issues)
2. [Quick Start: Test Data Setup](#2-quick-start-test-data-setup)
3. [Testing Flows](#3-testing-flows)
4. [Test Scenarios by Feature](#4-test-scenarios-by-feature)
5. [API Testing with curl](#5-api-testing-with-curl)
6. [Known Issues to Verify](#6-known-issues-to-verify)

---

## 1. Analysis Summary: Potential Issues

### Critical Issues (Must Fix Before Production)

| Issue                        | Location                           | Risk     | Description                              |
| ---------------------------- | ---------------------------------- | -------- | ---------------------------------------- |
| Unsafe `.rows[0]` access     | Multiple routes                    | High     | No null check before accessing first row |
| Debug endpoint exposed       | `operational/pipeline-mappings.ts` | Security | `/mappings/debug` returns all data       |
| No pagination limits         | `db.utils.ts`                      | DoS      | `LIMIT` accepts any value                |
| No refresh token cleanup     | `migrations/014`                   | Data     | Tokens never deleted                     |
| Race condition on word state | `word-state.ts`                    | Data     | No `FOR UPDATE` lock                     |

### Medium Issues

| Issue                     | Location                     | Risk              |
| ------------------------- | ---------------------------- | ----------------- |
| LocalStorage tokens       | `AuthContext.tsx`            | XSS vulnerability |
| Missing CSRF protection   | All routes                   | CSRF attacks      |
| Inconsistent error format | Multiple routes              | UX                |
| SRS queue overflow        | `recall-practice.service.ts` | Performance       |

### Low Issues

| Issue                          | Location        | Risk             |
| ------------------------------ | --------------- | ---------------- |
| Silent expiry parsing fallback | `login.ts`      | Debug difficulty |
| Unvalidated string lengths     | Various         | Edge cases       |
| Audio promise ignored          | `FlashCard.tsx` | Silent failures  |

---

## 2. Quick Start: Test Data Setup

### CRITICAL: A0 Orthography Data Required!

Without A0 orthography content in `curriculum_graph`, users **CANNOT progress**:

```
No A0 orthography → Empty lesson page → Can't pass gate → Blocked at A1+ (403)
```

**Minimum required data for functional testing:**

- 10+ orthography concepts in `curriculum_graph` (A0 level)
- Vocabulary in `approved_meanings`
- Exercises in `approved_exercises`

### Option A: Full Seed Script (Recommended - 2 min)

```bash
# 1. Start database
docker compose up -d postgres-test

# 2. Run migrations
DATABASE_URL="postgresql://test:test@localhost:5434/polyladder_test" pnpm --filter @polyladder/db migrate:up

# 3. Run full seed script
psql postgresql://test:test@localhost:5434/polyladder_test -f scripts/seed-test-data.sql
```

**What gets created:**

- 2 test users (operator + learner)
- 10 A0 orthography lessons (Spanish vowels + key consonants)
- 50 A1 vocabulary words (greetings, numbers, verbs, nouns)
- 4 grammar rules
- 11 exercises (multiple choice, cloze, flashcard, translation)
- Learner has Spanish set with 10 words in "learning" state
- SRS items ready for review

**Test credentials:**

- `operator@test.com` / `password123`
- `learner@test.com` / `password123`

### Option B: Users Only (Won't Test Learning Flow!)

Direct SQL to insert test content without pipeline:

```sql
-- Connect to database
psql postgresql://test:test@localhost:5434/polyladder_test

-- Insert test vocabulary (Spanish A1)
INSERT INTO approved_meanings (id, lemma, language, cefr_level, part_of_speech, definition, created_at)
VALUES
  (gen_random_uuid(), 'hola', 'ES', 'A1', 'interjection', 'greeting; hello', NOW()),
  (gen_random_uuid(), 'adiós', 'ES', 'A1', 'interjection', 'goodbye', NOW()),
  (gen_random_uuid(), 'gracias', 'ES', 'A1', 'noun', 'thanks; thank you', NOW()),
  (gen_random_uuid(), 'por favor', 'ES', 'A1', 'adverb', 'please', NOW()),
  (gen_random_uuid(), 'sí', 'ES', 'A1', 'adverb', 'yes', NOW()),
  (gen_random_uuid(), 'no', 'ES', 'A1', 'adverb', 'no; not', NOW()),
  (gen_random_uuid(), 'casa', 'ES', 'A1', 'noun', 'house; home', NOW()),
  (gen_random_uuid(), 'agua', 'ES', 'A1', 'noun', 'water', NOW()),
  (gen_random_uuid(), 'comer', 'ES', 'A1', 'verb', 'to eat', NOW()),
  (gen_random_uuid(), 'beber', 'ES', 'A1', 'verb', 'to drink', NOW());

-- Get IDs for utterances
WITH meanings AS (SELECT id, lemma FROM approved_meanings WHERE language = 'ES')
INSERT INTO approved_utterances (id, meaning_id, language, form, is_primary, created_at)
SELECT gen_random_uuid(), id, 'ES', lemma, true, NOW() FROM meanings;

-- Insert grammar rule
INSERT INTO approved_rules (id, language, category, subcategory, cefr_level, title, explanation, examples, created_at)
VALUES (
  gen_random_uuid(), 'ES', 'verbs', 'present_tense', 'A1',
  'Present Tense: Regular -ar Verbs',
  'Regular -ar verbs in Spanish follow a predictable conjugation pattern. Remove -ar and add: -o, -as, -a, -amos, -áis, -an',
  '["hablar → hablo (I speak)", "hablar → hablas (you speak)", "trabajar → trabajo (I work)"]'::jsonb,
  NOW()
);

-- Insert exercises
INSERT INTO approved_exercises (id, language, cefr_level, exercise_type, content, options, correct_answer, created_at)
VALUES
  (gen_random_uuid(), 'ES', 'A1', 'multiple_choice',
   '{"question": "How do you say ''hello'' in Spanish?"}',
   '["hola", "adiós", "gracias", "por favor"]'::jsonb,
   'hola', NOW()),
  (gen_random_uuid(), 'ES', 'A1', 'cloze',
   '{"sentence": "Buenos días, ¿cómo ___ usted?", "blank_word": "está"}',
   '[]'::jsonb,
   'está', NOW()),
  (gen_random_uuid(), 'ES', 'A1', 'flashcard',
   '{"front": "water", "back": "agua"}',
   '[]'::jsonb,
   'agua', NOW());

-- Create user language preference (for learner@test.com)
INSERT INTO user_languages (user_id, language, proficiency_level, is_active, created_at)
SELECT id, 'ES', 'A1', true, NOW()
FROM users WHERE email = 'learner@test.com'
ON CONFLICT DO NOTHING;

-- Initialize some word states for learner
INSERT INTO user_word_state (id, user_id, meaning_id, state, review_count, success_count, created_at, updated_at)
SELECT gen_random_uuid(), u.id, m.id, 'learning', 0, 0, NOW(), NOW()
FROM users u, approved_meanings m
WHERE u.email = 'learner@test.com' AND m.language = 'ES'
LIMIT 5;
```

### Option C: Full Test Script (Recommended - 10 min)

Create `scripts/seed-test-data.sql`:

```bash
# Run the full seed
psql postgresql://test:test@localhost:5434/polyladder_test -f scripts/seed-test-data.sql
```

---

## 3. Testing Flows

### Flow 1: Authentication (5 min)

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOW                       │
├─────────────────────────────────────────────────────────────┤
│  1. Registration                                             │
│     POST /api/v1/auth/register                               │
│     ↓                                                        │
│  2. Login                                                    │
│     POST /api/v1/auth/login → tokens                         │
│     ↓                                                        │
│  3. Access Protected Route                                   │
│     GET /api/v1/auth/me (with Bearer token)                  │
│     ↓                                                        │
│  4. Token Refresh                                            │
│     POST /api/v1/auth/refresh                                │
│     ↓                                                        │
│  5. Logout                                                   │
│     POST /api/v1/auth/logout                                 │
└─────────────────────────────────────────────────────────────┘
```

**Test Checklist**:

- [ ] Register new user (learner)
- [ ] Register new user (operator)
- [ ] Login with valid credentials
- [ ] Login with invalid credentials (expect 401)
- [ ] Access /me with valid token
- [ ] Access /me with expired token (expect 401)
- [ ] Refresh token works
- [ ] Logout invalidates token

### Flow 2: Learner Journey (15 min)

```
┌─────────────────────────────────────────────────────────────┐
│                    LEARNER JOURNEY                           │
├─────────────────────────────────────────────────────────────┤
│  1. Login as learner                                         │
│     ↓                                                        │
│  2. Set studied language                                     │
│     POST /api/v1/learning/preferences/languages              │
│     ↓                                                        │
│  3. Check orthography gate (if A0)                           │
│     GET /api/v1/learning/orthography-gate/status             │
│     ↓                                                        │
│  4. Browse vocabulary                                        │
│     GET /api/v1/learning/vocabulary                          │
│     ↓                                                        │
│  5. Mark word as "learning"                                  │
│     POST /api/v1/learning/word-state/:meaningId              │
│     ↓                                                        │
│  6. Start recall practice                                    │
│     GET /api/v1/learning/recall/due                          │
│     ↓                                                        │
│  7. Submit recall review                                     │
│     POST /api/v1/learning/recall/review                      │
│     ↓                                                        │
│  8. Try recognition practice                                 │
│     GET /api/v1/learning/recognition/questions               │
│     POST /api/v1/learning/recognition/answer                 │
│     ↓                                                        │
│  9. View analytics                                           │
│     GET /api/v1/analytics/vocabulary                         │
│     GET /api/v1/analytics/statistics                         │
└─────────────────────────────────────────────────────────────┘
```

**Test Checklist**:

- [ ] Can set studied language
- [ ] Can view vocabulary list
- [ ] Can filter by CEFR level
- [ ] Can mark word as learning
- [ ] Due words appear in recall
- [ ] Review updates SRS state
- [ ] Recognition generates questions
- [ ] Analytics show progress

### Flow 3: Operator Journey (20 min)

```
┌─────────────────────────────────────────────────────────────┐
│                    OPERATOR JOURNEY                          │
├─────────────────────────────────────────────────────────────┤
│  1. Login as operator                                        │
│     ↓                                                        │
│  2. View pipelines                                           │
│     GET /api/v1/operational/pipelines                        │
│     ↓                                                        │
│  3. View pending approvals                                   │
│     GET /api/v1/operational/approve                          │
│     ↓                                                        │
│  4. Review item details                                      │
│     GET /api/v1/operational/approve/:id                      │
│     ↓                                                        │
│  5. Approve or reject                                        │
│     POST /api/v1/operational/approve/:id                     │
│     POST /api/v1/operational/reject/:id                      │
│     ↓                                                        │
│  6. View failures                                            │
│     GET /api/v1/operational/failures                         │
│     ↓                                                        │
│  7. View activity log                                        │
│     GET /api/v1/operational/activity-log                     │
└─────────────────────────────────────────────────────────────┘
```

**Test Checklist**:

- [ ] Learner cannot access operator routes (expect 403)
- [ ] Can view pipeline list
- [ ] Can view pending approvals
- [ ] Can approve item
- [ ] Can reject item with reason
- [ ] Failures show correctly
- [ ] Activity log records actions

---

## 4. Test Scenarios by Feature

### 4.1 Health Check

| Test                   | Expected                        | Priority |
| ---------------------- | ------------------------------- | -------- |
| `GET /health`          | 200 with status, uptime, memory | High     |
| DB down → health check | 503 unhealthy                   | High     |

### 4.2 Authentication

| Test                        | Expected             | Priority |
| --------------------------- | -------------------- | -------- |
| Register with invalid email | 400 validation error | High     |
| Register with weak password | 400 validation error | Medium   |
| Login wrong password        | 401 unauthorized     | High     |
| Use expired access token    | 401 unauthorized     | High     |
| Refresh with invalid token  | 401 unauthorized     | High     |
| Double logout               | Should not error     | Low      |

### 4.3 Vocabulary & Word State

| Test                               | Expected         | Priority |
| ---------------------------------- | ---------------- | -------- |
| Get vocabulary (no language set)   | 400 or empty     | High     |
| Get vocabulary with filters        | Filtered results | High     |
| Update word state unknown→learning | State updates    | High     |
| Update word state learning→known   | State updates    | High     |
| Update non-existent word           | 404              | Medium   |

### 4.4 Recall Practice (SRS)

| Test                                | Expected           | Priority |
| ----------------------------------- | ------------------ | -------- |
| Get due words (none due)            | Empty array        | High     |
| Get due words (some due)            | Array with words   | High     |
| Submit review quality=5             | Interval increases | High     |
| Submit review quality=1             | Interval resets    | High     |
| Submit review for non-learning word | Error or auto-add  | Medium   |

### 4.5 Recognition Practice

| Test                               | Expected                   | Priority |
| ---------------------------------- | -------------------------- | -------- |
| Get questions (no learning words)  | Empty or error             | Medium   |
| Get questions (has learning words) | Questions with distractors | High     |
| Submit correct answer              | Success, next question     | High     |
| Submit wrong answer                | Feedback, try again        | High     |

### 4.6 Exercises

| Test                             | Expected                  | Priority |
| -------------------------------- | ------------------------- | -------- |
| Get cloze exercises              | Exercises with blanks     | High     |
| Get dictation exercises          | Exercises with audio URLs | Medium   |
| Submit exercise answer (correct) | Success response          | High     |
| Submit exercise answer (wrong)   | Feedback response         | High     |

### 4.7 Grammar

| Test                    | Expected                  | Priority |
| ----------------------- | ------------------------- | -------- |
| Get grammar lessons     | List of rules             | High     |
| Filter by CEFR level    | Filtered results          | High     |
| Get comparative grammar | Cross-language comparison | Medium   |

### 4.8 Analytics

| Test                    | Expected                  | Priority |
| ----------------------- | ------------------------- | -------- |
| Vocabulary analytics    | Mastery percentages       | High     |
| Grammar analytics       | Coverage stats            | High     |
| Statistics              | Study time, words learned | High     |
| Weakness identification | Problem areas             | Medium   |
| CEFR assessment         | Level estimate            | Medium   |

### 4.9 Operator Routes

| Test                          | Expected                        | Priority |
| ----------------------------- | ------------------------------- | -------- |
| Learner access operator route | 403 forbidden                   | Critical |
| Get pipelines list            | Paginated list                  | High     |
| Get pipeline details          | Full details with stats         | High     |
| Approve validated item        | Moves to approved\_\*           | High     |
| Reject with reason            | Moves to rejected, reason saved | High     |
| Delete pipeline               | Cascade deletes related data    | High     |

---

## 5. API Testing with curl

### Setup

```bash
# Set base URL
export API_URL="http://localhost:3000"

# Login and get tokens
TOKENS=$(curl -s -X POST "$API_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"learner@test.com","password":"password123"}')

export ACCESS_TOKEN=$(echo $TOKENS | jq -r '.accessToken')
export REFRESH_TOKEN=$(echo $TOKENS | jq -r '.refreshToken')

# Helper function
api() {
  curl -s -X $1 "$API_URL$2" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    ${3:+-d "$3"} | jq
}
```

### Authentication Tests

```bash
# Health check
curl -s "$API_URL/health" | jq

# Register new user
curl -s -X POST "$API_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","role":"learner","baseLanguage":"EN"}' | jq

# Login
curl -s -X POST "$API_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"learner@test.com","password":"password123"}' | jq

# Get profile
api GET /api/v1/auth/me

# Refresh token
curl -s -X POST "$API_URL/api/v1/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" | jq

# Logout
api POST /api/v1/auth/logout
```

### Learner Flow Tests

```bash
# Set studied language
api POST /api/v1/learning/preferences/languages '{"languages":["ES"]}'

# Get vocabulary
api GET "/api/v1/learning/vocabulary?language=ES&level=A1&limit=10"

# Get word state
api GET /api/v1/learning/word-state/{meaningId}

# Update word state to learning
api POST /api/v1/learning/word-state/{meaningId} '{"state":"learning"}'

# Get due recall words
api GET "/api/v1/learning/recall/due?language=ES"

# Submit recall review
api POST /api/v1/learning/recall/review '{"meaningId":"...","quality":4}'

# Get recognition questions
api GET "/api/v1/learning/recognition/questions?language=ES&count=5"

# Submit recognition answer
api POST /api/v1/learning/recognition/answer '{"questionId":"...","selectedAnswer":"..."}'

# Get analytics
api GET /api/v1/analytics/vocabulary
api GET /api/v1/analytics/statistics
api GET /api/v1/analytics/weakness
```

### Operator Flow Tests

```bash
# Login as operator
TOKENS=$(curl -s -X POST "$API_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"operator@test.com","password":"password123"}')
export ACCESS_TOKEN=$(echo $TOKENS | jq -r '.accessToken')

# Get pipelines
api GET "/api/v1/operational/pipelines?limit=10"

# Get pending approvals
api GET /api/v1/operational/approve

# Approve item
api POST /api/v1/operational/approve/{id}

# Reject item
api POST /api/v1/operational/reject/{id} '{"reason":"Incorrect translation"}'

# Get failures
api GET /api/v1/operational/failures

# Get activity log
api GET /api/v1/operational/activity-log
```

---

## 6. Empty Data Scenarios (Critical to Test!)

These scenarios reveal silent failures in the app:

### 6.1 No Orthography Content

**Setup:**

```sql
-- Remove all orthography concepts
DELETE FROM curriculum_graph WHERE concept_type = 'orthography';
```

**Test:**

1. Login as learner
2. Set Spanish as studied language
3. Navigate to Orthography lessons

**Expected behavior (current):**

- Returns 200 with empty `lessons: []`
- Shows yellow "No orthography lessons available" message
- **Problem:** User stuck - can't unlock gate, can't access A1+

**Desired behavior:**

- Should prevent adding language without A0 content
- Or show actionable message with recovery path

### 6.2 No Vocabulary Data

**Setup:**

```sql
DELETE FROM approved_meanings WHERE language = 'ES';
DELETE FROM approved_utterances WHERE language = 'ES';
```

**Test:**

1. Login as learner with Spanish
2. Go to vocabulary list
3. Try recall practice

**Expected behavior (current):**

- Vocabulary: Returns 200 with `items: []`
- Recall: Returns 200 with `words: []`
- **Problem:** No explanation, no "when will content be available"

### 6.3 No Exercises

**Setup:**

```sql
DELETE FROM approved_exercises WHERE language = 'ES';
```

**Test:**

1. Login as learner
2. Try to do exercises

**Expected behavior (current):**

- Returns 200 with `exercises: []`
- **Problem:** UI may show loading forever or blank screen

### 6.4 Empty SRS Queue (All Reviewed)

**Setup:**

```sql
-- Move all SRS items to future
UPDATE user_srs_items
SET next_review_at = NOW() + INTERVAL '7 days'
WHERE user_id = (SELECT id FROM users WHERE email = 'learner@test.com');
```

**Test:**

1. Login as learner
2. Go to recall practice

**Expected behavior (current):**

- Returns 200 with `words: []`
- **Problem:** No indication WHEN next review will be available

### 6.5 Circular Curriculum Dependencies

**Setup:**

```sql
-- Create circular dependency: A requires B, B requires A
UPDATE curriculum_graph
SET prerequisites = '["concept-b"]'::jsonb
WHERE concept_id = 'concept-a';

UPDATE curriculum_graph
SET prerequisites = '["concept-a"]'::jsonb
WHERE concept_id = 'concept-b';
```

**Test:**

1. Get curriculum graph for language

**Expected behavior (current):**

- Throws unhandled error, returns 500
- **Problem:** Should be 400 with "Configuration error" message

---

### 6.1 Security Issues to Test

```bash
# Test: Debug endpoint should be removed/protected
api GET /api/v1/operational/pipelines/test-id/mappings/debug
# Expected: Should return 404 or 403, NOT data

# Test: Learner cannot access operator routes
# (Use learner token)
api GET /api/v1/operational/pipelines
# Expected: 403 Forbidden

# Test: Invalid pagination should be bounded
api GET "/api/v1/learning/vocabulary?limit=999999"
# Expected: Should cap at reasonable limit (e.g., 1000)
```

### 6.2 Data Integrity Tests

```bash
# Test: Non-existent resource returns 404
api GET /api/v1/learning/word-state/00000000-0000-0000-0000-000000000000
# Expected: 404, NOT 500

# Test: Concurrent word state updates
# Run two requests simultaneously - should not corrupt data

# Test: Empty results don't crash
api GET "/api/v1/learning/vocabulary?language=XX"
# Expected: Empty array, NOT error
```

### 6.3 Edge Cases

```bash
# Test: Very long strings
api POST /api/v1/auth/register \
  '{"email":"a{500 chars}@test.com","password":"pass"}'
# Expected: 400 validation error

# Test: SQL injection attempt
api GET "/api/v1/learning/vocabulary?language=ES'; DROP TABLE users;--"
# Expected: Escaped, no error

# Test: Empty body where required
api POST /api/v1/learning/recall/review ''
# Expected: 400 validation error
```

---

## 7. Quick Testing Checklist

### Smoke Test (5 min)

- [ ] App starts without errors
- [ ] Health endpoint returns healthy
- [ ] Can login as learner
- [ ] Can login as operator
- [ ] Protected routes require auth

### Core Flow Test (15 min)

- [ ] Learner can set language
- [ ] Learner can view vocabulary
- [ ] Learner can start learning words
- [ ] Recall practice works
- [ ] Recognition practice works
- [ ] Analytics display data

### Operator Flow Test (10 min)

- [ ] Operator can view pipelines
- [ ] Operator can view approvals
- [ ] Approval workflow works
- [ ] Rejection workflow works

### Security Test (10 min)

- [ ] Role-based access enforced
- [ ] Invalid tokens rejected
- [ ] Debug endpoints protected
- [ ] Input validation works

---

## 8. Test Data Cleanup

```sql
-- Reset all test data (CAUTION: deletes everything!)
TRUNCATE
  user_word_state,
  user_srs_items,
  user_srs_review_history,
  user_review_sessions,
  user_languages,
  user_preferences,
  refresh_tokens,
  approval_events
CASCADE;

-- Reset specific user's data
DELETE FROM user_word_state WHERE user_id = (SELECT id FROM users WHERE email = 'learner@test.com');
DELETE FROM user_srs_items WHERE user_id = (SELECT id FROM users WHERE email = 'learner@test.com');

-- Reset to fresh state but keep approved content
TRUNCATE
  user_word_state,
  user_srs_items,
  user_srs_review_history
CASCADE;
```

---

## 9. Environment Setup Reference

### Development Database

```bash
# docker-compose.yml includes postgres-test on port 5434
docker compose up -d postgres-test

# Connection string
DATABASE_URL="postgresql://test:test@localhost:5434/polyladder_test"
```

### Start Services

```bash
# Terminal 1: API
DATABASE_URL="postgresql://test:test@localhost:5434/polyladder_test" pnpm --filter @polyladder/api dev

# Terminal 2: Web (optional for UI testing)
pnpm --filter @polyladder/web dev
```

### Useful psql Commands

```bash
# Connect
psql postgresql://test:test@localhost:5434/polyladder_test

# List tables
\dt

# Describe table
\d users

# Count records
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM approved_meanings;
SELECT COUNT(*) FROM user_word_state;
```
