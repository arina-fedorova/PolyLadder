# F040: Recognition Practice Mode (Multiple Choice)

**Feature Code**: F040
**Created**: 2025-12-17
**Phase**: 12 - Practice Modes
**Status**: Not Started

---

## Description

Implement recognition practice mode using multiple choice questions for vocabulary and grammar comprehension. Recognition practice is cognitively easier than recall (easier to recognize correct answer among options vs. producing it from memory), making it ideal for early-stage learning and confidence building. The system generates intelligent distractors from same CEFR level and similar grammatical categories, provides immediate feedback with explanations, tracks accuracy for SRS scheduling, and supports both vocabulary (word→definition) and grammar (sentence→correct form) questions.

## Success Criteria

- [ ] Multiple choice questions with 4 options (1 correct + 3 distractors)
- [ ] Intelligent distractor generation from same CEFR level and category
- [ ] Immediate visual feedback (green=correct, red=incorrect)
- [ ] Explanation shown after answer selection
- [ ] Correct/incorrect tracking feeds into SRS scheduling
- [ ] Support for vocabulary and grammar recognition
- [ ] Audio playback for pronunciation practice
- [ ] Keyboard shortcuts (1-4 for option selection)
- [ ] Shuffle option order to prevent position bias
- [ ] Track time-to-answer for adaptive difficulty

---

## Tasks

### Task 1: Distractor Generation Service

**Implementation Plan**:

Create `packages/api/src/services/practice/distractor.service.ts`:

```typescript
import { Pool } from 'pg';
import { Language, CEFRLevel } from '@polyladder/core';

export class DistractorGenerationService {
  constructor(private readonly pool: Pool) {}

  /**
   * Generate distractors for vocabulary word
   * Strategy: Same CEFR level, same POS, different meaning
   */
  async generateVocabularyDistractors(
    vocabularyId: string,
    count: number = 3
  ): Promise<string[]> {
    // Get target word info
    const wordResult = await this.pool.query<{
      cefrLevel: CEFRLevel;
      partOfSpeech: string;
      language: string;
    }>(
      `SELECT cefr_level as "cefrLevel", part_of_speech as "partOfSpeech", language
       FROM approved_vocabulary
       WHERE id = $1`,
      [vocabularyId]
    );

    if (wordResult.rows.length === 0) {
      throw new Error('Vocabulary not found');
    }

    const { cefrLevel, partOfSpeech, language } = wordResult.rows[0];

    // Fetch potential distractors
    const distractorsResult = await this.pool.query<{ wordText: string }>(
      `SELECT word_text as "wordText"
       FROM approved_vocabulary
       WHERE language = $1
         AND cefr_level = $2
         AND part_of_speech = $3
         AND id != $4
       ORDER BY RANDOM()
       LIMIT $5`,
      [language, cefrLevel, partOfSpeech, vocabularyId, count]
    );

    return distractorsResult.rows.map(r => r.wordText);
  }

  /**
   * Generate definition distractors for vocabulary
   * Strategy: Definitions from same CEFR level, different words
   */
  async generateDefinitionDistractors(
    meaningId: string,
    baseLanguage: Language,
    count: number = 3
  ): Promise<string[]> {
    // Get target meaning's CEFR level
    const meaningResult = await this.pool.query<{
      vocabularyId: string;
      cefrLevel: CEFRLevel;
    }>(
      `SELECT am.vocabulary_id as "vocabularyId", av.cefr_level as "cefrLevel"
       FROM approved_meanings am
       JOIN approved_vocabulary av ON am.vocabulary_id = av.id
       WHERE am.id = $1`,
      [meaningId]
    );

    if (meaningResult.rows.length === 0) {
      throw new Error('Meaning not found');
    }

    const { vocabularyId, cefrLevel } = meaningResult.rows[0];

    // Fetch distractor definitions
    const distractorsResult = await this.pool.query<{ definition: string }>(
      `SELECT am.definition
       FROM approved_meanings am
       JOIN approved_vocabulary av ON am.vocabulary_id = av.id
       WHERE am.base_language = $1
         AND av.cefr_level = $2
         AND am.vocabulary_id != $3
       ORDER BY RANDOM()
       LIMIT $4`,
      [baseLanguage, cefrLevel, vocabularyId, count]
    );

    return distractorsResult.rows.map(r => r.definition);
  }

  /**
   * Generate grammar form distractors
   * Strategy: Other conjugations/forms of same word or similar words
   */
  async generateGrammarDistractors(
    correctForm: string,
    grammarCategory: string,
    language: Language,
    count: number = 3
  ): Promise<string[]> {
    // Strategy depends on grammar category
    // For now, simple: find similar words from grammar examples

    const distractorsResult = await this.pool.query<{ sentenceText: string }>(
      `SELECT DISTINCT
        regexp_matches(sentence_text, '[A-Za-zÀ-ÿ]+', 'g') as word
       FROM approved_grammar_examples age
       JOIN approved_grammar_rules agr ON age.grammar_rule_id = agr.id
       WHERE agr.grammar_category = $1
         AND agr.language = $2
       LIMIT $3`,
      [grammarCategory, language, count * 3]
    );

    // Extract unique words, filter out correct form
    const words = distractorsResult.rows
      .map(r => r.sentenceText)
      .filter(w => w !== correctForm)
      .slice(0, count);

    return words;
  }
}
```

