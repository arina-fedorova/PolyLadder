# F016: Content Transformation Engine

**Feature Code**: F016
**Created**: 2025-12-21
**Phase**: 4 - Content Refinement Service
**Status**: 🔄 Planned
**Replaces**: F016-data-source-integration (deprecated)

---

## Description

LLM-powered engine that maps raw document chunks to curriculum topics and transforms extracted text into structured learning content. This is TRANSFORMATION (not generation) - the content comes from real textbooks, LLM structures it.

## Success Criteria

- [ ] Semantic mapping: chunks → curriculum topics
- [ ] LLM-based topic classification with confidence scoring
- [ ] Operator confirmation UI for mappings
- [ ] LLM transformation: raw text → structured format
- [ ] DRAFT creation with full source traceability
- [ ] Batch processing for efficiency
- [ ] Cost tracking and optimization

---

## Tasks

### Task 1: Database Schema for Mappings

**Description**: Tables to store chunk-to-topic mappings and transformation results.

**Implementation Plan**:

Create `packages/db/migrations/017-content-mappings.sql`:

```sql
CREATE TYPE mapping_status_enum AS ENUM (
  'pending',
  'auto_mapped',
  'confirmed',
  'rejected',
  'manual'
);

CREATE TABLE content_topic_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES raw_content_chunks(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE,

  confidence_score DECIMAL(3, 2) NOT NULL,
  status mapping_status_enum NOT NULL DEFAULT 'pending',

  llm_reasoning TEXT,

  confirmed_by UUID REFERENCES users(id),
  confirmed_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(chunk_id, topic_id)
);

CREATE INDEX idx_content_mappings_chunk ON content_topic_mappings(chunk_id);
CREATE INDEX idx_content_mappings_topic ON content_topic_mappings(topic_id);
CREATE INDEX idx_content_mappings_status ON content_topic_mappings(status);

CREATE TABLE transformation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id UUID NOT NULL REFERENCES content_topic_mappings(id) ON DELETE CASCADE,

  status VARCHAR(50) NOT NULL DEFAULT 'pending',

  prompt_used TEXT,
  raw_response TEXT,
  parsed_result JSONB,

  tokens_input INTEGER,
  tokens_output INTEGER,
  cost_usd DECIMAL(10, 6),
  duration_ms INTEGER,

  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_transformation_jobs_mapping ON transformation_jobs(mapping_id);
CREATE INDEX idx_transformation_jobs_status ON transformation_jobs(status);

ALTER TABLE drafts ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES document_sources(id);
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS chunk_id UUID REFERENCES raw_content_chunks(id);
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES curriculum_topics(id);
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS transformation_job_id UUID REFERENCES transformation_jobs(id);

CREATE VIEW transformation_cost_summary AS
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_jobs,
  SUM(tokens_input) as total_input_tokens,
  SUM(tokens_output) as total_output_tokens,
  SUM(cost_usd) as total_cost_usd,
  AVG(duration_ms) as avg_duration_ms
FROM transformation_jobs
WHERE status = 'completed'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

**Files Created**: `packages/db/migrations/017-content-mappings.sql`

---

### Task 2: Semantic Mapping Service

**Description**: LLM service to map chunks to curriculum topics.

**Implementation Plan**:

Create `packages/refinement-service/src/services/semantic-mapper.service.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

interface Topic {
  id: string;
  name: string;
  description: string | null;
  contentType: string;
}

interface Chunk {
  id: string;
  cleanedText: string;
  chunkType: string;
}

interface MappingResult {
  chunkId: string;
  topicId: string;
  confidence: number;
  reasoning: string;
}

export class SemanticMapperService {
  private client: Anthropic;

