import api from './client';

export interface VocabularyStatsResponse {
  totalWords: number;
  byState: {
    unknown: number;
    learning: number;
    known: number;
  };
  byLanguage: Array<{
    language: string;
    totalWords: number;
    unknown: number;
    learning: number;
    known: number;
  }>;
  byCEFR: Array<{
    level: string;
    count: number;
  }>;
  recentlyLearned: Array<{
    meaningId: string;
    text: string;
    language: string;
    learnedAt: string;
  }>;
}

export interface VocabularyTrendsResponse {
  trends: Array<{
    date: string;
    totalWords: number;
    learning: number;
    known: number;
  }>;
}

export interface VelocityResponse {
  wordsPerDay: number;
  wordsPerWeek: number;
  wordsThisWeek: number;
  wordsLastWeek: number;
  trend: 'increasing' | 'stable' | 'decreasing';
}

export interface PaginatedWordsResponse {
  words: Array<{
    meaningId: string;
    text: string;
    language: string;
    state: 'unknown' | 'learning' | 'known';
    cefrLevel: string;
    totalReviews: number;
    successfulReviews: number;
    lastReviewedAt: string | null;
    nextReviewAt: string | null;
    easeFactor: number;
    interval: number;
  }>;
  total: number;
}

export interface WordDetailsResponse {
  meaningId: string;
  text: string;
  language: string;
  state: 'unknown' | 'learning' | 'known';
  cefrLevel: string;
  totalReviews: number;
  successfulReviews: number;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  easeFactor: number;
  interval: number;
}

export const analyticsApi = {
  async getVocabularyStats(language?: string): Promise<VocabularyStatsResponse> {
    const params = language ? `?language=${language}` : '';
    return api.get<VocabularyStatsResponse>(`/analytics/vocabulary/stats${params}`);
  },

  async getVocabularyTrends(language?: string, days?: number): Promise<VocabularyTrendsResponse> {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    if (days) params.append('days', days.toString());
    const queryString = params.toString();
    return api.get<VocabularyTrendsResponse>(
      `/analytics/vocabulary/trends${queryString ? `?${queryString}` : ''}`
    );
  },

  async getLearningVelocity(language?: string): Promise<VelocityResponse> {
    const params = language ? `?language=${language}` : '';
    return api.get<VelocityResponse>(`/analytics/vocabulary/velocity${params}`);
  },

  async getWordsByState(
    state: 'unknown' | 'learning' | 'known',
    language?: string,
    offset?: number,
    limit?: number
  ): Promise<PaginatedWordsResponse> {
    const params = new URLSearchParams();
    params.append('state', state);
    if (language) params.append('language', language);
    if (offset !== undefined) params.append('offset', offset.toString());
    if (limit !== undefined) params.append('limit', limit.toString());
    return api.get<PaginatedWordsResponse>(`/analytics/vocabulary/words?${params.toString()}`);
  },

  async getWordDetails(meaningId: string): Promise<WordDetailsResponse> {
    return api.get<WordDetailsResponse>(`/analytics/vocabulary/word/${meaningId}`);
  },
};

// Grammar Analytics Types
export interface GrammarCoverageResponse {
  totalConcepts: number;
  completedConcepts: number;
  coveragePercentage: number;
  byCEFR: Array<{
    level: string;
    total: number;
    completed: number;
    percentage: number;
  }>;
  byCategory: Array<{
    category: string;
    total: number;
    completed: number;
    percentage: number;
  }>;
  byLanguage: Array<{
    language: string;
    totalConcepts: number;
    completedConcepts: number;
    percentage: number;
  }>;
  gaps: Array<{
    id: string;
    title: string;
    cefrLevel: string;
    category: string;
  }>;
  recentlyCompleted: Array<{
    id: string;
    title: string;
    cefrLevel: string;
    lastPracticed: string;
  }>;
}

export interface GrammarRecommendationsResponse {
  recommendations: Array<{
    conceptId: string;
    title: string;
    cefrLevel: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
  }>;
}

export interface GrammarTrendsResponse {
  trends: Array<{
    date: string;
    conceptsCompleted: number;
    averageMastery: number;
  }>;
}

export interface GrammarConceptResponse {
  id: string;
  title: string;
  description: string;
  cefrLevel: string;
  language: string;
  category: string;
  completed: boolean;
  masteryLevel: number;
  lastPracticed: string | null;
  practiceCount: number;
}

export const grammarAnalyticsApi = {
  async getCoverage(language?: string): Promise<GrammarCoverageResponse> {
    const params = language ? `?language=${language}` : '';
    return api.get<GrammarCoverageResponse>(`/analytics/grammar/coverage${params}`);
  },

  async getRecommendations(
    language: string,
    limit?: number
  ): Promise<GrammarRecommendationsResponse> {
    const params = new URLSearchParams();
    params.append('language', language);
    if (limit) params.append('limit', limit.toString());
    return api.get<GrammarRecommendationsResponse>(
      `/analytics/grammar/recommendations?${params.toString()}`
    );
  },

  async getTrends(language?: string, days?: number): Promise<GrammarTrendsResponse> {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    if (days) params.append('days', days.toString());
    const queryString = params.toString();
    return api.get<GrammarTrendsResponse>(
      `/analytics/grammar/trends${queryString ? `?${queryString}` : ''}`
    );
  },

  async getConceptDetails(conceptId: string): Promise<GrammarConceptResponse> {
    return api.get<GrammarConceptResponse>(`/analytics/grammar/concept/${conceptId}`);
  },
};

