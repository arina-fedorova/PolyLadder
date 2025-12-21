# F014: Curriculum Structure Management

**Feature Code**: F014
**Created**: 2025-12-21
**Phase**: 4 - Content Refinement Service
**Status**: ✅ Completed
**PR**: https://github.com/arina-fedorova/PolyLadder/pull/33
**Replaces**: F014-service-loop-architecture (deprecated)

---

## Description

Operator-defined curriculum structure that organizes learning content by topics, levels, and prerequisites. Instead of auto-generating random content, the system follows a structured curriculum defined by operators.

## Success Criteria

- [ ] CEFR levels (A0-C2) seeded in database for each language
- [ ] Operator UI to define topics per level
- [ ] Topics have: name, description, order, prerequisites
- [ ] Prerequisites validation (no circular dependencies)
- [ ] Bulk import topics from JSON/CSV templates
- [ ] Per-language topic libraries maintained

---

## Tasks

### Task 1: Database Schema for Curriculum

**Description**: Create tables to store curriculum levels and topics.

**Implementation Plan**:

Create `packages/db/migrations/014-curriculum-structure.sql`:

```sql
CREATE TABLE curriculum_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language language_enum NOT NULL,
  cefr_level cefr_level_enum NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(language, cefr_level)
);

CREATE INDEX idx_curriculum_levels_language ON curriculum_levels(language);

CREATE TABLE curriculum_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level_id UUID NOT NULL REFERENCES curriculum_levels(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  description TEXT,
  content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('vocabulary', 'grammar', 'orthography', 'mixed')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  estimated_items INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(level_id, slug)
);

CREATE INDEX idx_curriculum_topics_level ON curriculum_topics(level_id);
CREATE INDEX idx_curriculum_topics_type ON curriculum_topics(content_type);

CREATE TABLE topic_prerequisites (
  topic_id UUID NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE,
  prerequisite_id UUID NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE,
  PRIMARY KEY (topic_id, prerequisite_id),
  CHECK (topic_id != prerequisite_id)
);

CREATE INDEX idx_topic_prerequisites_topic ON topic_prerequisites(topic_id);
CREATE INDEX idx_topic_prerequisites_prereq ON topic_prerequisites(prerequisite_id);
```

**Files Created**: `packages/db/migrations/014-curriculum-structure.sql`

---

### Task 2: Seed Default CEFR Levels

**Description**: Create migration to seed CEFR levels for all supported languages.

**Implementation Plan**:

Create `packages/db/migrations/015-seed-curriculum-levels.sql`:

```sql
INSERT INTO curriculum_levels (language, cefr_level, name, description, sort_order)
SELECT
  lang.language,
  lvl.level,
  lvl.name,
  lvl.description,
  lvl.sort_order
FROM (
  VALUES
    ('ES'::language_enum),
    ('IT'::language_enum),
    ('PT'::language_enum),
    ('SL'::language_enum)
) AS lang(language)
CROSS JOIN (
  VALUES
    ('A0'::cefr_level_enum, 'Pre-A1 (Beginner)', 'Alphabet, basic sounds, foundational phonetics', 0),
    ('A1'::cefr_level_enum, 'A1 (Elementary)', 'Basic vocabulary, simple phrases, present tense', 1),
    ('A2'::cefr_level_enum, 'A2 (Pre-Intermediate)', 'Everyday expressions, past tense, simple dialogues', 2),
    ('B1'::cefr_level_enum, 'B1 (Intermediate)', 'Independent use, subjunctive introduction, complex sentences', 3),
    ('B2'::cefr_level_enum, 'B2 (Upper-Intermediate)', 'Fluent interaction, idiomatic expressions, formal writing', 4),
    ('C1'::cefr_level_enum, 'C1 (Advanced)', 'Complex texts, nuanced expression, professional contexts', 5),
    ('C2'::cefr_level_enum, 'C2 (Mastery)', 'Near-native fluency, subtle meanings, all registers', 6)
) AS lvl(level, name, description, sort_order)
ON CONFLICT (language, cefr_level) DO NOTHING;
```

**Files Created**: `packages/db/migrations/015-seed-curriculum-levels.sql`

---

### Task 3: Topic Management Service

**Description**: Backend service for CRUD operations on curriculum topics.

