import { z } from 'zod';
import { ConceptType, Language } from './enums';

export const CurriculumNodeSchema = z.object({
  id: z.string().uuid(),
  conceptId: z.string().max(100),
  conceptType: z.nativeEnum(ConceptType),
  language: z.nativeEnum(Language).nullable(),
  prerequisites: z.array(z.string().max(100)),
  metadata: z.record(z.unknown()),
  createdAt: z.date(),
});

export type CurriculumNode = z.infer<typeof CurriculumNodeSchema>;