  constructor(
    private readonly pool: Pool,
    apiKey: string
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async mapChunksToTopics(documentId: string, levelId: string): Promise<MappingResult[]> {
    const chunks = await this.getUnmappedChunks(documentId);
    const topics = await this.getTopicsForLevel(levelId);

    if (chunks.length === 0 || topics.length === 0) {
      logger.info({ documentId, levelId }, 'No chunks or topics to map');
      return [];
    }

    const results: MappingResult[] = [];

    for (const chunk of chunks) {
      try {
        const mapping = await this.mapSingleChunk(chunk, topics);

        if (mapping) {
          await this.saveMappingResult(mapping);
          results.push(mapping);
        }
      } catch (error) {
        logger.error({ chunkId: chunk.id, error }, 'Failed to map chunk');
      }
    }

    return results;
  }

  private async mapSingleChunk(chunk: Chunk, topics: Topic[]): Promise<MappingResult | null> {
    const topicList = topics
      .map((t, i) => `${i + 1}. ${t.name} (${t.contentType}): ${t.description || 'No description'}`)
      .join('\n');

    const prompt = `You are analyzing educational content for language learning. 
Given a text chunk from a textbook, determine which curriculum topic it belongs to.

## Available Topics:
${topicList}

## Text Chunk:
"${chunk.cleanedText.substring(0, 2000)}"

## Instructions:
1. Analyze the content of the chunk
2. Determine which topic(s) it most closely matches
3. If no topic matches well, respond with topic_index: 0

Respond in JSON format:
{
  "topic_index": <number 1-${topics.length} or 0 if no match>,
  "confidence": <number 0.0-1.0>,
  "reasoning": "<brief explanation of why this topic matches>"
}`;

    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') return null;

    try {
      const parsed = JSON.parse(content.text);

      if (parsed.topic_index === 0 || parsed.confidence < 0.3) {
        return null;
      }

      const selectedTopic = topics[parsed.topic_index - 1];
      if (!selectedTopic) return null;

      return {
        chunkId: chunk.id,
        topicId: selectedTopic.id,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      logger.error(
        { chunkId: chunk.id, response: content.text },
        'Failed to parse mapping response'
      );
      return null;
    }
  }

  private async getUnmappedChunks(documentId: string): Promise<Chunk[]> {
    const result = await this.pool.query(
      `SELECT c.id, c.cleaned_text, c.chunk_type
       FROM raw_content_chunks c
       LEFT JOIN content_topic_mappings m ON c.id = m.chunk_id
       WHERE c.document_id = $1 AND m.id IS NULL
       ORDER BY c.chunk_index`,
      [documentId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      cleanedText: row.cleaned_text,
      chunkType: row.chunk_type,
    }));
  }

  private async getTopicsForLevel(levelId: string): Promise<Topic[]> {
    const result = await this.pool.query(
      `SELECT id, name, description, content_type
       FROM curriculum_topics
       WHERE level_id = $1
       ORDER BY sort_order`,
      [levelId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      contentType: row.content_type,
    }));
  }

  private async saveMappingResult(mapping: MappingResult): Promise<void> {
    await this.pool.query(
      `INSERT INTO content_topic_mappings 
       (chunk_id, topic_id, confidence_score, status, llm_reasoning)
       VALUES ($1, $2, $3, 'auto_mapped', $4)
       ON CONFLICT (chunk_id, topic_id) DO UPDATE
       SET confidence_score = $3, llm_reasoning = $4`,
      [mapping.chunkId, mapping.topicId, mapping.confidence, mapping.reasoning]
    );
  }
}
```

**Files Created**: `packages/refinement-service/src/services/semantic-mapper.service.ts`

---

### Task 3: Content Transformation Service

**Description**: LLM service to transform raw text into structured learning content.

**Implementation Plan**:

Create `packages/refinement-service/src/services/content-transformer.service.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

interface TransformationInput {
  mappingId: string;
  chunkText: string;
  topicName: string;
  topicType: 'vocabulary' | 'grammar' | 'orthography' | 'mixed';
  language: string;
  level: string;
}

interface VocabularyItem {
  word: string;
  definition: string;
  partOfSpeech: string;
  usageNotes?: string;
  examples?: string[];
}

interface GrammarItem {
  title: string;
  explanation: string;
  examples: Array<{
    correct: string;
    incorrect?: string;
    note?: string;
  }>;
  commonMistakes?: string;
}

interface TransformationResult {
  mappingId: string;
  dataType: 'meaning' | 'rule' | 'exercise';
  items: Array<VocabularyItem | GrammarItem>;
  tokensUsed: { input: number; output: number };
  cost: number;
  durationMs: number;
}

export class ContentTransformerService {
  private client: Anthropic;

