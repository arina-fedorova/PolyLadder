import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

export interface CurriculumLevel {
  id: string;
  language: string;
  cefrLevel: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

export interface CurriculumTopic {
  id: string;
  levelId: string;
  name: string;
  slug: string;
  description: string | null;
  contentType: 'vocabulary' | 'grammar' | 'orthography' | 'mixed';
  sortOrder: number;
  estimatedItems: number;
  metadata: Record<string, unknown>;
  prerequisites: string[];
}

export interface CreateTopicInput {
  levelId: string;
  name: string;
  description?: string;
  contentType: 'vocabulary' | 'grammar' | 'orthography' | 'mixed';
  sortOrder?: number;
  estimatedItems?: number;
  prerequisites?: string[];
}

export class CurriculumService {
  constructor(private readonly pool: Pool) {}

  async getLevelsByLanguage(language: string): Promise<CurriculumLevel[]> {
    const result = await this.pool.query(
      `SELECT id, language, cefr_level, name, description, sort_order
       FROM curriculum_levels
       WHERE language = $1
       ORDER BY sort_order`,
      [language]
    );
    return result.rows.map((row) => this.mapLevelRow(row as Record<string, unknown>));
  }

  async getTopicsByLevel(levelId: string): Promise<CurriculumTopic[]> {
    const result = await this.pool.query(
      `SELECT t.*, 
              COALESCE(
                (SELECT array_agg(prerequisite_id) 
                 FROM topic_prerequisites 
                 WHERE topic_id = t.id), 
                '{}'
              ) as prerequisites
       FROM curriculum_topics t
       WHERE t.level_id = $1
       ORDER BY t.sort_order`,
      [levelId]
    );
    return result.rows.map((row) => this.mapTopicRow(row as Record<string, unknown>));
  }

  async getTopicById(id: string): Promise<CurriculumTopic> {
    const result = await this.pool.query(
      `SELECT t.*, 
              COALESCE(
                (SELECT array_agg(prerequisite_id) 
                 FROM topic_prerequisites 
                 WHERE topic_id = t.id), 
                '{}'
              ) as prerequisites
       FROM curriculum_topics t
       WHERE t.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Topic not found: ${id}`);
    }

    return this.mapTopicRow(result.rows[0] as Record<string, unknown>);
  }

  async createTopic(input: CreateTopicInput): Promise<CurriculumTopic> {
    const slug = this.generateSlug(input.name);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO curriculum_topics 
         (level_id, name, slug, description, content_type, sort_order, estimated_items)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          input.levelId,
          input.name,
          slug,
          input.description || null,
          input.contentType,
          input.sortOrder || 0,
          input.estimatedItems || 0,
        ]
      );

      const topic = result.rows[0] as Record<string, unknown>;

      if (input.prerequisites && input.prerequisites.length > 0) {
        await this.validateNoCircularDeps(client, topic.id as string, input.prerequisites);

        for (const prereqId of input.prerequisites) {
          await client.query(
            `INSERT INTO topic_prerequisites (topic_id, prerequisite_id)
             VALUES ($1, $2)`,
            [topic.id as string, prereqId]
          );
        }
      }

      await client.query('COMMIT');
      return this.mapTopicRow({
        ...topic,
        prerequisites: input.prerequisites || [],
      } as Record<string, unknown>);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateTopic(id: string, updates: Partial<CreateTopicInput>): Promise<CurriculumTopic> {
    const setClause: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClause.push(`name = $${paramIndex++}`);
      values.push(updates.name);
      setClause.push(`slug = $${paramIndex++}`);
      values.push(this.generateSlug(updates.name));
    }
    if (updates.description !== undefined) {
      setClause.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.contentType !== undefined) {
      setClause.push(`content_type = $${paramIndex++}`);
      values.push(updates.contentType);
    }
    if (updates.sortOrder !== undefined) {
      setClause.push(`sort_order = $${paramIndex++}`);
      values.push(updates.sortOrder);
    }
    if (updates.estimatedItems !== undefined) {
      setClause.push(`estimated_items = $${paramIndex++}`);
      values.push(updates.estimatedItems);
    }

    setClause.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    await this.pool.query(
      `UPDATE curriculum_topics 
       SET ${setClause.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (updates.prerequisites !== undefined) {
      await this.pool.query(`DELETE FROM topic_prerequisites WHERE topic_id = $1`, [id]);

      if (updates.prerequisites.length > 0) {
        for (const prereqId of updates.prerequisites) {
          await this.pool.query(
            `INSERT INTO topic_prerequisites (topic_id, prerequisite_id)
             VALUES ($1, $2)`,
            [id, prereqId]
          );
        }
      }
    }

    return this.getTopicById(id);
  }

  async deleteTopic(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM curriculum_topics WHERE id = $1`, [id]);
  }

  async reorderTopics(levelId: string, topicIds: string[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < topicIds.length; i++) {
        await client.query(
          `UPDATE curriculum_topics SET sort_order = $1 WHERE id = $2 AND level_id = $3`,
          [i, topicIds[i], levelId]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async importTopicsFromJSON(levelId: string, topics: CreateTopicInput[]): Promise<number> {
    let imported = 0;

    for (const topic of topics) {
      try {
        await this.createTopic({ ...topic, levelId });
        imported++;
      } catch (error) {
        logger.error({ topicName: topic.name, error }, 'Failed to import topic');
      }
    }

    return imported;
  }

  private async validateNoCircularDeps(
    client: PoolClient,
    topicId: string,
    newPrereqs: string[]
  ): Promise<void> {
    for (const prereqId of newPrereqs) {
      const result = await client.query(
        `WITH RECURSIVE prereq_chain AS (
           SELECT prerequisite_id FROM topic_prerequisites WHERE topic_id = $1
           UNION
           SELECT tp.prerequisite_id 
           FROM topic_prerequisites tp
           JOIN prereq_chain pc ON tp.topic_id = pc.prerequisite_id
         )
         SELECT 1 FROM prereq_chain WHERE prerequisite_id = $2`,
        [prereqId, topicId]
      );

      if (result.rows.length > 0) {
        throw new Error(
          `Circular dependency detected: adding ${prereqId} as prerequisite would create a cycle`
        );
      }
    }
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private mapLevelRow(row: Record<string, unknown>): CurriculumLevel {
    return {
      id: row.id as string,
      language: row.language as string,
      cefrLevel: row.cefr_level as string,
      name: row.name as string,
      description: (row.description as string) || null,
      sortOrder: row.sort_order as number,
    };
  }

  private mapTopicRow(row: Record<string, unknown>): CurriculumTopic {
    return {
      id: row.id as string,
      levelId: row.level_id as string,
      name: row.name as string,
      slug: row.slug as string,
      description: (row.description as string) || null,
      contentType: row.content_type as 'vocabulary' | 'grammar' | 'orthography' | 'mixed',
      sortOrder: row.sort_order as number,
      estimatedItems: row.estimated_items as number,
      metadata: (row.metadata as Record<string, unknown>) || {},
      prerequisites: (row.prerequisites as string[]) || [],
    };
  }
}
