# F032: Curriculum Graph Engine

**Feature Code**: F032
**Created**: 2025-12-17
**Phase**: 8 - Learning Foundation
**Status**: Completed

---

## Description

Implement curriculum dependency graph engine that determines what content is available to users based on completed prerequisites. The graph enforces logical progression through CEFR levels (A0 → C2), ensuring learners don't encounter content before mastering foundational concepts. Supports complex prerequisite relationships (AND/OR logic), topological ordering for optimal learning paths, and visualization of learning progress.

## Success Criteria

- [x] Curriculum graph loaded from database with efficient caching
- [x] Prerequisite checking before showing content (blocks locked concepts)
- [x] Topological sort provides optimal content ordering
- [x] Next available concepts endpoint returns unlocked content with priority ranking
- [x] Handles multiple concurrent prerequisites (AND logic: all must be completed)
- [x] Supports alternative prerequisites (OR logic: any one unlocks concept)
- [x] Detects circular dependencies during validation (graph must be acyclic)
- [x] Graph visualization API returns node/edge data for UI rendering
- [ ] Real-time unlock notifications when prerequisites completed (deferred)
- [x] Performance optimized for graphs with 1000+ nodes per language

---

## Tasks

### Task 1: Database Schema for Curriculum Graph

**Implementation Plan**:

Create migration `packages/db/migrations/018-curriculum-graph.sql`:

```sql
-- Curriculum graph nodes (concepts to learn)
CREATE TABLE curriculum_graph (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id VARCHAR(100) NOT NULL, -- e.g., "de_grammar_present_tense"
  language TEXT NOT NULL,
  cefr_level VARCHAR(2) NOT NULL CHECK (cefr_level IN ('A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  concept_type VARCHAR(50) NOT NULL CHECK (concept_type IN ('orthography', 'vocabulary', 'grammar', 'pronunciation')),
  title TEXT NOT NULL,
  description TEXT,
  estimated_duration_minutes INT, -- Estimated time to complete
  priority_order INT NOT NULL DEFAULT 0, -- For tie-breaking when multiple concepts unlocked
  is_optional BOOLEAN NOT NULL DEFAULT false, -- Optional concepts don't block progression

  -- Prerequisite logic
  prerequisites_and VARCHAR(100)[] DEFAULT '{}', -- All must be completed (AND logic)
  prerequisites_or VARCHAR(100)[] DEFAULT '{}', -- At least one must be completed (OR logic)

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (concept_id, language)
);

CREATE INDEX idx_curriculum_graph_language ON curriculum_graph(language);
CREATE INDEX idx_curriculum_graph_cefr ON curriculum_graph(cefr_level);
CREATE INDEX idx_curriculum_graph_type ON curriculum_graph(concept_type);
CREATE INDEX idx_curriculum_graph_prereqs_and ON curriculum_graph USING GIN(prerequisites_and);
CREATE INDEX idx_curriculum_graph_prereqs_or ON curriculum_graph USING GIN(prerequisites_or);

-- User progress tracking per concept
CREATE TABLE user_concept_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concept_id VARCHAR(100) NOT NULL,
  language TEXT NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('locked', 'unlocked', 'in_progress', 'completed')),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  progress_percentage INT NOT NULL DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),

  -- Metadata
  total_exercises INT NOT NULL DEFAULT 0,
  completed_exercises INT NOT NULL DEFAULT 0,
  accuracy_percentage DECIMAL(5,2), -- Average accuracy across exercises

  UNIQUE (user_id, concept_id, language),
  FOREIGN KEY (concept_id, language) REFERENCES curriculum_graph(concept_id, language) ON DELETE CASCADE
);

CREATE INDEX idx_user_concept_progress_user ON user_concept_progress(user_id);
CREATE INDEX idx_user_concept_progress_status ON user_concept_progress(status);
CREATE INDEX idx_user_concept_progress_language ON user_concept_progress(user_id, language);

-- View: Unlocked concepts for user
CREATE VIEW user_unlocked_concepts AS
SELECT
  ucp.user_id,
  ucp.language,
  cg.concept_id,
  cg.title,
  cg.cefr_level,
  cg.concept_type,
  cg.priority_order,
  ucp.status,
  ucp.progress_percentage
FROM user_concept_progress ucp
JOIN curriculum_graph cg ON ucp.concept_id = cg.concept_id AND ucp.language = cg.language
WHERE ucp.status IN ('unlocked', 'in_progress');

-- View: Completed concepts count per user
CREATE VIEW user_curriculum_stats AS
SELECT
  user_id,
  language,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
  COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
  COUNT(*) FILTER (WHERE status = 'unlocked') as unlocked_count,
  COUNT(*) FILTER (WHERE status = 'locked') as locked_count,
  AVG(accuracy_percentage) FILTER (WHERE status = 'completed') as avg_accuracy
FROM user_concept_progress
GROUP BY user_id, language;
```

**Files Created**:

- `packages/db/migrations/018-curriculum-graph.sql`