**Files Created**:
- `packages/api/src/services/practice/distractor.service.ts`

**Distractor Strategies**:
- **Vocabulary**: Same CEFR level + same part of speech + different word
- **Definitions**: Same CEFR level + different word
- **Grammar**: Same category + different form/conjugation

---

### Task 2: Recognition Practice Service and API

**Implementation Plan**:

Create `packages/api/src/services/practice/recognition.service.ts`:

```typescript
import { Pool } from 'pg';
import { Language } from '@polyladder/core';
import { DistractorGenerationService } from './distractor.service';
import { SRSService } from '../srs/srs.service';

interface RecognitionQuestion {
  questionId: string;
  questionType: 'vocabulary_word' | 'vocabulary_definition' | 'grammar';
  prompt: string;
  correctAnswer: string;
  options: string[]; // Shuffled [correct + distractors]
  correctIndex: number; // Index of correct answer in options
  explanation: string;
  audioUrl: string | null;
  srsItemId: string | null; // For SRS tracking
}

export class RecognitionPracticeService {
  private distractorService: DistractorGenerationService;
  private srsService: SRSService;

  constructor(private readonly pool: Pool) {
    this.distractorService = new DistractorGenerationService(pool);
    this.srsService = new SRSService(pool);
  }

  /**
   * Generate recognition questions from SRS queue
   */
  async getRecognitionQuestions(
    userId: string,
    language: Language,
    baseLanguage: Language,
    limit: number = 10
  ): Promise<RecognitionQuestion[]> {
    // Get items due for review from SRS
    const srsItems = await this.pool.query<{
      id: string;
      vocabularyId: string | null;
      utteranceId: string | null;
    }>(
      `SELECT id, vocabulary_id as "vocabularyId", utterance_id as "utteranceId"
       FROM user_srs_items
       WHERE user_id = $1
         AND language = $2
         AND next_review_date <= NOW()
       ORDER BY next_review_date ASC
       LIMIT $3`,
      [userId, language, limit]
    );

    const questions: RecognitionQuestion[] = [];

    for (const item of srsItems.rows) {
      if (item.vocabularyId) {
        // Generate vocabulary recognition question
        const question = await this.generateVocabularyQuestion(
          item.vocabularyId,
          baseLanguage,
          item.id
        );
        questions.push(question);
      }
      // Could add utterance/grammar questions here
    }

    return questions;
  }

  /**
   * Generate vocabulary recognition question
   * Format: "What is the meaning of '{word}'?"
   */
  private async generateVocabularyQuestion(
    vocabularyId: string,
    baseLanguage: Language,
    srsItemId: string
  ): Promise<RecognitionQuestion> {
    // Get word and correct definition
    const wordResult = await this.pool.query<{
      wordText: string;
      definition: string;
      explanation: string;
      audioUrl: string | null;
    }>(
      `SELECT
        av.word_text as "wordText",
        am.definition,
        COALESCE(am.usage_notes, '') as explanation,
        av.audio_url as "audioUrl"
       FROM approved_vocabulary av
       JOIN approved_meanings am ON av.id = am.vocabulary_id
       WHERE av.id = $1 AND am.base_language = $2
       LIMIT 1`,
      [vocabularyId, baseLanguage]
    );

    if (wordResult.rows.length === 0) {
      throw new Error('Vocabulary not found');
    }

    const { wordText, definition, explanation, audioUrl } = wordResult.rows[0];

    // Generate distractors
    const distractors = await this.distractorService.generateDefinitionDistractors(
      vocabularyId,
      baseLanguage,
      3
    );

    // Create options array with correct answer + distractors
    const allOptions = [definition, ...distractors];

    // Shuffle options
    const shuffledOptions = this.shuffleArray(allOptions);
    const correctIndex = shuffledOptions.indexOf(definition);

    return {
      questionId: `vocab_${vocabularyId}_${Date.now()}`,
      questionType: 'vocabulary_definition',
      prompt: `What is the meaning of "${wordText}"?`,
      correctAnswer: definition,
      options: shuffledOptions,
      correctIndex,
      explanation: explanation || 'Correct!',
      audioUrl,
      srsItemId,
    };
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Submit answer and update SRS
   */
  async submitRecognitionAnswer(
    userId: string,
    questionId: string,
    srsItemId: string | null,
    selectedIndex: number,
    correctIndex: number,
    timeToAnswerMs: number
  ): Promise<{
    isCorrect: boolean;
    explanation: string;
    correctAnswer: string;
  }> {
    const isCorrect = selectedIndex === correctIndex;

    // Update SRS if applicable
    if (srsItemId) {
      const quality = isCorrect ? 4 : 1; // Good if correct, Again if incorrect

      // Get current SRS item
      const itemResult = await this.pool.query<{
        interval: number;
        easeFactor: number;
        reviewCount: number;
      }>(
        `SELECT interval, ease_factor as "easeFactor", review_count as "reviewCount"
         FROM user_srs_items
         WHERE id = $1 AND user_id = $2`,
        [srsItemId, userId]
      );

      if (itemResult.rows.length > 0) {
        const item = itemResult.rows[0];

        // Calculate next review
        const srsUpdate = await this.srsService.calculateNextReview({
          currentInterval: item.interval,
          currentEaseFactor: item.easeFactor,
          quality,
          reviewCount: item.reviewCount,
        });

        // Update SRS item
        await this.pool.query(
          `UPDATE user_srs_items
           SET interval = $3,
               ease_factor = $4,
               next_review_date = $5,
               last_reviewed_at = NOW(),
               review_count = review_count + 1
           WHERE id = $1 AND user_id = $2`,
          [srsItemId, userId, srsUpdate.newInterval, srsUpdate.newEaseFactor, srsUpdate.nextReviewDate]
        );
      }
    }

    return {
      isCorrect,
      explanation: isCorrect ? 'Correct!' : 'Incorrect. Review the meaning.',
      correctAnswer: '', // Will be filled by calling function
    };
  }
}
```