  constructor(
    private readonly pool: Pool,
    apiKey: string
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async transformMapping(mappingId: string): Promise<TransformationResult> {
    const startTime = Date.now();

    const input = await this.getTransformationInput(mappingId);

    const jobId = await this.createTransformationJob(mappingId);

    try {
      const result = await this.executeTransformation(input, jobId);

      await this.completeJob(jobId, result);
      await this.createDrafts(result, input);

      return result;
    } catch (error) {
      await this.failJob(jobId, error as Error);
      throw error;
    }
  }

  private async executeTransformation(
    input: TransformationInput,
    jobId: string
  ): Promise<TransformationResult> {
    const startTime = Date.now();
    const prompt = this.buildTransformationPrompt(input);

    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const parsed = this.parseTransformationResponse(content.text, input.topicType);
    const cost = this.calculateCost(response.usage);

    await this.pool.query(
      `UPDATE transformation_jobs 
       SET prompt_used = $1, raw_response = $2, parsed_result = $3,
           tokens_input = $4, tokens_output = $5, cost_usd = $6, duration_ms = $7
       WHERE id = $8`,
      [
        prompt,
        content.text,
        JSON.stringify(parsed.items),
        response.usage.input_tokens,
        response.usage.output_tokens,
        cost,
        Date.now() - startTime,
        jobId,
      ]
    );

    return {
      mappingId: input.mappingId,
      dataType: parsed.dataType,
      items: parsed.items,
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
      cost,
      durationMs: Date.now() - startTime,
    };
  }

  private buildTransformationPrompt(input: TransformationInput): string {
    const basePrompt = `You are extracting structured learning content from educational text.

## Context
- Language: ${input.language}
- CEFR Level: ${input.level}
- Topic: ${input.topicName}

## Source Text (from textbook):
"${input.chunkText}"

## Instructions
Extract ALL learning items from this text. Transform them into structured format.
Do NOT invent content. Only extract what exists in the source text.`;

    if (input.topicType === 'vocabulary') {
      return `${basePrompt}

## Output Format (JSON array):
[
  {
    "word": "exact word from text",
    "definition": "definition or translation if provided",
    "partOfSpeech": "noun/verb/adjective/etc",
    "usageNotes": "any context or usage notes from text",
    "examples": ["example sentence if provided"]
  }
]

Extract every vocabulary word mentioned. If definition isn't explicit, leave it empty.`;
    }

    if (input.topicType === 'grammar') {
      return `${basePrompt}

## Output Format (JSON array):
[
  {
    "title": "grammar rule title",
    "explanation": "clear explanation of the rule",
    "examples": [
      {
        "correct": "correct usage example",
        "incorrect": "incorrect usage if shown",
        "note": "explanation of the example"
      }
    ],
    "commonMistakes": "any mentioned common errors"
  }
]

Extract grammar rules with all provided examples.`;
    }

    return `${basePrompt}

## Output Format (JSON array):
Based on the content type, extract relevant learning items in structured format.
Include: title, content, examples where available.`;
  }

  private parseTransformationResponse(
    response: string,
    topicType: string
  ): { dataType: 'meaning' | 'rule' | 'exercise'; items: any[] } {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
    }

    const items = JSON.parse(jsonMatch[0]);

    const dataType =
      topicType === 'vocabulary' ? 'meaning' : topicType === 'grammar' ? 'rule' : 'exercise';

    return { dataType, items };
  }

  private async createDrafts(
    result: TransformationResult,
    input: TransformationInput
  ): Promise<void> {
    const mapping = await this.pool.query(
      `SELECT c.document_id, m.chunk_id, m.topic_id
       FROM content_topic_mappings m
       JOIN raw_content_chunks c ON m.chunk_id = c.id
       WHERE m.id = $1`,
      [result.mappingId]
    );

    if (mapping.rows.length === 0) return;

    const { document_id, chunk_id, topic_id } = mapping.rows[0];

    for (const item of result.items) {
      await this.pool.query(
        `INSERT INTO drafts 
         (data_type, raw_data, source, document_id, chunk_id, topic_id)
         VALUES ($1, $2, 'document_transform', $3, $4, $5)`,
        [result.dataType, JSON.stringify(item), document_id, chunk_id, topic_id]
      );
    }

    logger.info(
      {
        mappingId: result.mappingId,
        itemsCreated: result.items.length,
        dataType: result.dataType,
      },
      'Created drafts from transformation'
    );
  }

