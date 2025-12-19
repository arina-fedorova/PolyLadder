import { z } from 'zod';
import { Language, CEFRLevel, DataType, ExerciseType } from '../domain/enums';

export const LanguageSchema = z.nativeEnum(Language);
export const CEFRLevelSchema = z.nativeEnum(CEFRLevel);
export const DataTypeSchema = z.nativeEnum(DataType);
export const ExerciseTypeSchema = z.nativeEnum(ExerciseType);

export const MeaningValidationSchema = z.object({
  id: z.string().min(1).max(100),
  level: CEFRLevelSchema,
  tags: z.array(z.string().max(50)).max(20),
  semanticDomain: z.string().max(100).optional(),
  frequency: z.number().min(0).max(100).optional(),
});

export const UtteranceValidationSchema = z.object({
  id: z.string().uuid(),
  meaningId: z.string().min(1).max(100),
  language: LanguageSchema,
  text: z.string().min(1).max(1000),
  pronunciation: z.string().max(500).optional(),
  audioUrl: z.string().url().optional(),
  notes: z.string().max(2000).optional(),
});

export const GrammarRuleValidationSchema = z.object({
  id: z.string().uuid(),
  level: CEFRLevelSchema,
  category: z.string().min(1).max(100),
  languages: z.array(LanguageSchema).min(1).max(10),
  title: z.string().min(1).max(200),
  explanation: z.string().min(10).max(10000),
  examples: z.array(z.string().max(500)).min(1).max(50),
  prerequisites: z.array(z.string().uuid()).max(20).optional(),
});

export const ExerciseValidationSchema = z.object({
  id: z.string().uuid(),
  type: ExerciseTypeSchema,
  level: CEFRLevelSchema,
  languages: z.array(LanguageSchema).min(1).max(5),
  prompt: z.string().min(1).max(2000),
  correctAnswer: z.string().min(1).max(1000),
  distractors: z.array(z.string().max(500)).max(10).optional(),
  hints: z.array(z.string().max(500)).max(5).optional(),
  relatedMeaningId: z.string().max(100).optional(),
  relatedRuleId: z.string().uuid().optional(),
});

export const DraftDataValidationSchema = z.object({
  dataType: DataTypeSchema,
  rawData: z.record(z.string(), z.unknown()),
  source: z.string().min(1).max(100),
});

export const CandidateDataValidationSchema = z.object({
  dataType: DataTypeSchema,
  normalizedData: z.record(z.string(), z.unknown()),
  draftId: z.string().uuid(),
});

export type MeaningValidation = z.infer<typeof MeaningValidationSchema>;
export type UtteranceValidation = z.infer<typeof UtteranceValidationSchema>;
export type GrammarRuleValidation = z.infer<typeof GrammarRuleValidationSchema>;
export type ExerciseValidation = z.infer<typeof ExerciseValidationSchema>;
