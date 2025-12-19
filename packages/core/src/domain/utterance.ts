import { z } from 'zod';
import { Language } from './enums';

export const UtteranceSchema = z.object({
  id: z.string().uuid(),
  meaningId: z.string().max(100),
  language: z.nativeEnum(Language),
  text: z.string().min(1),
  register: z.string().nullable(),
  usageNotes: z.string().nullable(),
  audioUrl: z.string().url().nullable(),
  createdAt: z.date(),
});

export type Utterance = z.infer<typeof UtteranceSchema>;
