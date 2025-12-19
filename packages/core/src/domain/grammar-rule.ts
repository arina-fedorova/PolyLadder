import { z } from 'zod';
import { CEFRLevel, Language } from './enums';

export const GrammarRuleSchema = z.object({
  id: z.string().max(100),
  language: z.nativeEnum(Language),
  level: z.nativeEnum(CEFRLevel),
  category: z.string().max(50),
  title: z.string(),
  explanation: z.string(),
  examples: z.array(z.string()),
  createdAt: z.date(),
});

export type GrammarRule = z.infer<typeof GrammarRuleSchema>;
