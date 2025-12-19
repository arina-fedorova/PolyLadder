import { Pool } from 'pg';

type Language = 'EN' | 'ES' | 'IT' | 'PT' | 'SL';
type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export enum ContentType {
  ORTHOGRAPHY = 'orthography',
  MEANING = 'meaning',
  UTTERANCE = 'utterance',
  GRAMMAR_RULE = 'grammar',
  EXERCISE = 'exercise',
}

export enum WorkPriority {
  CRITICAL = 1,
  HIGH = 2,
  MEDIUM = 3,
  LOW = 4,
}

export interface WorkItem {
  id: string;
  type: ContentType;
  language: Language;
  level: CEFRLevel;
  priority: WorkPriority;
  metadata: Record<string, unknown>;
}

export interface ContentTargets {
  meaningsPerLevel: number;
  utterancesPerMeaning: number;
  grammarRulesPerLevel: number;
  exercisesPerLevel: number;
}

export interface WorkPlannerRepository {
  markWorkInProgress(workId: string): Promise<void>;
  isWorkInProgress(workId: string): Promise<boolean>;
  markWorkComplete(workId: string): Promise<void>;
  cleanupStaleWork(maxAgeHours: number): Promise<number>;
}

export const DEFAULT_TARGETS: ContentTargets = {
  meaningsPerLevel: 100,
  utterancesPerMeaning: 3,
  grammarRulesPerLevel: 20,
  exercisesPerLevel: 50,
};

export const SUPPORTED_LANGUAGES: Language[] = ['EN', 'ES', 'IT', 'PT', 'SL'];

export class WorkPlanner {
  protected repository: WorkPlannerRepository;

  constructor(repository: WorkPlannerRepository) {
    this.repository = repository;
  }

  async getNextWork(): Promise<WorkItem | null> {
    const work = await this.findNextWork();

    if (!work) {
      return null;
    }

    if (await this.repository.isWorkInProgress(work.id)) {
      return null;
    }

    await this.repository.markWorkInProgress(work.id);
    return work;
  }

  async markWorkComplete(workId: string): Promise<void> {
    await this.repository.markWorkComplete(workId);
  }

  protected findNextWork(): Promise<WorkItem | null> {
    return Promise.resolve(null);
  }
}

interface OrthographyGap {
  language: Language;
  reason: string;
}

interface MeaningGap {
  language: Language;
  level: CEFRLevel;
  currentCount: number;
  targetCount: number;
}

interface UtteranceGap {
  meaningId: string;
  language: Language;
  level: CEFRLevel;
  currentUtterances: number;
  targetUtterances: number;
}

interface GrammarGap {
  language: Language;
  level: CEFRLevel;
  category: string;
  currentCount: number;
  targetCount: number;
}

interface ExerciseGap {
  language: Language;
  level: CEFRLevel;
  currentCount: number;
  targetCount: number;
}

export interface GapAnalysisRepository {
  findOrthographyGaps(): Promise<OrthographyGap | null>;
  findMeaningGaps(target: number): Promise<MeaningGap | null>;
  findUtteranceGaps(targetPerMeaning: number): Promise<UtteranceGap | null>;
  findGrammarGaps(target: number): Promise<GrammarGap | null>;
  findExerciseGaps(languages: Language[], target: number): Promise<ExerciseGap | null>;
}

export class WorkPlannerWithGapAnalysis extends WorkPlanner {
  private gapRepository: GapAnalysisRepository;
  private contentTargets: ContentTargets;

  constructor(
    workRepository: WorkPlannerRepository,
    gapRepository: GapAnalysisRepository,
    targets?: Partial<ContentTargets>
  ) {
    super(workRepository);
    this.gapRepository = gapRepository;
    this.contentTargets = { ...DEFAULT_TARGETS, ...targets };
  }

