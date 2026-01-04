/**
 * Focus mode settings for a user
 */
export interface FocusModeSettings {
  userId: string;
  enabled: boolean;
  focusLanguage: string | null;
  activatedAt: Date | null;
  lastToggled: Date | null;
}

/**
 * Focus mode statistics
 */
export interface FocusModeStats {
  totalFocusSessions: number;
  currentStreak: number;
  longestStreak: number;
  totalFocusedMinutes: number;
  languageBreakdown: LanguageFocusStats[];
}

/**
 * Focus statistics per language
 */
export interface LanguageFocusStats {
  language: string;
  sessionsCount: number;
  minutesPracticed: number;
}

/**
 * Focus mode history entry
 */
export interface FocusModeHistoryEntry {
  language: string;
  action: FocusModeAction;
  timestamp: Date;
  metadata?: FocusModeMetadata;
}

/**
 * Possible focus mode actions
 */
export type FocusModeAction = 'enabled' | 'disabled' | 'switched';

/**
 * Metadata for focus mode history entries
 */
export interface FocusModeMetadata {
  from?: string;
  [key: string]: unknown;
}
