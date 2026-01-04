/**
 * Configuration for creating a mixed practice session
 */
export interface MixedSessionConfig {
  userId: string;
  practiceTypes: PracticeType[];
  itemsPerLanguage: number;
  mixingStrategy: MixingStrategy;
  totalItems: number;
}

/**
 * Supported practice types for mixed sessions
 */
export type PracticeType = 'recall' | 'recognition';

/**
 * Mixing strategies for distributing items across languages
 */
export type MixingStrategy = 'equal' | 'weighted' | 'random';

/**
 * A single exercise item in a mixed session
 */
export interface MixedExerciseItem {
  id: string;
  language: string;
  practiceType: PracticeType;
  meaningId: string;
  content: MixedItemContent;
  estimatedDifficulty: number;
}

/**
 * Content for a mixed practice item
 */
export interface MixedItemContent {
  text: string;
  definition: string | null;
  audioUrl: string | null;
  level: string;
}

/**
 * Created mixed session with items
 */
export interface MixedSession {
  sessionId: string;
  languages: string[];
  mixingStrategy: MixingStrategy;
  items: MixedExerciseItem[];
}

/**
 * Session summary with per-language analytics
 */
export interface MixedSessionSummary {
  sessionId: string;
  totalItems: number;
  totalCorrect: number;
  totalTime: number;
  languageBreakdown: LanguagePerformance[];
  switchingEfficiency: number;
}

/**
 * Performance metrics for a single language
 */
export interface LanguagePerformance {
  language: string;
  itemsAttempted: number;
  correctAnswers: number;
  averageTime: number;
  accuracy: number;
}
