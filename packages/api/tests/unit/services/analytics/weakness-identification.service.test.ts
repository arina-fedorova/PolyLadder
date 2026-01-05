import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import { WeaknessIdentificationService } from '../../../../src/services/analytics';

// Helper to create mock result
const mockResult = <T extends QueryResultRow>(rows: T[], rowCount?: number): QueryResult<T> =>
  ({
    rows,
    rowCount: rowCount ?? rows.length,
  }) as unknown as QueryResult<T>;

// Interface for vocabulary weakness row
interface VocabWeaknessRow {
  meaning_id: string;
  item_text: string;
  language: string;
  cefr_level: string;
  successful_reviews: string;
  total_reviews: string;
  last_reviewed_at: Date | null;
  ease_factor: string | null;
  recent_failures: string;
}

// Interface for grammar weakness row
interface GrammarWeaknessRow {
  grammar_id: string;
  item_text: string;
  language: string;
  cefr_level: string;
  category: string;
  mastery_level: string;
  practice_count: string;
  correct_count: string;
  last_practiced: Date | null;
  recent_failures: string;
}

// Interface for historical performance row
interface HistoricalRow {
  item_id: string;
  item_type: string;
  accuracy: string;
  attempts: string;
}

// Helper to create vocabulary weakness rows
const createVocabRow = (
  id: string,
  text: string,
  successfulReviews: number,
  totalReviews: number,
  easeFactor: number | null = 2.5,
  recentFailures: number = 0
): VocabWeaknessRow => ({
  meaning_id: id,
  item_text: text,
  language: 'ES',
  cefr_level: 'A1',
  successful_reviews: String(successfulReviews),
  total_reviews: String(totalReviews),
  last_reviewed_at: new Date('2024-01-15'),
  ease_factor: easeFactor !== null ? String(easeFactor) : null,
  recent_failures: String(recentFailures),
});

// Helper to create grammar weakness rows
const createGrammarRow = (
  id: string,
  title: string,
  masteryLevel: number,
  practiceCount: number,
  correctCount: number,
  recentFailures: number = 0
): GrammarWeaknessRow => ({
  grammar_id: id,
  item_text: title,
  language: 'ES',
  cefr_level: 'A1',
  category: 'verbs',
  mastery_level: String(masteryLevel),
  practice_count: String(practiceCount),
  correct_count: String(correctCount),
  last_practiced: new Date('2024-01-15'),
  recent_failures: String(recentFailures),
});