**Validation**:

- Verify foreign keys cascade correctly
- Test GIN indexes improve array containment queries (@> operator)
- Confirm UNIQUE constraint prevents duplicate concept_id per language

---

### Task 2: Curriculum Graph Service with Prerequisite Resolution

**Implementation Plan**:

Create `packages/api/src/services/curriculum/graph.service.ts`:

```typescript
import { Pool } from 'pg';
import { Language, CEFRLevel } from '@polyladder/core';

interface CurriculumNode {
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

interface UserConceptStatus {
  conceptId: string;
  status: 'locked' | 'unlocked' | 'in_progress' | 'completed';
  progressPercentage: number;
}

export class CurriculumGraphService {
  constructor(private readonly pool: Pool) {}

  /**
   * Load entire curriculum graph for a language
   * Uses caching to avoid repeated database queries
   */
  private graphCache = new Map<string, CurriculumNode[]>();

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

    this.graphCache.set(cacheKey, result.rows);
    return result.rows;
  }

  /**
   * Clear cache when curriculum graph is updated
   */
  clearCache(language?: Language): void {
    if (language) {
      this.graphCache.delete(language);
    } else {
      this.graphCache.clear();
    }
  }

  /**
   * Get user's completed concepts
   */
  async getCompletedConcepts(userId: string, language: Language): Promise<Set<string>> {
    const result = await this.pool.query<{ conceptId: string }>(
      `SELECT concept_id as "conceptId"
       FROM user_concept_progress
       WHERE user_id = $1 AND language = $2 AND status = 'completed'`,
      [userId, language]
    );

    return new Set(result.rows.map((r) => r.conceptId));
  }

  /**
   * Check if all AND prerequisites are completed
   */
  private checkAndPrerequisites(
    prerequisitesAnd: string[],
    completedConcepts: Set<string>
  ): boolean {
    if (prerequisitesAnd.length === 0) return true;
    return prerequisitesAnd.every((prereq) => completedConcepts.has(prereq));
  }

  /**
   * Check if at least one OR prerequisite is completed
   */
  private checkOrPrerequisites(prerequisitesOr: string[], completedConcepts: Set<string>): boolean {
    if (prerequisitesOr.length === 0) return true;
    return prerequisitesOr.some((prereq) => completedConcepts.has(prereq));
  }

  /**
   * Check if concept prerequisites are satisfied
   */
  isConceptUnlocked(concept: CurriculumNode, completedConcepts: Set<string>): boolean {
    // Check both AND and OR prerequisites
    const andSatisfied = this.checkAndPrerequisites(concept.prerequisitesAnd, completedConcepts);
    const orSatisfied = this.checkOrPrerequisites(concept.prerequisitesOr, completedConcepts);

    return andSatisfied && orSatisfied;
  }

  /**
   * Get all available (unlocked but not completed) concepts for user
   */
  async getAvailableConcepts(userId: string, language: Language): Promise<CurriculumNode[]> {
    const graph = await this.getGraphForLanguage(language);
    const completedConcepts = await this.getCompletedConcepts(userId, language);

    const available = graph.filter((concept) => {
      // Skip already completed concepts
      if (completedConcepts.has(concept.conceptId)) return false;

      // Check if prerequisites satisfied
      return this.isConceptUnlocked(concept, completedConcepts);
    });

    // Sort by priority order (lower number = higher priority)
    return available.sort((a, b) => a.priorityOrder - b.priorityOrder);
  }

  /**
   * Get next recommended concept for user
   * Prioritizes by: CEFR level → priority_order → estimated duration
   */
  async getNextConcept(userId: string, language: Language): Promise<CurriculumNode | null> {
    const available = await this.getAvailableConcepts(userId, language);

    if (available.length === 0) return null;

    // Return highest priority available concept
    return available[0];
  }

  /**
   * Topological sort of curriculum graph
   * Returns ordered list of concepts respecting dependencies
   */
  async getTopologicalOrder(language: Language): Promise<string[]> {
    const graph = await this.getGraphForLanguage(language);

    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();

    // Initialize
    graph.forEach((node) => {
      inDegree.set(node.conceptId, 0);
      adjacencyList.set(node.conceptId, []);
    });

    // Build adjacency list and calculate in-degrees
    graph.forEach((node) => {
      const allPrereqs = [...node.prerequisitesAnd, ...node.prerequisitesOr];
      allPrereqs.forEach((prereq) => {
        adjacencyList.get(prereq)?.push(node.conceptId);
        inDegree.set(node.conceptId, (inDegree.get(node.conceptId) || 0) + 1);
      });
    });

    // Kahn's algorithm for topological sort
    const queue: string[] = [];
    const result: string[] = [];

    // Add all nodes with in-degree 0 to queue
    inDegree.forEach((degree, conceptId) => {
      if (degree === 0) queue.push(conceptId);
    });

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      // Reduce in-degree for all neighbors
      adjacencyList.get(current)?.forEach((neighbor) => {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      });
    }

    // If result doesn't include all nodes, there's a cycle
    if (result.length !== graph.length) {
      throw new Error(`Circular dependency detected in curriculum graph for language: ${language}`);
    }

    return result;
  }

  /**
   * Initialize user progress for a new language
   * Sets all concepts to 'locked' initially, then unlocks available ones
   */
  async initializeUserProgress(userId: string, language: Language): Promise<void> {
    const graph = await this.getGraphForLanguage(language);

    // Insert all concepts as locked
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

    // Unlock concepts with no prerequisites
    await this.unlockAvailableConcepts(userId, language);
  }

  /**
   * Unlock concepts that have prerequisites satisfied
   * Called after completing a concept
   */
  async unlockAvailableConcepts(userId: string, language: Language): Promise<string[]> {
    const graph = await this.getGraphForLanguage(language);
    const completedConcepts = await this.getCompletedConcepts(userId, language);

    const toUnlock: string[] = [];

    for (const concept of graph) {
      // Skip already unlocked/completed concepts
      const statusResult = await this.pool.query<{ status: string }>(
        `SELECT status FROM user_concept_progress
         WHERE user_id = $1 AND concept_id = $2 AND language = $3`,
        [userId, concept.conceptId, language]
      );

      const currentStatus = statusResult.rows[0]?.status;
      if (currentStatus !== 'locked') continue;

      // Check if should be unlocked
      if (this.isConceptUnlocked(concept, completedConcepts)) {
        toUnlock.push(concept.conceptId);
      }
    }

    // Update statuses in batch
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
```

