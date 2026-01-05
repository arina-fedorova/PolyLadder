/**
 * Weakness Identification Service Interfaces
 *
 * Identifies user's weak areas based on performance metrics:
 * 1. Vocabulary items with low accuracy or high lapse rate
 * 2. Grammar concepts with poor mastery scores
 *
 * Weakness Criteria:
 * - Accuracy < 70% over last attempts
 * - OR ease factor < 2.0 (SRS metric indicating difficulty)
 * - OR recent failures (>=3 failures in last 7 days)
 */

/**
 * Individual weakness item (vocabulary or grammar)
 */
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
  lastAttemptDate: Date | null;
  severityScore: number;
  improvementPotential: number;
}

/**
 * Overall weakness analysis result
 */
export interface WeaknessAnalysis {
  userId: string;
  language?: string;
  totalWeaknesses: number;
  weaknessesByType: {
    vocabulary: number;
    grammar: number;
  };
  weaknessesByCEFR: Record<string, number>;
  topWeaknesses: WeaknessItem[];
  analyzedAt: Date;
}

/**
 * Practice recommendation for a weakness
 */
export interface WeaknessRecommendation {
  itemId: string;
  itemType: string;
  itemText: string;
  reason: string;
  practiceType: 'recall' | 'recognition' | 'production' | 'mixed';
  estimatedPracticeTime: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Improvement tracking for weaknesses
 */
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

/**
 * Weakness heatmap data point
 */
export interface WeaknessHeatmapCell {
  cefrLevel: string;
  category: string;
  weaknessCount: number;
  avgSeverity: number;
}