describe('WeaknessIdentificationService', () => {
  let service: WeaknessIdentificationService;
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery = vi.fn();
    const mockPool = { query: mockQuery } as unknown as Pool;
    service = new WeaknessIdentificationService(mockPool);
  });

  describe('analyzeWeaknesses', () => {
    it('should return empty analysis when no weaknesses found', async () => {
      // Vocabulary query returns empty
      mockQuery.mockResolvedValueOnce(mockResult<VocabWeaknessRow>([]));
      // Grammar query returns empty
      mockQuery.mockResolvedValueOnce(mockResult<GrammarWeaknessRow>([]));

      const result = await service.analyzeWeaknesses('user-123', 'ES');

      expect(result.userId).toBe('user-123');
      expect(result.language).toBe('ES');
      expect(result.totalWeaknesses).toBe(0);
      expect(result.weaknessesByType.vocabulary).toBe(0);
      expect(result.weaknessesByType.grammar).toBe(0);
      expect(result.topWeaknesses).toHaveLength(0);
    });

    it('should identify vocabulary weaknesses with low accuracy', async () => {
      // Vocabulary with 40% accuracy (4/10)
      mockQuery.mockResolvedValueOnce(
        mockResult<VocabWeaknessRow>([createVocabRow('word-1', 'hola', 4, 10)])
      );
      // Grammar query returns empty
      mockQuery.mockResolvedValueOnce(mockResult<GrammarWeaknessRow>([]));

      const result = await service.analyzeWeaknesses('user-123', 'ES');

      expect(result.totalWeaknesses).toBe(1);
      expect(result.weaknessesByType.vocabulary).toBe(1);
      expect(result.topWeaknesses[0].itemText).toBe('hola');
      expect(result.topWeaknesses[0].accuracy).toBe(40);
      expect(result.topWeaknesses[0].itemType).toBe('vocabulary');
    });

    it('should identify grammar weaknesses with low mastery', async () => {
      // Vocabulary query returns empty
      mockQuery.mockResolvedValueOnce(mockResult<VocabWeaknessRow>([]));
      // Grammar with 50% accuracy (5/10)
      mockQuery.mockResolvedValueOnce(
        mockResult<GrammarWeaknessRow>([createGrammarRow('rule-1', 'Present Tense', 45, 10, 5)])
      );

      const result = await service.analyzeWeaknesses('user-123', 'ES');

      expect(result.totalWeaknesses).toBe(1);
      expect(result.weaknessesByType.grammar).toBe(1);
      expect(result.topWeaknesses[0].itemText).toBe('Present Tense');
      expect(result.topWeaknesses[0].accuracy).toBe(50);
      expect(result.topWeaknesses[0].itemType).toBe('grammar');
    });

    it('should combine and sort weaknesses by severity', async () => {
      // Vocabulary with 30% accuracy (worst)
      mockQuery.mockResolvedValueOnce(
        mockResult<VocabWeaknessRow>([
          createVocabRow('word-1', 'hola', 3, 10), // 30%
        ])
      );
      // Grammar with 60% accuracy (better)
      mockQuery.mockResolvedValueOnce(
        mockResult<GrammarWeaknessRow>([createGrammarRow('rule-1', 'Present Tense', 60, 10, 6)])
      );

      const result = await service.analyzeWeaknesses('user-123', 'ES');

      expect(result.totalWeaknesses).toBe(2);
      // Should be sorted by severity (lower accuracy = higher severity)
      expect(result.topWeaknesses[0].itemText).toBe('hola');
      expect(result.topWeaknesses[0].accuracy).toBe(30);
      expect(result.topWeaknesses[1].itemText).toBe('Present Tense');
    });

    it('should count weaknesses by CEFR level', async () => {
      const vocabRows: VocabWeaknessRow[] = [
        { ...createVocabRow('word-1', 'hola', 3, 10), cefr_level: 'A1' },
        { ...createVocabRow('word-2', 'gracias', 4, 10), cefr_level: 'A1' },
      ];
      mockQuery.mockResolvedValueOnce(mockResult<VocabWeaknessRow>(vocabRows));

      const grammarRows: GrammarWeaknessRow[] = [
        { ...createGrammarRow('rule-1', 'Present Tense', 45, 10, 5), cefr_level: 'A2' },
      ];
      mockQuery.mockResolvedValueOnce(mockResult<GrammarWeaknessRow>(grammarRows));

      const result = await service.analyzeWeaknesses('user-123', 'ES');

      expect(result.weaknessesByCEFR['A1']).toBe(2);
      expect(result.weaknessesByCEFR['A2']).toBe(1);
    });

    it('should handle weaknesses with recent failures', async () => {
      // Vocabulary with many recent failures
      mockQuery.mockResolvedValueOnce(
        mockResult<VocabWeaknessRow>([createVocabRow('word-1', 'difícil', 5, 10, 2.5, 5)])
      );
      mockQuery.mockResolvedValueOnce(mockResult<GrammarWeaknessRow>([]));

      const result = await service.analyzeWeaknesses('user-123', 'ES');

      expect(result.topWeaknesses[0].failureCount).toBe(5);
    });

    it('should identify weaknesses with low ease factor', async () => {
      // Vocabulary with low ease factor (indicates difficulty)
      mockQuery.mockResolvedValueOnce(
        mockResult<VocabWeaknessRow>([createVocabRow('word-1', 'complejo', 3, 10, 1.5)])
      );
      mockQuery.mockResolvedValueOnce(mockResult<GrammarWeaknessRow>([]));

      const result = await service.analyzeWeaknesses('user-123', 'ES');

      expect(result.totalWeaknesses).toBe(1);
    });
  });

  describe('getWeaknessRecommendations', () => {
    it('should generate recommendations with correct priority', async () => {
      // Very low accuracy -> medium priority based on severity formula
      // Severity = (1 - accuracy) * 0.5 + recency * 0.3 + frequency * 0.2
      // For 20% accuracy: (1-0.2)*0.5 = 0.4 (40%)
      mockQuery.mockResolvedValueOnce(
        mockResult<VocabWeaknessRow>([createVocabRow('word-1', 'difícil', 2, 10)]) // 20% accuracy
      );
      mockQuery.mockResolvedValueOnce(mockResult<GrammarWeaknessRow>([]));

      const result = await service.getWeaknessRecommendations('user-123', 'ES', 10);

      expect(result).toHaveLength(1);
      expect(result[0].itemText).toBe('difícil');
      expect(result[0].practiceType).toBe('recognition'); // Easiest for <40%
      // Priority is based on severity score, which depends on accuracy, recency, and frequency
      expect(['critical', 'high', 'medium']).toContain(result[0].priority);
    });

    it('should use mixed practice for moderate weaknesses', async () => {
      // Moderate accuracy (50%) -> mixed practice
      mockQuery.mockResolvedValueOnce(
        mockResult<VocabWeaknessRow>([createVocabRow('word-1', 'moderado', 5, 10)])
      );
      mockQuery.mockResolvedValueOnce(mockResult<GrammarWeaknessRow>([]));

      const result = await service.getWeaknessRecommendations('user-123', 'ES', 10);

      expect(result[0].practiceType).toBe('mixed');
    });

    it('should use recall practice for near-threshold weaknesses', async () => {
      // Near threshold (65%) -> recall practice
      mockQuery.mockResolvedValueOnce(
        mockResult<VocabWeaknessRow>([createVocabRow('word-1', 'casi', 65, 100)])
      );
      mockQuery.mockResolvedValueOnce(mockResult<GrammarWeaknessRow>([]));

      const result = await service.getWeaknessRecommendations('user-123', 'ES', 10);

      expect(result[0].practiceType).toBe('recall');
    });

    it('should limit recommendations to requested count', async () => {
      const vocabRows: VocabWeaknessRow[] = Array.from({ length: 10 }, (_, i) =>
        createVocabRow(`word-${i}`, `word${i}`, 3, 10)
      );
      mockQuery.mockResolvedValueOnce(mockResult<VocabWeaknessRow>(vocabRows));
      mockQuery.mockResolvedValueOnce(mockResult<GrammarWeaknessRow>([]));

      const result = await service.getWeaknessRecommendations('user-123', 'ES', 5);

      expect(result).toHaveLength(5);
    });

    it('should generate appropriate reason for low accuracy', async () => {
      mockQuery.mockResolvedValueOnce(
        mockResult<VocabWeaknessRow>([createVocabRow('word-1', 'bajo', 3, 10)])
      );
      mockQuery.mockResolvedValueOnce(mockResult<GrammarWeaknessRow>([]));

      const result = await service.getWeaknessRecommendations('user-123', 'ES', 10);

      expect(result[0].reason).toContain('30.0%');
      expect(result[0].reason).toContain('fundamental review');
    });

    it('should generate appropriate reason for persistent failures', async () => {
      mockQuery.mockResolvedValueOnce(
        mockResult<VocabWeaknessRow>([createVocabRow('word-1', 'persistente', 6, 10, 2.5, 6)])
      );
      mockQuery.mockResolvedValueOnce(mockResult<GrammarWeaknessRow>([]));

      const result = await service.getWeaknessRecommendations('user-123', 'ES', 10);

      expect(result[0].reason).toContain('6 recent failures');
    });
  });

  describe('trackImprovements', () => {
    it('should identify improving items', async () => {
      // Historical performance query
      mockQuery.mockResolvedValueOnce(
        mockResult<HistoricalRow>([
          { item_id: 'word-1', item_type: 'vocabulary', accuracy: '0.4', attempts: '10' },
        ])
      );
      // Current weaknesses - vocabulary query
      mockQuery.mockResolvedValueOnce(
        mockResult<VocabWeaknessRow>([createVocabRow('word-1', 'mejorado', 6, 10)]) // 60% now
      );
      // Current weaknesses - grammar query
      mockQuery.mockResolvedValueOnce(mockResult<GrammarWeaknessRow>([]));

      const result = await service.trackImprovements('user-123', 'ES', 14);

      expect(result).toHaveLength(1);
      expect(result[0].beforeAccuracy).toBe(40);
      expect(result[0].afterAccuracy).toBe(60);
      expect(result[0].status).toBe('improving');
      expect(result[0].improvementPercentage).toBeGreaterThan(0);
    });

    it('should identify regressing items', async () => {
      // Historical performance - was good
      mockQuery.mockResolvedValueOnce(
        mockResult<HistoricalRow>([
          { item_id: 'word-1', item_type: 'vocabulary', accuracy: '0.8', attempts: '10' },
        ])
      );
      // Current - worse now
      mockQuery.mockResolvedValueOnce(
        mockResult<VocabWeaknessRow>([createVocabRow('word-1', 'peor', 5, 10)]) // 50% now
      );
      mockQuery.mockResolvedValueOnce(mockResult<GrammarWeaknessRow>([]));

      const result = await service.trackImprovements('user-123', 'ES', 14);

      expect(result[0].status).toBe('regressing');
      expect(result[0].improvementPercentage).toBeLessThan(0);
    });

    it('should identify stagnant items', async () => {
      // Historical performance
      mockQuery.mockResolvedValueOnce(
        mockResult<HistoricalRow>([
          { item_id: 'word-1', item_type: 'vocabulary', accuracy: '0.55', attempts: '10' },
        ])
      );
      // Current - similar
      mockQuery.mockResolvedValueOnce(
        mockResult<VocabWeaknessRow>([createVocabRow('word-1', 'igual', 56, 100)]) // 56% now
      );
      mockQuery.mockResolvedValueOnce(mockResult<GrammarWeaknessRow>([]));

      const result = await service.trackImprovements('user-123', 'ES', 14);

      expect(result[0].status).toBe('stagnant');
    });

    it('should return empty when no historical data', async () => {
      mockQuery.mockResolvedValueOnce(mockResult<HistoricalRow>([]));
      mockQuery.mockResolvedValueOnce(mockResult<VocabWeaknessRow>([]));
      mockQuery.mockResolvedValueOnce(mockResult<GrammarWeaknessRow>([]));

      const result = await service.trackImprovements('user-123', 'ES', 14);

      expect(result).toHaveLength(0);
    });
  });

  describe('getWeaknessHeatmap', () => {
    it('should group weaknesses by CEFR level and category', async () => {
      const vocabRows: VocabWeaknessRow[] = [
        { ...createVocabRow('word-1', 'one', 3, 10), cefr_level: 'A1' },
        { ...createVocabRow('word-2', 'two', 4, 10), cefr_level: 'A1' },
      ];
      mockQuery.mockResolvedValueOnce(mockResult<VocabWeaknessRow>(vocabRows));

      const grammarRows: GrammarWeaknessRow[] = [
        { ...createGrammarRow('rule-1', 'Verbs', 45, 10, 5), cefr_level: 'A1', category: 'verbs' },
      ];
      mockQuery.mockResolvedValueOnce(mockResult<GrammarWeaknessRow>(grammarRows));

      const result = await service.getWeaknessHeatmap('user-123', 'ES');

      expect(result.length).toBeGreaterThan(0);
      // Should have cells for A1/vocabulary and A1/verbs
      const vocabCell = result.find((c) => c.category === 'vocabulary');
      const verbsCell = result.find((c) => c.category === 'verbs');
      expect(vocabCell?.weaknessCount).toBe(2);
      expect(verbsCell?.weaknessCount).toBe(1);
    });

    it('should calculate average severity per cell', async () => {
      mockQuery.mockResolvedValueOnce(
        mockResult<VocabWeaknessRow>([
          createVocabRow('word-1', 'one', 2, 10), // 20% accuracy - high severity
          createVocabRow('word-2', 'two', 5, 10), // 50% accuracy - medium severity
        ])
      );
      mockQuery.mockResolvedValueOnce(mockResult<GrammarWeaknessRow>([]));

      const result = await service.getWeaknessHeatmap('user-123', 'ES');

      const vocabCell = result.find((c) => c.category === 'vocabulary');
      expect(vocabCell?.avgSeverity).toBeGreaterThan(0);
    });

    it('should return empty array when no weaknesses', async () => {
      mockQuery.mockResolvedValueOnce(mockResult<VocabWeaknessRow>([]));
      mockQuery.mockResolvedValueOnce(mockResult<GrammarWeaknessRow>([]));

      const result = await service.getWeaknessHeatmap('user-123', 'ES');

      expect(result).toHaveLength(0);
    });
  });

  describe('severity score calculation', () => {
    it('should calculate higher severity for lower accuracy', async () => {
      mockQuery.mockResolvedValueOnce(
        mockResult<VocabWeaknessRow>([
          createVocabRow('word-1', 'low', 2, 10), // 20%
          createVocabRow('word-2', 'high', 6, 10), // 60%
        ])
      );
      mockQuery.mockResolvedValueOnce(mockResult<GrammarWeaknessRow>([]));

      const result = await service.analyzeWeaknesses('user-123', 'ES');

      // Lower accuracy should have higher severity
      expect(result.topWeaknesses[0].itemText).toBe('low');
      expect(result.topWeaknesses[0].severityScore).toBeGreaterThan(
        result.topWeaknesses[1].severityScore
      );
    });

    it('should calculate improvement potential based on accuracy gap', async () => {
      mockQuery.mockResolvedValueOnce(
        mockResult<VocabWeaknessRow>([
          createVocabRow('word-1', 'low', 2, 10), // 20% - high potential
          createVocabRow('word-2', 'medium', 5, 10), // 50% - medium potential
        ])
      );
      mockQuery.mockResolvedValueOnce(mockResult<GrammarWeaknessRow>([]));

      const result = await service.analyzeWeaknesses('user-123', 'ES');

      // Lower accuracy = higher improvement potential
      expect(result.topWeaknesses[0].improvementPotential).toBeGreaterThan(
        result.topWeaknesses[1].improvementPotential
      );
    });
  });
});
