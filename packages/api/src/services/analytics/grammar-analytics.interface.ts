/**
 * Grammar concept with completion status
 */
export interface GrammarConcept {
  id: string;
  title: string;
  description: string;
  cefrLevel: string;
  language: string;
  category: string;
  completed: boolean;
  masteryLevel: number;
  lastPracticed: Date | null;
  practiceCount: number;
}

/**
 * Grammar coverage statistics
 */
export interface GrammarCoverageStats {
  totalConcepts: number;
  completedConcepts: number;
  coveragePercentage: number;
  byCEFR: CEFRCoverage[];
  byCategory: CategoryCoverage[];
  byLanguage: LanguageCoverage[];
  gaps: GrammarConcept[];
  recentlyCompleted: GrammarConcept[];
}

/**
 * CEFR level coverage breakdown
 */
export interface CEFRCoverage {
  level: string;
  total: number;
  completed: number;
  percentage: number;
}

/**
 * Category coverage breakdown
 */
export interface CategoryCoverage {
  category: string;
  total: number;
  completed: number;
  percentage: number;
}

/**
 * Per-language coverage breakdown
 */
export interface LanguageCoverage {
  language: string;
  totalConcepts: number;
  completedConcepts: number;
  percentage: number;
}

/**
 * Personalized grammar recommendation
 */
export interface GrammarRecommendation {
  conceptId: string;
  title: string;
  cefrLevel: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Grammar mastery trend data point
 */
export interface GrammarMasteryTrend {
  date: string;
  conceptsCompleted: number;
  averageMastery: number;
}
