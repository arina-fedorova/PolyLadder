# F021: Learning Endpoints

**Feature Code**: F021
**Created**: 2025-12-17
**Phase**: 5 - API Layer
**Status**: Not Started

---

## Description

REST API endpoints for learners: curriculum access, vocabulary state, progress tracking, exercise fetching, and SRS review queue.

## Success Criteria

- [ ] GET /api/v1/learning/curriculum - User curriculum
- [ ] GET /api/v1/learning/vocabulary - User vocabulary state
- [ ] POST /api/v1/learning/progress - Record progress
- [ ] GET /api/v1/learning/exercises - Fetch exercises
- [ ] POST /api/v1/learning/exercise-result - Submit exercise result
- [ ] GET /api/v1/learning/srs-due - Get SRS review queue

---

## Tasks

### Task 1: Create User Languages Endpoint

**Description**: GET /learning/languages - Returns list of languages user is learning with progress.

**Implementation Plan**:

Create `packages/api/src/routes/learning/languages.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth.middleware';

const UserLanguageSchema = Type.Object({
  language: Type.String(),
  startedAt: Type.String({ format: 'date-time' }),
  orthographyCompleted: Type.Boolean(),
  vocabularyCount: Type.Object({
    unknown: Type.Number(),
    learning: Type.Number(),
    known: Type.Number(),
  }),
  cefrLevel: Type.Optional(Type.String()),
});

export const languagesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/languages', {
    preHandler: authMiddleware,
    schema: {
      response: {
        200: Type.Object({
          languages: Type.Array(UserLanguageSchema),
        }),
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.userId;

    try {
      // Get user's languages
      const languagesResult = await fastify.pg.query(
        `SELECT language, started_at, orthography_completed
         FROM user_languages
         WHERE user_id = $1
         ORDER BY started_at ASC`,
        [userId]
      );

      // For each language, get vocabulary counts
      const languages = await Promise.all(
        languagesResult.rows.map(async (row) => {
          const vocabResult = await fastify.pg.query(
            `SELECT
               COUNT(*) FILTER (WHERE state = 'unknown') as unknown_count,
               COUNT(*) FILTER (WHERE state = 'learning') as learning_count,
               COUNT(*) FILTER (WHERE state = 'known') as known_count
             FROM user_vocabulary
             WHERE user_id = $1 AND language = $2`,
            [userId, row.language]
          );

          const vocab = vocabResult.rows[0];

          return {
            language: row.language,
            startedAt: row.started_at.toISOString(),
            orthographyCompleted: row.orthography_completed,
            vocabularyCount: {
              unknown: parseInt(vocab.unknown_count) || 0,
              learning: parseInt(vocab.learning_count) || 0,
              known: parseInt(vocab.known_count) || 0,
            },
            cefrLevel: null, // TODO: Calculate CEFR level based on progress
          };
        })
      );

      return reply.status(200).send({ languages });
    } catch (error) {
      request.log.error({ err: error, userId }, 'Failed to fetch user languages');
      throw error;
    }
  });

  fastify.post('/languages', {
    preHandler: authMiddleware,
    schema: {
      body: Type.Object({
        language: Type.String(),
      }),
      response: {
        201: Type.Object({
          success: Type.Boolean(),
          message: Type.String(),
        }),
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.userId;
    const { language } = request.body;

    try {
      // Check if already learning this language
      const existing = await fastify.pg.query(
        'SELECT id FROM user_languages WHERE user_id = $1 AND language = $2',
        [userId, language]
      );

      if (existing.rows.length > 0) {
        return reply.status(400).send({
          error: {
            statusCode: 400,
            message: 'Already learning this language',
            requestId: request.id,
          },
        });
      }

      // Add language
      await fastify.pg.query(
        `INSERT INTO user_languages (user_id, language, started_at, orthography_completed)
         VALUES ($1, $2, CURRENT_TIMESTAMP, false)`,
        [userId, language]
      );

      request.log.info({ userId, language }, 'User started learning language');

      return reply.status(201).send({
        success: true,
        message: `Started learning ${language}`,
      });
    } catch (error) {
      request.log.error({ err: error, userId, language }, 'Failed to add language');
      throw error;
    }
  });
};
```