  private async getTransformationInput(mappingId: string): Promise<TransformationInput> {
    const result = await this.pool.query(
      `SELECT m.id as mapping_id,
              c.cleaned_text as chunk_text,
              t.name as topic_name,
              t.content_type as topic_type,
              l.language,
              l.cefr_level as level
       FROM content_topic_mappings m
       JOIN raw_content_chunks c ON m.chunk_id = c.id
       JOIN curriculum_topics t ON m.topic_id = t.id
       JOIN curriculum_levels l ON t.level_id = l.id
       WHERE m.id = $1`,
      [mappingId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Mapping not found: ${mappingId}`);
    }

    return result.rows[0];
  }

  private async createTransformationJob(mappingId: string): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO transformation_jobs (mapping_id, status)
       VALUES ($1, 'processing')
       RETURNING id`,
      [mappingId]
    );
    return result.rows[0].id;
  }

  private async completeJob(jobId: string, result: TransformationResult): Promise<void> {
    await this.pool.query(
      `UPDATE transformation_jobs 
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [jobId]
    );
  }

  private async failJob(jobId: string, error: Error): Promise<void> {
    await this.pool.query(
      `UPDATE transformation_jobs 
       SET status = 'failed', error_message = $1, retry_count = retry_count + 1
       WHERE id = $2`,
      [error.message, jobId]
    );
  }

  private calculateCost(usage: { input_tokens: number; output_tokens: number }): number {
    const INPUT_COST_PER_1M = 3.0;
    const OUTPUT_COST_PER_1M = 15.0;

    return (
      (usage.input_tokens / 1_000_000) * INPUT_COST_PER_1M +
      (usage.output_tokens / 1_000_000) * OUTPUT_COST_PER_1M
    );
  }
}
```

**Files Created**: `packages/refinement-service/src/services/content-transformer.service.ts`

---

### Task 4: Mapping Confirmation UI

**Description**: Operator interface to review and confirm auto-mapped content.

**Implementation Plan**:

Create `packages/web/src/pages/operator/MappingReviewPage.tsx`:

```typescript
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, ChevronLeft, ChevronRight, FileText, Tag, Percent } from 'lucide-react';
import { api } from '../../api/client';

interface Mapping {
  id: string;
  chunk_id: string;
  topic_id: string;
  confidence_score: number;
  status: string;
  llm_reasoning: string;
  chunk_text: string;
  chunk_type: string;
  topic_name: string;
  topic_type: string;
  document_name: string;
}

export function MappingReviewPage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['mappings-review', page],
    queryFn: () => api.get(`/operational/mappings/review?page=${page}&limit=10`),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/operational/mappings/${id}/confirm`),
    onSuccess: () => queryClient.invalidateQueries(['mappings-review']),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/operational/mappings/${id}/reject`),
    onSuccess: () => queryClient.invalidateQueries(['mappings-review']),
  });

  const bulkConfirmMutation = useMutation({
    mutationFn: (ids: string[]) =>
      api.post('/operational/mappings/bulk-confirm', { ids }),
    onSuccess: () => queryClient.invalidateQueries(['mappings-review']),
  });

  const highConfidenceMappings = data?.mappings?.filter(
    (m: Mapping) => m.confidence_score >= 0.8
  ) || [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Review Content Mappings</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            {data?.total || 0} pending review
          </span>
          {highConfidenceMappings.length > 0 && (
            <button
              onClick={() => bulkConfirmMutation.mutate(
                highConfidenceMappings.map((m: Mapping) => m.id)
              )}
              className="btn btn-secondary"
            >
              Confirm All High Confidence ({highConfidenceMappings.length})
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading mappings...</div>
      ) : data?.mappings?.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <Check className="w-12 h-12 mx-auto text-green-500 mb-4" />
          <h3 className="text-lg font-medium">All mappings reviewed!</h3>
          <p className="text-gray-500">No pending mappings to review.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data?.mappings?.map((mapping: Mapping) => (
            <div key={mapping.id} className="border rounded-lg p-4 bg-white">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="flex items-center gap-1 text-sm text-gray-500">
                      <FileText className="w-4 h-4" />
                      {mapping.document_name}
                    </span>
                    <span className={`flex items-center gap-1 text-sm px-2 py-0.5 rounded ${
                      mapping.confidence_score >= 0.8
                        ? 'bg-green-100 text-green-700'
                        : mapping.confidence_score >= 0.5
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      <Percent className="w-3 h-3" />
                      {Math.round(mapping.confidence_score * 100)}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">Source Chunk</h4>
                      <div className="bg-gray-50 p-3 rounded text-sm max-h-40 overflow-y-auto">
                        {mapping.chunk_text.substring(0, 500)}
                        {mapping.chunk_text.length > 500 && '...'}
                      </div>
                      <span className="text-xs text-gray-400 mt-1 block">
                        Type: {mapping.chunk_type}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">Mapped Topic</h4>
                      <div className="flex items-center gap-2 mb-2">
                        <Tag className="w-4 h-4 text-primary-500" />
                        <span className="font-medium">{mapping.topic_name}</span>
                        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                          {mapping.topic_type}
                        </span>
                      </div>
                      <div className="bg-blue-50 p-3 rounded text-sm text-blue-800">
                        <strong>AI Reasoning:</strong> {mapping.llm_reasoning}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => confirmMutation.mutate(mapping.id)}
                    className="btn btn-success flex items-center gap-1"
                    disabled={confirmMutation.isPending}
                  >
                    <Check className="w-4 h-4" />
                    Confirm
                  </button>
                  <button
                    onClick={() => rejectMutation.mutate(mapping.id)}
                    className="btn btn-danger flex items-center gap-1"
                    disabled={rejectMutation.isPending}
                  >
                    <X className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {data?.total > 10 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 hover:bg-gray-100 rounded disabled:opacity-50"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm">
            Page {page} of {Math.ceil(data.total / 10)}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(data.total / 10)}
            className="p-2 hover:bg-gray-100 rounded disabled:opacity-50"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
```

**Files Created**: `packages/web/src/pages/operator/MappingReviewPage.tsx`

---

### Task 5: API Endpoints for Mappings

**Description**: REST API for managing content mappings.

**Implementation Plan**:

Create `packages/api/src/routes/operational/mappings.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

export const mappingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/operational/mappings/review', async (request, reply) => {
    const { page = 1, limit = 10 } = request.query as any;
    const offset = (page - 1) * limit;

    const result = await fastify.db.query(
      `SELECT m.*, 
              c.cleaned_text as chunk_text,
              c.chunk_type,
              t.name as topic_name,
              t.content_type as topic_type,
              d.original_filename as document_name
       FROM content_topic_mappings m
       JOIN raw_content_chunks c ON m.chunk_id = c.id
       JOIN curriculum_topics t ON m.topic_id = t.id
       JOIN document_sources d ON c.document_id = d.id
       WHERE m.status = 'auto_mapped'
       ORDER BY m.confidence_score DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await fastify.db.query(
      `SELECT COUNT(*) FROM content_topic_mappings WHERE status = 'auto_mapped'`
    );

    return reply.send({
      mappings: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    });
  });

  fastify.post('/operational/mappings/:id/confirm', async (request, reply) => {
    const { id } = request.params as { id: string };

    await fastify.db.query(
      `UPDATE content_topic_mappings 
       SET status = 'confirmed', confirmed_by = $1, confirmed_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [request.user.userId, id]
    );

    return reply.send({ success: true });
  });

