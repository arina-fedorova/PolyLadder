# F034: Orthography Practice Exercises

**Feature Code**: F034
**Created**: 2025-12-17
**Phase**: 9 - Orthography Learning (CEFR A0)
**Status**: Not Started

---

## Description

Implement practice exercises for orthography: letter recognition, sound matching, and dictation. Users must pass these to complete orthography gate.

## Success Criteria

- [ ] Letter recognition exercises (hear sound, select letter)
- [ ] Sound matching (see letter, hear sounds, select correct one)
- [ ] Simple dictation (hear letter, type it)
- [ ] Immediate feedback on answers
- [ ] Exercise completion marks progress
- [ ] Passing all exercises completes orthography gate

---

## Tasks

### Task 1: Create Orthography Exercise Fetching API

**Description**: API endpoint to retrieve orthography exercises for a language.

**Implementation Plan**:

Create `packages/api/src/routes/exercises/orthography-exercises.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Language, ExerciseType } from '@polyladder/core';

const OrthographyExerciseQuerySchema = z.object({
  language: z.nativeEnum(Language),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const orthographyExercisesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/exercises/orthography/:language', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const { language } = request.params as { language: Language };
    const { limit } = OrthographyExerciseQuerySchema.parse(request.query);
    const userId = request.user!.userId;

    // Get completed orthography concepts
    const completed = await fastify.pg.query(
      `SELECT concept_id FROM user_progress
       WHERE user_id = $1 AND status = 'completed'
         AND concept_id LIKE 'ortho_%'`,
      [userId]
    );

    const completedIds = completed.rows.map(r => r.concept_id);

    // Fetch exercises for completed concepts
    const exercises = await fastify.pg.query(
      `SELECT id, type, level, languages, prompt, correct_answer, options, metadata
       FROM approved_exercises
       WHERE language = ANY($1) AND type IN ('flashcard', 'multiple_choice', 'dictation')
         AND metadata->>'category' = 'orthography'
       ORDER BY RANDOM()
       LIMIT $2`,
      [[language], limit]
    );

    return reply.status(200).send({
      exercises: exercises.rows.map(row => ({
        id: row.id,
        type: row.type,
        prompt: row.prompt,
        correctAnswer: row.correct_answer,
        options: row.options,
        audioUrl: row.metadata.audio_url,
      })),
    });
  });
};
```

**Files Created**: `packages/api/src/routes/exercises/orthography-exercises.ts`

---

### Task 2: Create Letter Recognition Exercise Component

**Description**: Multiple choice exercise - hear sound, select letter.

**Implementation Plan**:

Create `packages/web/src/components/exercises/LetterRecognition.tsx`:
```typescript
import React, { useState } from 'react';

interface LetterRecognitionProps {
  audioUrl: string;
  options: string[];
  correctAnswer: string;
  onAnswer: (correct: boolean) => void;
}

export function LetterRecognition({
  audioUrl,
  options,
  correctAnswer,
  onAnswer,
}: LetterRecognitionProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const playAudio = () => {
    const audio = new Audio(audioUrl);
    audio.play();
  };

  const handleSelect = (option: string) => {
    setSelected(option);
    setShowFeedback(true);

    const isCorrect = option === correctAnswer;
    onAnswer(isCorrect);

    // Auto-advance after 1.5 seconds
    setTimeout(() => {
      setShowFeedback(false);
      setSelected(null);
    }, 1500);
  };

  return (
    <div className="letter-recognition">
      <h3>Listen and select the letter:</h3>
      <button onClick={playAudio} className="audio-button">
        🔊 Play Sound
      </button>

      <div className="options-grid">
        {options.map(option => (
          <button
            key={option}
            onClick={() => handleSelect(option)}
            disabled={showFeedback}
            className={`option ${
              showFeedback && option === selected
                ? option === correctAnswer
                  ? 'correct'
                  : 'incorrect'
                : ''
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {showFeedback && (
        <div className={`feedback ${selected === correctAnswer ? 'correct' : 'incorrect'}`}>
          {selected === correctAnswer ? '✅ Correct!' : `❌ Incorrect. The answer is "${correctAnswer}"`}
        </div>
      )}
    </div>
  );
}
```

**Files Created**: `packages/web/src/components/exercises/LetterRecognition.tsx`

---

### Task 3: Create Sound Matching Exercise Component

**Description**: See letter, hear multiple sounds, select correct one.

**Implementation Plan**:

Create `packages/web/src/components/exercises/SoundMatching.tsx`:
```typescript
import React, { useState } from 'react';