// CEFR Assessment Types
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

export interface CEFRAssessmentResponse {
  userId: string;
  language: string;
  currentLevel: string;
  status: 'progressing' | 'ready' | 'completed';
  levelDetails: CEFRLevelData[];
  nextLevel: string | null;
  progressToNextLevel: number;
  estimatedDaysToNextLevel: number | null;
  assessedAt: string;
}

export interface CEFRProgressionResponse {
  language: string;
  days: number;
  progression: Array<{
    date: string;
    level: string;
    vocabularyPercentage: number;
    grammarPercentage: number;
    overallPercentage: number;
  }>;
}

export interface CEFRRequirementsResponse {
  level: string;
  vocabularyNeeded: number;
  grammarNeeded: number;
  vocabularyGap: string[];
  grammarGap: string[];
  estimatedPracticeHours: number;
}

export interface CEFROverviewItem {
  language: string;
  currentLevel: string;
  status: string;
  progressToNextLevel: number;
  lastAssessed: string | null;
}

export interface CEFROverviewResponse {
  overview: CEFROverviewItem[];
}

export const cefrAnalyticsApi = {
  async getAssessment(language: string): Promise<CEFRAssessmentResponse> {
    return api.get<CEFRAssessmentResponse>(`/analytics/cefr/assessment/${language}`);
  },

  async getProgression(language: string, days?: number): Promise<CEFRProgressionResponse> {
    const params = new URLSearchParams();
    params.append('language', language);
    if (days) params.append('days', days.toString());
    return api.get<CEFRProgressionResponse>(`/analytics/cefr/progression?${params.toString()}`);
  },

  async getRequirements(
    language: string,
    targetLevel?: string
  ): Promise<CEFRRequirementsResponse | null> {
    const params = new URLSearchParams();
    params.append('language', language);
    if (targetLevel) params.append('targetLevel', targetLevel);
    return api.get<CEFRRequirementsResponse | null>(
      `/analytics/cefr/requirements?${params.toString()}`
    );
  },

  async getOverview(): Promise<CEFROverviewResponse> {
    return api.get<CEFROverviewResponse>('/analytics/cefr/overview');
  },
};

// Weakness Identification Types
export interface WeaknessItem {
  itemId: string;
  itemType: 'vocabulary' | 'grammar';
  itemText: string;
  language: string;
  cefrLevel: string;
  category?: string;
  accuracy: number;
  totalAttempts: number;
  recentAttempts: number;
  failureCount: number;
  lastAttemptDate: string | null;
  severityScore: number;
  improvementPotential: number;
}

export interface WeaknessAnalysisResponse {
  userId: string;
  language?: string;
  totalWeaknesses: number;
  weaknessesByType: {
    vocabulary: number;
    grammar: number;
  };
  weaknessesByCEFR: Record<string, number>;
  topWeaknesses: WeaknessItem[];
  analyzedAt: string;
}

export interface WeaknessRecommendation {
  itemId: string;
  itemType: string;
  itemText: string;
  reason: string;
  practiceType: 'recall' | 'recognition' | 'production' | 'mixed';
  estimatedPracticeTime: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface WeaknessRecommendationsResponse {
  recommendations: WeaknessRecommendation[];
}

export interface ImprovementTracking {
  itemId: string;
  itemType: string;
  itemText: string;
  beforeAccuracy: number;
  afterAccuracy: number;
  improvementPercentage: number;
  practiceSessionsCompleted: number;
  status: 'improving' | 'stagnant' | 'regressing';
}

export interface ImprovementsResponse {
  improvements: ImprovementTracking[];
}

export interface WeaknessHeatmapCell {
  cefrLevel: string;
  category: string;
  weaknessCount: number;
  avgSeverity: number;
}

export interface WeaknessHeatmapResponse {
  heatmap: WeaknessHeatmapCell[];
}

export const weaknessAnalyticsApi = {
  async getAnalysis(language?: string, cefrLevel?: string): Promise<WeaknessAnalysisResponse> {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    if (cefrLevel) params.append('cefrLevel', cefrLevel);
    const queryString = params.toString();
    return api.get<WeaknessAnalysisResponse>(
      `/analytics/weakness/analysis${queryString ? `?${queryString}` : ''}`
    );
  },

  async getRecommendations(
    language?: string,
    limit?: number
  ): Promise<WeaknessRecommendationsResponse> {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    if (limit) params.append('limit', limit.toString());
    const queryString = params.toString();
    return api.get<WeaknessRecommendationsResponse>(
      `/analytics/weakness/recommendations${queryString ? `?${queryString}` : ''}`
    );
  },

  async getImprovements(language?: string, daysSince?: number): Promise<ImprovementsResponse> {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    if (daysSince) params.append('daysSince', daysSince.toString());
    const queryString = params.toString();
    return api.get<ImprovementsResponse>(
      `/analytics/weakness/improvements${queryString ? `?${queryString}` : ''}`
    );
  },

  async getHeatmap(language?: string): Promise<WeaknessHeatmapResponse> {
    const params = language ? `?language=${language}` : '';
    return api.get<WeaknessHeatmapResponse>(`/analytics/weakness/heatmap${params}`);
  },
};

// Study Statistics Types
export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string | null;
  streakStartDate: string | null;
  isActiveToday: boolean;
}

