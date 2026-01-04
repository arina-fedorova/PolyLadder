/**
 * Types of linguistic interference
 */
export type InterferenceType = 'vocabulary' | 'grammar' | 'syntax';

/**
 * Trend direction for interference reduction
 */
export type InterferenceTrend = 'improving' | 'stable' | 'worsening';

/**
 * Recorded interference pattern between languages
 */
export interface InterferencePattern {
  id: string;
  userId: string;
  targetLanguage: string;
  sourceLanguage: string;
  targetItemId: string;
  targetText: string;
  interferingItemId: string;
  interferingText: string;
  interferenceType: InterferenceType;
  confidenceScore: number;
  occurrenceCount: number;
  lastOccurrence: Date;
  remediationCompleted: boolean;
  createdAt: Date;
}

/**
 * Result of analyzing an answer for interference
 */
export interface InterferenceDetectionResult {
  isInterference: boolean;
  confidenceScore: number;
  pattern: InterferencePattern | null;
  explanation: string;
}

/**
 * Remediation exercise to address interference
 */
export interface RemediationExercise {
  id: string;
  patternId: string;
  exerciseType: 'contrast' | 'fill_blank' | 'multiple_choice';
  targetItem: {
    language: string;
    text: string;
    translation: string;
  };
  interferingItem: {
    language: string;
    text: string;
    translation: string;
  };
  prompt: string;
  correctAnswer: string;
  distractors: string[];
}

/**
 * Summary of user's interference patterns
 */
export interface InterferenceSummary {
  totalPatterns: number;
  activePatterns: number;
  remediatedPatterns: number;
  topInterferenceLanguagePairs: Array<{
    targetLanguage: string;
    sourceLanguage: string;
    count: number;
  }>;
  recentPatterns: InterferencePattern[];
}

/**
 * Interference reduction statistics
 */
export interface InterferenceReduction {
  rate: number;
  trend: InterferenceTrend;
}