  override async getNextWork(): Promise<WorkItem | null> {
    const orthographyGap = await this.gapRepository.findOrthographyGaps();
    if (orthographyGap) {
      return this.createWorkItem(
        `ortho_${orthographyGap.language}`,
        ContentType.ORTHOGRAPHY,
        orthographyGap.language,
        'A1',
        WorkPriority.CRITICAL,
        { ...orthographyGap }
      );
    }

    const meaningGap = await this.gapRepository.findMeaningGaps(
      this.contentTargets.meaningsPerLevel
    );
    if (meaningGap) {
      return this.createWorkItem(
        `meaning_${meaningGap.language}_${meaningGap.level}`,
        ContentType.MEANING,
        meaningGap.language,
        meaningGap.level,
        WorkPriority.HIGH,
        { ...meaningGap }
      );
    }

    const utteranceGap = await this.gapRepository.findUtteranceGaps(
      this.contentTargets.utterancesPerMeaning
    );
    if (utteranceGap) {
      return this.createWorkItem(
        `utterance_${utteranceGap.meaningId}`,
        ContentType.UTTERANCE,
        utteranceGap.language,
        utteranceGap.level,
        WorkPriority.MEDIUM,
        { ...utteranceGap }
      );
    }

    const grammarGap = await this.gapRepository.findGrammarGaps(
      this.contentTargets.grammarRulesPerLevel
    );
    if (grammarGap) {
      return this.createWorkItem(
        `grammar_${grammarGap.language}_${grammarGap.level}_${grammarGap.category}`,
        ContentType.GRAMMAR_RULE,
        grammarGap.language,
        grammarGap.level,
        WorkPriority.MEDIUM,
        { ...grammarGap }
      );
    }

    const exerciseGap = await this.gapRepository.findExerciseGaps(
      SUPPORTED_LANGUAGES,
      this.contentTargets.exercisesPerLevel
    );
    if (exerciseGap) {
      return this.createWorkItem(
        `exercise_${exerciseGap.language}_${exerciseGap.level}`,
        ContentType.EXERCISE,
        exerciseGap.language,
        exerciseGap.level,
        WorkPriority.LOW,
        { ...exerciseGap }
      );
    }

    return null;
  }

  private createWorkItem(
    id: string,
    type: ContentType,
    language: Language,
    level: CEFRLevel,
    priority: WorkPriority,
    metadata: Record<string, unknown>
  ): WorkItem {
    return { id, type, language, level, priority, metadata };
  }
}

export function createWorkPlannerRepository(pool: Pool): WorkPlannerRepository {
  return {
    async markWorkInProgress(workId: string): Promise<void> {
      await pool.query(
        `INSERT INTO work_in_progress (work_id, started_at)
         VALUES ($1, CURRENT_TIMESTAMP)
         ON CONFLICT (work_id) DO NOTHING`,
        [workId]
      );
    },

    async isWorkInProgress(workId: string): Promise<boolean> {
      const result = await pool.query(
        `SELECT 1 FROM work_in_progress
         WHERE work_id = $1
           AND started_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'`,
        [workId]
      );
      return result.rows.length > 0;
    },

    async markWorkComplete(workId: string): Promise<void> {
      await pool.query('DELETE FROM work_in_progress WHERE work_id = $1', [workId]);
    },

    async cleanupStaleWork(maxAgeHours: number): Promise<number> {
      const result = await pool.query(
        `DELETE FROM work_in_progress
         WHERE started_at < CURRENT_TIMESTAMP - INTERVAL '${maxAgeHours} hours'
         RETURNING work_id`
      );
      return result.rowCount ?? 0;
    },
  };
}