interface SoundMatchingProps {
  letter: string;
  soundOptions: { audioUrl: string; id: string }[];
  correctSoundId: string;
  onAnswer: (correct: boolean) => void;
}

export function SoundMatching({
  letter,
  soundOptions,
  correctSoundId,
  onAnswer,
}: SoundMatchingProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const playSound = (audioUrl: string, soundId: string) => {
    const audio = new Audio(audioUrl);
    audio.play();

    setSelected(soundId);
    setShowFeedback(true);

    const isCorrect = soundId === correctSoundId;
    onAnswer(isCorrect);

    setTimeout(() => {
      setShowFeedback(false);
      setSelected(null);
    }, 1500);
  };

  return (
    <div className="sound-matching">
      <h3>Select the correct sound for this letter:</h3>
      <div className="letter-display">{letter}</div>

      <div className="sound-options">
        {soundOptions.map((sound, index) => (
          <button
            key={sound.id}
            onClick={() => playSound(sound.audioUrl, sound.id)}
            disabled={showFeedback}
            className={`sound-option ${
              showFeedback && sound.id === selected
                ? sound.id === correctSoundId
                  ? 'correct'
                  : 'incorrect'
                : ''
            }`}
          >
            🔊 Sound {index + 1}
          </button>
        ))}
      </div>

      {showFeedback && (
        <div className={`feedback ${selected === correctSoundId ? 'correct' : 'incorrect'}`}>
          {selected === correctSoundId ? '✅ Correct!' : '❌ Try again'}
        </div>
      )}
    </div>
  );
}
```

**Files Created**: `packages/web/src/components/exercises/SoundMatching.tsx`

---

### Task 4: Create Simple Dictation Exercise Component

**Description**: Hear letter/word, type it.

**Implementation Plan**:

Create `packages/web/src/components/exercises/SimpleDictation.tsx`:
```typescript
import React, { useState } from 'react';

interface SimpleDictationProps {
  audioUrl: string;
  correctAnswer: string;
  onAnswer: (correct: boolean) => void;
}

export function SimpleDictation({
  audioUrl,
  correctAnswer,
  onAnswer,
}: SimpleDictationProps) {
  const [input, setInput] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const playAudio = () => {
    const audio = new Audio(audioUrl);
    audio.play();
  };

  const handleSubmit = () => {
    const normalized = input.trim().toLowerCase();
    const correct = normalized === correctAnswer.toLowerCase();

    setIsCorrect(correct);
    setShowFeedback(true);
    onAnswer(correct);

    setTimeout(() => {
      setShowFeedback(false);
      setInput('');
    }, 1500);
  };

  return (
    <div className="simple-dictation">
      <h3>Listen and type what you hear:</h3>
      <button onClick={playAudio} className="audio-button">
        🔊 Play
      </button>

      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
        disabled={showFeedback}
        placeholder="Type here..."
        autoFocus
      />

      <button onClick={handleSubmit} disabled={!input || showFeedback}>
        Submit
      </button>

      {showFeedback && (
        <div className={`feedback ${isCorrect ? 'correct' : 'incorrect'}`}>
          {isCorrect ? '✅ Correct!' : `❌ Incorrect. The answer is "${correctAnswer}"`}
        </div>
      )}
    </div>
  );
}
```

**Files Created**: `packages/web/src/components/exercises/SimpleDictation.tsx`

---

### Task 5: Create Orthography Exercise Session Manager

**Description**: Main component that orchestrates orthography exercises.

**Implementation Plan**:

Create `packages/web/src/components/exercises/OrthographyExerciseSession.tsx`:
```typescript
import React, { useState, useEffect } from 'react';
import { Language } from '@polyladder/core';
import { api } from '../../services/api';
import { LetterRecognition } from './LetterRecognition';
import { SoundMatching } from './SoundMatching';
import { SimpleDictation } from './SimpleDictation';

