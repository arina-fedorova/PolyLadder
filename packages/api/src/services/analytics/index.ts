export { VocabularyAnalyticsService } from './vocabulary-analytics.service';
export type {
  VocabularyStats,
  VocabularyTrend,
  WordDetails,
  LearningVelocity,
  PaginatedWords,
  WordState,
  LanguageBreakdown,
  CEFRDistribution,
  RecentWord,
} from './vocabulary-analytics.interface';

export { GrammarAnalyticsService } from './grammar-analytics.service';
export type {
  GrammarConcept,
  GrammarCoverageStats,
  GrammarRecommendation,
  GrammarMasteryTrend,
  CEFRCoverage,
  CategoryCoverage,
  LanguageCoverage,
} from './grammar-analytics.interface';

export { CEFRAssessmentService } from './cefr-assessment.service';
export type {
  CEFRLevelData,
  CEFRAssessment,
  LevelProgression,
  LevelRequirements,
  CEFROverview,
} from './cefr-assessment.interface';

export { WeaknessIdentificationService } from './weakness-identification.service';
export type {
  WeaknessItem,
  WeaknessAnalysis,
  WeaknessRecommendation,
  ImprovementTracking,
  WeaknessHeatmapCell,
} from './weakness-identification.interface';
