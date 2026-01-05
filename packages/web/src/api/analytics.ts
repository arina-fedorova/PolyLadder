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