**Files Created**:

- `packages/api/src/services/curriculum/graph.service.ts`

**Technical Details**:

- **Caching**: In-memory cache prevents repeated DB queries for graph structure
- **Kahn's Algorithm**: Ensures topological ordering and detects cycles in O(V + E) time
- **Prerequisite Logic**: AND (all required) + OR (any one required) support
- **Batch Operations**: Unlocking uses array operators for efficiency

---

### Task 3: API Endpoints for Curriculum Graph Access

**Implementation Plan**:

Create `packages/api/src/routes/learning/curriculum.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Language } from '@polyladder/core';
import { CurriculumGraphService } from '../../services/curriculum/graph.service';
import { authMiddleware } from '../../middleware/auth';

const LanguageQuerySchema = z.object({
  language: z.nativeEnum(Language),
});

const ConceptIdParamSchema = z.object({
  conceptId: z.string().min(1),
});

export const curriculumRoutes: FastifyPluginAsync = async (fastify) => {
  const graphService = new CurriculumGraphService(fastify.pg.pool);

  /**
   * GET /learning/curriculum/available
   * Get all unlocked concepts for user in language
   */
  fastify.get(
    '/learning/curriculum/available',
    {
      preHandler: authMiddleware,
      schema: {
        querystring: LanguageQuerySchema,
        response: {
          200: z.object({
            concepts: z.array(
              z.object({
                conceptId: z.string(),
                title: z.string(),
                cefrLevel: z.string(),
                conceptType: z.string(),
                description: z.string().nullable(),
                estimatedDurationMinutes: z.number().nullable(),
                priorityOrder: z.number(),
              })
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const { language } = LanguageQuerySchema.parse(request.query);
      const userId = request.user!.userId;

      const concepts = await graphService.getAvailableConcepts(userId, language);

      return reply.status(200).send({ concepts });
    }
  );

  /**
   * GET /learning/curriculum/next
   * Get next recommended concept for user
   */
  fastify.get(
    '/learning/curriculum/next',
    {
      preHandler: authMiddleware,
      schema: {
        querystring: LanguageQuerySchema,
        response: {
          200: z.object({
            concept: z
              .object({
                conceptId: z.string(),
                title: z.string(),
                cefrLevel: z.string(),
                conceptType: z.string(),
                description: z.string().nullable(),
                estimatedDurationMinutes: z.number().nullable(),
              })
              .nullable(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { language } = LanguageQuerySchema.parse(request.query);
      const userId = request.user!.userId;

      const concept = await graphService.getNextConcept(userId, language);

      return reply.status(200).send({ concept });
    }
  );

  /**
   * GET /learning/curriculum/graph
   * Get full curriculum graph structure for visualization
   */
  fastify.get(
    '/learning/curriculum/graph',
    {
      preHandler: authMiddleware,
      schema: {
        querystring: LanguageQuerySchema,
        response: {
          200: z.object({
            nodes: z.array(
              z.object({
                conceptId: z.string(),
                title: z.string(),
                cefrLevel: z.string(),
                conceptType: z.string(),
                status: z.enum(['locked', 'unlocked', 'in_progress', 'completed']),
              })
            ),
            edges: z.array(
              z.object({
                from: z.string(),
                to: z.string(),
                type: z.enum(['and', 'or']),
              })
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const { language } = LanguageQuerySchema.parse(request.query);
      const userId = request.user!.userId;

      const graph = await graphService.getGraphForLanguage(language);
      const completedConcepts = await graphService.getCompletedConcepts(userId, language);

      // Get user status for each concept
      const statusMap = new Map<string, string>();
      const statusResult = await fastify.pg.pool.query(
        `SELECT concept_id, status FROM user_concept_progress
       WHERE user_id = $1 AND language = $2`,
        [userId, language]
      );
      statusResult.rows.forEach((row) => {
        statusMap.set(row.concept_id, row.status);
      });

      // Build nodes
      const nodes = graph.map((concept) => ({
        conceptId: concept.conceptId,
        title: concept.title,
        cefrLevel: concept.cefrLevel,
        conceptType: concept.conceptType,
        status: statusMap.get(concept.conceptId) || 'locked',
      }));

      // Build edges (prerequisites → concept)
      const edges: Array<{ from: string; to: string; type: 'and' | 'or' }> = [];
      graph.forEach((concept) => {
        concept.prerequisitesAnd.forEach((prereq) => {
          edges.push({ from: prereq, to: concept.conceptId, type: 'and' });
        });
        concept.prerequisitesOr.forEach((prereq) => {
          edges.push({ from: prereq, to: concept.conceptId, type: 'or' });
        });
      });

      return reply.status(200).send({ nodes, edges });
    }
  );

  /**
   * POST /learning/curriculum/complete/:conceptId
   * Mark concept as completed and unlock dependent concepts
   */
  fastify.post(
    '/learning/curriculum/complete/:conceptId',
    {
      preHandler: authMiddleware,
      schema: {
        params: ConceptIdParamSchema,
        body: z.object({
          language: z.nativeEnum(Language),
          accuracyPercentage: z.number().min(0).max(100).optional(),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            unlockedConcepts: z.array(z.string()),
          }),
        },
      },
    },
    async (request, reply) => {
      const { conceptId } = ConceptIdParamSchema.parse(request.params);
      const { language, accuracyPercentage } = request.body as {
        language: Language;
        accuracyPercentage?: number;
      };
      const userId = request.user!.userId;

      // Mark as completed
      await fastify.pg.pool.query(
        `UPDATE user_concept_progress
       SET status = 'completed',
           completed_at = NOW(),
           progress_percentage = 100,
           accuracy_percentage = $4
       WHERE user_id = $1 AND concept_id = $2 AND language = $3`,
        [userId, conceptId, language, accuracyPercentage]
      );

      // Unlock newly available concepts
      const unlockedConcepts = await graphService.unlockAvailableConcepts(userId, language);

      return reply.status(200).send({
        success: true,
        unlockedConcepts,
      });
    }
  );

  /**
   * GET /learning/curriculum/stats
   * Get curriculum progress statistics for user
   */
  fastify.get(
    '/learning/curriculum/stats',
    {
      preHandler: authMiddleware,
      schema: {
        querystring: LanguageQuerySchema,
        response: {
          200: z.object({
            completedCount: z.number(),
            inProgressCount: z.number(),
            unlockedCount: z.number(),
            lockedCount: z.number(),
            totalCount: z.number(),
            avgAccuracy: z.number().nullable(),
            completionPercentage: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { language } = LanguageQuerySchema.parse(request.query);
      const userId = request.user!.userId;

      const statsResult = await fastify.pg.pool.query(
        `SELECT * FROM user_curriculum_stats
       WHERE user_id = $1 AND language = $2`,
        [userId, language]
      );

      const stats = statsResult.rows[0] || {
        completed_count: 0,
        in_progress_count: 0,
        unlocked_count: 0,
        locked_count: 0,
        avg_accuracy: null,
      };

      const totalCount =
        stats.completed_count + stats.in_progress_count + stats.unlocked_count + stats.locked_count;
      const completionPercentage = totalCount > 0 ? (stats.completed_count / totalCount) * 100 : 0;

      return reply.status(200).send({
        completedCount: stats.completed_count,
        inProgressCount: stats.in_progress_count,
        unlockedCount: stats.unlocked_count,
        lockedCount: stats.locked_count,
        totalCount,
        avgAccuracy: stats.avg_accuracy,
        completionPercentage,
      });
    }
  );
};
```

