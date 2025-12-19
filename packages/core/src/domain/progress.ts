import { z } from 'zod';
import { Language, ProgressStatus, SRSItemType, VocabularyState } from './enums';

export const UserProgressSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  conceptId: z.string().max(100),
  status: z.nativeEnum(ProgressStatus),
  completionDate: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type UserProgress = z.infer<typeof UserProgressSchema>;

export const UserVocabularySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  word: z.string().max(100),
  language: z.nativeEnum(Language),
  state: z.nativeEnum(VocabularyState),
  firstSeen: z.date(),
  lastReviewed: z.date().nullable(),
  reviewCount: z.number().int().nonnegative(),
  updatedAt: z.date(),
});

export type UserVocabulary = z.infer<typeof UserVocabularySchema>;

export const SRSScheduleSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  itemType: z.nativeEnum(SRSItemType),
  itemId: z.string().max(100),
  dueDate: z.date(),
  intervalDays: z.number().int().positive(),
  easeFactor: z.number().min(1.3).max(3.0),
  repetitions: z.number().int().nonnegative(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type SRSSchedule = z.infer<typeof SRSScheduleSchema>;
