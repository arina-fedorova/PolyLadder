import { z } from 'zod';
import { CEFRLevel } from './enums';

export const MeaningSchema = z.object({
  id: z.string().max(100),
  level: z.nativeEnum(CEFRLevel),
  tags: z.array(z.string()),
  createdAt: z.date(),
});

export type Meaning = z.infer<typeof MeaningSchema>;
