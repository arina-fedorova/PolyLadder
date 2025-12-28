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

      let result;
      try {
        result = await client.query(
          `INSERT INTO curriculum_topics 
           (level_id, name, slug, description, content_type, sort_order, estimated_items)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (level_id, slug) DO NOTHING
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

        if (result.rows.length === 0) {
          const existing = await client.query(
            `SELECT * FROM curriculum_topics WHERE level_id = $1 AND slug = $2`,
            [input.levelId, slug]
          );
          if (existing.rows.length > 0) {
            result = existing;
          } else {
            throw new Error('Failed to create topic and topic does not exist');
          }
        }
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === '23505') {
          const existing = await client.query(
            `SELECT * FROM curriculum_topics WHERE level_id = $1 AND slug = $2`,
            [input.levelId, slug]
          );
          if (existing.rows.length > 0) {
            result = existing;
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }

      const topic = result.rows[0] as Record<string, unknown>;

      if (input.prerequisites && input.prerequisites.length > 0) {
        await this.validateNoCircularDeps(client, topic.id as string, input.prerequisites);

        for (const prereqId of input.prerequisites) {
          try {
            await client.query(
              `INSERT INTO topic_prerequisites (topic_id, prerequisite_id)
               VALUES ($1, $2)
               ON CONFLICT DO NOTHING`,
              [topic.id as string, prereqId]
            );
          } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === '23503') {
              throw new Error(`Prerequisite topic ${prereqId} does not exist`);
            }
            throw error;
          }
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
    if (topics.length === 0) {
      return 0;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const topicValues: unknown[][] = [];
      const slugs: string[] = [];

      for (const topic of topics) {
        const slug = this.generateSlug(topic.name);
        slugs.push(slug);
        topicValues.push([
          levelId,
          topic.name,
          slug,
          topic.description || null,
          topic.contentType,
          topic.sortOrder ?? 0,
          topic.estimatedItems ?? 0,
        ]);
      }

      const placeholders = topicValues
        .map(
          (_, idx) =>
            `($${idx * 7 + 1}, $${idx * 7 + 2}, $${idx * 7 + 3}, $${idx * 7 + 4}, $${idx * 7 + 5}, $${idx * 7 + 6}, $${idx * 7 + 7})`
        )
        .join(', ');

      const flatValues = topicValues.flat();

      const result = await client.query(
        `INSERT INTO curriculum_topics 
         (level_id, name, slug, description, content_type, sort_order, estimated_items)
         VALUES ${placeholders}
         RETURNING id, name, slug`,
        flatValues
      );

      const createdTopics = result.rows as Array<{ id: string; name: string; slug: string }>;

      for (let i = 0; i < topics.length; i++) {
        const topic = topics[i];
        const createdTopic = createdTopics[i];

        if (topic.prerequisites && topic.prerequisites.length > 0 && createdTopic) {
          await this.validateNoCircularDeps(client, createdTopic.id, topic.prerequisites);

          const prereqPlaceholders = topic.prerequisites
            .map((_, idx) => `($1, $${idx + 2})`)
            .join(', ');
          const prereqValues = [createdTopic.id, ...topic.prerequisites];

          await client.query(
            `INSERT INTO topic_prerequisites (topic_id, prerequisite_id)
             VALUES ${prereqPlaceholders}`,
            prereqValues
          );
        }
      }

      await client.query('COMMIT');
      return createdTopics.length;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ levelId, topicCount: topics.length, error }, 'Failed to bulk import topics');
      throw error;
    } finally {
      client.release();
    }
  }

  async bulkCreateTopics(topics: CreateTopicInput[]): Promise<{
    created: CurriculumTopic[];
    errors: Array<{ index: number; name: string; error: string }>;
  }> {
    const created: CurriculumTopic[] = [];
    const errors: Array<{ index: number; name: string; error: string }> = [];

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const topicValues: unknown[][] = [];
      const topicIndices: number[] = [];

      for (let i = 0; i < topics.length; i++) {
        const topic = topics[i];
        try {
          const slug = this.generateSlug(topic.name);
          topicValues.push([
            topic.levelId,
            topic.name,
            slug,
            topic.description || null,
            topic.contentType,
            topic.sortOrder ?? 0,
            topic.estimatedItems ?? 0,
          ]);
          topicIndices.push(i);
        } catch (error) {
          errors.push({
            index: i,
            name: topic.name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (topicValues.length === 0) {
        await client.query('ROLLBACK');
        return { created, errors };
      }

      const placeholders = topicValues
        .map(
          (_, idx) =>
            `($${idx * 7 + 1}, $${idx * 7 + 2}, $${idx * 7 + 3}, $${idx * 7 + 4}, $${idx * 7 + 5}, $${idx * 7 + 6}, $${idx * 7 + 7})`
        )
        .join(', ');

      const flatValues = topicValues.flat();

      let insertedTopics: Array<{ id: string; [key: string]: unknown }> = [];
      const newTopicIndices: number[] = [];

      try {
        const result = await client.query(
          `INSERT INTO curriculum_topics 
           (level_id, name, slug, description, content_type, sort_order, estimated_items)
           VALUES ${placeholders}
           RETURNING *`,
          flatValues
        );
        insertedTopics = result.rows as Array<{ id: string; [key: string]: unknown }>;
        newTopicIndices.push(...topicIndices);
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === '23505') {
          for (let i = 0; i < topicValues.length; i++) {
            const originalIndex = topicIndices[i];
            const topic = topics[originalIndex];
            try {
              const slug = this.generateSlug(topic.name);
              const result = await client.query(
                `INSERT INTO curriculum_topics 
                 (level_id, name, slug, description, content_type, sort_order, estimated_items)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (level_id, slug) DO NOTHING
                 RETURNING *`,
                [
                  topic.levelId,
                  topic.name,
                  slug,
                  topic.description || null,
                  topic.contentType,
                  topic.sortOrder ?? 0,
                  topic.estimatedItems ?? 0,
                ]
              );
              if (result.rows.length > 0) {
                insertedTopics.push(result.rows[0] as { id: string; [key: string]: unknown });
                newTopicIndices.push(originalIndex);
              } else {
                errors.push({
                  index: originalIndex,
                  name: topic.name,
                  error: 'Topic with this name already exists in this level',
                });
              }
            } catch (insertError) {
              errors.push({
                index: originalIndex,
                name: topic.name,
                error: insertError instanceof Error ? insertError.message : String(insertError),
              });
            }
          }
        } else {
          throw error;
        }
      }

      const finalTopicIndices = newTopicIndices.length > 0 ? newTopicIndices : topicIndices;

      const topicPrerequisitesMap = new Map<string, string[]>();

      if (insertedTopics.length > 0) {
        const allPrereqIds = new Set<string>();
        const topicPrereqMap = new Map<number, string[]>();

        for (let i = 0; i < insertedTopics.length; i++) {
          const originalIndex = finalTopicIndices[i];
          const topic = topics[originalIndex];
          if (topic.prerequisites && topic.prerequisites.length > 0) {
            topicPrereqMap.set(i, topic.prerequisites);
            for (const prereqId of topic.prerequisites) {
              allPrereqIds.add(prereqId);
            }
          }
        }

        if (allPrereqIds.size > 0) {
          const existingPrereqIds = await client.query<{ id: string }>(
            `SELECT id FROM curriculum_topics WHERE id = ANY($1::uuid[])`,
            [Array.from(allPrereqIds)]
          );
          const existingIdsSet = new Set(existingPrereqIds.rows.map((r) => String(r.id)));
          const invalidPrereqIds = Array.from(allPrereqIds).filter(
            (id) => !existingIdsSet.has(String(id))
          );

          for (let i = 0; i < insertedTopics.length; i++) {
            const insertedTopic = insertedTopics[i];
            const originalIndex = finalTopicIndices[i];
            const prereqIds = topicPrereqMap.get(i);

            if (prereqIds && prereqIds.length > 0) {
              const invalidPrereqs = prereqIds.filter((id) => invalidPrereqIds.includes(id));
              if (invalidPrereqs.length > 0) {
                errors.push({
                  index: originalIndex,
                  name: topics[originalIndex].name,
                  error: 'Prerequisite topic does not exist',
                });
                continue;
              }

              const validPrereqs = prereqIds.filter((id) => !invalidPrereqIds.includes(id));
              if (validPrereqs.length > 0) {
                try {
                  await this.validateNoCircularDeps(client, insertedTopic.id, validPrereqs);
                  topicPrerequisitesMap.set(insertedTopic.id, validPrereqs);
                } catch (error) {
                  errors.push({
                    index: originalIndex,
                    name: topics[originalIndex].name,
                    error: error instanceof Error ? error.message : String(error),
                  });
                }
              }
            }
          }
        }
      }

      if (topicPrerequisitesMap.size > 0) {
        const prereqValues: unknown[] = [];
        const prereqPlaceholders: string[] = [];
        let paramIndex = 1;

        for (const [topicId, prereqIds] of topicPrerequisitesMap.entries()) {
          for (const prereqId of prereqIds) {
            prereqPlaceholders.push(`($${paramIndex}, $${paramIndex + 1})`);
            prereqValues.push(topicId, prereqId);
            paramIndex += 2;
          }
        }

        if (prereqPlaceholders.length > 0) {
          try {
            await client.query(
              `INSERT INTO topic_prerequisites (topic_id, prerequisite_id)
               VALUES ${prereqPlaceholders.join(', ')}`,
              prereqValues
            );
          } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === '23503') {
              const failedPrereqIds = new Set<string>();
              for (let i = 1; i < prereqValues.length; i += 2) {
                failedPrereqIds.add(String(prereqValues[i]));
              }
              const failedTopicIds = new Set<string>();
              for (let i = 0; i < prereqValues.length; i += 2) {
                const topicId = String(prereqValues[i]);
                const prereqId = String(prereqValues[i + 1]);
                if (failedPrereqIds.has(prereqId)) {
                  failedTopicIds.add(topicId);
                }
              }
              for (let i = 0; i < insertedTopics.length; i++) {
                const insertedTopic = insertedTopics[i];
                if (failedTopicIds.has(String(insertedTopic.id))) {
                  const originalIndex = finalTopicIndices[i];
                  const existingError = errors.find((e) => e.index === originalIndex);
                  if (!existingError) {
                    errors.push({
                      index: originalIndex,
                      name: topics[originalIndex].name,
                      error: 'Prerequisite topic does not exist',
                    });
                  }
                }
              }
            } else {
              throw error;
            }
          }
        }
      }

      const topicIds = insertedTopics.map((t) => t.id);
      if (topicIds.length > 0) {
        const topicsWithPrereqs = await client.query(
          `SELECT t.*, 
                  COALESCE(
                    (SELECT array_agg(prerequisite_id) 
                     FROM topic_prerequisites 
                     WHERE topic_id = t.id), 
                    '{}'
                  ) as prerequisites
           FROM curriculum_topics t
           WHERE t.id = ANY($1::uuid[])`,
          [topicIds]
        );

        for (const row of topicsWithPrereqs.rows) {
          created.push(this.mapTopicRow(row as Record<string, unknown>));
        }
      }

      await client.query('COMMIT');
      return { created, errors };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ topicCount: topics.length, error }, 'Failed to bulk create topics');
      throw error;
    } finally {
      client.release();
    }
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
    let prerequisites: string[] = [];
    if (row.prerequisites) {
      if (Array.isArray(row.prerequisites)) {
        prerequisites = row.prerequisites as unknown[] as string[];
      } else if (typeof row.prerequisites === 'string') {
        try {
          const parsed = JSON.parse(row.prerequisites) as unknown;
          prerequisites = Array.isArray(parsed) ? (parsed as string[]) : [];
        } catch {
          prerequisites = [];
        }
      }
    }

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
      prerequisites,
    };
  }
}