interface Exercise {
  id: string;
  type: 'letter_recognition' | 'sound_matching' | 'dictation';
  prompt: string;
  correctAnswer: string;
  options?: string[];
  audioUrl?: string;
}

export function OrthographyExerciseSession({ language }: { language: Language }) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/exercises/orthography/${language}?limit=20`)
      .then(data => {
        setExercises(data.exercises);
        setLoading(false);
      });
  }, [language]);

  const handleAnswer = (correct: boolean) => {
    setScore(prev => ({
      correct: prev.correct + (correct ? 1 : 0),
      total: prev.total + 1,
    }));

    // Move to next exercise after delay
    setTimeout(() => {
      if (currentIndex < exercises.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        // Session complete
        handleSessionComplete();
      }
    }, 2000);
  };

  const handleSessionComplete = async () => {
    const accuracy = (score.correct / score.total) * 100;

    if (accuracy >= 80) {
      // Pass - mark orthography gate as completed
      await api.post('/learning/orthography/complete', {
        language,
        accuracy,
      });

      alert('🎉 Congratulations! You passed the orthography exercises!');
      window.location.href = '/learning/dashboard';
    } else {
      // Fail - retry
      if (confirm(`You scored ${accuracy.toFixed(1)}%. You need 80% to pass. Retry?`)) {
        setCurrentIndex(0);
        setScore({ correct: 0, total: 0 });
      }
    }
  };

  if (loading) return <div>Loading exercises...</div>;
  if (exercises.length === 0) return <div>No exercises available</div>;

  const currentExercise = exercises[currentIndex];

  return (
    <div className="orthography-exercise-session">
      <div className="session-header">
        <h2>Orthography Practice: {language}</h2>
        <div className="progress">
          Exercise {currentIndex + 1} / {exercises.length}
        </div>
        <div className="score">
          Score: {score.correct} / {score.total} ({score.total > 0 ? ((score.correct / score.total) * 100).toFixed(0) : 0}%)
        </div>
      </div>

      <div className="exercise-container">
        {currentExercise.type === 'letter_recognition' && (
          <LetterRecognition
            audioUrl={currentExercise.audioUrl!}
            options={currentExercise.options!}
            correctAnswer={currentExercise.correctAnswer}
            onAnswer={handleAnswer}
          />
        )}

        {currentExercise.type === 'sound_matching' && (
          <SoundMatching
            letter={currentExercise.prompt}
            soundOptions={currentExercise.options!.map(opt => ({
              audioUrl: opt,
              id: opt,
            }))}
            correctSoundId={currentExercise.correctAnswer}
            onAnswer={handleAnswer}
          />
        )}

        {currentExercise.type === 'dictation' && (
          <SimpleDictation
            audioUrl={currentExercise.audioUrl!}
            correctAnswer={currentExercise.correctAnswer}
            onAnswer={handleAnswer}
          />
        )}
      </div>
    </div>
  );
}
```

**Files Created**: `packages/web/src/components/exercises/OrthographyExerciseSession.tsx`

---

### Task 6: Create Orthography Completion Endpoint

**Description**: API endpoint to mark orthography gate as completed.

**Implementation Plan**:

Create endpoint in `packages/api/src/routes/learning/orthography.ts`:
```typescript
fastify.post('/learning/orthography/complete', {
  preHandler: authMiddleware,
}, async (request, reply) => {
  const userId = request.user!.userId;
  const { language, accuracy } = request.body as { language: Language; accuracy: number };

  if (accuracy < 80) {
    return reply.status(400).send({ error: 'Minimum 80% accuracy required' });
  }

  // Mark all orthography concepts as completed
  await fastify.pg.query(
    `UPDATE user_progress
     SET status = 'completed', completion_date = CURRENT_TIMESTAMP
     WHERE user_id = $1
       AND concept_id IN (
         SELECT concept_id FROM curriculum_graph
         WHERE language = $2 AND concept_type = 'orthography'
       )`,
    [userId, language]
  );

  return reply.status(200).send({ success: true });
});
```

**Files Created**: None (update existing)

---

## Dependencies

- **Blocks**: F035-F056 (gated by orthography)
- **Depends on**: F033

---

## Notes

- Exercises generated from approved_exercises table
- Minimum 80% accuracy required to pass
- Retry unlimited times

---

## Open Questions

### 1. Exercise Type Distribution

**Question**: What should be the ratio of different exercise types (letter recognition vs. sound matching vs. dictation) in each practice session?

**Current Approach**: Random selection (`ORDER BY RANDOM()`) from all available exercise types without balancing. Distribution depends entirely on what's available in `approved_exercises` table.

**Alternatives**:
1. **Equal distribution**: 33% letter recognition, 33% sound matching, 33% dictation
2. **Difficulty progression**: Start with easier types (recognition), gradually increase harder types (dictation)
3. **Weighted distribution**: More emphasis on difficult types (40% recognition, 30% matching, 30% dictation)
4. **Adaptive distribution**: Analyze user performance, assign more exercises of types where user struggles

**Recommendation**: Implement **difficulty progression** (Option 2) within sessions. Structure 20-exercise sessions as: 40% letter recognition (exercises 1-8), 35% sound matching (exercises 9-15), 25% dictation (exercises 16-20). This builds confidence early while ensuring exposure to all exercise types. Track per-type accuracy in database to inform future session composition.

---

### 2. Difficulty Adaptation Algorithm

**Question**: Should exercise difficulty adapt based on user performance, and if so, how?

**Current Approach**: No difficulty adaptation. All exercises are presented randomly regardless of user performance. Failed exercises are not repeated or emphasized.

**Alternatives**:
1. **Static difficulty**: No adaptation, all users see same progression (current approach)
2. **Retry on failure**: Immediately re-present exercises that were answered incorrectly
3. **Leitner system**: Increase interval for correct answers, decrease for wrong answers (similar to SRS)
4. **Performance-based selection**: If accuracy < 70%, show easier exercises; if > 90%, show harder ones

**Recommendation**: Implement **modified retry system** (Option 2) combined with end-of-session review. During session, don't immediately retry (avoids frustration). After completing all 20 exercises, if accuracy < 80%, present a bonus review round containing only the missed items. This gives users targeted practice on weak areas without disrupting flow. Store missed exercise IDs in session state for review round.

---

### 3. Performance Tracking Granularity

**Question**: At what level should performance be tracked - per letter, per exercise type, per session, or all of the above?

**Current Approach**: Only session-level tracking (overall accuracy percentage). No persistence of which specific letters or exercise types caused difficulties.

**Alternatives**:
1. **Session-level only**: Track overall accuracy per session (current approach, simplest but least informative)
2. **Exercise-type level**: Track accuracy separately for recognition, matching, and dictation
3. **Letter-level**: Track accuracy for each individual letter/character
4. **Full granularity**: Track all dimensions (letter × exercise type × session)

**Recommendation**: Implement **full granularity tracking** (Option 4). Create `orthography_exercise_results` table with columns: `user_id`, `session_id`, `letter`, `exercise_type`, `correct`, `timestamp`. This enables powerful analytics:
- Identify specific letters causing problems
- Determine if user struggles with all exercise types or just one
- Show progress over time per letter
- Inform adaptive exercise generation in F035+

Query this data for the "weakness identification" feature (F055) to show users exactly which letters need more practice.