Create `packages/api/src/routes/practice/recognition.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Language } from '@polyladder/core';
import { RecognitionPracticeService } from '../../services/practice/recognition.service';
import { authMiddleware } from '../../middleware/auth';

const RecognitionQueueSchema = z.object({
  language: z.nativeEnum(Language),
  baseLanguage: z.nativeEnum(Language),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

const SubmitRecognitionSchema = z.object({
  questionId: z.string(),
  srsItemId: z.string().uuid().nullable(),
  selectedIndex: z.number().int().min(0).max(3),
  correctIndex: z.number().int().min(0).max(3),
  timeToAnswerMs: z.number().int().min(0),
});

export const recognitionPracticeRoutes: FastifyPluginAsync = async (fastify) => {
  const recognitionService = new RecognitionPracticeService(fastify.pg.pool);

  /**
   * GET /practice/recognition/questions
   * Get recognition practice questions
   */
  fastify.get('/practice/recognition/questions', {
    preHandler: authMiddleware,
    schema: {
      querystring: RecognitionQueueSchema,
    },
  }, async (request, reply) => {
    const { language, baseLanguage, limit } = RecognitionQueueSchema.parse(request.query);
    const userId = request.user!.userId;

    const questions = await recognitionService.getRecognitionQuestions(
      userId,
      language,
      baseLanguage,
      limit
    );

    return reply.status(200).send({ questions });
  });

  /**
   * POST /practice/recognition/submit
   * Submit recognition answer
   */
  fastify.post('/practice/recognition/submit', {
    preHandler: authMiddleware,
    schema: {
      body: SubmitRecognitionSchema,
    },
  }, async (request, reply) => {
    const { questionId, srsItemId, selectedIndex, correctIndex, timeToAnswerMs } =
      SubmitRecognitionSchema.parse(request.body);
    const userId = request.user!.userId;

    const result = await recognitionService.submitRecognitionAnswer(
      userId,
      questionId,
      srsItemId,
      selectedIndex,
      correctIndex,
      timeToAnswerMs
    );

    return reply.status(200).send({ result });
  });
};
```

**Files Created**:
- `packages/api/src/services/practice/recognition.service.ts`
- `packages/api/src/routes/practice/recognition.ts`

---

### Task 3: React Recognition Practice Component

**Implementation Plan**:

Create `packages/web/src/components/practice/RecognitionPractice.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { Language } from '@polyladder/core';

interface RecognitionPracticeProps {
  language: Language;
  baseLanguage: Language;
}

export function RecognitionPractice({ language, baseLanguage }: RecognitionPracticeProps) {
  const queryClient = useQueryClient();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [startTime, setStartTime] = useState(Date.now());

  const { data: questions, isLoading } = useQuery({
    queryKey: ['recognition-questions', language, baseLanguage],
    queryFn: async () => {
      const response = await apiClient.get(
        `/practice/recognition/questions?language=${language}&baseLanguage=${baseLanguage}&limit=10`
      );
      return response.data.questions;
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (payload: {
      questionId: string;
      srsItemId: string | null;
      selectedIndex: number;
      correctIndex: number;
      timeToAnswerMs: number;
    }) => {
      const response = await apiClient.post('/practice/recognition/submit', payload);
      return response.data.result;
    },
    onSuccess: () => {
      setTimeout(() => {
        setCurrentQuestionIndex(prev => prev + 1);
        setSelectedOption(null);
        setShowFeedback(false);
        setStartTime(Date.now());
      }, 2000);
    },
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (showFeedback || !questions) return;

      const key = parseInt(e.key);
      if (key >= 1 && key <= 4) {
        handleOptionSelect(key - 1);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [showFeedback, questions]);

  if (isLoading) {
    return <div className="text-center py-8">Loading questions...</div>;
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="card p-8 text-center">
        <h3 className="text-xl font-bold text-green-600">All Done!</h3>
        <p className="text-gray-600 mt-2">No questions available right now.</p>
      </div>
    );
  }

  if (currentQuestionIndex >= questions.length) {
    return (
      <div className="card p-8 text-center">
        <h3 className="text-2xl font-bold text-green-600 mb-4">Session Complete!</h3>
        <p className="text-gray-700 mb-4">You've completed all questions.</p>
        <button
          onClick={() => {
            setCurrentQuestionIndex(0);
            queryClient.invalidateQueries({ queryKey: ['recognition-questions'] });
          }}
          className="btn btn-primary"
        >
          Start New Session
        </button>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];

  const handleOptionSelect = (index: number) => {
    if (showFeedback) return;

    setSelectedOption(index);
    setShowFeedback(true);

    const timeToAnswer = Date.now() - startTime;

    submitMutation.mutate({
      questionId: currentQuestion.questionId,
      srsItemId: currentQuestion.srsItemId,
      selectedIndex: index,
      correctIndex: currentQuestion.correctIndex,
      timeToAnswerMs: timeToAnswer,
    });
  };

  const playAudio = () => {
    if (currentQuestion.audioUrl) {
      const audio = new Audio(currentQuestion.audioUrl);
      audio.play();
    }
  };

  const isCorrect = selectedOption === currentQuestion.correctIndex;

  return (
    <div className="recognition-practice max-w-3xl mx-auto p-6">
      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
          <span>{currentQuestion.questionType}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Question */}
      <div className="card p-8 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-semibold">{currentQuestion.prompt}</h3>
          {currentQuestion.audioUrl && (
            <button onClick={playAudio} className="btn btn-circle btn-lg">
              🔊
            </button>
          )}
        </div>

        {/* Options */}
        <div className="space-y-3">
          {currentQuestion.options.map((option, index) => {
            const isSelected = selectedOption === index;
            const isCorrectOption = index === currentQuestion.correctIndex;

            let buttonClass = 'btn w-full text-left justify-start h-auto py-4 px-6';

            if (showFeedback) {
              if (isCorrectOption) {
                buttonClass += ' btn-success';
              } else if (isSelected && !isCorrect) {
                buttonClass += ' btn-error';
              } else {
                buttonClass += ' btn-ghost';
              }
            } else {
              buttonClass += isSelected ? ' btn-primary' : ' btn-outline';
            }

            return (
              <button
                key={index}
                onClick={() => handleOptionSelect(index)}
                className={buttonClass}
                disabled={showFeedback}
              >
                <span className="mr-3 font-bold">{index + 1}.</span>
                <span className="flex-1">{option}</span>
                {showFeedback && isCorrectOption && <span className="ml-2">✓</span>}
                {showFeedback && isSelected && !isCorrect && <span className="ml-2">✗</span>}
              </button>
            );
          })}
        </div>

        {/* Feedback */}
        {showFeedback && (
          <div className={`alert ${isCorrect ? 'alert-success' : 'alert-error'} mt-6`}>
            <div>
              <div className="font-semibold">
                {isCorrect ? '✓ Correct!' : '✗ Incorrect'}
              </div>
              <div className="text-sm mt-1">{currentQuestion.explanation}</div>
            </div>
          </div>
        )}
      </div>

      {/* Keyboard hint */}
      {!showFeedback && (
        <div className="text-center text-sm text-gray-500">
          Keyboard shortcuts: Press 1-4 to select an option
        </div>
      )}
    </div>
  );
}
```