export function createGapAnalysisRepository(pool: Pool): GapAnalysisRepository {
  return {
    async findOrthographyGaps(): Promise<OrthographyGap | null> {
      const result = await pool.query<{ language: string }>(
        `SELECT unnest($1::text[]) AS language
         EXCEPT
         SELECT DISTINCT language FROM approved_curriculum_lessons
         WHERE lesson_type = 'orthography'
         LIMIT 1`,
        [SUPPORTED_LANGUAGES]
      );

      if (result.rows.length > 0) {
        return {
          language: result.rows[0].language as Language,
          reason: 'No orthography content exists for this language',
        };
      }
      return null;
    },

    async findMeaningGaps(target: number): Promise<MeaningGap | null> {
      const result = await pool.query<{ language: string; level: string; count: string }>(
        `WITH expected AS (
           SELECT unnest($1::text[]) AS language,
                  unnest(ARRAY['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) AS level
         ),
         actual AS (
           SELECT language, level, COUNT(*) as count
           FROM approved_meanings
           GROUP BY language, level
         )
         SELECT e.language, e.level, COALESCE(a.count, 0)::text as count
         FROM expected e
         LEFT JOIN actual a ON e.language = a.language AND e.level = a.level
         WHERE COALESCE(a.count, 0) < $2
         ORDER BY
           CASE e.level
             WHEN 'A1' THEN 1 WHEN 'A2' THEN 2
             WHEN 'B1' THEN 3 WHEN 'B2' THEN 4
             WHEN 'C1' THEN 5 WHEN 'C2' THEN 6
           END,
           COALESCE(a.count, 0) ASC
         LIMIT 1`,
        [SUPPORTED_LANGUAGES, target]
      );

      if (result.rows.length > 0) {
        return {
          language: result.rows[0].language as Language,
          level: result.rows[0].level as CEFRLevel,
          currentCount: parseInt(result.rows[0].count, 10),
          targetCount: target,
        };
      }
      return null;
    },

    async findUtteranceGaps(targetPerMeaning: number): Promise<UtteranceGap | null> {
      const result = await pool.query<{
        meaning_id: string;
        language: string;
        level: string;
        utterance_count: string;
      }>(
        `SELECT m.id as meaning_id, m.language, m.level, COUNT(u.id)::text as utterance_count
         FROM approved_meanings m
         LEFT JOIN approved_utterances u ON u.meaning_id = m.id
         GROUP BY m.id, m.language, m.level
         HAVING COUNT(u.id) < $1
         ORDER BY
           CASE m.level
             WHEN 'A1' THEN 1 WHEN 'A2' THEN 2
             WHEN 'B1' THEN 3 WHEN 'B2' THEN 4
             WHEN 'C1' THEN 5 WHEN 'C2' THEN 6
           END,
           COUNT(u.id) ASC
         LIMIT 1`,
        [targetPerMeaning]
      );

      if (result.rows.length > 0) {
        return {
          meaningId: result.rows[0].meaning_id,
          language: result.rows[0].language as Language,
          level: result.rows[0].level as CEFRLevel,
          currentUtterances: parseInt(result.rows[0].utterance_count, 10),
          targetUtterances: targetPerMeaning,
        };
      }
      return null;
    },

    async findGrammarGaps(target: number): Promise<GrammarGap | null> {
      const result = await pool.query<{ language: string; level: string; count: string }>(
        `WITH expected AS (
           SELECT unnest($1::text[]) AS language,
                  unnest(ARRAY['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) AS level
         ),
         actual AS (
           SELECT language, level, COUNT(*) as count
           FROM approved_grammar_rules
           GROUP BY language, level
         )
         SELECT e.language, e.level, COALESCE(a.count, 0)::text as count
         FROM expected e
         LEFT JOIN actual a ON e.language = a.language AND e.level = a.level
         WHERE COALESCE(a.count, 0) < $2
         ORDER BY
           CASE e.level
             WHEN 'A1' THEN 1 WHEN 'A2' THEN 2
             WHEN 'B1' THEN 3 WHEN 'B2' THEN 4
             WHEN 'C1' THEN 5 WHEN 'C2' THEN 6
           END,
           COALESCE(a.count, 0) ASC
         LIMIT 1`,
        [SUPPORTED_LANGUAGES, target]
      );

      if (result.rows.length > 0) {
        return {
          language: result.rows[0].language as Language,
          level: result.rows[0].level as CEFRLevel,
          category: 'general',
          currentCount: parseInt(result.rows[0].count, 10),
          targetCount: target,
        };
      }
      return null;
    },

    async findExerciseGaps(languages: Language[], target: number): Promise<ExerciseGap | null> {
      const result = await pool.query<{ language: string; level: string; count: string }>(
        `WITH expected AS (
           SELECT unnest($1::text[]) AS language,
                  unnest(ARRAY['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) AS level
         ),
         actual AS (
           SELECT language, level, COUNT(*) as count
           FROM approved_exercises
           WHERE language = ANY($1)
           GROUP BY language, level
         )
         SELECT e.language, e.level, COALESCE(a.count, 0)::text as count
         FROM expected e
         LEFT JOIN actual a ON e.language = a.language AND e.level = a.level
         WHERE COALESCE(a.count, 0) < $2
         ORDER BY
           CASE e.level
             WHEN 'A1' THEN 1 WHEN 'A2' THEN 2
             WHEN 'B1' THEN 3 WHEN 'B2' THEN 4
             WHEN 'C1' THEN 5 WHEN 'C2' THEN 6
           END,
           COALESCE(a.count, 0) ASC
         LIMIT 1`,
        [languages, target]
      );

      if (result.rows.length > 0) {
        return {
          language: result.rows[0].language as Language,
          level: result.rows[0].level as CEFRLevel,
          currentCount: parseInt(result.rows[0].count, 10),
          targetCount: target,
        };
      }
      return null;
    },
  };
}
