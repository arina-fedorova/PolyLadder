# F045: Reading Comprehension

**Feature Code**: F045
**Created**: 2025-12-17
**Phase**: 12 - Practice Modes
**Status**: Not Started

---

## Description

Implement reading comprehension exercises with passages and multiple-choice questions. This practice mode develops reading skills, vocabulary in context, and comprehension abilities. Users read authentic or adapted texts at their CEFR level, answer comprehension questions, and receive immediate feedback. Vocabulary hints provide definitions on hover for unknown words.

## Success Criteria

- [ ] Reading passage displayed in target language with proper formatting
- [ ] Multiple choice questions (3-5 per passage) about passage content
- [ ] Vocabulary hints show definitions on hover/click for difficult words
- [ ] Progress indicator showing current question
- [ ] Scoring and detailed feedback after completion
- [ ] SRS integration for passages and vocabulary encountered
- [ ] Audio narration of passage (optional, if available)

---

## Tasks

### Task 1: Create Reading Comprehension Service

**File**: `packages/api/src/services/practice/reading.service.ts`

Create backend service that:
- Fetches reading passages with comprehension questions from SRS queue
- Filters passages by CEFR level and user progress
- Validates submitted answers
- Calculates comprehension score
- Updates SRS for passage and vocabulary items
- Tracks reading practice history

**Implementation**:

```typescript
// packages/api/src/services/practice/reading.service.ts
import { Pool } from 'pg';
import { SRSService } from '../srs/srs.service';

interface ReadingPassage {
  id: string;
  title: string;
  text: string;
  language: string;
  cefrLevel: string;
  wordCount: number;
  audioUrl?: string; // Optional audio narration
  source?: string; // Attribution (e.g., "Adapted from...")
  vocabularyHints: VocabularyHint[];
  questions: ComprehensionQuestion[];
  srsItemId: string;
}

interface VocabularyHint {
  word: string;
  definition: string;
  position: number; // Character position in text
}

interface ComprehensionQuestion {
  id: string;
  questionText: string;
  questionType: 'factual' | 'inferential' | 'vocabulary' | 'main_idea';
  options: string[];
  correctAnswerIndex: number;
  explanation?: string; // Optional explanation of correct answer
}

interface ReadingResult {
  passageId: string;
  score: number; // 0.0 to 1.0
  totalQuestions: number;
  correctAnswers: number;
  answers: AnswerResult[];
}

interface AnswerResult {
  questionId: string;
  userAnswerIndex: number;
  correctAnswerIndex: number;
  isCorrect: boolean;
  explanation?: string;
}

export class ReadingComprehensionService {
  constructor(
    private pool: Pool,
    private srsService: SRSService
  ) {}

  /**
   * Fetch reading passages from SRS queue
   * Filters by CEFR level and user progress
   */
  async getReadingPassages(
    userId: string,
    language: string,
    cefrLevel?: string,
    limit: number = 5
  ): Promise<ReadingPassage[]> {
    // If CEFR level not specified, get user's current level
    let targetCefrLevel = cefrLevel;
    if (!targetCefrLevel) {
      const levelResult = await this.pool.query(
        `SELECT current_cefr_level FROM user_language_progress
         WHERE user_id = $1 AND language = $2`,
        [userId, language]
      );
      targetCefrLevel = levelResult.rows[0]?.current_cefr_level || 'A1';
    }

    const result = await this.pool.query(
      `SELECT
         rp.id AS passage_id,
         rp.title,
         rp.text,
         rp.language,
         rp.cefr_level,
         rp.word_count,
         aa.audio_url,
         rp.source,
         usi.id AS srs_item_id
       FROM user_srs_items usi
       JOIN approved_reading_passages rp ON usi.reading_passage_id = rp.id
       LEFT JOIN approved_audio aa ON aa.reading_passage_id = rp.id
       WHERE usi.user_id = $1
         AND rp.language = $2
         AND rp.cefr_level = $3
         AND usi.next_review_date <= NOW()
       ORDER BY usi.next_review_date ASC
       LIMIT $4`,
      [userId, language, targetCefrLevel, limit]
    );

    // Fetch vocabulary hints and questions for each passage
    const passages: ReadingPassage[] = [];
    for (const row of result.rows) {
      const vocabularyHints = await this.getVocabularyHints(row.passage_id);
      const questions = await this.getComprehensionQuestions(row.passage_id);

      passages.push({
        id: row.passage_id,
        title: row.title,
        text: row.text,
        language: row.language,
        cefrLevel: row.cefr_level,
        wordCount: row.word_count,
        audioUrl: row.audio_url,
        source: row.source,
        vocabularyHints,
        questions,
        srsItemId: row.srs_item_id
      });
    }

    return passages;
  }

  /**
   * Get vocabulary hints for a passage
   * These are difficult words that may need explanation
   */
  private async getVocabularyHints(passageId: string): Promise<VocabularyHint[]> {
    const result = await this.pool.query(
      `SELECT
         vh.word,
         vh.definition,
         vh.position
       FROM reading_vocabulary_hints vh
       WHERE vh.reading_passage_id = $1
       ORDER BY vh.position ASC`,
      [passageId]
    );

    return result.rows.map(row => ({
      word: row.word,
      definition: row.definition,
      position: row.position
    }));
  }

  /**
   * Get comprehension questions for a passage
   */
  private async getComprehensionQuestions(passageId: string): Promise<ComprehensionQuestion[]> {
    const result = await this.pool.query(
      `SELECT
         id,
         question_text,
         question_type,
         options,
         correct_answer_index,
         explanation
       FROM reading_comprehension_questions
       WHERE reading_passage_id = $1
       ORDER BY display_order ASC`,
      [passageId]
    );

    return result.rows.map(row => ({
      id: row.id,
      questionText: row.question_text,
      questionType: row.question_type,
      options: row.options, // JSONB array
      correctAnswerIndex: row.correct_answer_index,
      explanation: row.explanation
    }));
  }

  /**
   * Validate submitted answers for reading comprehension
   */
  async validateReadingAnswers(
    passageId: string,
    srsItemId: string,
    userId: string,
    userAnswers: { questionId: string; answerIndex: number }[]
  ): Promise<ReadingResult> {
    // Fetch correct answers
    const questions = await this.getComprehensionQuestions(passageId);

    const answerResults: AnswerResult[] = [];
    let correctCount = 0;

    for (const userAnswer of userAnswers) {
      const question = questions.find(q => q.id === userAnswer.questionId);
      if (!question) continue;

      const isCorrect = userAnswer.answerIndex === question.correctAnswerIndex;
      if (isCorrect) correctCount++;

      answerResults.push({
        questionId: userAnswer.questionId,
        userAnswerIndex: userAnswer.answerIndex,
        correctAnswerIndex: question.correctAnswerIndex,
        isCorrect,
        explanation: question.explanation
      });
    }

    const score = questions.length > 0 ? correctCount / questions.length : 0;

    // Convert score to SRS quality (0-5)
    const quality = this.scoreToQuality(score);

    // Update SRS schedule for passage
    await this.srsService.processReview(srsItemId, userId, quality);

    // Record reading attempt
    await this.pool.query(
      `INSERT INTO practice_attempts
         (user_id, srs_item_id, practice_type, user_answer, is_correct, accuracy, metadata, created_at)
       VALUES ($1, $2, 'reading_comprehension', $3, $4, $5, $6, NOW())`,
      [
        userId,
        srsItemId,
        JSON.stringify(userAnswers),
        score >= 0.7, // Consider 70%+ as correct
        score,
        JSON.stringify({ totalQuestions: questions.length, correctAnswers: correctCount })
      ]
    );

    return {
      passageId,
      score,
      totalQuestions: questions.length,
      correctAnswers: correctCount,
      answers: answerResults
    };
  }

  /**
   * Convert comprehension score to SRS quality (0-5)
   */
  private scoreToQuality(score: number): number {
    if (score >= 0.95) return 5; // Perfect comprehension
    if (score >= 0.80) return 4; // Good comprehension
    if (score >= 0.60) return 3; // Acceptable comprehension
    if (score >= 0.40) return 2; // Struggled but got some correct
    if (score > 0) return 1;     // Minimal comprehension
    return 0; // Complete failure
  }

  /**
   * Get reading practice statistics
   */
  async getReadingStats(userId: string, language: string): Promise<{
    totalPassagesRead: number;
    averageScore: number;
    wordsRead: number;
  }> {
    const result = await this.pool.query(
      `SELECT
         COUNT(*) AS total_passages,
         AVG(accuracy) AS average_score,
         SUM((metadata->>'totalQuestions')::int) AS total_questions
       FROM practice_attempts pa
       JOIN user_srs_items usi ON pa.srs_item_id = usi.id
       JOIN approved_reading_passages rp ON usi.reading_passage_id = rp.id
       WHERE pa.user_id = $1
         AND pa.practice_type = 'reading_comprehension'
         AND rp.language = $2`,
      [userId, language]
    );

    // Calculate total words read
    const wordsResult = await this.pool.query(
      `SELECT SUM(rp.word_count) AS words_read
       FROM practice_attempts pa
       JOIN user_srs_items usi ON pa.srs_item_id = usi.id
       JOIN approved_reading_passages rp ON usi.reading_passage_id = rp.id
       WHERE pa.user_id = $1
         AND pa.practice_type = 'reading_comprehension'
         AND rp.language = $2`,
      [userId, language]
    );

    return {
      totalPassagesRead: parseInt(result.rows[0]?.total_passages || '0'),
      averageScore: parseFloat(result.rows[0]?.average_score || '0'),
      wordsRead: parseInt(wordsResult.rows[0]?.words_read || '0')
    };
  }
}
```

