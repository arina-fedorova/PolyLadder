import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import {
  GrammarExerciseService,
  ExerciseType,
} from '../../../../src/services/grammar/exercise.service';

// Helper to create mock query result
const mockQueryResult = <T extends QueryResultRow>(
  rows: T[],
  rowCount?: number
): QueryResult<T> => ({
  rows,
  command: '',
  rowCount: rowCount ?? rows.length,
  oid: 0,
  fields: [],
});

describe('GrammarExerciseService', () => {
  let service: GrammarExerciseService;
  let mockPool: { query: Mock };

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    };

    service = new GrammarExerciseService(mockPool as unknown as Pool);
  });

  describe('getExercisesForRule', () => {
    it('should return exercises for a specific grammar rule with adaptive difficulty', async () => {
      const grammarRuleId = 'en-present-tense';
      const userId = 'user-123';

      // Mock getUserAccuracyForRule
      mockPool.query
        .mockResolvedValueOnce(mockQueryResult([{ avg_accuracy: 0.75 }]))
        // Mock getExercisesForRule query
        .mockResolvedValueOnce(
          mockQueryResult([
            {
              exercise_id: 'ex-1',
              grammar_rule_id: grammarRuleId,
              exercise_type: 'fill_blank' as ExerciseType,
              difficulty: 3,
              prompt: 'Fill in the blank',
              sentence_text: 'I ___ to school every day.',
              correct_answer: 'go',
              distractors: ['goes', 'went', 'gone'],
              explanation: 'Present simple tense uses base form',
              hint: 'Think about daily routines',
              audio_url: null,
            },
          ])
        );

      const result = await service.getExercisesForRule(grammarRuleId, userId, 10);

      expect(result).toHaveLength(1);
      expect(result[0].exerciseId).toBe('ex-1');
      expect(result[0].grammarRuleId).toBe(grammarRuleId);
      expect(result[0].exerciseType).toBe('fill_blank');
      expect(result[0].difficulty).toBe(3);
      expect(result[0].distractors).toEqual(['goes', 'went', 'gone']);
    });

    it('should return exercises with difficulty 1-2 for low accuracy users', async () => {
      const grammarRuleId = 'en-present-tense';
      const userId = 'user-low';

      mockPool.query
        .mockResolvedValueOnce(mockQueryResult([{ avg_accuracy: 0.3 }]))
        .mockResolvedValueOnce(mockQueryResult([], 0));

      await service.getExercisesForRule(grammarRuleId, userId, 10);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([grammarRuleId, 1, 2, userId, 10])
      );
    });

    it('should return exercises with difficulty 4-5 for high accuracy users', async () => {
      const grammarRuleId = 'en-present-tense';
      const userId = 'user-high';

      mockPool.query
        .mockResolvedValueOnce(mockQueryResult([{ avg_accuracy: 0.95 }]))
        .mockResolvedValueOnce(mockQueryResult([], 0));

      await service.getExercisesForRule(grammarRuleId, userId, 10);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([grammarRuleId, 4, 5, userId, 10])
      );
    });
  });

  describe('getMixedExercises', () => {
    it('should return mixed exercises from unlocked grammar concepts', async () => {
      const userId = 'user-123';
      const language = 'EN';

      mockPool.query.mockResolvedValueOnce(
        mockQueryResult([
          {
            exercise_id: 'ex-1',
            grammar_rule_id: 'en-present-tense',
            exercise_type: 'multiple_choice' as ExerciseType,
            difficulty: 2,
            prompt: 'Choose the correct form',
            sentence_text: 'She ___ every day.',
            correct_answer: 'runs',
            distractors: ['run', 'running', 'ran'],
            explanation: 'Third person singular adds -s',
            hint: null,
            audio_url: null,
          },
          {
            exercise_id: 'ex-2',
            grammar_rule_id: 'en-past-tense',
            exercise_type: 'transformation' as ExerciseType,
            difficulty: 3,
            prompt: 'Change to past tense',
            sentence_text: 'I go to the store.',
            correct_answer: 'I went to the store.',
            distractors: null,
            explanation: 'Go becomes went in past tense',
            hint: 'Irregular verb',
            audio_url: null,
          },
        ])
      );

      const result = await service.getMixedExercises(userId, language, 20);

      expect(result).toHaveLength(2);
      expect(result[0].exerciseType).toBe('multiple_choice');
      expect(result[1].exerciseType).toBe('transformation');
    });
  });

  describe('validateAnswer', () => {
    it('should validate correct fill_blank answer', async () => {
      const exerciseId = 'ex-1';
      const userAnswer = 'go';
      const userId = 'user-123';

      mockPool.query
        .mockResolvedValueOnce(
          mockQueryResult([
            {
              correct_answer: 'go',
              exercise_type: 'fill_blank' as ExerciseType,
              explanation: 'Present simple tense uses base form',
              grammar_rule_id: 'en-present-tense',
            },
          ])
        )
        .mockResolvedValueOnce(mockQueryResult([], 0));

      const result = await service.validateAnswer(exerciseId, userAnswer, userId);

      expect(result.isCorrect).toBe(true);
      expect(result.partialCredit).toBe(1.0);
      expect(result.feedback).toContain('✓ Correct!');
    });

    it('should validate incorrect fill_blank answer with partial credit for close match', async () => {
      const exerciseId = 'ex-1';
      const userAnswer = 'restauran';
      const userId = 'user-123';

      mockPool.query
        .mockResolvedValueOnce(
          mockQueryResult([
            {
              correct_answer: 'restaurant',
              exercise_type: 'fill_blank' as ExerciseType,
              explanation: 'French loanword',
              grammar_rule_id: 'en-vocabulary',
            },
          ])
        )
        .mockResolvedValueOnce(mockQueryResult([], 0));

      const result = await service.validateAnswer(exerciseId, userAnswer, userId);

      expect(result.isCorrect).toBe(false);
      expect(result.partialCredit).toBe(0.8);
      expect(result.feedback).toContain('Very close!');
    });

    it('should validate correct multiple_choice answer', async () => {
      const exerciseId = 'ex-2';
      const userAnswer = 'runs';
      const userId = 'user-123';

      mockPool.query
        .mockResolvedValueOnce(
          mockQueryResult([
            {
              correct_answer: 'runs',
              exercise_type: 'multiple_choice' as ExerciseType,
              explanation: 'Third person singular',
              grammar_rule_id: 'en-present-tense',
            },
          ])
        )
        .mockResolvedValueOnce(mockQueryResult([], 0));

      const result = await service.validateAnswer(exerciseId, userAnswer, userId);

      expect(result.isCorrect).toBe(true);
      expect(result.partialCredit).toBe(1.0);
    });

    it('should validate incorrect multiple_choice answer', async () => {
      const exerciseId = 'ex-2';
      const userAnswer = 'run';
      const userId = 'user-123';

      mockPool.query
        .mockResolvedValueOnce(
          mockQueryResult([
            {
              correct_answer: 'runs',
              exercise_type: 'multiple_choice' as ExerciseType,
              explanation: 'Third person singular',
              grammar_rule_id: 'en-present-tense',
            },
          ])
        )
        .mockResolvedValueOnce(mockQueryResult([], 0));

      const result = await service.validateAnswer(exerciseId, userAnswer, userId);

      expect(result.isCorrect).toBe(false);
      expect(result.partialCredit).toBe(0.0);
    });

    it('should validate correct reorder answer', async () => {
      const exerciseId = 'ex-3';
      const userAnswer = ['I', 'go', 'to', 'school'];
      const userId = 'user-123';

      mockPool.query
        .mockResolvedValueOnce(
          mockQueryResult([
            {
              correct_answer: ['I', 'go', 'to', 'school'],
              exercise_type: 'reorder' as ExerciseType,
              explanation: 'Correct word order',
              grammar_rule_id: 'en-word-order',
            },
          ])
        )
        .mockResolvedValueOnce(mockQueryResult([], 0));

      const result = await service.validateAnswer(exerciseId, userAnswer, userId);

      expect(result.isCorrect).toBe(true);
      expect(result.partialCredit).toBe(1.0);
    });

    it('should validate partially correct reorder answer', async () => {
      const exerciseId = 'ex-3';
      const userAnswer = ['I', 'go', 'to', 'the', 'wrong'];
      const userId = 'user-123';

      mockPool.query
        .mockResolvedValueOnce(
          mockQueryResult([
            {
              correct_answer: ['I', 'go', 'to', 'the', 'school'],
              exercise_type: 'reorder' as ExerciseType,
              explanation: 'Correct word order',
              grammar_rule_id: 'en-word-order',
            },
          ])
        )
        .mockResolvedValueOnce(mockQueryResult([], 0));

      const result = await service.validateAnswer(exerciseId, userAnswer, userId);

      expect(result.isCorrect).toBe(false);
      expect(result.partialCredit).toBe(0.8);
      expect(result.feedback).toContain('4 out of 5');
    });

    it('should throw error for non-existent exercise', async () => {
      const exerciseId = 'non-existent';
      const userAnswer = 'test';
      const userId = 'user-123';

      mockPool.query.mockResolvedValueOnce(mockQueryResult([], 0));

      await expect(service.validateAnswer(exerciseId, userAnswer, userId)).rejects.toThrow(
        'Exercise not found'
      );
    });

    it('should handle accent normalization in text validation', async () => {
      const exerciseId = 'ex-4';
      const userAnswer = 'café';
      const userId = 'user-123';

      mockPool.query
        .mockResolvedValueOnce(
          mockQueryResult([
            {
              correct_answer: 'cafe',
              exercise_type: 'fill_blank' as ExerciseType,
              explanation: 'French word',
              grammar_rule_id: 'fr-vocabulary',
            },
          ])
        )
        .mockResolvedValueOnce(mockQueryResult([], 0));

      const result = await service.validateAnswer(exerciseId, userAnswer, userId);

      expect(result.isCorrect).toBe(true);
      expect(result.partialCredit).toBe(1.0);
    });
  });
});
