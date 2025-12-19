# F033: Orthography Learning Module

**Feature Code**: F033
**Created**: 2025-12-17
**Phase**: 9 - Orthography Learning (CEFR A0)
**Status**: Not Started

---

## Description

Implement orthography learning interface that teaches alphabet, pronunciation, and phonetics for each language. Displays letters, sounds, example words, and audio.

## Success Criteria

- [ ] Orthography lessons fetched from approved corpus
- [ ] Letter presentation with IPA notation
- [ ] Audio playback for letter sounds
- [ ] Example words with audio
- [ ] Progress tracking per letter/sound
- [ ] Lesson completion triggers exercise mode

---

## Tasks

### Task 1: Create Orthography Data API Endpoint

**Description**: Fetch orthography content (letters, sounds, examples) from approved corpus.

**Implementation Plan**:

Create `packages/api/src/routes/learning/orthography.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Language, CEFRLevel } from '@polyladder/core';
import { createAuthMiddleware } from '../../middleware/auth.middleware';
import { JWTService } from '../../services/auth/jwt.service';

const OrthographyQuerySchema = z.object({
  language: z.nativeEnum(Language),
});

export const orthographyRoute: FastifyPluginAsync = async (fastify) => {
  const jwtService = new JWTService(fastify.config.JWT_SECRET);
  const authMiddleware = createAuthMiddleware(jwtService);

  fastify.get('/learning/orthography/:language', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const { language } = request.params as { language: Language };

    // Get orthography concepts from curriculum graph
    const concepts = await fastify.pg.query(
      `SELECT concept_id, metadata
       FROM curriculum_graph
       WHERE language = $1 AND concept_type = 'orthography'
       ORDER BY metadata->>'order' ASC`,
      [language]
    );

    // For each concept, get utterances (letters, sounds, examples)
    const lessons = await Promise.all(
      concepts.rows.map(async (concept) => {
        const utterances = await fastify.pg.query(
          `SELECT id, text, audio_url, register, usage_notes, metadata
           FROM approved_utterances
           WHERE meaning_id = $1 AND language = $2
           ORDER BY created_at ASC`,
          [concept.concept_id, language]
        );

        return {
          conceptId: concept.concept_id,
          letter: concept.metadata.letter,
          ipa: concept.metadata.ipa,
          examples: utterances.rows.map(row => ({
            id: row.id,
            text: row.text,
            audioUrl: row.audio_url,
            notes: row.usage_notes,
          })),
        };
      })
    );

    return reply.status(200).send({ lessons });
  });
};
```

**Files Created**: `packages/api/src/routes/learning/orthography.ts`

---

### Task 2: Create Orthography Lesson UI Component

**Description**: React component to display letters with IPA, audio, and examples.

**Implementation Plan**:

Create `packages/web/src/components/orthography/OrthographyLesson.tsx`:
```typescript
import React, { useState, useEffect } from 'react';
import { Language } from '@polyladder/core';
import { api } from '../../services/api';

interface OrthographyLesson {
  conceptId: string;
  letter: string;
  ipa: string;
  examples: {
    id: string;
    text: string;
    audioUrl: string;
    notes?: string;
  }[];
}

export function OrthographyLesson({ language }: { language: Language }) {
  const [lessons, setLessons] = useState<OrthographyLesson[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/learning/orthography/${language}`)
      .then(data => {
        setLessons(data.lessons);
        setLoading(false);
      });
  }, [language]);

  if (loading) return <div>Loading...</div>;
  if (lessons.length === 0) return <div>No orthography lessons available</div>;

  const currentLesson = lessons[currentIndex];

  const playAudio = (url: string) => {
    const audio = new Audio(url);
    audio.play();
  };

  const handleComplete = async () => {
    // Mark lesson as completed
    await api.post('/learning/progress', {
      conceptId: currentLesson.conceptId,
      status: 'completed',
    });

    // Move to next lesson
    if (currentIndex < lessons.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // All lessons completed, redirect to exercises
      window.location.href = '/learning/orthography/exercises';
    }
  };

  return (
    <div className="orthography-lesson">
      <h1>Orthography: {language}</h1>
      <div className="progress-bar">
        {currentIndex + 1} / {lessons.length}
      </div>

      <div className="letter-display">
        <h2 className="letter">{currentLesson.letter}</h2>
        <p className="ipa">[{currentLesson.ipa}]</p>
      </div>

      <div className="examples">
        <h3>Examples:</h3>
        {currentLesson.examples.map(example => (
          <div key={example.id} className="example">
            <p className="example-text">{example.text}</p>
            <button onClick={() => playAudio(example.audioUrl)}>
              🔊 Play
            </button>
            {example.notes && <p className="notes">{example.notes}</p>}
          </div>
        ))}
      </div>

      <div className="lesson-actions">
        <button onClick={handleComplete}>
          {currentIndex < lessons.length - 1 ? 'Next Letter' : 'Finish & Practice'}
        </button>
      </div>
    </div>
  );
}
```

**Files Created**: `packages/web/src/components/orthography/OrthographyLesson.tsx`

---

### Task 3: Create Progress Tracking Endpoint

**Description**: API endpoint to mark orthography concepts as completed.

**Implementation Plan**:

Create `packages/api/src/routes/learning/progress.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const ProgressUpdateSchema = z.object({
  conceptId: z.string(),
  status: z.enum(['not_started', 'in_progress', 'completed']),
});