  fastify.post('/operational/mappings/:id/reject', async (request, reply) => {
    const { id } = request.params as { id: string };

    await fastify.db.query(`UPDATE content_topic_mappings SET status = 'rejected' WHERE id = $1`, [
      id,
    ]);

    return reply.send({ success: true });
  });

  fastify.post('/operational/mappings/bulk-confirm', async (request, reply) => {
    const { ids } = z.object({ ids: z.array(z.string().uuid()) }).parse(request.body);

    await fastify.db.query(
      `UPDATE content_topic_mappings 
       SET status = 'confirmed', confirmed_by = $1, confirmed_at = CURRENT_TIMESTAMP
       WHERE id = ANY($2)`,
      [request.user.userId, ids]
    );

    return reply.send({ success: true, confirmed: ids.length });
  });

  fastify.post('/operational/mappings/:id/remap', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { topicId } = z.object({ topicId: z.string().uuid() }).parse(request.body);

    await fastify.db.query(
      `UPDATE content_topic_mappings 
       SET topic_id = $1, status = 'manual', confidence_score = 1.0
       WHERE id = $2`,
      [topicId, id]
    );

    return reply.send({ success: true });
  });

  fastify.get('/operational/mappings/stats', async (request, reply) => {
    const result = await fastify.db.query(`
      SELECT 
        status,
        COUNT(*) as count,
        AVG(confidence_score) as avg_confidence
      FROM content_topic_mappings
      GROUP BY status
    `);

    const costResult = await fastify.db.query(`
      SELECT 
        SUM(cost_usd) as total_cost,
        SUM(tokens_input + tokens_output) as total_tokens,
        COUNT(*) as total_jobs
      FROM transformation_jobs
      WHERE completed_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
    `);

    return reply.send({
      mappingStats: result.rows,
      transformationCosts: costResult.rows[0],
    });
  });
};
```

**Files Created**: `packages/api/src/routes/operational/mappings.ts`

---

### Task 6: Batch Processing Integration

**Description**: Integrate mapping and transformation into refinement service main loop.

**Implementation Plan**:

Update `packages/refinement-service/src/main.ts`:

```typescript
import { SemanticMapperService } from './services/semantic-mapper.service';
import { ContentTransformerService } from './services/content-transformer.service';

