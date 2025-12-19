import { z } from 'zod';
import { Language, UserRole } from './enums';

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  passwordHash: z.string(),
  role: z.nativeEnum(UserRole),
  baseLanguage: z.nativeEnum(Language),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

export const UserPreferencesSchema = z.object({
  userId: z.string().uuid(),
  studiedLanguages: z.array(z.nativeEnum(Language)),
  focusModeEnabled: z.boolean(),
  focusLanguage: z.nativeEnum(Language).nullable(),
  onboardingCompleted: z.boolean(),
  settings: z.record(z.string(), z.unknown()),
  updatedAt: z.date(),
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const UserStatisticsSchema = z.object({
  userId: z.string().uuid(),
  totalStudyTimeMinutes: z.number().int().nonnegative(),
  exercisesCompleted: z.number().int().nonnegative(),
  currentStreakDays: z.number().int().nonnegative(),
  longestStreakDays: z.number().int().nonnegative(),
  lastStudyDate: z.date().nullable(),
  achievements: z.array(z.string()),
  updatedAt: z.date(),
});

export type UserStatistics = z.infer<typeof UserStatisticsSchema>;