**Database Schema Additions**:

```sql
-- Reading passages table
CREATE TABLE approved_reading_passages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  text TEXT NOT NULL,
  language VARCHAR(20) NOT NULL,
  cefr_level VARCHAR(5) NOT NULL,
  word_count INT NOT NULL,
  source VARCHAR(500), -- Attribution
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Vocabulary hints for reading passages
CREATE TABLE reading_vocabulary_hints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reading_passage_id UUID REFERENCES approved_reading_passages(id) NOT NULL,
  word VARCHAR(100) NOT NULL,
  definition TEXT NOT NULL,
  position INT NOT NULL, -- Character position in text
  created_at TIMESTAMP DEFAULT NOW()
);

-- Comprehension questions
CREATE TABLE reading_comprehension_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reading_passage_id UUID REFERENCES approved_reading_passages(id) NOT NULL,
  question_text TEXT NOT NULL,
  question_type VARCHAR(20) CHECK (question_type IN ('factual', 'inferential', 'vocabulary', 'main_idea')),
  options JSONB NOT NULL, -- Array of answer options
  correct_answer_index INT NOT NULL,
  explanation TEXT, -- Optional explanation of correct answer
  display_order INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_reading_passages_language_cefr ON approved_reading_passages(language, cefr_level);
CREATE INDEX idx_vocab_hints_passage ON reading_vocabulary_hints(reading_passage_id);
CREATE INDEX idx_comprehension_questions_passage ON reading_comprehension_questions(reading_passage_id);
```

**Open Questions**:
1. **Passage Sourcing Strategy**: Where will reading passages come from?
   - **Option A**: Operators manually curate and input passages
   - **Option B**: Scrape from public domain sources (Project Gutenberg, Wikipedia)
   - **Option C**: Commission original content from language experts
   - **Recommendation**: Start with manual curation (Option A), add scraping later

2. **Question Generation**: Should we support automatic question generation using LLMs, or require manual question creation?
   - **Manual**: High quality, expensive/time-consuming
   - **Automatic**: Scalable, may have quality issues
   - **Recommendation**: Manual for MVP, explore LLM-assisted generation later

3. **Passage Length Guidelines**: What word count ranges for each CEFR level?
   - **A1**: 50-100 words
   - **A2**: 100-200 words
   - **B1**: 200-400 words
   - **B2**: 400-600 words
   - **C1/C2**: 600-1000+ words
   - Should we enforce these limits in validation?

---

### Task 2: Create Reading Comprehension API Endpoints

**File**: `packages/api/src/routes/practice/reading.ts`

Add REST endpoints for:
- GET `/practice/reading/passages` - Fetch passages with questions
- POST `/practice/reading/submit` - Submit answers and get results
- GET `/practice/reading/stats` - Get reading practice statistics

**Implementation**:

```typescript
// packages/api/src/routes/practice/reading.ts
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ReadingComprehensionService } from '../../services/practice/reading.service';

const GetReadingPassagesSchema = z.object({
  language: z.enum(['russian', 'chinese', 'arabic']),
  cefrLevel: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5)
});

const SubmitReadingAnswersSchema = z.object({
  passageId: z.string().uuid(),
  srsItemId: z.string().uuid(),
  answers: z.array(z.object({
    questionId: z.string().uuid(),
    answerIndex: z.number().int().min(0).max(5)
  }))
});

const GetReadingStatsSchema = z.object({
  language: z.enum(['russian', 'chinese', 'arabic'])
});

const readingRoutes: FastifyPluginAsync = async (fastify) => {
  const readingService = new ReadingComprehensionService(
    fastify.db.pool,
    fastify.srsService
  );

  /**
   * GET /practice/reading/passages
   * Fetch reading passages with comprehension questions
   */
  fastify.get(
    '/passages',
    {
      onRequest: [fastify.authenticate],
      schema: {
        querystring: GetReadingPassagesSchema,
        response: {
          200: z.object({
            passages: z.array(z.object({
              id: z.string().uuid(),
              title: z.string(),
              text: z.string(),
              language: z.string(),
              cefrLevel: z.string(),
              wordCount: z.number(),
              audioUrl: z.string().optional(),
              source: z.string().optional(),
              vocabularyHints: z.array(z.object({
                word: z.string(),
                definition: z.string(),
                position: z.number()
              })),
              questions: z.array(z.object({
                id: z.string().uuid(),
                questionText: z.string(),
                questionType: z.string(),
                options: z.array(z.string()),
                // Don't send correctAnswerIndex or explanation to client
              })),
              srsItemId: z.string().uuid()
            }))
          })
        }
      }
    },
    async (request, reply) => {
      const { language, cefrLevel, limit } =
        GetReadingPassagesSchema.parse(request.query);
      const userId = request.user.userId;

      const passages = await readingService.getReadingPassages(
        userId,
        language,
        cefrLevel,
        limit
      );

      // Remove correct answers and explanations before sending to client
      const sanitizedPassages = passages.map(passage => ({
        ...passage,
        questions: passage.questions.map(q => ({
          id: q.id,
          questionText: q.questionText,
          questionType: q.questionType,
          options: q.options
          // correctAnswerIndex and explanation omitted
        }))
      }));

      return reply.send({ passages: sanitizedPassages });
    }
  );

  /**
   * POST /practice/reading/submit
   * Submit answers for reading comprehension exercise
   */
  fastify.post(
    '/submit',
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: SubmitReadingAnswersSchema,
        response: {
          200: z.object({
            passageId: z.string().uuid(),
            score: z.number(),
            totalQuestions: z.number(),
            correctAnswers: z.number(),
            answers: z.array(z.object({
              questionId: z.string().uuid(),
              userAnswerIndex: z.number(),
              correctAnswerIndex: z.number(),
              isCorrect: z.boolean(),
              explanation: z.string().optional()
            }))
          })
        }
      }
    },
    async (request, reply) => {
      const { passageId, srsItemId, answers } =
        SubmitReadingAnswersSchema.parse(request.body);
      const userId = request.user.userId;

      const result = await readingService.validateReadingAnswers(
        passageId,
        srsItemId,
        userId,
        answers
      );

      return reply.send(result);
    }
  );

  /**
   * GET /practice/reading/stats
   * Get reading practice statistics
   */
  fastify.get(
    '/stats',
    {
      onRequest: [fastify.authenticate],
      schema: {
        querystring: GetReadingStatsSchema,
        response: {
          200: z.object({
            totalPassagesRead: z.number(),
            averageScore: z.number(),
            wordsRead: z.number()
          })
        }
      }
    },
    async (request, reply) => {
      const { language } = GetReadingStatsSchema.parse(request.query);
      const userId = request.user.userId;

      const stats = await readingService.getReadingStats(userId, language);

      return reply.send(stats);
    }
  );
};

export default readingRoutes;
```

**Integration**: Register in `packages/api/src/routes/practice/index.ts`:

```typescript
import readingRoutes from './reading';

export const practiceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(recallRoutes, { prefix: '/recall' });
  fastify.register(recognitionRoutes, { prefix: '/recognition' });
  fastify.register(clozeRoutes, { prefix: '/cloze' });
  fastify.register(dictationRoutes, { prefix: '/dictation' });
  fastify.register(translationRoutes, { prefix: '/translation' });
  fastify.register(productionRoutes, { prefix: '/production' });
  fastify.register(readingRoutes, { prefix: '/reading' }); // NEW
};
```

**Open Questions**:
1. **Answer Submission Timing**: Should we allow users to submit answers one-by-one or require all answers before submission?
   - **One-by-one**: Immediate feedback, but may encourage guessing patterns
   - **Batch submission**: More authentic reading test experience
   - **Recommendation**: Batch submission for MVP

2. **Time Limits**: Should we enforce reading time limits based on passage length and CEFR level?
   - Example: A2 passage (200 words) = 5-minute limit
   - **Recommendation**: No time limits for MVP (learning focus, not testing)

