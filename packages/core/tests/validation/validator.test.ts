import { describe, it, expect } from 'vitest';
import {
  validateSchema,
  assertValidSchema,
  isValidSchema,
  validateOrThrow,
  SchemaValidationError,
} from '../../src/validation/validator';
import {
  MeaningValidationSchema,
  UtteranceValidationSchema,
  ExerciseValidationSchema,
  GrammarRuleValidationSchema,
} from '../../src/validation/schemas';
import { Language, CEFRLevel, ExerciseType } from '../../src/domain/enums';

describe('Validation Engine', () => {
  describe('validateSchema', () => {
    it('should validate correct meaning', () => {
      const data = {
        id: 'greeting-hello',
        level: CEFRLevel.A1,
        tags: ['greetings', 'basic'],
      };
      const result = validateSchema(MeaningValidationSchema, data);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual(data);
    });

    it('should reject invalid CEFR level', () => {
      const data = {
        id: 'greeting-hello',
        level: 'Z9',
        tags: ['greetings'],
      };
      const result = validateSchema(MeaningValidationSchema, data);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should reject missing required fields', () => {
      const data = {
        id: 'greeting-hello',
      };
      const result = validateSchema(MeaningValidationSchema, data);
      expect(result.valid).toBe(false);
      expect(result.errors?.some((e) => e.field === 'level')).toBe(true);
      expect(result.errors?.some((e) => e.field === 'tags')).toBe(true);
    });

    it('should validate correct utterance', () => {
      const data = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        meaningId: 'greeting-hello',
        language: Language.EN,
        text: 'Hello!',
      };
      const result = validateSchema(UtteranceValidationSchema, data);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid language code', () => {
      const data = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        meaningId: 'greeting-hello',
        language: 'XX',
        text: 'Hello!',
      };
      const result = validateSchema(UtteranceValidationSchema, data);
      expect(result.valid).toBe(false);
    });

    it('should reject empty text in utterance', () => {
      const data = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        meaningId: 'greeting-hello',
        language: Language.EN,
        text: '',
      };
      const result = validateSchema(UtteranceValidationSchema, data);
      expect(result.valid).toBe(false);
    });

    it('should validate correct exercise', () => {
      const data = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: ExerciseType.MULTIPLE_CHOICE,
        level: CEFRLevel.A1,
        languages: [Language.EN, Language.ES],
        prompt: 'What is the Spanish word for "hello"?',
        correctAnswer: 'hola',
        distractors: ['adiós', 'gracias'],
      };
      const result = validateSchema(ExerciseValidationSchema, data);
      expect(result.valid).toBe(true);
    });

    it('should validate grammar rule with prerequisites', () => {
      const data = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        level: CEFRLevel.A2,
        category: 'verbs',
        languages: [Language.ES],
        title: 'Present tense conjugation',
        explanation: 'Regular verbs in present tense follow specific patterns...',
        examples: ['Yo hablo', 'Tú hablas', 'Él habla'],
        prerequisites: ['123e4567-e89b-12d3-a456-426614174001'],
      };
      const result = validateSchema(GrammarRuleValidationSchema, data);
      expect(result.valid).toBe(true);
    });
  });

  describe('assertValidSchema', () => {
    it('should return data for valid input', () => {
      const data = {
        id: 'greeting-hello',
        level: CEFRLevel.A1,
        tags: ['greetings'],
      };
      const result = assertValidSchema(MeaningValidationSchema, data);
      expect(result).toEqual(data);
    });

    it('should throw for invalid input', () => {
      const data = { id: 'greeting-hello' };
      expect(() => assertValidSchema(MeaningValidationSchema, data)).toThrow();
    });
  });

  describe('isValidSchema', () => {
    it('should return true for valid data', () => {
      const data = {
        id: 'greeting-hello',
        level: CEFRLevel.A1,
        tags: ['greetings'],
      };
      expect(isValidSchema(MeaningValidationSchema, data)).toBe(true);
    });

    it('should return false for invalid data', () => {
      const data = { id: 'greeting-hello' };
      expect(isValidSchema(MeaningValidationSchema, data)).toBe(false);
    });
  });

  describe('validateOrThrow', () => {
    it('should return data for valid input', () => {
      const data = {
        id: 'greeting-hello',
        level: CEFRLevel.A1,
        tags: ['greetings'],
      };
      const result = validateOrThrow(MeaningValidationSchema, data);
      expect(result).toEqual(data);
    });

    it('should throw SchemaValidationError for invalid input', () => {
      const data = { id: 'greeting-hello' };
      expect(() => validateOrThrow(MeaningValidationSchema, data)).toThrow(SchemaValidationError);
    });
  });

  describe('Error messages', () => {
    it('should provide detailed error information', () => {
      const data = {
        id: '',
        level: 'INVALID',
        tags: 'not-an-array',
      };
      const result = validateSchema(MeaningValidationSchema, data);
      expect(result.valid).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
      result.errors?.forEach((error) => {
        expect(error.field).toBeDefined();
        expect(error.message).toBeDefined();
        expect(error.code).toBeDefined();
      });
    });
  });
});