**Implementation Plan**:

Create `packages/api/src/services/curriculum.service.ts`:

```typescript
import { Pool } from 'pg';

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
    return result.rows;
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
    return result.rows.map(this.mapTopicRow);
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

      const topic = result.rows[0];

      if (input.prerequisites && input.prerequisites.length > 0) {
        await this.validateNoCircularDeps(client, topic.id, input.prerequisites);

        for (const prereqId of input.prerequisites) {
          await client.query(
            `INSERT INTO topic_prerequisites (topic_id, prerequisite_id)
             VALUES ($1, $2)`,
            [topic.id, prereqId]
          );
        }
      }

      await client.query('COMMIT');
      return this.mapTopicRow({ ...topic, prerequisites: input.prerequisites || [] });
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

    const result = await this.pool.query(
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
        console.error(`Failed to import topic: ${topic.name}`, error);
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

  private mapTopicRow(row: any): CurriculumTopic {
    return {
      id: row.id,
      levelId: row.level_id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      contentType: row.content_type,
      sortOrder: row.sort_order,
      estimatedItems: row.estimated_items,
      metadata: row.metadata || {},
      prerequisites: row.prerequisites || [],
    };
  }
}
```

**Files Created**: `packages/api/src/services/curriculum.service.ts`

---

### Task 4: Curriculum API Endpoints

**Description**: REST API for managing curriculum structure.

**Implementation Plan**:

Create `packages/api/src/routes/operational/curriculum.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { CurriculumService } from '../../services/curriculum.service';

const CreateTopicSchema = z.object({
  levelId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  contentType: z.enum(['vocabulary', 'grammar', 'orthography', 'mixed']),
  sortOrder: z.number().int().min(0).optional(),
  estimatedItems: z.number().int().min(0).optional(),
  prerequisites: z.array(z.string().uuid()).optional(),
});

const UpdateTopicSchema = CreateTopicSchema.partial().omit({ levelId: true });

const ReorderSchema = z.object({
  topicIds: z.array(z.string().uuid()),
});

const ImportSchema = z.object({
  topics: z.array(CreateTopicSchema.omit({ levelId: true })),
});

export const curriculumRoutes: FastifyPluginAsync = async (fastify) => {
  const curriculumService = new CurriculumService(fastify.db);

  fastify.get('/operational/curriculum/levels/:language', async (request, reply) => {
    const { language } = request.params as { language: string };
    const levels = await curriculumService.getLevelsByLanguage(language);
    return reply.send({ levels });
  });

  fastify.get('/operational/curriculum/topics/:levelId', async (request, reply) => {
    const { levelId } = request.params as { levelId: string };
    const topics = await curriculumService.getTopicsByLevel(levelId);
    return reply.send({ topics });
  });

  fastify.post('/operational/curriculum/topics', async (request, reply) => {
    const input = CreateTopicSchema.parse(request.body);
    const topic = await curriculumService.createTopic(input);
    return reply.status(201).send({ topic });
  });

  fastify.put('/operational/curriculum/topics/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = UpdateTopicSchema.parse(request.body);
    const topic = await curriculumService.updateTopic(id, updates);
    return reply.send({ topic });
  });

  fastify.delete('/operational/curriculum/topics/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await curriculumService.deleteTopic(id);
    return reply.status(204).send();
  });

  fastify.post('/operational/curriculum/topics/:levelId/reorder', async (request, reply) => {
    const { levelId } = request.params as { levelId: string };
    const { topicIds } = ReorderSchema.parse(request.body);
    await curriculumService.reorderTopics(levelId, topicIds);
    return reply.send({ success: true });
  });

  fastify.post('/operational/curriculum/topics/:levelId/import', async (request, reply) => {
    const { levelId } = request.params as { levelId: string };
    const { topics } = ImportSchema.parse(request.body);
    const imported = await curriculumService.importTopicsFromJSON(
      levelId,
      topics.map((t) => ({ ...t, levelId }))
    );
    return reply.send({ imported });
  });
};
```

**Files Created**: `packages/api/src/routes/operational/curriculum.ts`

---

### Task 5: Operator UI for Topic Management

**Description**: React components for managing curriculum topics.

**Implementation Plan**:

Create `packages/web/src/pages/operator/CurriculumPage.tsx`:

```typescript
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, GripVertical, Trash2, Edit2, ChevronDown } from 'lucide-react';
import { api } from '../../api/client';

interface CurriculumLevel {
  id: string;
  language: string;
  cefrLevel: string;
  name: string;
  description: string;
}

interface CurriculumTopic {
  id: string;
  levelId: string;
  name: string;
  slug: string;
  description: string | null;
  contentType: 'vocabulary' | 'grammar' | 'orthography' | 'mixed';
  sortOrder: number;
  estimatedItems: number;
  prerequisites: string[];
}

const LANGUAGES = [
  { code: 'ES', name: 'Spanish' },
  { code: 'IT', name: 'Italian' },
  { code: 'PT', name: 'Portuguese' },
  { code: 'SL', name: 'Slovenian' },
];

export function CurriculumPage() {
  const [selectedLanguage, setSelectedLanguage] = useState('ES');
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);
  const [editingTopic, setEditingTopic] = useState<CurriculumTopic | null>(null);
  const queryClient = useQueryClient();

  const { data: levels, isLoading: levelsLoading } = useQuery({
    queryKey: ['curriculum-levels', selectedLanguage],
    queryFn: () => api.get(`/operational/curriculum/levels/${selectedLanguage}`),
  });

  const { data: topics } = useQuery({
    queryKey: ['curriculum-topics', expandedLevel],
    queryFn: () => api.get(`/operational/curriculum/topics/${expandedLevel}`),
    enabled: !!expandedLevel,
  });

  const createTopicMutation = useMutation({
    mutationFn: (topic: Partial<CurriculumTopic>) =>
      api.post('/operational/curriculum/topics', topic),
    onSuccess: () => {
      queryClient.invalidateQueries(['curriculum-topics', expandedLevel]);
    },
  });

  const deleteTopicMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/operational/curriculum/topics/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['curriculum-topics', expandedLevel]);
    },
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Curriculum Structure</h1>
        <select
          value={selectedLanguage}
          onChange={(e) => {
            setSelectedLanguage(e.target.value);
            setExpandedLevel(null);
          }}
          className="input w-48"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>

      {levelsLoading ? (
        <div className="text-center py-8">Loading levels...</div>
      ) : (
        <div className="space-y-4">
          {levels?.levels.map((level: CurriculumLevel) => (
            <div key={level.id} className="border rounded-lg overflow-hidden">
              <button
                onClick={() =>
                  setExpandedLevel(expandedLevel === level.id ? null : level.id)
                }
                className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm bg-primary-100 text-primary-700 px-2 py-1 rounded">
                    {level.cefrLevel}
                  </span>
                  <span className="font-medium">{level.name}</span>
                </div>
                <ChevronDown
                  className={`w-5 h-5 transition-transform ${
                    expandedLevel === level.id ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {expandedLevel === level.id && (
                <div className="p-4 border-t">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-medium">Topics</h3>
                    <button
                      onClick={() =>
                        createTopicMutation.mutate({
                          levelId: level.id,
                          name: 'New Topic',
                          contentType: 'vocabulary',
                        })
                      }
                      className="btn btn-primary btn-sm flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Add Topic
                    </button>
                  </div>

                  {topics?.topics.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">
                      No topics defined. Add topics to structure the curriculum.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {topics?.topics.map((topic: CurriculumTopic) => (
                        <div
                          key={topic.id}
                          className="flex items-center gap-3 p-3 bg-white border rounded"
                        >
                          <GripVertical className="w-4 h-4 text-gray-400 cursor-grab" />
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${
                              topic.contentType === 'vocabulary'
                                ? 'bg-blue-100 text-blue-700'
                                : topic.contentType === 'grammar'
                                ? 'bg-purple-100 text-purple-700'
                                : topic.contentType === 'orthography'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {topic.contentType}
                          </span>
                          <span className="flex-1 font-medium">{topic.name}</span>
                          <span className="text-sm text-gray-500">
                            ~{topic.estimatedItems} items
                          </span>
                          <button
                            onClick={() => setEditingTopic(topic)}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteTopicMutation.mutate(topic.id)}
                            className="p-1 hover:bg-red-100 text-red-600 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editingTopic && (
        <TopicEditModal
          topic={editingTopic}
          onClose={() => setEditingTopic(null)}
          onSave={() => {
            setEditingTopic(null);
            queryClient.invalidateQueries(['curriculum-topics', expandedLevel]);
          }}
        />
      )}
    </div>
  );
}
```

**Files Created**: `packages/web/src/pages/operator/CurriculumPage.tsx`

---

### Task 6: Topic Templates for Quick Setup

**Description**: JSON templates for common curriculum structures.

**Implementation Plan**:

Create `packages/api/src/templates/curriculum-templates.ts`:

```typescript
export const SPANISH_A1_TEMPLATE = [
  {
    name: 'Alphabet & Pronunciation',
    contentType: 'orthography',
    description: 'Spanish alphabet, vowels, consonants, special characters (ñ, á, é, í, ó, ú)',
    estimatedItems: 50,
  },
  {
    name: 'Greetings & Introductions',
    contentType: 'vocabulary',
    description: 'Hola, adiós, buenos días, ¿cómo estás?, me llamo...',
    estimatedItems: 30,
  },
  {
    name: 'Numbers 1-100',
    contentType: 'vocabulary',
    description: 'Cardinal numbers, counting, basic math expressions',
    estimatedItems: 40,
  },
  {
    name: 'Days & Months',
    contentType: 'vocabulary',
    description: 'Days of week, months, seasons, dates',
    estimatedItems: 25,
  },
  {
    name: 'Present Tense - Regular Verbs',
    contentType: 'grammar',
    description: '-ar, -er, -ir verb conjugations in present tense',
    estimatedItems: 60,
  },
  {
    name: 'Ser vs Estar',
    contentType: 'grammar',
    description: 'Two forms of "to be" - permanent vs temporary states',
    estimatedItems: 40,
  },
  {
    name: 'Family Members',
    contentType: 'vocabulary',
    description: 'Madre, padre, hermano, hermana, abuelo, etc.',
    estimatedItems: 25,
  },
  {
    name: 'Colors & Descriptions',
    contentType: 'vocabulary',
    description: 'Basic colors, adjective agreement, descriptions',
    estimatedItems: 35,
  },
  {
    name: 'Articles & Gender',
    contentType: 'grammar',
    description: 'El/la, un/una, masculine/feminine nouns',
    estimatedItems: 30,
  },
  {
    name: 'Food & Drinks',
    contentType: 'vocabulary',
    description: 'Common foods, drinks, restaurant vocabulary',
    estimatedItems: 50,
  },
];

export const CURRICULUM_TEMPLATES: Record<string, Record<string, typeof SPANISH_A1_TEMPLATE>> = {
  ES: { A1: SPANISH_A1_TEMPLATE },
  IT: { A1: [] },
  PT: { A1: [] },
  SL: { A1: [] },
};
```

**Files Created**: `packages/api/src/templates/curriculum-templates.ts`

---

## Dependencies

- **Blocks**: F015, F016, F017
- **Depends on**: F001 (database), F018-F020 (API infrastructure)

---

## Notes

- Curriculum structure defines WHAT to teach, not HOW (that's F015-F016)
- Operators must define topics BEFORE documents can be processed
- Topics link to document chunks via semantic mapping (F016)
- Prerequisites ensure learners complete foundational topics first

---

## Open Questions

### Question 1: Topic Granularity

**Context**: How granular should topics be?

**Options**:

1. **Coarse** (10-15 topics per level): "Grammar", "Vocabulary", "Pronunciation"
2. **Medium** (20-30 topics per level): "Present Tense Verbs", "Family Vocabulary", "Restaurant Dialogues"
3. **Fine** (50+ topics per level): "Ser vs Estar", "Regular -ar Verbs", "Numbers 1-20", "Numbers 21-100"

**Recommendation**: Start with medium granularity. Operators can split topics later if needed.

### Question 2: Cross-Language Topic Alignment

**Context**: Should topics be aligned across languages?

**Example**: Spanish A1 "Greetings" should map to Italian A1 "Greetings" for parallel learning.

**Decision Needed**: Yes, topics should have optional `alignment_group` for cross-language comparison features.

**Temporary Plan**: Add alignment support in post-MVP phase.