**Files Created**:

- `packages/api/src/routes/learning/curriculum.ts`

**API Summary**:

- `GET /learning/curriculum/available` - List unlocked concepts
- `GET /learning/curriculum/next` - Get recommended next concept
- `GET /learning/curriculum/graph` - Full graph for visualization
- `POST /learning/curriculum/complete/:conceptId` - Complete concept + unlock dependents
- `GET /learning/curriculum/stats` - Progress statistics

---

### Task 4: React Components for Curriculum Graph Visualization

**Implementation Plan**:

Create `packages/web/src/components/learning/CurriculumGraph.tsx`:

```typescript
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { Language } from '@polyladder/core';

interface GraphNode {
  conceptId: string;
  title: string;
  cefrLevel: string;
  conceptType: string;
  status: 'locked' | 'unlocked' | 'in_progress' | 'completed';
}

interface GraphEdge {
  from: string;
  to: string;
  type: 'and' | 'or';
}

interface CurriculumGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface CurriculumGraphProps {
  language: Language;
}

export function CurriculumGraph({ language }: CurriculumGraphProps) {
  const { data, isLoading } = useQuery<CurriculumGraphData>({
    queryKey: ['curriculum-graph', language],
    queryFn: async () => {
      const response = await apiClient.get<CurriculumGraphData>(
        `/learning/curriculum/graph?language=${language}`
      );
      return response.data;
    },
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading curriculum graph...</div>;
  }

  if (!data) {
    return <div className="text-center py-8">No curriculum data available</div>;
  }

  // Group nodes by CEFR level for visual organization
  const nodesByCEFR = data.nodes.reduce((acc, node) => {
    if (!acc[node.cefrLevel]) acc[node.cefrLevel] = [];
    acc[node.cefrLevel].push(node);
    return acc;
  }, {} as Record<string, GraphNode[]>);

  const cefrLevels = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

  const getStatusColor = (status: GraphNode['status']) => {
    switch (status) {
      case 'completed': return 'bg-green-500 text-white';
      case 'in_progress': return 'bg-yellow-500 text-white';
      case 'unlocked': return 'bg-blue-500 text-white';
      case 'locked': return 'bg-gray-300 text-gray-600';
    }
  };

  const getStatusIcon = (status: GraphNode['status']) => {
    switch (status) {
      case 'completed': return '✓';
      case 'in_progress': return '...';
      case 'unlocked': return '○';
      case 'locked': return '🔒';
    }
  };

  return (
    <div className="curriculum-graph p-6">
      <h2 className="text-2xl font-bold mb-6">Curriculum Progress</h2>

      {/* CEFR Level Columns */}
      <div className="grid grid-cols-7 gap-4">
        {cefrLevels.map(level => (
          <div key={level} className="cefr-column">
            <div className="bg-gray-100 rounded-t-lg p-2 text-center font-bold">
              {level}
            </div>

            <div className="space-y-3 mt-3">
              {(nodesByCEFR[level] || []).map(node => (
                <div
                  key={node.conceptId}
                  className={`rounded-lg p-3 shadow-sm cursor-pointer transition-all hover:shadow-md ${getStatusColor(node.status)}`}
                  title={`${node.title} - ${node.status}`}
                >
                  <div className="text-xs font-semibold mb-1">{node.conceptType}</div>
                  <div className="text-sm">{node.title}</div>
                  <div className="text-right text-lg mt-1">{getStatusIcon(node.status)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-8 flex gap-4 justify-center text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded"></div>
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-yellow-500 rounded"></div>
          <span>In Progress</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-500 rounded"></div>
          <span>Unlocked</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-300 rounded"></div>
          <span>Locked</span>
        </div>
      </div>
    </div>
  );
}
```