**Files Created**: `packages/api/src/routes/learning/languages.ts`

---

### Task 2: Create Orthography Content Endpoint

**Description**: GET /learning/orthography/:language - Returns orthography lessons for a language.

**Implementation Plan**:

Create `packages/api/src/routes/learning/orthography.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth.middleware';

const OrthographyLessonSchema = Type.Object({
  conceptId: Type.String(),
  letter: Type.String(),
  ipa: Type.String(),
  soundDescription: Type.String(),
  examples: Type.Array(Type.Object({
    word: Type.String(),
    audioUrl: Type.Optional(Type.String()),
  })),
  completed: Type.Boolean(),
});

export const orthographyRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/orthography/:language', {
    preHandler: authMiddleware,
    schema: {
      params: Type.Object({
        language: Type.String(),
      }),
      response: {
        200: Type.Object({
          lessons: Type.Array(OrthographyLessonSchema),
          totalLessons: Type.Number(),
          completedLessons: Type.Number(),
        }),
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.userId;
    const { language } = request.params;

    try {
      // Get orthography concepts from curriculum graph
      const conceptsResult = await fastify.pg.query(
        `SELECT concept_id, metadata
         FROM curriculum_graph
         WHERE language = $1 AND concept_type = 'orthography'
         ORDER BY metadata->>'order' ASC`,
        [language]
      );

      // Get user progress
      const progressResult = await fastify.pg.query(
        `SELECT concept_id
         FROM user_progress
         WHERE user_id = $1 AND concept_type = 'orthography' AND completed = true`,
        [userId]
      );

      const completedConceptIds = new Set(progressResult.rows.map(r => r.concept_id));

      const lessons = conceptsResult.rows.map(row => {
        const metadata = row.metadata;

        return {
          conceptId: row.concept_id,
          letter: metadata.letter,
          ipa: metadata.ipa,
          soundDescription: metadata.soundDescription,
          examples: metadata.exampleWords.map(word => ({
            word,
            audioUrl: null, // TODO: Generate/fetch TTS audio
          })),
          completed: completedConceptIds.has(row.concept_id),
        };
      });

      return reply.status(200).send({
        lessons,
        totalLessons: lessons.length,
        completedLessons: progressResult.rows.length,
      });
    } catch (error) {
      request.log.error({ err: error, userId, language }, 'Failed to fetch orthography');
      throw error;
    }
  });

  fastify.post('/orthography/complete', {
    preHandler: authMiddleware,
    schema: {
      body: Type.Object({
        language: Type.String(),
        accuracy: Type.Number({ minimum: 0, maximum: 100 }),
      }),
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          gateCompleted: Type.Boolean(),
        }),
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.userId;
    const { language, accuracy } = request.body;

    try {
      // Check if user passed (80% accuracy threshold)
      const passed = accuracy >= 80;

      if (passed) {
        // Mark orthography gate as completed
        await fastify.pg.query(
          `UPDATE user_languages
           SET orthography_completed = true
           WHERE user_id = $1 AND language = $2`,
          [userId, language]
        );

        request.log.info({ userId, language, accuracy }, 'User completed orthography gate');
      }

      return reply.status(200).send({
        success: true,
        gateCompleted: passed,
      });
    } catch (error) {
      request.log.error({ err: error, userId, language }, 'Failed to complete orthography');
      throw error;
    }
  });
};
```

**Files Created**: `packages/api/src/routes/learning/orthography.ts`

---

### Task 3: Create Vocabulary Endpoint

**Description**: GET /learning/vocabulary - Returns user's vocabulary state for a language.

**Implementation Plan**:

