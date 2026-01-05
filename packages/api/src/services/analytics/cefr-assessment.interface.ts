/**
 * CEFR Level data with vocabulary and grammar completion statistics
 */
export interface CEFRLevelData {
  level: string;
  vocabularyTotal: number;
  vocabularyMastered: number;
  vocabularyPercentage: number;
  grammarTotal: number;
  grammarCompleted: number;
  grammarPercentage: number;
  overallPercentage: number;
  isCompleted: boolean;
}

/**
 * Complete CEFR assessment result
 */
export interface CEFRAssessment {
  userId: string;
  language: string;
  currentLevel: string;
  status: 'progressing' | 'ready' | 'completed';
  levelDetails: CEFRLevelData[];
  nextLevel: string | null;
  progressToNextLevel: number;
  estimatedDaysToNextLevel: number | null;
  assessedAt: Date;
}

/**
 * Historical level progression data point
 */
export interface LevelProgression {
  date: Date;
  level: string;
  vocabularyPercentage: number;
  grammarPercentage: number;
  overallPercentage: number;
}

/**
 * Requirements to reach target CEFR level
 */
export interface LevelRequirements {
  level: string;
  vocabularyNeeded: number;
  grammarNeeded: number;
  vocabularyGap: string[];
  grammarGap: string[];
  estimatedPracticeHours: number;
}

/**
 * Overview of CEFR progress for a language
 */
export interface CEFROverview {
  language: string;
  currentLevel: string;
  status: string;
  progressToNextLevel: number;
  lastAssessed: Date | null;
}
