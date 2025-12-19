import { z } from 'zod';
import { CEFRLevel, ExerciseType, Language } from './enums';

export const ExerciseSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(ExerciseType),
  level: z.nativeEnum(CEFRLevel),
  languages: z.array(z.nativeEnum(Language)),
  prompt: z.string(),
  correctAnswer: z.string(),
  options: z.array(z.string()).nullable(),
  metadata: z.record(z.unknown()),
  createdAt: z.date(),
});

export type Exercise = z.infer<typeof ExerciseSchema>;