3. **Passage Repetition**: Should users be able to re-read the same passage immediately if they scored poorly, or must they wait for SRS scheduling?
   - **Immediate retry**: Better for learning, may lead to answer memorization
   - **SRS-only**: Prevents memorization, may frustrate learners
   - **Recommendation**: Allow one immediate retry per session

---

### Task 3: Create Reading Comprehension React Component

**File**: `packages/web/src/components/practice/ReadingComprehension.tsx`

Create UI component with:
- Reading passage display with proper text formatting
- Audio narration player (if available)
- Vocabulary hints with hover/click tooltips
- Progress indicator (Question 1 of 5)
- Multiple choice question interface
- Submit button to validate answers
- Results screen showing score and detailed feedback

**Implementation**:

```tsx
// packages/web/src/components/practice/ReadingComprehension.tsx
import React, { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

interface ReadingPassage {
  id: string;
  title: string;
  text: string;
  language: string;
  cefrLevel: string;
  wordCount: number;
  audioUrl?: string;
  source?: string;
  vocabularyHints: VocabularyHint[];
  questions: ComprehensionQuestion[];
  srsItemId: string;
}

interface VocabularyHint {
  word: string;
  definition: string;
  position: number;
}

interface ComprehensionQuestion {
  id: string;
  questionText: string;
  questionType: string;
  options: string[];
}

interface ReadingResult {
  passageId: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  answers: AnswerResult[];
}

interface AnswerResult {
  questionId: string;
  userAnswerIndex: number;
  correctAnswerIndex: number;
  isCorrect: boolean;
  explanation?: string;
}

interface Props {
  passage: ReadingPassage;
  onComplete: () => void;
}

export const ReadingComprehension: React.FC<Props> = ({ passage, onComplete }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Map<string, number>>(new Map());
  const [result, setResult] = useState<ReadingResult | null>(null);
  const [showVocabHint, setShowVocabHint] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const answers = passage.questions.map(q => ({
        questionId: q.id,
        answerIndex: userAnswers.get(q.id) ?? -1
      }));

      const response = await apiClient.post('/practice/reading/submit', {
        passageId: passage.id,
        srsItemId: passage.srsItemId,
        answers
      });
      return response.data;
    },
    onSuccess: (data: ReadingResult) => {
      setResult(data);
    }
  });

  const handleAnswerSelect = (questionId: string, answerIndex: number) => {
    setUserAnswers(prev => new Map(prev).set(questionId, answerIndex));
  };

  const handleNext = () => {
    if (currentQuestionIndex < passage.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleSubmit = () => {
    // Check if all questions answered
    const unanswered = passage.questions.filter(q => !userAnswers.has(q.id));
    if (unanswered.length > 0) {
      const confirm = window.confirm(
        `You have ${unanswered.length} unanswered question(s). Submit anyway?`
      );
      if (!confirm) return;
    }

    submitMutation.mutate();
  };

  const renderPassageWithHints = () => {
    const textWithHints = passage.text;
    const words = textWithHints.split(/\b/);

    return (
      <div className="text-lg leading-relaxed text-gray-800">
        {words.map((word, idx) => {
          const hint = passage.vocabularyHints.find(h =>
            h.word.toLowerCase() === word.toLowerCase().replace(/[.,!?;:]/g, '')
          );

          if (hint) {
            return (
              <span
                key={idx}
                className="relative inline-block cursor-help border-b-2 border-dotted border-blue-400 hover:bg-blue-50"
                onMouseEnter={() => setShowVocabHint(hint.word)}
                onMouseLeave={() => setShowVocabHint(null)}
              >
                {word}
                {showVocabHint === hint.word && (
                  <div className="absolute bottom-full left-0 mb-2 p-3 bg-gray-900 text-white text-sm rounded shadow-lg z-10 w-64">
                    <div className="font-semibold mb-1">{hint.word}</div>
                    <div>{hint.definition}</div>
                  </div>
                )}
              </span>
            );
          }

          return <span key={idx}>{word}</span>;
        })}
      </div>
    );
  };

  const currentQuestion = passage.questions[currentQuestionIndex];
  const allAnswered = passage.questions.every(q => userAnswers.has(q.id));

  if (result) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          {/* Results Header */}
          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold mb-2">Reading Comprehension Results</h3>
            <div className="text-4xl font-bold mb-2" style={{
              color: result.score >= 0.8 ? '#10b981' : result.score >= 0.6 ? '#f59e0b' : '#ef4444'
            }}>
              {(result.score * 100).toFixed(0)}%
            </div>
            <div className="text-gray-600">
              {result.correctAnswers} out of {result.totalQuestions} correct
            </div>
          </div>

          {/* Question-by-Question Feedback */}
          <div className="space-y-4">
            {passage.questions.map((question, idx) => {
              const answerResult = result.answers.find(a => a.questionId === question.id);
              if (!answerResult) return null;

              return (
                <div
                  key={question.id}
                  className={`p-4 rounded-lg border-2 ${
                    answerResult.isCorrect
                      ? 'bg-green-50 border-green-300'
                      : 'bg-red-50 border-red-300'
                  }`}
                >
                  <div className="font-semibold mb-2">
                    {answerResult.isCorrect ? '✓' : '✗'} Question {idx + 1}: {question.questionText}
                  </div>
                  <div className="space-y-1 text-sm">
                    <div>
                      <span className="font-medium">Your answer:</span>{' '}
                      <span className={answerResult.isCorrect ? 'text-green-700' : 'text-red-700'}>
                        {question.options[answerResult.userAnswerIndex] || '(No answer)'}
                      </span>
                    </div>
                    {!answerResult.isCorrect && (
                      <div>
                        <span className="font-medium">Correct answer:</span>{' '}
                        <span className="text-green-700">
                          {question.options[answerResult.correctAnswerIndex]}
                        </span>
                      </div>
                    )}
                    {answerResult.explanation && (
                      <div className="mt-2 p-2 bg-blue-50 rounded text-gray-700">
                        <span className="font-medium">Explanation:</span> {answerResult.explanation}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Button */}
          <div className="text-center mt-6">
            <button
              onClick={onComplete}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-colors"
            >
              Next Passage →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        {/* Passage Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">{passage.title}</h3>
            {passage.source && (
              <div className="text-sm text-gray-500 mt-1">{passage.source}</div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded">
              {passage.cefrLevel}
            </span>
            <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded">
              {passage.wordCount} words
            </span>
          </div>
        </div>

        {/* Audio Narration */}
        {passage.audioUrl && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <div className="text-sm font-semibold text-gray-700 mb-2">
              🎧 Listen to narration (optional):
            </div>
            <audio ref={audioRef} src={passage.audioUrl} controls className="w-full" />
          </div>
        )}

        {/* Reading Passage */}
        <div className="mb-8 p-6 bg-gray-50 rounded-lg">
          {renderPassageWithHints()}
        </div>

        {/* Vocabulary Hint Legend */}
        {passage.vocabularyHints.length > 0 && (
          <div className="mb-6 p-3 bg-yellow-50 border-l-4 border-yellow-400 text-sm text-gray-700">
            💡 <strong>Tip:</strong> Hover over underlined words for definitions
          </div>
        )}

        {/* Question Section */}
        <div className="border-t-2 border-gray-200 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold">Comprehension Questions</h4>
            <div className="text-sm text-gray-600">
              Question {currentQuestionIndex + 1} of {passage.questions.length}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-6 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${((currentQuestionIndex + 1) / passage.questions.length) * 100}%` }}
            />
          </div>

          {/* Current Question */}
          <div className="space-y-4">
            <div className="text-lg font-medium text-gray-900">
              {currentQuestion.questionText}
            </div>

            {/* Answer Options */}
            <div className="space-y-2">
              {currentQuestion.options.map((option, idx) => {
                const isSelected = userAnswers.get(currentQuestion.id) === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => handleAnswerSelect(currentQuestion.id, idx)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                      }`}>
                        {isSelected && <div className="w-3 h-3 bg-white rounded-full" />}
                      </div>
                      <span className="text-gray-900">{option}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Navigation Buttons */}
            <div className="flex justify-between items-center pt-4">
              <button
                onClick={handlePrevious}
                disabled={currentQuestionIndex === 0}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
              >
                ← Previous
              </button>

              <div className="text-sm text-gray-600">
                {allAnswered ? 'All questions answered ✓' : `${userAnswers.size}/${passage.questions.length} answered`}
              </div>

              {currentQuestionIndex < passage.questions.length - 1 ? (
                <button
                  onClick={handleNext}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                >
                  Next →
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitMutation.isPending}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-medium transition-colors"
                >
                  {submitMutation.isPending ? 'Submitting...' : 'Submit Answers'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 p-4 rounded-lg text-sm text-gray-700">
        <strong>Instructions:</strong>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>Read the passage carefully (you can listen to audio narration if available)</li>
          <li>Hover over underlined words to see definitions</li>
          <li>Answer all comprehension questions</li>
          <li>You can navigate between questions before submitting</li>
          <li>Submit your answers when ready to see results</li>
        </ul>
      </div>
    </div>
  );
};
```

**Integration**: Add to practice mode router in `packages/web/src/pages/PracticeModePage.tsx`:

```tsx
import { ReadingComprehension } from '../components/practice/ReadingComprehension';

// In practice mode selector:
case 'reading':
  return <ReadingComprehension passage={currentPassage} onComplete={loadNextPassage} />;
```

**Open Questions**:
1. **Text-to-Speech Fallback**: If audio narration is not available, should we offer browser-based text-to-speech as fallback? Quality may vary by browser/language.
2. **Passage Navigation**: Should users be able to scroll back to the passage while answering questions, or should passage be hidden during questions?
   - **Always visible**: More natural reading experience
   - **Hidden**: Forces comprehension/memory (more challenging)
   - **Recommendation**: Always visible for MVP
3. **Mobile Optimization**: Reading long passages on mobile can be challenging. Should we implement a dedicated mobile layout with different text sizing and spacing?

---

## Dependencies

- **Blocks**: None
- **Depends on**:
  - F001 (Database Schema) - New tables: `approved_reading_passages`, `reading_vocabulary_hints`, `reading_comprehension_questions`
  - F002 (Domain Model) - Language enum, CEFR levels
  - F046 (SRS Algorithm) - `SRSService.processReview()`
  - F018 (API Infrastructure) - Fastify setup, authentication middleware
  - F022 (React Setup) - React 18, TanStack Query, Tailwind CSS

---

## Notes

### Question Types
- **Factual**: Direct information from text (Who, What, When, Where)
- **Inferential**: Requires reading between the lines (Why, How, implications)
- **Vocabulary**: Word meaning in context
- **Main Idea**: Overall theme or purpose of passage

### CEFR-Appropriate Passage Characteristics
- **A1**: Simple sentences, present tense, everyday topics (50-100 words)
- **A2**: Simple connectors, past tense introduced, familiar situations (100-200 words)
- **B1**: Complex sentences, opinions, abstract topics introduced (200-400 words)
- **B2**: Formal/informal register, nuanced arguments, specialized topics (400-600 words)
- **C1/C2**: Complex structure, idioms, literary/academic texts (600-1000+ words)

### Vocabulary Hints Strategy
- Target 5-10 hints per passage (most challenging words for level)
- Definitions should be simple (ideally one CEFR level below passage level)
- Position tracking allows precise highlighting in UI

### Scoring Thresholds
- **95%+**: Perfect comprehension (SRS quality 5)
- **80-95%**: Good comprehension (SRS quality 4)
- **60-80%**: Acceptable comprehension (SRS quality 3)
- **40-60%**: Struggled (SRS quality 2)
- **<40%**: Poor comprehension (SRS quality 0-1)

### Accessibility
- Hover tooltips for vocabulary hints
- Progress bar shows question completion
- Clear visual distinction between answered/unanswered questions
- Audio narration available when possible
- High contrast colors for readability

### Future Enhancements (Out of Scope)
- **Adaptive Reading**: Adjust passage difficulty based on performance
- **Open-ended Questions**: Free text responses with NLP evaluation
- **Collaborative Reading**: Multi-user reading discussions
- **Reading Speed Tracking**: Words-per-minute analytics
- **Highlighting**: User can highlight important parts
- **Notes**: User can add personal notes to passages
- **Graded Readers**: Professionally adapted literary works by CEFR level

---

## Open Questions

### 1. Passage Sourcing Strategy

**Question**: Should reading passages be manually curated and created, or automatically sourced from existing content (web articles, books, news)?

**Current Approach**: Manual curation implied by `approved_reading_passages` table. Operators/content creators write or adapt passages specifically for each CEFR level, ensuring appropriate vocabulary and grammar complexity.

**Alternatives**:
1. **Manual creation only** (current): Operators write original passages or professionally adapt existing texts. Highest quality control but very labor-intensive and limited content volume.
2. **Web scraping with curation**: Automatically scrape news sites, Wikipedia, blogs, etc. Operators review and approve suitable passages. Faster content pipeline but requires filtering for copyright and quality.
3. **LLM generation**: Use GPT-4/Claude to generate passages for specific CEFR levels and topics. Fast and scalable but may have unnatural language or factual errors.
4. **Graded reader licensing**: License professionally written graded reader content from publishers (e.g., Oxford Graded Readers, Penguin Readers). High quality but costly.
5. **Hybrid approach**: Mix manual creation (for controlled quality), web scraping (for current events), and LLM generation (for volume).

**Recommendation**: Implement **hybrid approach** (Option 5) with quality gates. Use LLM generation (Claude/GPT-4) to create initial passage drafts with prompts like: "Write a 150-word A2-level passage about [topic] using only present simple and past simple tenses." Operators review, edit for naturalness, add comprehension questions. Supplement with curated web content (Creative Commons licensed articles) for current events. Store content source in `approved_reading_passages.metadata->>'source'` ('manual' | 'llm-generated' | 'web-curated') for quality tracking.

---

### 2. Question Type Distribution and Difficulty

**Question**: What should be the distribution of question types (factual/inferential/vocabulary/main-idea), and how many questions per passage?

**Current Approach**: No specified distribution. Question types and count determined per passage by content creator. Default to 4 question types (factual, inferential, vocabulary, main idea) as documented in Notes section.

**Alternatives**:
1. **Equal distribution**: 25% each type for all passages. Simple but may not suit all content (some passages better for inference, others for vocabulary).
2. **CEFR-adaptive distribution**:
   - A1-A2: 60% factual, 20% vocabulary, 20% main idea (focus on literal comprehension)
   - B1-B2: 40% factual, 30% inferential, 20% vocabulary, 10% main idea (add inference)
   - C1-C2: 25% each type (balanced critical reading)
3. **Dynamic by passage**: Content creator chooses distribution based on passage content. Flexible but inconsistent.
4. **Minimum requirements**: Each passage must have at least 1 of each type, then creator adds more. Ensures coverage without rigidity.

**Recommendation**: Implement **CEFR-adaptive distribution with minimum requirements** (Option 2 + 4 hybrid). Define target distributions per CEFR level (as in Option 2), but enforce minimum 1 question per type. Typical passage has 5-8 questions total:
- A1-A2: 5 questions (3 factual, 1 vocabulary, 1 main idea)
- B1-B2: 6 questions (2 factual, 2 inferential, 1 vocabulary, 1 main idea)
- C1-C2: 8 questions (2 of each type)

Store question type distribution analytics to validate if target distributions correlate with better learning outcomes.

---

### 3. Difficulty Calibration and Quality Control

**Question**: How do we ensure passages are correctly calibrated to their assigned CEFR level and consistently measure comprehension across different passages?

**Current Approach**: Manual CEFR assignment by content creators stored in `approved_reading_passages.cefr_level`. No automated validation or difficulty metrics. Relies on operator expertise to judge appropriate vocabulary, grammar, and complexity.

**Alternatives**:
1. **Manual only** (current): Operators assign CEFR based on judgment. Simple but prone to inconsistency between different operators.
2. **Readability formulas**: Use established metrics (Flesch-Kincaid, SMOG, Coleman-Liau) to estimate reading level. Automated but designed for English and may not transfer to other languages.
3. **Vocabulary frequency analysis**: Calculate % of words from each CEFR word list (A1 words, A2 words, etc.). If passage uses 90%+ A2 words, likely A2 level.
4. **Field testing**: New passages tested with real learners at target level. Passages with <70% average accuracy moved to harder level. Gold standard but slow.
5. **LLM evaluation**: Use GPT-4/Claude to analyze passage and provide CEFR estimate with justification. Fast and scalable but requires validation.

**Recommendation**: Implement **vocabulary frequency analysis** (Option 3) as automated baseline, combined with **field testing** (Option 4) for validation. For each passage, calculate coverage of CEFR-leveled vocabulary lists. Passages should use:
- A1: 90%+ words from A1 list
- A2: 80%+ from A1+A2 combined
- B1: 70%+ from A1+A2+B1 combined
- B2/C1/C2: Progressively introduce more advanced vocabulary

Flag passages that don't meet thresholds for operator review. After deployment, track aggregate accuracy per passage. If passage consistently shows <60% or >95% accuracy with target-level users, auto-flag for difficulty re-calibration. Store passage difficulty metrics in `approved_reading_passages.metadata->>'difficulty_score'` and actual user performance in `passage_performance_stats` table.
