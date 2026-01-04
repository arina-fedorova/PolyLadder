/**
 * Overall vocabulary statistics for a user
 */
export interface VocabularyStats {
  totalWords: number;
  byState: {
    unknown: number;
    learning: number;
    known: number;
  };
  byLanguage: LanguageBreakdown[];
  byCEFR: CEFRDistribution[];
  recentlyLearned: RecentWord[];
}

/**
 * Per-language vocabulary breakdown
 */
export interface LanguageBreakdown {
  language: string;
  totalWords: number;
  unknown: number;
  learning: number;
  known: number;
}

/**
 * CEFR level distribution
 */
export interface CEFRDistribution {
  level: string;
  count: number;
}

/**
 * Recently learned word
 */
export interface RecentWord {
  meaningId: string;
  text: string;
  language: string;
  learnedAt: Date;
}

/**
 * Vocabulary trend data point
 */
export interface VocabularyTrend {
  date: string;
  totalWords: number;
  learning: number;
  known: number;
}

/**
 * Detailed word information
 */
export interface WordDetails {
  meaningId: string;
  text: string;
  language: string;
  state: 'unknown' | 'learning' | 'known';
  cefrLevel: string;
  totalReviews: number;
  successfulReviews: number;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  easeFactor: number;
  interval: number;
}

/**
 * Learning velocity metrics
 */
export interface LearningVelocity {
  wordsPerDay: number;
  wordsPerWeek: number;
  wordsThisWeek: number;
  wordsLastWeek: number;
  trend: 'increasing' | 'stable' | 'decreasing';
}

/**
 * Paginated word list result
 */
export interface PaginatedWords {
  words: WordDetails[];
  total: number;
}

/**
 * Word state type
 */
export type WordState = 'unknown' | 'learning' | 'known';