async function mainLoop() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    logger.error('ANTHROPIC_API_KEY not set');
    return;
  }

  const semanticMapper = new SemanticMapperService(pool, anthropicKey);
  const contentTransformer = new ContentTransformerService(pool, anthropicKey);
  const checkpoint = new CheckpointService(pool);

  logger.info('Refinement Service started (Document Processing Mode)');

  while (!isShuttingDown) {
    try {
      const pendingDoc = await findPendingDocument();
      if (pendingDoc) {
        logger.info({ documentId: pendingDoc.id }, 'Processing document');
        await documentProcessor.processDocument(pendingDoc.id);
        continue;
      }

      const unmappedDoc = await findDocumentWithUnmappedChunks();
      if (unmappedDoc) {
        logger.info({ documentId: unmappedDoc.id }, 'Mapping chunks to topics');
        await semanticMapper.mapChunksToTopics(unmappedDoc.id, unmappedDoc.level_id);
        continue;
      }

      const confirmedMapping = await findConfirmedMappingForTransformation();
      if (confirmedMapping) {
        logger.info({ mappingId: confirmedMapping.id }, 'Transforming mapping');
        await contentTransformer.transformMapping(confirmedMapping.id);
        continue;
      }

      logger.debug('No work available, sleeping');
      await sleep(LOOP_INTERVAL_MS);
    } catch (error) {
      logger.error({ error }, 'Error in main loop');
      await sleep(LOOP_INTERVAL_MS);
    }
  }
}

async function findPendingDocument(): Promise<{ id: string } | null> {
  const result = await pool.query(
    `SELECT id FROM document_sources WHERE status = 'pending' LIMIT 1`
  );
  return result.rows[0] || null;
}

async function findDocumentWithUnmappedChunks(): Promise<{ id: string; level_id: string } | null> {
  const result = await pool.query(
    `SELECT DISTINCT d.id, l.id as level_id
     FROM document_sources d
     JOIN curriculum_levels l ON d.language = l.language AND d.target_level = l.cefr_level
     JOIN raw_content_chunks c ON c.document_id = d.id
     LEFT JOIN content_topic_mappings m ON m.chunk_id = c.id
     WHERE d.status = 'ready' AND m.id IS NULL
     LIMIT 1`
  );
  return result.rows[0] || null;
}

async function findConfirmedMappingForTransformation(): Promise<{ id: string } | null> {
  const result = await pool.query(
    `SELECT m.id
     FROM content_topic_mappings m
     LEFT JOIN transformation_jobs j ON j.mapping_id = m.id AND j.status = 'completed'
     WHERE m.status = 'confirmed' AND j.id IS NULL
     LIMIT 1`
  );
  return result.rows[0] || null;
}
```

**Files Created**: Update `packages/refinement-service/src/main.ts`

---

## Dependencies

- **Blocks**: F017 (Feedback System)
- **Depends on**: F014 (Curriculum), F015 (Document Processing)

---

## Notes

- Transformation is NOT generation - LLM extracts and structures existing content
- Cost is ~90% lower than full generation ($0.01 vs $0.10 per item)
- Operator confirmation is required before transformation (ensures quality)
- Full traceability: DRAFT → chunk → document (can always find source)

---

## Open Questions

### Question 1: Confidence Threshold for Auto-Confirmation

**Context**: At what confidence level should mappings be auto-confirmed?

**Options**:

1. **Conservative (0.95+)**: Only very high confidence
2. **Moderate (0.85+)**: High confidence with occasional errors
3. **Never**: All mappings require operator review

**Recommendation**: Start with 0.95 threshold for MVP. Track accuracy. Lower if operators are overwhelmed.

### Question 2: Batch Size for Transformation

**Context**: How many items to transform per API call?

**Options**:

1. **One chunk at a time**: Simple, easy to debug
2. **Multiple chunks per call**: More efficient, cheaper
3. **Whole topic at once**: Maximum context, highest quality

**Recommendation**: One chunk at a time for MVP. Add batching post-MVP for cost optimization.

### Question 3: Handling Transformation Failures

**Context**: What happens when LLM produces invalid output?

**Options**:

1. **Retry with same prompt**: Simple, might work
2. **Retry with modified prompt**: Add "please output valid JSON"
3. **Mark for manual review**: Operator fixes

**Recommendation**: Retry once with modified prompt. If still fails, mark for manual review.