export const progressRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/learning/progress', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const userId = request.user!.userId;
    const body = ProgressUpdateSchema.parse(request.body);

    // Check if progress record exists
    const existing = await fastify.pg.query(
      `SELECT id FROM user_progress WHERE user_id = $1 AND concept_id = $2`,
      [userId, body.conceptId]
    );

    if (existing.rows.length > 0) {
      // Update existing
      await fastify.pg.query(
        `UPDATE user_progress
         SET status = $1, updated_at = CURRENT_TIMESTAMP,
             completion_date = CASE WHEN $1 = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END
         WHERE user_id = $2 AND concept_id = $3`,
        [body.status, userId, body.conceptId]
      );
    } else {
      // Insert new
      await fastify.pg.query(
        `INSERT INTO user_progress (user_id, concept_id, status, completion_date)
         VALUES ($1, $2, $3, CASE WHEN $3 = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
        [userId, body.conceptId, body.status]
      );
    }

    return reply.status(200).send({ success: true });
  });
};
```

**Files Created**: `packages/api/src/routes/learning/progress.ts`

---

### Task 4: Add Orthography Route to App

**Description**: Wire up orthography lesson route in main app.

**Implementation Plan**:

Update `packages/web/src/App.tsx`:
```typescript
import { OrthographyLesson } from './components/orthography/OrthographyLesson';

// In routing:
<Route path="/learning/orthography/:language" element={<OrthographyLesson />} />
```

Register API routes in `packages/api/src/index.ts`:
```typescript
import { orthographyRoute } from './routes/learning/orthography';
import { progressRoute } from './routes/learning/progress';

fastify.register(orthographyRoute, { prefix: '/api' });
fastify.register(progressRoute, { prefix: '/api' });
```

**Files Created**: None (update existing)

---

### Task 5: Style Orthography Lesson Component

**Description**: Create CSS for orthography lesson display.

**Implementation Plan**:

Create `packages/web/src/components/orthography/OrthographyLesson.css`:
```css
.orthography-lesson {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

.progress-bar {
  background: #e0e0e0;
  height: 8px;
  border-radius: 4px;
  margin-bottom: 2rem;
  position: relative;
}

.progress-bar::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: var(--progress);
  background: #4caf50;
  border-radius: 4px;
}

.letter-display {
  text-align: center;
  margin: 3rem 0;
}

.letter {
  font-size: 8rem;
  font-weight: bold;
  color: #333;
}

.ipa {
  font-size: 2rem;
  color: #666;
  font-family: 'Charis SIL', serif; /* IPA font */
}

.examples {
  margin: 2rem 0;
}

.example {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-bottom: 1rem;
}

.example-text {
  font-size: 1.5rem;
  flex: 1;
}

.notes {
  color: #666;
  font-size: 0.9rem;
  font-style: italic;
}

.lesson-actions {
  text-align: center;
  margin-top: 3rem;
}

.lesson-actions button {
  padding: 1rem 2rem;
  font-size: 1.2rem;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.lesson-actions button:hover {
  background: #45a049;
}
```

**Files Created**: `packages/web/src/components/orthography/OrthographyLesson.css`

---

## Dependencies

- **Blocks**: F034
- **Depends on**: F001, F031, F032

---

## Notes

- Orthography content comes from approved_utterances with type="orthography"
- Audio URLs stored in approved_utterances.audio_url
- IPA notation stored in metadata field

---

## Open Questions

### 1. Character Grouping Methodology

**Question**: How should letters/characters be grouped and presented in lessons - alphabetically, by phonetic similarity, or by difficulty?

**Current Approach**: Letters are ordered by `metadata->>'order'` field in curriculum graph, allowing manual curation but no explicit grouping strategy is implemented.

**Alternatives**:
1. **Alphabetical order**: Simple, predictable sequence (A, B, C...) matching how native speakers learn
2. **Phonetic grouping**: Group similar sounds together (/p/, /b/, /m/ as bilabials), helps learners distinguish minimal pairs
3. **Frequency-based**: Teach most common letters first (in English: E, T, A, O, I...), enables reading simple words sooner
4. **Difficulty-based**: Start with simple/familiar sounds, progress to difficult/exotic ones (useful for non-Roman scripts)

**Recommendation**: Use **phonetic grouping** (Option 2) for non-Roman scripts and **frequency-based** (Option 3) for Roman scripts. Phonetic grouping helps learners systematically understand sound systems in unfamiliar writing systems. Frequency-based ordering for familiar scripts enables practical reading skills quickly. Store grouping strategy in `metadata->>'grouping_method'` field.

---

### 2. Practice Exercise Trigger Timing

**Question**: When should the system transition from learning mode to practice mode - after each letter, after groups of letters, or after completing all letters?

**Current Approach**: Practice exercises trigger only after all orthography lessons are completed (redirects to `/learning/orthography/exercises` when `currentIndex >= lessons.length - 1`).

**Alternatives**:
1. **Per-letter practice**: After learning each letter, immediately practice it in isolation
2. **Group-based practice**: After completing a group of 5-10 related letters, practice the group together
3. **Progressive practice**: Mix new letters with previously learned ones after each group
4. **Deferred practice**: Complete all learning first, then practice all letters together (current approach)

**Recommendation**: Implement **group-based practice** (Option 2) with groups of 5-7 letters. This provides spaced repetition opportunities while preventing cognitive overload from too many new symbols. After completing a group, trigger mini-practice session before moving to next group. Update routing to support `/learning/orthography/exercises?letters=ABC...` for group-specific practice.

---

### 3. Completion Criteria and Mastery Thresholds

**Question**: What criteria determine when a user has "mastered" orthography and can progress to vocabulary learning?

**Current Approach**: Implicit completion when user clicks through all lessons. No mastery measurement - user can advance without demonstrating retention.

**Alternatives**:
1. **Time-based**: User must view each lesson for minimum duration (30-60 seconds)
2. **Acknowledgment-based**: User clicks "I understand" for each letter (current approach, minimal accountability)
3. **Practice-based**: Must complete practice exercises with 80%+ accuracy on all letters
4. **Spaced repetition**: Must successfully recognize/produce each letter 3+ times over multiple days

**Recommendation**: Implement **practice-based mastery** (Option 3) combined with minimum practice count. Require 80% accuracy on practice exercises for each letter, with at least 5 successful attempts per letter. This ensures genuine recognition ability before advancing. Store mastery state in `user_progress` table with `mastery_score` field. Gate access to vocabulary features (F036) on orthography completion status.
