import { Pool } from 'pg';

type Language = string;
type CEFRLevel = 'A0' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface CurriculumNode {
  conceptId: string;
  language: string;
  cefrLevel: CEFRLevel;
  conceptType: 'orthography' | 'vocabulary' | 'grammar' | 'pronunciation';
  title: string;
  description: string | null;
  estimatedDurationMinutes: number | null;
  priorityOrder: number;
  isOptional: boolean;
  prerequisitesAnd: string[];
  prerequisitesOr: string[];
}

export interface UserConceptStatus {
  conceptId: string;
  status: 'locked' | 'unlocked' | 'in_progress' | 'completed';
  progressPercentage: number;
}

export class CurriculumGraphService {
  private graphCache = new Map<string, CurriculumNode[]>();

  constructor(private readonly pool: Pool) {}

  async getGraphForLanguage(language: Language): Promise<CurriculumNode[]> {
    const cacheKey = language;
    if (this.graphCache.has(cacheKey)) {
      return this.graphCache.get(cacheKey)!;
    }

    const result = await this.pool.query<CurriculumNode>(
      `SELECT
        concept_id as "conceptId",
        language,
        cefr_level as "cefrLevel",
        concept_type as "conceptType",
        title,
        description,
        estimated_duration_minutes as "estimatedDurationMinutes",
        priority_order as "priorityOrder",
        is_optional as "isOptional",
        prerequisites_and as "prerequisitesAnd",
        prerequisites_or as "prerequisitesOr"
       FROM curriculum_graph
       WHERE language = $1
       ORDER BY priority_order ASC`,
      [language]
    );

    const nodes: CurriculumNode[] = result.rows;
    this.graphCache.set(cacheKey, nodes);
    return nodes;
  }

  clearCache(language?: Language): void {
    if (language) {
      this.graphCache.delete(language);
    } else {
      this.graphCache.clear();
    }
  }

  async getCompletedConcepts(userId: string, language: Language): Promise<Set<string>> {
    const result = await this.pool.query<{ conceptId: string }>(
      `SELECT concept_id as "conceptId"
       FROM user_concept_progress
       WHERE user_id = $1 AND language = $2 AND status = 'completed'`,
      [userId, language]
    );

    return new Set(result.rows.map((r) => r.conceptId));
  }

  private checkAndPrerequisites(
    prerequisitesAnd: string[],
    completedConcepts: Set<string>
  ): boolean {
    if (prerequisitesAnd.length === 0) return true;
    return prerequisitesAnd.every((prereq) => completedConcepts.has(prereq));
  }

  private checkOrPrerequisites(prerequisitesOr: string[], completedConcepts: Set<string>): boolean {
    if (prerequisitesOr.length === 0) return true;
    return prerequisitesOr.some((prereq) => completedConcepts.has(prereq));
  }

  isConceptUnlocked(concept: CurriculumNode, completedConcepts: Set<string>): boolean {
    const andSatisfied = this.checkAndPrerequisites(concept.prerequisitesAnd, completedConcepts);
    const orSatisfied = this.checkOrPrerequisites(concept.prerequisitesOr, completedConcepts);

    return andSatisfied && orSatisfied;
  }

  async getAvailableConcepts(userId: string, language: Language): Promise<CurriculumNode[]> {
    const graph = await this.getGraphForLanguage(language);
    const completedConcepts = await this.getCompletedConcepts(userId, language);

    const available = graph.filter((concept) => {
      if (completedConcepts.has(concept.conceptId)) return false;

      return this.isConceptUnlocked(concept, completedConcepts);
    });

    return available.sort((a, b) => a.priorityOrder - b.priorityOrder);
  }

  async getNextConcept(userId: string, language: Language): Promise<CurriculumNode | null> {
    const available = await this.getAvailableConcepts(userId, language);

    if (available.length === 0) return null;

    return available[0];
  }

  async getTopologicalOrder(language: Language): Promise<string[]> {
    const graph = await this.getGraphForLanguage(language);

    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();

    graph.forEach((node) => {
      inDegree.set(node.conceptId, 0);
      adjacencyList.set(node.conceptId, []);
    });

    graph.forEach((node) => {
      const allPrereqs = [...node.prerequisitesAnd, ...node.prerequisitesOr];
      allPrereqs.forEach((prereq) => {
        adjacencyList.get(prereq)?.push(node.conceptId);
        inDegree.set(node.conceptId, (inDegree.get(node.conceptId) || 0) + 1);
      });
    });

    const queue: string[] = [];
    const result: string[] = [];

    inDegree.forEach((degree, conceptId) => {
      if (degree === 0) queue.push(conceptId);
    });

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      adjacencyList.get(current)?.forEach((neighbor) => {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      });
    }

    if (result.length !== graph.length) {
      throw new Error(`Circular dependency detected in curriculum graph for language: ${language}`);
    }

    return result;
  }

  async initializeUserProgress(userId: string, language: Language): Promise<void> {
    const graph = await this.getGraphForLanguage(language);

    const values = graph
      .map((_, idx) => `($1, $${idx * 2 + 2}, $${idx * 2 + 3}, 'locked', 0)`)
      .join(', ');
    const params = [userId, ...graph.flatMap((n) => [n.conceptId, n.language])];

    await this.pool.query(
      `INSERT INTO user_concept_progress (user_id, concept_id, language, status, progress_percentage)
       VALUES ${values}
       ON CONFLICT (user_id, concept_id, language) DO NOTHING`,
      params
    );

    await this.unlockAvailableConcepts(userId, language);
  }

  async unlockAvailableConcepts(userId: string, language: Language): Promise<string[]> {
    const graph = await this.getGraphForLanguage(language);
    const completedConcepts = await this.getCompletedConcepts(userId, language);

    const toUnlock: string[] = [];

    for (const concept of graph) {
      const statusResult = await this.pool.query<{ status: string }>(
        `SELECT status FROM user_concept_progress
         WHERE user_id = $1 AND concept_id = $2 AND language = $3`,
        [userId, concept.conceptId, language]
      );

      const currentStatus = statusResult.rows[0]?.status;
      if (currentStatus !== 'locked') continue;

      if (this.isConceptUnlocked(concept, completedConcepts)) {
        toUnlock.push(concept.conceptId);
      }
    }

    if (toUnlock.length > 0) {
      await this.pool.query(
        `UPDATE user_concept_progress
         SET status = 'unlocked'
         WHERE user_id = $1 AND language = $2 AND concept_id = ANY($3::varchar[])`,
        [userId, language, toUnlock]
      );
    }

    return toUnlock;
  }
}
