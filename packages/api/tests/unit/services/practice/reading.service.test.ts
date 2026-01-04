import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { ReadingComprehensionService } from '../../../../src/services/practice/reading.service';

describe('ReadingComprehensionService', () => {
  let service: ReadingComprehensionService;
  let mockPool: Pool;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    } as unknown as Pool;

    service = new ReadingComprehensionService(mockPool);
  });

  describe('getReadingPassages', () => {
    it('should return passages from SRS queue', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      // SRS items query
      querySpy.mockResolvedValueOnce({
        rows: [
          {
            id: 'passage-1',
            title: 'A Day at the Park',
            text: 'Maria goes to the park every morning. She likes to walk by the lake.',
            language: 'EN',
            cefr_level: 'A1',
            word_count: 16,
            audio_url: 'https://example.com/park.mp3',
            source: null,
            srs_item_id: 'srs-1',
          },
        ],
        rowCount: 1,
      } as never);

      // Vocabulary hints query
      querySpy.mockResolvedValueOnce({
        rows: [
          { word: 'park', definition: 'a public garden', position: 25 },
          { word: 'lake', definition: 'a large body of water', position: 60 },
        ],
        rowCount: 2,
      } as never);

      // Questions query
      querySpy.mockResolvedValueOnce({
        rows: [
          {
            id: 'q1',
            question_text: 'When does Maria go to the park?',
            question_type: 'factual',
            options: ['In the morning', 'In the evening', 'At night', 'In the afternoon'],
            correct_answer_index: 0,
            explanation: 'The text says she goes every morning.',
          },
        ],
        rowCount: 1,
      } as never);

      const result = await service.getReadingPassages('user-1', 'EN', undefined, 5);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('A Day at the Park');
      expect(result[0].vocabularyHints).toHaveLength(2);
      expect(result[0].questions).toHaveLength(1);
      expect(result[0].questions[0].questionType).toBe('factual');
    });

    it('should return new passages when no SRS items', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      // SRS items query - empty
      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

      // New passages query
      querySpy.mockResolvedValueOnce({
        rows: [
          {
            id: 'passage-2',
            title: 'My Family',
            text: 'I have a big family. We live in a house.',
            language: 'EN',
            cefr_level: 'A1',
            word_count: 12,
            audio_url: null,
            source: 'Original',
            srs_item_id: null,
          },
        ],
        rowCount: 1,
      } as never);

      // Vocabulary hints query
      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

      // Questions query
      querySpy.mockResolvedValueOnce({
        rows: [
          {
            id: 'q2',
            question_text: 'What is the main idea of the text?',
            question_type: 'main_idea',
            options: ['Family life', 'Going to school', 'Playing sports', 'Cooking'],
            correct_answer_index: 0,
            explanation: null,
          },
        ],
        rowCount: 1,
      } as never);

      const result = await service.getReadingPassages('user-1', 'EN');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('My Family');
      expect(result[0].srsItemId).toBeNull();
    });

    it('should filter by CEFR level when provided', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

      await service.getReadingPassages('user-1', 'EN', 'B1', 5);

      // Check that CEFR level was passed in query
      expect(querySpy).toHaveBeenCalledTimes(2);
      const firstCallArgs = querySpy.mock.calls[0];
      expect(firstCallArgs[1]).toContain('B1');
    });
  });

  describe('submitAnswers', () => {
    it('should calculate score and quality rating for all correct', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      // Get questions
      querySpy.mockResolvedValueOnce({
        rows: [
          {
            id: 'q1',
            question_text: 'Question 1',
            question_type: 'factual',
            options: ['A', 'B', 'C', 'D'],
            correct_answer_index: 0,
            explanation: 'A is correct',
          },
          {
            id: 'q2',
            question_text: 'Question 2',
            question_type: 'inferential',
            options: ['A', 'B', 'C', 'D'],
            correct_answer_index: 2,
            explanation: null,
          },
        ],
        rowCount: 2,
      } as never);

      // Check existing SRS item
      querySpy.mockResolvedValueOnce({
        rows: [{ id: 'srs-1' }],
        rowCount: 1,
      } as never);

      // Get SRS item for update
      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);

      // Update SRS
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      // Record attempt
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.submitAnswers(
        'user-1',
        'passage-1',
        [
          { questionId: 'q1', answerIndex: 0 },
          { questionId: 'q2', answerIndex: 2 },
        ],
        30000
      );

      expect(result.score).toBe(1.0);
      expect(result.correctAnswers).toBe(2);
      expect(result.totalQuestions).toBe(2);
      expect(result.qualityRating).toBe(5);
      expect(result.answers.every((a) => a.isCorrect)).toBe(true);
    });

    it('should calculate score and quality rating for partial correct', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      // Get questions
      querySpy.mockResolvedValueOnce({
        rows: [
          {
            id: 'q1',
            question_text: 'Question 1',
            question_type: 'factual',
            options: ['A', 'B', 'C', 'D'],
            correct_answer_index: 0,
            explanation: null,
          },
          {
            id: 'q2',
            question_text: 'Question 2',
            question_type: 'vocabulary',
            options: ['A', 'B', 'C', 'D'],
            correct_answer_index: 1,
            explanation: null,
          },
          {
            id: 'q3',
            question_text: 'Question 3',
            question_type: 'main_idea',
            options: ['A', 'B', 'C', 'D'],
            correct_answer_index: 3,
            explanation: null,
          },
          {
            id: 'q4',
            question_text: 'Question 4',
            question_type: 'inferential',
            options: ['A', 'B', 'C', 'D'],
            correct_answer_index: 2,
            explanation: null,
          },
        ],
        rowCount: 4,
      } as never);

      // Check existing SRS item
      querySpy.mockResolvedValueOnce({
        rows: [{ id: 'srs-1' }],
        rowCount: 1,
      } as never);

      // Get SRS item for update
      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);

      // Update SRS
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      // Record attempt
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      // 3/4 correct = 75%
      const result = await service.submitAnswers(
        'user-1',
        'passage-1',
        [
          { questionId: 'q1', answerIndex: 0 }, // correct
          { questionId: 'q2', answerIndex: 0 }, // wrong
          { questionId: 'q3', answerIndex: 3 }, // correct
          { questionId: 'q4', answerIndex: 2 }, // correct
        ],
        45000
      );

      expect(result.score).toBe(0.75);
      expect(result.correctAnswers).toBe(3);
      expect(result.totalQuestions).toBe(4);
      expect(result.qualityRating).toBe(3); // 60-80% = quality 3
    });

    it('should return explanations for incorrect answers', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      // Get questions
      querySpy.mockResolvedValueOnce({
        rows: [
          {
            id: 'q1',
            question_text: 'Question 1',
            question_type: 'factual',
            options: ['A', 'B', 'C', 'D'],
            correct_answer_index: 0,
            explanation: 'The answer is A because...',
          },
        ],
        rowCount: 1,
      } as never);

      // Check existing SRS item
      querySpy.mockResolvedValueOnce({
        rows: [{ id: 'srs-1' }],
        rowCount: 1,
      } as never);

      // Get SRS item for update
      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);

      // Update SRS
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      // Record attempt
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.submitAnswers(
        'user-1',
        'passage-1',
        [{ questionId: 'q1', answerIndex: 2 }], // wrong answer
        10000
      );

      expect(result.answers[0].isCorrect).toBe(false);
      expect(result.answers[0].explanation).toBe('The answer is A because...');
      expect(result.answers[0].correctAnswerIndex).toBe(0);
    });

    it('should create SRS item if not exists', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      // Get questions
      querySpy.mockResolvedValueOnce({
        rows: [
          {
            id: 'q1',
            question_text: 'Question 1',
            question_type: 'factual',
            options: ['A', 'B', 'C', 'D'],
            correct_answer_index: 0,
            explanation: null,
          },
        ],
        rowCount: 1,
      } as never);

      // Check existing SRS item - not found
      querySpy.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

      // Get passage language
      querySpy.mockResolvedValueOnce({
        rows: [{ language: 'EN' }],
        rowCount: 1,
      } as never);

      // Create new SRS item
      querySpy.mockResolvedValueOnce({
        rows: [{ id: 'new-srs-id' }],
        rowCount: 1,
      } as never);

      // Get SRS item for update
      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 0, interval: 0 }],
        rowCount: 1,
      } as never);

      // Update SRS
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      // Record attempt
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.submitAnswers(
        'user-1',
        'passage-1',
        [{ questionId: 'q1', answerIndex: 0 }],
        5000
      );

      expect(result.score).toBe(1.0);

      // Verify SRS item was created
      const createCall = querySpy.mock.calls.find((call) =>
        call[0].includes('INSERT INTO user_srs_items')
      );
      expect(createCall).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return reading practice statistics', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            total_passages: '15',
            correct_count: '12',
            avg_accuracy: '0.82',
          },
        ],
        rowCount: 1,
      } as never);

      const stats = await service.getStats('user-1', 'EN');

      expect(stats.totalPassagesRead).toBe(15);
      expect(stats.passagesWithGoodScore).toBe(12);
      expect(stats.averageScore).toBe(82);
    });

    it('should handle zero passages', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            total_passages: '0',
            correct_count: '0',
            avg_accuracy: null,
          },
        ],
        rowCount: 1,
      } as never);

      const stats = await service.getStats('user-1', 'EN');

      expect(stats.totalPassagesRead).toBe(0);
      expect(stats.passagesWithGoodScore).toBe(0);
      expect(stats.averageScore).toBeNull();
    });
  });

  describe('score to quality conversion', () => {
    it('should assign quality 5 for 95%+ score', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      // 5/5 = 100%
      querySpy.mockResolvedValueOnce({
        rows: [
          {
            id: 'q1',
            question_text: 'Q1',
            question_type: 'factual',
            options: ['A'],
            correct_answer_index: 0,
            explanation: null,
          },
          {
            id: 'q2',
            question_text: 'Q2',
            question_type: 'factual',
            options: ['A'],
            correct_answer_index: 0,
            explanation: null,
          },
          {
            id: 'q3',
            question_text: 'Q3',
            question_type: 'factual',
            options: ['A'],
            correct_answer_index: 0,
            explanation: null,
          },
          {
            id: 'q4',
            question_text: 'Q4',
            question_type: 'factual',
            options: ['A'],
            correct_answer_index: 0,
            explanation: null,
          },
          {
            id: 'q5',
            question_text: 'Q5',
            question_type: 'factual',
            options: ['A'],
            correct_answer_index: 0,
            explanation: null,
          },
        ],
        rowCount: 5,
      } as never);

      querySpy.mockResolvedValueOnce({ rows: [{ id: 'srs-1' }], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.submitAnswers(
        'user-1',
        'passage-1',
        [
          { questionId: 'q1', answerIndex: 0 },
          { questionId: 'q2', answerIndex: 0 },
          { questionId: 'q3', answerIndex: 0 },
          { questionId: 'q4', answerIndex: 0 },
          { questionId: 'q5', answerIndex: 0 },
        ],
        20000
      );

      expect(result.qualityRating).toBe(5);
    });

    it('should assign quality 4 for 80-95% score', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      // 4/5 = 80%
      querySpy.mockResolvedValueOnce({
        rows: [
          {
            id: 'q1',
            question_text: 'Q1',
            question_type: 'factual',
            options: ['A'],
            correct_answer_index: 0,
            explanation: null,
          },
          {
            id: 'q2',
            question_text: 'Q2',
            question_type: 'factual',
            options: ['A'],
            correct_answer_index: 0,
            explanation: null,
          },
          {
            id: 'q3',
            question_text: 'Q3',
            question_type: 'factual',
            options: ['A'],
            correct_answer_index: 0,
            explanation: null,
          },
          {
            id: 'q4',
            question_text: 'Q4',
            question_type: 'factual',
            options: ['A'],
            correct_answer_index: 0,
            explanation: null,
          },
          {
            id: 'q5',
            question_text: 'Q5',
            question_type: 'factual',
            options: ['A'],
            correct_answer_index: 0,
            explanation: null,
          },
        ],
        rowCount: 5,
      } as never);

      querySpy.mockResolvedValueOnce({ rows: [{ id: 'srs-1' }], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.submitAnswers(
        'user-1',
        'passage-1',
        [
          { questionId: 'q1', answerIndex: 0 },
          { questionId: 'q2', answerIndex: 0 },
          { questionId: 'q3', answerIndex: 0 },
          { questionId: 'q4', answerIndex: 0 },
          { questionId: 'q5', answerIndex: 1 }, // wrong
        ],
        20000
      );

      expect(result.qualityRating).toBe(4);
    });

    it('should assign quality 0 for 0% score', async () => {
      const querySpy = vi.spyOn(mockPool, 'query');

      querySpy.mockResolvedValueOnce({
        rows: [
          {
            id: 'q1',
            question_text: 'Q1',
            question_type: 'factual',
            options: ['A', 'B'],
            correct_answer_index: 0,
            explanation: null,
          },
          {
            id: 'q2',
            question_text: 'Q2',
            question_type: 'factual',
            options: ['A', 'B'],
            correct_answer_index: 0,
            explanation: null,
          },
        ],
        rowCount: 2,
      } as never);

      querySpy.mockResolvedValueOnce({ rows: [{ id: 'srs-1' }], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({
        rows: [{ ease_factor: 2.5, repetitions: 2, interval: 6 }],
        rowCount: 1,
      } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      const result = await service.submitAnswers(
        'user-1',
        'passage-1',
        [
          { questionId: 'q1', answerIndex: 1 }, // wrong
          { questionId: 'q2', answerIndex: 1 }, // wrong
        ],
        10000
      );

      expect(result.qualityRating).toBe(0);
    });
  });

  describe('sanitizePassagesForClient', () => {
    it('should remove correct answers and explanations', () => {
      const passages = [
        {
          id: 'passage-1',
          title: 'Test Passage',
          text: 'Some text here.',
          language: 'EN',
          cefrLevel: 'A1',
          wordCount: 3,
          audioUrl: null,
          source: null,
          srsItemId: null,
          vocabularyHints: [{ word: 'text', definition: 'words', position: 5 }],
          questions: [
            {
              id: 'q1',
              questionText: 'What is this?',
              questionType: 'factual' as const,
              options: ['A', 'B', 'C', 'D'],
              correctAnswerIndex: 2,
              explanation: 'C is correct because...',
            },
          ],
        },
      ];

      const sanitized = service.sanitizePassagesForClient(passages);

      expect(sanitized[0].questions[0]).not.toHaveProperty('correctAnswerIndex');
      expect(sanitized[0].questions[0]).not.toHaveProperty('explanation');
      expect(sanitized[0].questions[0]).toHaveProperty('id');
      expect(sanitized[0].questions[0]).toHaveProperty('questionText');
      expect(sanitized[0].questions[0]).toHaveProperty('options');
    });
  });
});