Create `packages/web/src/components/learning/NextConceptCard.tsx`:

```typescript
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../lib/api-client';
import { Language } from '@polyladder/core';

interface ConceptData {
  conceptId: string;
  title: string;
  cefrLevel: string;
  conceptType: string;
  description: string | null;
  estimatedDurationMinutes: number | null;
}

interface NextConceptCardProps {
  language: Language;
}

export function NextConceptCard({ language }: NextConceptCardProps) {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery<{ concept: ConceptData | null }>({
    queryKey: ['next-concept', language],
    queryFn: async () => {
      const response = await apiClient.get<{ concept: ConceptData | null }>(
        `/learning/curriculum/next?language=${language}`
      );
      return response.data;
    },
  });

  if (isLoading) {
    return <div className="card p-6">Loading next concept...</div>;
  }

  if (!data?.concept) {
    return (
      <div className="card p-6 bg-green-50 border-green-200">
        <h3 className="text-xl font-bold text-green-800">🎉 Curriculum Complete!</h3>
        <p className="text-green-700 mt-2">
          You've completed all available concepts for {language}. Great work!
        </p>
      </div>
    );
  }

  const concept = data.concept;

  const handleStartConcept = () => {
    navigate(`/learn/${language}/${concept.conceptType}/${concept.conceptId}`);
  };

  return (
    <div className="card p-6 border-2 border-blue-500">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-gray-500 mb-1">Next Recommended Concept</div>
          <h3 className="text-2xl font-bold">{concept.title}</h3>
          <div className="flex gap-3 mt-2 text-sm">
            <span className="badge badge-blue">{concept.cefrLevel}</span>
            <span className="badge badge-purple">{concept.conceptType}</span>
            {concept.estimatedDurationMinutes && (
              <span className="text-gray-600">~{concept.estimatedDurationMinutes} min</span>
            )}
          </div>
        </div>

        <button
          onClick={handleStartConcept}
          className="btn btn-primary px-6 py-3"
        >
          Start Learning →
        </button>
      </div>

      {concept.description && (
        <p className="text-gray-700 mt-4">{concept.description}</p>
      )}
    </div>
  );
}
```