export interface TimeStats {
  totalMinutes: number;
  averageSessionMinutes: number;
  totalSessions: number;
  dailyAverage: number;
  weeklyTotal: number;
  monthlyTotal: number;
}

export interface DailyStats {
  date: string;
  sessionsCompleted: number;
  totalMinutes: number;
  itemsReviewed: number;
  accuracy: number;
  languagesStudied: string[];
}

export interface AccuracyTrend {
  date: string;
  accuracy: number;
  movingAverage7Day: number;
  movingAverage30Day: number;
  itemsReviewed: number;
}

export interface StudyPaceAnalysis {
  pattern: 'consistent' | 'bursty' | 'irregular';
  activeDaysPerWeek: number;
  averageSessionsPerActiveDay: number;
  longestGapDays: number;
  studyTimeDistribution: {
    morning: number;
    afternoon: number;
    evening: number;
    night: number;
  };
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  category: 'streak' | 'volume' | 'accuracy' | 'milestone';
  unlockedAt?: string;
  progress?: number;
  target?: number;
}

export interface ActivityHeatmapCell {
  date: string;
  itemsReviewed: number;
  totalMinutes: number;
  intensity: number;
}

export interface StudyOverviewResponse {
  userId: string;
  streak: StreakInfo;
  timeStats: TimeStats;
  recentActivity: DailyStats[];
  accuracyTrends: AccuracyTrend[];
  paceAnalysis: StudyPaceAnalysis;
  badges: Badge[];
  heatmap: ActivityHeatmapCell[];
  analyzedAt: string;
}

export interface PeriodSummaryResponse {
  period: 'week' | 'month';
  startDate: string;
  endDate: string;
  totalMinutes: number;
  totalSessions: number;
  totalItemsReviewed: number;
  averageAccuracy: number;
  activeDays: number;
  newBadges: Badge[];
}

export interface BadgeUnlocksResponse {
  unlockedBadges: Badge[];
}

export const statisticsApi = {
  async getOverview(days?: number): Promise<StudyOverviewResponse> {
    const params = days ? `?days=${days}` : '';
    return api.get<StudyOverviewResponse>(`/analytics/statistics/overview${params}`);
  },

  async getStreak(): Promise<{ streak: StreakInfo }> {
    return api.get<{ streak: StreakInfo }>('/analytics/statistics/streak');
  },

  async getTimeStats(days?: number): Promise<{ timeStats: TimeStats }> {
    const params = days ? `?days=${days}` : '';
    return api.get<{ timeStats: TimeStats }>(`/analytics/statistics/time${params}`);
  },

  async getActivity(days?: number): Promise<{ activity: DailyStats[] }> {
    const params = days ? `?days=${days}` : '';
    return api.get<{ activity: DailyStats[] }>(`/analytics/statistics/activity${params}`);
  },

  async getAccuracyTrends(days?: number): Promise<{ trends: AccuracyTrend[] }> {
    const params = days ? `?days=${days}` : '';
    return api.get<{ trends: AccuracyTrend[] }>(`/analytics/statistics/accuracy${params}`);
  },

  async getPaceAnalysis(days?: number): Promise<{ paceAnalysis: StudyPaceAnalysis }> {
    const params = days ? `?days=${days}` : '';
    return api.get<{ paceAnalysis: StudyPaceAnalysis }>(`/analytics/statistics/pace${params}`);
  },

  async getBadges(): Promise<{ badges: Badge[] }> {
    return api.get<{ badges: Badge[] }>('/analytics/statistics/badges');
  },

  async getHeatmap(days?: number): Promise<{ heatmap: ActivityHeatmapCell[] }> {
    const params = days ? `?days=${days}` : '';
    return api.get<{ heatmap: ActivityHeatmapCell[] }>(`/analytics/statistics/heatmap${params}`);
  },

  async getSummary(period: 'week' | 'month'): Promise<PeriodSummaryResponse> {
    return api.get<PeriodSummaryResponse>(`/analytics/statistics/summary?period=${period}`);
  },

  async checkBadgeUnlocks(): Promise<BadgeUnlocksResponse> {
    return api.post<BadgeUnlocksResponse>('/analytics/statistics/badges/check', {});
  },
};
