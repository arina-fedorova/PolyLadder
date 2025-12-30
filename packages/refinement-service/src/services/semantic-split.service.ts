import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

interface CurriculumLevel {
  id: string;
  cefrLevel: string;
  name: string;
}

interface CurriculumTopic {
  id: string;
  levelId: string;
  cefrLevel: string;
  name: string;
  description: string | null;
  contentType: string;
}

interface Chunk {
  id: string;
  documentId: string;
  cleanedText: string;
  chunkType: string;
  language: string;
}

interface SplitItem {
  original_content: string;
  suggested_topic_id: string;
  suggested_level: string;
  content_type: 'vocabulary' | 'grammar' | 'orthography' | 'mixed';
  reasoning: string;
}

interface SplitResult {
  items: SplitItem[];
}

export class SemanticSplitService {
  private client: Anthropic;

  constructor(
    private readonly pool: Pool,
    apiKey: string
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async splitChunk(chunkId: string, pipelineId: string): Promise<number> {
    const chunk = await this.getChunk(chunkId);
    if (!chunk) {
      logger.warn({ chunkId }, 'Chunk not found');
      return 0;
    }

    const curriculum = await this.getFullCurriculum(chunk.language);
    if (curriculum.topics.length === 0) {
      logger.warn({ language: chunk.language }, 'No curriculum topics found');
      return 0;
    }

    const existingDrafts = await this.countExistingDrafts(chunkId);
    if (existingDrafts > 0) {
      logger.info({ chunkId, existingDrafts }, 'Chunk already has drafts, skipping');
      return 0;
    }

    const result = await this.callLLM(chunk, curriculum);
    let created = 0;

    for (const item of result.items) {
      if (!item.suggested_topic_id) {
        continue;
      }

      const topicExists = curriculum.topics.some((t) => t.id === item.suggested_topic_id);
      if (!topicExists) {
        logger.warn(
          { chunkId, topicId: item.suggested_topic_id },
          'Suggested topic not found in curriculum'
        );
        continue;
      }

      const draftId = await this.createDraft(item, chunk, pipelineId);
      if (draftId) {
        created++;
      }
    }

    logger.info({ chunkId, draftsCreated: created }, 'Semantic split complete');
    return created;
  }

  private async callLLM(
    chunk: Chunk,
    curriculum: { levels: CurriculumLevel[]; topics: CurriculumTopic[] }
  ): Promise<SplitResult> {
    const prompt = this.buildPrompt(chunk, curriculum);

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return { items: [] };
    }

    return this.parseResponse(content.text, chunk.id);
  }

  private buildPrompt(
    chunk: Chunk,
    curriculum: { levels: CurriculumLevel[]; topics: CurriculumTopic[] }
  ): string {
    const curriculumJson = {
      levels: curriculum.levels.map((l) => ({
        cefr: l.cefrLevel,
        name: l.name,
      })),
      topics: curriculum.topics.map((t) => ({
        id: t.id,
        level: t.cefrLevel,
        name: t.name,
        type: t.contentType,
        description: t.description,
      })),
    };

    return `You are analyzing educational content for language learning.
Your task is to GROUP related content and map it to curriculum topics.

## Full Curriculum Structure:
${JSON.stringify(curriculumJson, null, 2)}

## Source Document:
Language: ${chunk.language}
Detected Chunk Type: ${chunk.chunkType}

## Raw Text Chunk:
"${chunk.cleanedText}"

## Instructions:
1. Analyze the chunk and identify THEMATIC GROUPS (NOT individual words/rules)
2. Create 1-3 items maximum per chunk:
   - For vocabulary: group ALL related words together (e.g., all greetings, all colors)
   - For grammar: one item per grammar CONCEPT (include all examples together)
3. For each group:
   - Find the BEST matching curriculum topic (use exact topic id)
   - CEFR level must match the topic's level
   - Content type: vocabulary | grammar | orthography | mixed
4. CRITICAL RULES:
   - Maximum 3 items per chunk
   - Keep original text EXACTLY as-is (no modifications)
   - If chunk covers ONE topic → create ONE item with all content
   - Skip content that doesn't match any curriculum topic
   - Do NOT split related content into separate items

## Output (JSON):
{
  "items": [
    {
      "original_content": "full grouped text from chunk",
      "suggested_topic_id": "uuid from curriculum",
      "suggested_level": "A1",
      "content_type": "vocabulary",
      "reasoning": "why this topic mapping"
    }
  ]
}

If no valid items found, return: { "items": [] }`;
  }