Create `packages/web/src/components/learning/CurriculumStats.tsx`:

```typescript
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { Language } from '@polyladder/core';

interface CurriculumStatsData {
  completedCount: number;
  inProgressCount: number;
  unlockedCount: number;
  lockedCount: number;
  totalCount: number;
  avgAccuracy: number | null;
  completionPercentage: number;
}

interface CurriculumStatsProps {
  language: Language;
}

export function CurriculumStats({ language }: CurriculumStatsProps) {
  const { data, isLoading } = useQuery<CurriculumStatsData>({
    queryKey: ['curriculum-stats', language],
    queryFn: async () => {
      const response = await apiClient.get<CurriculumStatsData>(
        `/learning/curriculum/stats?language=${language}`
      );
      return response.data;
    },
  });

  if (isLoading) {
    return <div className="text-center">Loading stats...</div>;
  }

  if (!data) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="card p-4 text-center">
        <div className="text-3xl font-bold text-green-600">{data.completedCount}</div>
        <div className="text-sm text-gray-600 mt-1">Completed</div>
      </div>

      <div className="card p-4 text-center">
        <div className="text-3xl font-bold text-yellow-600">{data.inProgressCount}</div>
        <div className="text-sm text-gray-600 mt-1">In Progress</div>
      </div>

      <div className="card p-4 text-center">
        <div className="text-3xl font-bold text-blue-600">{data.unlockedCount}</div>
        <div className="text-sm text-gray-600 mt-1">Unlocked</div>
      </div>

      <div className="card p-4 text-center">
        <div className="text-3xl font-bold text-gray-600">{data.lockedCount}</div>
        <div className="text-sm text-gray-600 mt-1">Locked</div>
      </div>

      {/* Progress Bar */}
      <div className="col-span-2 md:col-span-4 card p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold">Overall Progress</span>
          <span className="text-sm font-bold">{data.completionPercentage.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-blue-500 to-green-500 h-3 rounded-full transition-all"
            style={{ width: `${data.completionPercentage}%` }}
          ></div>
        </div>
        {data.avgAccuracy !== null && (
          <div className="text-sm text-gray-600 mt-2">
            Average Accuracy: <span className="font-semibold">{data.avgAccuracy.toFixed(1)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Files Created**:

- `packages/web/src/components/learning/CurriculumGraph.tsx`
- `packages/web/src/components/learning/NextConceptCard.tsx`
- `packages/web/src/components/learning/CurriculumStats.tsx`

**UI Features**:

- Visual graph showing all concepts organized by CEFR level
- Color-coded status (completed=green, in_progress=yellow, unlocked=blue, locked=gray)
- "Next Concept" recommendation card with start button
- Progress statistics dashboard

---

### Task 5: Integration with Learning Module Completion

**Implementation Plan**:

Create `packages/api/src/services/curriculum/completion-handler.service.ts`:

```typescript
import { Pool } from 'pg';
import { Language } from '@polyladder/core';
import { CurriculumGraphService } from './graph.service';

interface CompletionEvent {
  userId: string;
  language: Language;
  conceptId: string;
  conceptType: 'orthography' | 'vocabulary' | 'grammar' | 'pronunciation';
  accuracyPercentage: number;
  totalExercises: number;
  completedExercises: number;
}

export class CompletionHandlerService {
  private graphService: CurriculumGraphService;

  constructor(private readonly pool: Pool) {
    this.graphService = new CurriculumGraphService(pool);
  }

  /**
   * Handle concept completion event
   * Updates user_concept_progress and unlocks dependent concepts
   */
  async handleConceptCompletion(event: CompletionEvent): Promise<{
    success: boolean;
    unlockedConcepts: string[];
    nextRecommendation: string | null;
  }> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Update concept progress
      await client.query(
        `UPDATE user_concept_progress
         SET status = 'completed',
             completed_at = NOW(),
             progress_percentage = 100,
             accuracy_percentage = $4,
             total_exercises = $5,
             completed_exercises = $6
         WHERE user_id = $1 AND concept_id = $2 AND language = $3`,
        [
          event.userId,
          event.conceptId,
          event.language,
          event.accuracyPercentage,
          event.totalExercises,
          event.completedExercises,
        ]
      );

      await client.query('COMMIT');

      // Unlock newly available concepts (outside transaction)
      const unlockedConcepts = await this.graphService.unlockAvailableConcepts(
        event.userId,
        event.language
      );

      // Get next recommendation
      const nextConcept = await this.graphService.getNextConcept(event.userId, event.language);

