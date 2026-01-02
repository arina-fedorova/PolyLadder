import { Pool } from 'pg';

const MASTERY_THRESHOLD = 0.8; // 80% accuracy required
const MIN_EXERCISES = 5; // Minimum exercises to complete

export class GrammarMasteryTrackerService {
  constructor(private readonly pool: Pool) {}

  /**
   * Check if user has mastered a grammar rule
   * Mastery = 80%+ accuracy on 5+ exercises in last 7 days
   */
  async checkMastery(userId: string, grammarRuleId: string): Promise<boolean> {
    interface MasteryRow {
      total_exercises: number | null;
      avg_accuracy: number | null;
    }

    const result = await this.pool.query<MasteryRow>(
      `SELECT
        COUNT(*) as total_exercises,
        AVG(CASE
          WHEN uer.correct THEN 1.0
          ELSE COALESCE((uer.user_answer::jsonb->>'partialCredit')::decimal, 0.0)
        END) as avg_accuracy
       FROM user_exercise_results uer
       JOIN grammar_exercises ge ON uer.exercise_id = ge.id
       WHERE uer.user_id = $1
         AND ge.grammar_rule_id = $2
         AND uer.submitted_at > NOW() - INTERVAL '7 days'
         AND uer.exercise_type = 'grammar'`,
      [userId, grammarRuleId]
    );

    const totalExercises = Number(result.rows[0]?.total_exercises) || 0;
    const avgAccuracy = Number(result.rows[0]?.avg_accuracy) || 0;

    return totalExercises >= MIN_EXERCISES && avgAccuracy >= MASTERY_THRESHOLD;
  }

  /**
   * Update curriculum progress if grammar rule mastered
   */
  async updateCurriculumProgress(
    userId: string,
    grammarRuleId: string,
    language: string
  ): Promise<void> {
    const hasMastery = await this.checkMastery(userId, grammarRuleId);

    if (hasMastery) {
      interface CategoryRow {
        category: string;
      }

      // Get grammar category for curriculum concept
      const categoryResult = await this.pool.query<CategoryRow>(
        `SELECT category
         FROM approved_rules
         WHERE id = $1`,
        [grammarRuleId]
      );

      if (categoryResult.rows.length === 0) return;

      const conceptId = `grammar_${categoryResult.rows[0].category}`;

      // Mark concept as completed
      await this.pool.query(
        `UPDATE user_concept_progress
         SET status = 'completed',
             completed_at = NOW(),
             progress_percentage = 100
         WHERE user_id = $1 AND concept_id = $2 AND language = $3
           AND status != 'completed'`,
        [userId, conceptId, language]
      );
    }
  }

  /**
   * Get mastery status for all grammar rules user has attempted
   */
  async getMasteryStatus(
    userId: string,
    language: string
  ): Promise<
    Array<{
      grammarRuleId: string;
      title: string;
      category: string;
      hasMastery: boolean;
      totalExercises: number;
      avgAccuracy: number;
    }>
  > {
    interface MasteryStatusRow {
      grammar_rule_id: string;
      title: string;
      category: string;
      total_exercises: number;
      avg_accuracy: number;
    }

    const result = await this.pool.query<MasteryStatusRow>(
      `SELECT
        ge.grammar_rule_id,
        ar.title,
        ar.category,
        COUNT(uer.id) as total_exercises,
        AVG(CASE
          WHEN uer.correct THEN 1.0
          ELSE COALESCE((uer.user_answer::jsonb->>'partialCredit')::decimal, 0.0)
        END) as avg_accuracy
       FROM grammar_exercises ge
       JOIN approved_rules ar ON ge.grammar_rule_id = ar.id
       JOIN user_exercise_results uer ON uer.exercise_id = ge.id
       WHERE uer.user_id = $1
         AND ar.language = $2
         AND uer.submitted_at > NOW() - INTERVAL '7 days'
         AND uer.exercise_type = 'grammar'
       GROUP BY ge.grammar_rule_id, ar.title, ar.category
       ORDER BY avg_accuracy DESC`,
      [userId, language]
    );

    return result.rows.map((row) => ({
      grammarRuleId: row.grammar_rule_id,
      title: row.title,
      category: row.category,
      hasMastery: row.total_exercises >= MIN_EXERCISES && row.avg_accuracy >= MASTERY_THRESHOLD,
      totalExercises: Number(row.total_exercises),
      avgAccuracy: Number(row.avg_accuracy),
    }));
  }
}