  private parseResponse(responseText: string, chunkId: string): SplitResult {
    try {
      let jsonText = responseText.trim();

      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonText) as SplitResult;

      if (!parsed.items || !Array.isArray(parsed.items)) {
        logger.warn({ chunkId, response: responseText }, 'Invalid split response format');
        return { items: [] };
      }

      const validItems = parsed.items.filter(
        (item) =>
          item.original_content &&
          item.suggested_topic_id &&
          item.suggested_level &&
          item.content_type
      );

      return { items: validItems };
    } catch (error) {
      logger.error({ chunkId, response: responseText, error }, 'Failed to parse split response');
      return { items: [] };
    }
  }

  private async getChunk(chunkId: string): Promise<Chunk | null> {
    interface ChunkRow {
      id: string;
      document_id: string;
      cleaned_text: string;
      chunk_type: string;
      language: string;
    }

    const result = await this.pool.query<ChunkRow>(
      `SELECT c.id, c.document_id, c.cleaned_text, c.chunk_type, d.language
       FROM raw_content_chunks c
       JOIN document_sources d ON c.document_id = d.id
       WHERE c.id = $1`,
      [chunkId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      documentId: row.document_id,
      cleanedText: row.cleaned_text,
      chunkType: row.chunk_type,
      language: row.language,
    };
  }

  private async getFullCurriculum(
    language: string
  ): Promise<{ levels: CurriculumLevel[]; topics: CurriculumTopic[] }> {
    interface LevelRow {
      id: string;
      cefr_level: string;
      name: string;
    }

    interface TopicRow {
      id: string;
      level_id: string;
      cefr_level: string;
      name: string;
      description: string | null;
      content_type: string;
    }

    const levelsResult = await this.pool.query<LevelRow>(
      `SELECT id, cefr_level, name FROM curriculum_levels WHERE language = $1 ORDER BY sort_order`,
      [language]
    );

    const topicsResult = await this.pool.query<TopicRow>(
      `SELECT t.id, t.level_id, l.cefr_level, t.name, t.description, t.content_type
       FROM curriculum_topics t
       JOIN curriculum_levels l ON t.level_id = l.id
       WHERE l.language = $1
       ORDER BY l.sort_order, t.sort_order`,
      [language]
    );

    return {
      levels: levelsResult.rows.map((r) => ({
        id: r.id,
        cefrLevel: r.cefr_level,
        name: r.name,
      })),
      topics: topicsResult.rows.map((r) => ({
        id: r.id,
        levelId: r.level_id,
        cefrLevel: r.cefr_level,
        name: r.name,
        description: r.description,
        contentType: r.content_type,
      })),
    };
  }

  private async countExistingDrafts(chunkId: string): Promise<number> {
    interface CountRow {
      count: string;
    }

    const result = await this.pool.query<CountRow>(
      `SELECT COUNT(*) as count FROM drafts WHERE chunk_id = $1`,
      [chunkId]
    );

    return parseInt(result.rows[0].count, 10);
  }

  private async createDraft(
    item: SplitItem,
    chunk: Chunk,
    pipelineId: string
  ): Promise<string | null> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const dataType = this.mapContentTypeToDataType(item.content_type);

      interface DraftRow {
        id: string;
      }

      const draftResult = await client.query<DraftRow>(
        `INSERT INTO drafts (
          data_type, raw_data, source, document_id, chunk_id, topic_id,
          approval_status, suggested_topic_id, suggested_level, original_content, llm_reasoning
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id`,
        [
          dataType,
          JSON.stringify({ content: item.original_content }),
          'semantic_split',
          chunk.documentId,
          chunk.id,
          item.suggested_topic_id,
          'pending',
          item.suggested_topic_id,
          item.suggested_level,
          item.original_content,
          item.reasoning,
        ]
      );

      const draftId = draftResult.rows[0].id;

      await client.query(
        `INSERT INTO draft_review_queue (draft_id, pipeline_id, priority)
         VALUES ($1, $2, $3)
         ON CONFLICT (draft_id) DO NOTHING`,
        [draftId, pipelineId, 5]
      );

      await client.query('COMMIT');

      logger.debug(
        { draftId, chunkId: chunk.id, topicId: item.suggested_topic_id },
        'Created draft from semantic split'
      );

      return draftId;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ chunkId: chunk.id, error }, 'Failed to create draft');
      return null;
    } finally {
      client.release();
    }
  }

  private mapContentTypeToDataType(
    contentType: 'vocabulary' | 'grammar' | 'orthography' | 'mixed'
  ): string {
    switch (contentType) {
      case 'vocabulary':
        return 'meaning';
      case 'grammar':
        return 'rule';
      case 'orthography':
        return 'rule';
      case 'mixed':
        return 'rule';
      default:
        return 'rule';
    }
  }
}