Create `packages/api/src/routes/learning/vocabulary.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth.middleware';
import { PaginationQuerySchema, PaginatedResponseSchema } from '../../schemas/common';

const VocabularyItemSchema = Type.Object({
  meaningId: Type.String({ format: 'uuid' }),
  word: Type.String(),
  definition: Type.String(),
  partOfSpeech: Type.String(),
  level: Type.String(),
  state: Type.Union([
    Type.Literal('unknown'),
    Type.Literal('learning'),
    Type.Literal('known'),
  ]),
  reviewCount: Type.Number(),
  nextReviewAt: Type.Optional(Type.String({ format: 'date-time' })),
  lastReviewedAt: Type.Optional(Type.String({ format: 'date-time' })),
});

const VocabularyQuerySchema = Type.Intersect([
  PaginationQuerySchema,
  Type.Object({
    language: Type.String(),
    state: Type.Optional(Type.Union([
      Type.Literal('unknown'),
      Type.Literal('learning'),
      Type.Literal('known'),
    ])),
    level: Type.Optional(Type.String()),
  }),
]);

export const vocabularyRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/vocabulary', {
    preHandler: authMiddleware,
    schema: {
      querystring: VocabularyQuerySchema,
      response: {
        200: PaginatedResponseSchema(VocabularyItemSchema),
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.userId;
    const { limit = 20, offset = 0, language, state, level } = request.query;

    try {
      // Build WHERE clause
      const conditions: string[] = ['uv.user_id = $1', 'am.language = $2'];
      const values: any[] = [userId, language];
      let paramIndex = 3;

      if (state) {
        conditions.push(`uv.state = $${paramIndex++}`);
        values.push(state);
      }

      if (level) {
        conditions.push(`am.level = $${paramIndex++}`);
        values.push(level);
      }

      const whereClause = conditions.join(' AND ');

      // Get total count
      const countResult = await fastify.pg.query(
        `SELECT COUNT(*) as total
         FROM user_vocabulary uv
         JOIN approved_meanings am ON am.id = uv.meaning_id
         WHERE ${whereClause}`,
        values
      );
      const total = parseInt(countResult.rows[0].total);

      // Get paginated vocabulary
      const vocabResult = await fastify.pg.query(
        `SELECT
           uv.meaning_id,
           uv.state,
           uv.review_count,
           uv.next_review_at,
           uv.last_reviewed_at,
           am.word,
           am.definition,
           am.part_of_speech,
           am.level
         FROM user_vocabulary uv
         JOIN approved_meanings am ON am.id = uv.meaning_id
         WHERE ${whereClause}
         ORDER BY uv.last_reviewed_at DESC NULLS FIRST
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      );

      const items = vocabResult.rows.map(row => ({
        meaningId: row.meaning_id,
        word: row.word,
        definition: row.definition,
        partOfSpeech: row.part_of_speech,
        level: row.level,
        state: row.state,
        reviewCount: parseInt(row.review_count),
        nextReviewAt: row.next_review_at?.toISOString(),
        lastReviewedAt: row.last_reviewed_at?.toISOString(),
      }));

      return reply.status(200).send({
        items,
        total,
        limit,
        offset,
      });
    } catch (error) {
      request.log.error({ err: error, userId, language }, 'Failed to fetch vocabulary');
      throw error;
    }
  });
};
```

**Files Created**: `packages/api/src/routes/learning/vocabulary.ts`

---

### Task 4: Create Exercise Fetch Endpoint

**Description**: GET /learning/exercises - Returns exercises for practice.

**Implementation Plan**:

Create `packages/api/src/routes/learning/exercises.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth.middleware';

const ExerciseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  type: Type.String(),
  language: Type.String(),
  level: Type.String(),
  prompt: Type.String(),
  options: Type.Array(Type.String()),
  // Note: correctAnswer NOT included in response (sent only after submission)
});

const ExerciseQuerySchema = Type.Object({
  language: Type.String(),
  level: Type.Optional(Type.String()),
  count: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 10 })),
});