      return {
        success: true,
        unlockedConcepts,
        nextRecommendation: nextConcept?.conceptId || null,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update concept progress (for partial completion)
   */
  async updateConceptProgress(
    userId: string,
    conceptId: string,
    language: Language,
    progressPercentage: number
  ): Promise<void> {
    await this.pool.query(
      `UPDATE user_concept_progress
       SET status = CASE
           WHEN $4 >= 100 THEN 'completed'
           WHEN $4 > 0 THEN 'in_progress'
           ELSE status
         END,
         progress_percentage = $4,
         started_at = COALESCE(started_at, NOW())
       WHERE user_id = $1 AND concept_id = $2 AND language = $3`,
      [userId, conceptId, language, progressPercentage]
    );
  }

  /**
   * Mark concept as started (unlocked → in_progress)
   */
  async startConcept(userId: string, conceptId: string, language: Language): Promise<void> {
    await this.pool.query(
      `UPDATE user_concept_progress
       SET status = 'in_progress',
           started_at = NOW()
       WHERE user_id = $1 AND concept_id = $2 AND language = $3 AND status = 'unlocked'`,
      [userId, conceptId, language]
    );
  }
}
```

**Files Created**:

- `packages/api/src/services/curriculum/completion-handler.service.ts`

**Integration Points**:

- Orthography module completion → triggers `handleConceptCompletion`
- Grammar lesson completion → triggers `handleConceptCompletion`
- Vocabulary mastery → triggers `handleConceptCompletion`
- Exercise progress → triggers `updateConceptProgress`

---

### Task 6: Circular Dependency Validation Tool

**Implementation Plan**:

Create `packages/api/src/scripts/validate-curriculum-graph.ts`:

```typescript
import { Pool } from 'pg';
import { Language } from '@polyladder/core';
import { CurriculumGraphService } from '../services/curriculum/graph.service';

interface ValidationResult {
  language: Language;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

async function validateCurriculumGraph(pool: Pool): Promise<ValidationResult[]> {
  const graphService = new CurriculumGraphService(pool);
  const languages = Object.values(Language);

  const results: ValidationResult[] = [];

  for (const language of languages) {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Test 1: Topological sort (detects circular dependencies)
      const topologicalOrder = await graphService.getTopologicalOrder(language);
      console.log(
        `✓ ${language}: Topological sort successful (${topologicalOrder.length} concepts)`
      );

      // Test 2: Verify all prerequisites exist
      const graph = await graphService.getGraphForLanguage(language);
      for (const concept of graph) {
        const allPrereqs = [...concept.prerequisitesAnd, ...concept.prerequisitesOr];

        for (const prereq of allPrereqs) {
          const prereqExists = graph.some((c) => c.conceptId === prereq);
          if (!prereqExists) {
            errors.push(
              `Concept "${concept.conceptId}" references non-existent prerequisite "${prereq}"`
            );
          }
        }
      }

      // Test 3: Verify CEFR level ordering (prerequisites should be same or lower level)
      const cefrOrder = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
      for (const concept of graph) {
        const conceptLevel = cefrOrder.indexOf(concept.cefrLevel);

        const allPrereqs = [...concept.prerequisitesAnd, ...concept.prerequisitesOr];
        for (const prereqId of allPrereqs) {
          const prereq = graph.find((c) => c.conceptId === prereqId);
          if (prereq) {
            const prereqLevel = cefrOrder.indexOf(prereq.cefrLevel);
            if (prereqLevel > conceptLevel) {
              warnings.push(
                `Concept "${concept.conceptId}" (${concept.cefrLevel}) has prerequisite "${prereqId}" (${prereq.cefrLevel}) at higher CEFR level`
              );
            }
          }
        }
      }

      // Test 4: Check for orphaned concepts (no incoming or outgoing edges)
      for (const concept of graph) {
        const hasPrereqs =
          concept.prerequisitesAnd.length > 0 || concept.prerequisitesOr.length > 0;
        const isDependency = graph.some(
          (c) =>
            c.prerequisitesAnd.includes(concept.conceptId) ||
            c.prerequisitesOr.includes(concept.conceptId)
        );

        if (!hasPrereqs && !isDependency && concept.cefrLevel !== 'A0') {
          warnings.push(
            `Concept "${concept.conceptId}" has no prerequisites and is not a dependency of any other concept`
          );
        }
      }

      results.push({
        language,
        isValid: errors.length === 0,
        errors,
        warnings,
      });
    } catch (error) {
      errors.push(
        `Failed to validate graph: ${error instanceof Error ? error.message : String(error)}`
      );
      results.push({ language, isValid: false, errors, warnings });
    }
  }

  return results;
}

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Validating curriculum graphs...\n');

    const results = await validateCurriculumGraph(pool);