**Files Created**:
- `packages/web/src/components/practice/RecognitionPractice.tsx`

**UI Features**:
- Color-coded feedback (green=correct, red=incorrect)
- Keyboard shortcuts (1-4)
- Audio playback button
- Progress bar
- Immediate visual feedback
- Auto-advance after 2 seconds

---

## Dependencies

- **Blocks**: None
- **Depends on**:
  - F001 (Database Schema)
  - F046 (SRS Algorithm)

---

## Open Questions

### Question 1: Optimal Number of Options

**Context**: Should recognition questions have 3, 4, or 5 options?

**Options**:
1. **3 Options** (1 correct + 2 distractors)
   - Pros: Faster to answer, less cognitive load
   - Cons: 33% chance of guessing correctly
2. **4 Options** (1 correct + 3 distractors) - Current implementation
   - Pros: Balanced difficulty, 25% guess rate
   - Cons: Standard but may be too easy
3. **5 Options** (1 correct + 4 distractors)
   - Pros: Lower guess rate (20%), more challenging
   - Cons: Slower, harder to generate quality distractors
4. **Adaptive** (3-5 options based on CEFR level)
   - Pros: Adjusts to user proficiency
   - Cons: Complex, inconsistent UX

**Current Decision**: Option 2 (4 options) for MVP. Standard for multiple choice assessments.

**Impact**: Low - can adjust post-launch if guess rates too high.

---

### Question 2: Distractor Quality Metrics

**Context**: How to ensure distractors are plausible but not deceptive?

**Options**:
1. **Random from Same CEFR** (Current implementation)
   - Pros: Simple, scalable
   - Cons: May be too easy or too hard
2. **Semantic Similarity** (Use word embeddings to find similar meanings)
   - Pros: More challenging, pedagogically sound
   - Cons: Requires ML model, complex
3. **Common Confusions** (Track user errors, use as distractors)
   - Pros: Learns from real mistakes
   - Cons: Requires data collection period
4. **Manual Curation** (Operators write distractors)
   - Pros: Highest quality
   - Cons: Labor-intensive, doesn't scale

**Current Decision**: Option 1 (random same CEFR) for MVP. Consider Option 2 (embeddings) post-launch.

**Impact**: Medium - affects question difficulty. Can improve iteratively.

---

### Question 3: Recognition vs Recall Weighting

**Context**: Should recognition practice contribute equally to SRS as recall practice?

**Options**:
1. **Equal Weight** (Current implementation)
   - Pros: Simple, encourages variety
   - Cons: Recognition is easier, may not indicate mastery
2. **Lower Weight** (Recognition = 0.7x recall for SRS)
   - Pros: More accurate mastery signal
   - Cons: Discourages recognition practice
3. **Separate Tracking** (Different SRS queues for recognition vs recall)
   - Pros: Optimized scheduling per mode
   - Cons: Complex, double queue size
4. **Progression** (Recognition early, recall later in learning curve)
   - Pros: Natural progression
   - Cons: Requires lifecycle management

**Current Decision**: Option 1 (equal weight) for MVP. Review data after launch.

**Impact**: Medium - affects learning effectiveness. Can refine based on user outcomes.

---

## Notes

- **Recognition vs Recall**: Recognition (identify correct answer) is easier than recall (produce answer), making it ideal for early learning
- **Distractor Quality**: Plausible distractors from same CEFR level and category increase difficulty appropriately
- **Option Shuffling**: Fisher-Yates algorithm prevents position bias (e.g., "correct answer always first")
- **Keyboard Shortcuts**: Numbers 1-4 for rapid practice (Anki-style)
- **Immediate Feedback**: Color-coded (green/red) visual feedback with explanations
- **SRS Integration**: Updates scheduling based on correct/incorrect answers
- **Audio Support**: Pronunciation practice via audio playback
- **Time Tracking**: Records time-to-answer for adaptive difficulty
- **Future Enhancement**: Add image-based recognition (see image → select word)
- **Future Enhancement**: Add audio-only recognition (hear word → select definition)
- **Future Enhancement**: Add sentence completion recognition (cloze with multiple choice)