export const exercisesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/exercises', {
    preHandler: authMiddleware,
    schema: {
      querystring: ExerciseQuerySchema,
      response: {
        200: Type.Object({
          exercises: Type.Array(ExerciseSchema),
        }),
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.userId;
    const { language, level, count = 10 } = request.query;

    try {
      // Build WHERE clause
      const conditions: string[] = ['language = $1'];
      const values: any[] = [language];
      let paramIndex = 2;

      if (level) {
        conditions.push(`level = $${paramIndex++}`);
        values.push(level);
      }

      const whereClause = conditions.join(' AND ');

      // Fetch random exercises
      const exercisesResult = await fastify.pg.query(
        `SELECT id, language, level, prompt, options
         FROM approved_exercises
         WHERE ${whereClause}
         ORDER BY RANDOM()
         LIMIT $${paramIndex}`,
        [...values, count]
      );

      const exercises = exercisesResult.rows.map(row => ({
        id: row.id,
        type: 'multiple_choice', // All exercises are multiple choice for now
        language: row.language,
        level: row.level,
        prompt: row.prompt,
        options: Array.isArray(row.options) ? row.options : JSON.parse(row.options),
      }));

      return reply.status(200).send({ exercises });
    } catch (error) {
      request.log.error({ err: error, userId, language }, 'Failed to fetch exercises');
      throw error;
    }
  });

  fastify.post('/exercises/submit', {
    preHandler: authMiddleware,
    schema: {
      body: Type.Object({
        exerciseId: Type.String({ format: 'uuid' }),
        selectedAnswer: Type.Number({ minimum: 0 }),
      }),
      response: {
        200: Type.Object({
          correct: Type.Boolean(),
          correctAnswer: Type.Number(),
          explanation: Type.Optional(Type.String()),
        }),
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.userId;
    const { exerciseId, selectedAnswer } = request.body;

    try {
      // Fetch exercise with correct answer
      const exerciseResult = await fastify.pg.query(
        'SELECT correct_answer, explanation FROM approved_exercises WHERE id = $1',
        [exerciseId]
      );

      if (exerciseResult.rows.length === 0) {
        return reply.status(404).send({
          error: {
            statusCode: 404,
            message: 'Exercise not found',
            requestId: request.id,
          },
        });
      }

      const exercise = exerciseResult.rows[0];
      const correct = selectedAnswer === exercise.correct_answer;

      // Record result (for analytics/SRS)
      await fastify.pg.query(
        `INSERT INTO user_exercise_results (user_id, exercise_id, correct, submitted_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        [userId, exerciseId, correct]
      );

      request.log.info({ userId, exerciseId, correct }, 'Exercise submitted');

      return reply.status(200).send({
        correct,
        correctAnswer: exercise.correct_answer,
        explanation: exercise.explanation,
      });
    } catch (error) {
      request.log.error({ err: error, userId, exerciseId }, 'Failed to submit exercise');
      throw error;
    }
  });
};
```

**Files Created**: `packages/api/src/routes/learning/exercises.ts`

---

### Task 5: Create SRS Review Queue Endpoint

**Description**: GET /learning/srs/due - Returns vocabulary due for review based on SRS schedule.

**Implementation Plan**:

Create `packages/api/src/routes/learning/srs.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth.middleware';

const SRSReviewItemSchema = Type.Object({
  meaningId: Type.String({ format: 'uuid' }),
  word: Type.String(),
  definition: Type.String(),
  partOfSpeech: Type.String(),
  level: Type.String(),
  reviewCount: Type.Number(),
  dueAt: Type.String({ format: 'date-time' }),
  exampleUtterances: Type.Array(Type.Object({
    id: Type.String({ format: 'uuid' }),
    text: Type.String(),
    translation: Type.String(),
  })),
});

export const srsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/srs/due', {
    preHandler: authMiddleware,
    schema: {
      querystring: Type.Object({
        language: Type.String(),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
      }),
      response: {
        200: Type.Object({
          items: Type.Array(SRSReviewItemSchema),
          totalDue: Type.Number(),
        }),
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.userId;
    const { language, limit = 20 } = request.query;

    try {
      // Get vocabulary items due for review
      const dueResult = await fastify.pg.query(
        `SELECT
           uv.meaning_id,
           uv.review_count,
           uv.next_review_at,
           am.word,
           am.definition,
           am.part_of_speech,
           am.level
         FROM user_vocabulary uv
         JOIN approved_meanings am ON am.id = uv.meaning_id
         WHERE uv.user_id = $1
           AND am.language = $2
           AND uv.state IN ('learning', 'known')
           AND uv.next_review_at <= CURRENT_TIMESTAMP
         ORDER BY uv.next_review_at ASC
         LIMIT $3`,
        [userId, language, limit]
      );

      // Fetch example utterances for each word
      const items = await Promise.all(
        dueResult.rows.map(async (row) => {
          const utterancesResult = await fastify.pg.query(
            `SELECT id, text, translation
             FROM approved_utterances
             WHERE meaning_id = $1
             ORDER BY RANDOM()
             LIMIT 3`,
            [row.meaning_id]
          );

          return {
            meaningId: row.meaning_id,
            word: row.word,
            definition: row.definition,
            partOfSpeech: row.part_of_speech,
            level: row.level,
            reviewCount: parseInt(row.review_count),
            dueAt: row.next_review_at.toISOString(),
            exampleUtterances: utterancesResult.rows.map(u => ({
              id: u.id,
              text: u.text,
              translation: u.translation,
            })),
          };
        })
      );

      // Get total due count
      const countResult = await fastify.pg.query(
        `SELECT COUNT(*) as total
         FROM user_vocabulary uv
         JOIN approved_meanings am ON am.id = uv.meaning_id
         WHERE uv.user_id = $1
           AND am.language = $2
           AND uv.state IN ('learning', 'known')
           AND uv.next_review_at <= CURRENT_TIMESTAMP`,
        [userId, language]
      );

      const totalDue = parseInt(countResult.rows[0].total);

      return reply.status(200).send({
        items,
        totalDue,
      });
    } catch (error) {
      request.log.error({ err: error, userId, language }, 'Failed to fetch SRS due items');
      throw error;
    }
  });

  fastify.post('/srs/review', {
    preHandler: authMiddleware,
    schema: {
      body: Type.Object({
        meaningId: Type.String({ format: 'uuid' }),
        correct: Type.Boolean(),
      }),
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          nextReviewAt: Type.String({ format: 'date-time' }),
          newState: Type.Union([
            Type.Literal('learning'),
            Type.Literal('known'),
          ]),
        }),
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.userId;
    const { meaningId, correct } = request.body;

    try {
      // Get current vocabulary state
      const vocabResult = await fastify.pg.query(
        `SELECT state, review_count FROM user_vocabulary
         WHERE user_id = $1 AND meaning_id = $2`,
        [userId, meaningId]
      );

      if (vocabResult.rows.length === 0) {
        return reply.status(404).send({
          error: {
            statusCode: 404,
            message: 'Vocabulary item not found',
            requestId: request.id,
          },
        });
      }

      const vocab = vocabResult.rows[0];
      const reviewCount = parseInt(vocab.review_count);

      // Calculate next review interval using SRS algorithm (from F046)
      // Simple implementation: double interval on success, reset on failure
      let intervalDays = 1;
      if (correct) {
        intervalDays = Math.min(Math.pow(2, reviewCount), 180); // Cap at 180 days
      }

      const nextReviewAt = new Date();
      nextReviewAt.setDate(nextReviewAt.getDate() + intervalDays);

      // Determine new state
      let newState = vocab.state;
      if (correct && reviewCount >= 5) {
        newState = 'known'; // Mark as known after 5+ successful reviews
      }

      // Update vocabulary
      await fastify.pg.query(
        `UPDATE user_vocabulary
         SET review_count = review_count + 1,
             next_review_at = $1,
             last_reviewed_at = CURRENT_TIMESTAMP,
             state = $2
         WHERE user_id = $3 AND meaning_id = $4`,
        [nextReviewAt, newState, userId, meaningId]
      );

      request.log.info(
        { userId, meaningId, correct, newState, nextReviewAt },
        'SRS review completed'
      );

      return reply.status(200).send({
        success: true,
        nextReviewAt: nextReviewAt.toISOString(),
        newState,
      });
    } catch (error) {
      request.log.error({ err: error, userId, meaningId }, 'Failed to record SRS review');
      throw error;
    }
  });
};
```

**Files Created**: `packages/api/src/routes/learning/srs.ts`

---

### Task 6: Register All Learning Routes

**Description**: Create learning route index and register all endpoints.

**Implementation Plan**:

Create `packages/api/src/routes/learning/index.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { languagesRoute } from './languages';
import { orthographyRoute } from './orthography';
import { vocabularyRoute } from './vocabulary';
import { exercisesRoute } from './exercises';
import { srsRoute } from './srs';

export const learningRoutes: FastifyPluginAsync = async (fastify) => {
  // Register all learning routes
  await fastify.register(languagesRoute);
  await fastify.register(orthographyRoute);
  await fastify.register(vocabularyRoute);
  await fastify.register(exercisesRoute);
  await fastify.register(srsRoute);
};
```

Update `packages/api/src/server.ts`:
```typescript
async function registerRoutes(server: FastifyInstance): Promise<void> {
  // ... health check and root endpoints ...

  // Import and register feature routes
  const { authRoutes } = await import('./routes/auth');
  await server.register(authRoutes, { prefix: '/auth' });

  const { operationalRoutes } = await import('./routes/operational');
  await server.register(operationalRoutes, { prefix: '/operational' });

  const { learningRoutes } = await import('./routes/learning');
  await server.register(learningRoutes, { prefix: '/learning' });
}
```

**Files Created**:
- `packages/api/src/routes/learning/index.ts`
- Update `packages/api/src/server.ts`

---

### Task 7: Add User Exercise Results Table

**Description**: Database table to track exercise submissions for analytics.

**Implementation Plan**:

Create `packages/db/migrations/013-user-exercise-results.sql`:
```sql
CREATE TABLE user_exercise_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL,
  correct BOOLEAN NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_exercise_results_user ON user_exercise_results(user_id);
CREATE INDEX idx_user_exercise_results_exercise ON user_exercise_results(exercise_id);
CREATE INDEX idx_user_exercise_results_date ON user_exercise_results(submitted_at);

-- View for exercise accuracy per user
CREATE VIEW user_exercise_accuracy AS
SELECT
  user_id,
  COUNT(*) as total_attempts,
  COUNT(*) FILTER (WHERE correct = true) as correct_attempts,
  ROUND(100.0 * COUNT(*) FILTER (WHERE correct = true) / COUNT(*), 1) as accuracy_pct
FROM user_exercise_results
GROUP BY user_id;
```

**Files Created**: `packages/db/migrations/013-user-exercise-results.sql`

---

## Open Questions

None - learning endpoints implement standard learner workflows with SRS integration.

---

## Dependencies

- **Blocks**: F029, F035, F046
- **Depends on**: F006, F018

---

## Notes

- All endpoints require learner authentication
- User data automatically filtered by `userId` from JWT
- Orthography gate must be completed (80% accuracy) before accessing higher content
- Vocabulary state machine: unknown → learning (first encounter) → known (5+ correct reviews)
- SRS uses exponential backoff: interval doubles on success (capped at 180 days)
- Exercises fetch randomly to avoid memorization patterns
- Exercise correctAnswer NOT returned until after submission
- Review queue ordered by due date (oldest first)