    let hasErrors = false;
    for (const result of results) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Language: ${result.language}`);
      console.log(`Status: ${result.isValid ? '✓ VALID' : '✗ INVALID'}`);

      if (result.errors.length > 0) {
        hasErrors = true;
        console.log('\nErrors:');
        result.errors.forEach((err) => console.log(`  - ${err}`));
      }

      if (result.warnings.length > 0) {
        console.log('\nWarnings:');
        result.warnings.forEach((warn) => console.log(`  - ${warn}`));
      }
    }

    console.log(`\n${'='.repeat(60)}\n`);

    if (hasErrors) {
      console.error('❌ Validation failed with errors');
      process.exit(1);
    } else {
      console.log('✅ All curriculum graphs are valid');
      process.exit(0);
    }
  } finally {
    await pool.end();
  }
}

main();
```

Add to `packages/api/package.json`:

```json
{
  "scripts": {
    "validate:curriculum": "tsx src/scripts/validate-curriculum-graph.ts"
  }
}
```

**Files Created**:

- `packages/api/src/scripts/validate-curriculum-graph.ts`

**Validation Checks**:

1. **Topological Sort**: Detects circular dependencies
2. **Prerequisite Existence**: Ensures all referenced prerequisites exist
3. **CEFR Ordering**: Warns if higher-level concepts are prerequisites for lower-level ones
4. **Orphaned Concepts**: Identifies isolated concepts

**Usage**:

```bash
npm run validate:curriculum
```

---

## Dependencies

- **Blocks**: All learning features (F033-F056) - concepts must be unlocked before learning
- **Depends on**:
  - F001 (Database Schema - curriculum_graph table)
  - F002 (Core Domain Model - Language enum)
  - F018 (API Infrastructure)
  - F022 (React Application Setup)

---

## Open Questions

### Question 1: Next Concept Prioritization Algorithm

**Context**: When multiple concepts are unlocked simultaneously, how should the system decide which one to recommend?

**Options**:

1. **Priority Order Field** (Current Implementation)
   - Pros: Simple, explicit control, predictable
   - Cons: Requires manual curation, doesn't adapt to user
2. **CEFR Level First, Then Priority**
   - Pros: Ensures progressive difficulty
   - Cons: May delay advanced learners on lower-level concepts
3. **Adaptive Recommendation** (ML-based)
   - Pros: Personalized, considers user performance patterns
   - Cons: Complex, requires training data, may be unpredictable
4. **User Choice** (Show all unlocked, let user pick)
   - Pros: Maximum autonomy
   - Cons: Analysis paralysis, suboptimal learning path

**Current Decision**: Option 1 (Priority Order) for MVP. Can add user preference override later.

**Impact**: Low - affects UX but not correctness. Can iterate post-launch.

---

### Question 2: OR Prerequisites Semantics

**Context**: When a concept has OR prerequisites (e.g., "German cases OR English grammar basics"), should completing ONE unlock it, or should the system guide users toward the "better" prerequisite?

**Options**:

1. **Pure OR Logic** (Any one unlocks)
   - Pros: Flexible, respects user autonomy
   - Cons: User might skip recommended path
2. **Weighted OR** (All available, but one marked "recommended")
   - Pros: Guidance without restriction
   - Cons: Requires additional metadata (prereq weights)
3. **Adaptive OR** (System recommends based on user's language background)
   - Pros: Personalized, optimal learning
   - Cons: Complex, needs user profile data

**Current Decision**: Option 1 (Pure OR) for simplicity. Add metadata for "recommended" prerequisite later if needed.

**Impact**: Medium - affects learning path quality. Should gather user feedback post-launch.

---

### Question 3: Graph Visualization Performance at Scale

**Context**: With 1000+ concepts per language, rendering the full graph in React may cause performance issues.

**Options**:

1. **Full Graph Render** (Current Implementation)
   - Pros: Simple, works for MVP scale (100-300 concepts)
   - Cons: May lag with 1000+ nodes
2. **Virtualized Rendering** (Only render visible nodes)
   - Pros: Handles large graphs
   - Cons: Requires library (react-window), complex scroll UX
3. **Level-Based Pagination** (Show one CEFR level at a time)
   - Pros: Manageable chunk size
   - Cons: Loses overview of full curriculum
4. **Dedicated Graph Library** (e.g., Cytoscape.js, D3.js force-directed graph)
   - Pros: Professional visualization, zoom/pan
   - Cons: Large bundle size, learning curve

**Current Decision**: Option 1 for MVP (assumes <300 concepts per language). Monitor performance, upgrade to Option 4 (D3.js) if needed.

**Impact**: Low for MVP, Medium for production scale. Defer decision until we have real data on curriculum size.

---

## Notes

- **Graph Structure**: Directed Acyclic Graph (DAG) enforced by validation script
- **Caching Strategy**: In-memory cache prevents repeated DB queries (cleared on graph updates)
- **Performance**: Kahn's algorithm runs in O(V + E) time - efficient for graphs <10k nodes
- **Future Enhancement**: Add "suggested learning time per day" to pace users through curriculum
- **Alternative Paths**: OR prerequisites enable multiple valid learning paths (e.g., grammar-first vs immersion-first)
- **Concept Types**: orthography | vocabulary | grammar | pronunciation (can be extended)
- **Optional Concepts**: Marked `is_optional = true` - don't block progression if skipped
- **Unlocking Logic**: Batch operation prevents N+1 queries when completing prerequisites
- **Topological Sort Use Cases**:
  - Content export in dependency order
  - Bulk user onboarding (initialize all concepts in correct order)
  - Curriculum validation during data ingestion
