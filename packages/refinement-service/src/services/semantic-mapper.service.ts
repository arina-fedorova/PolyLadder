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
      const parsed = JSON.parse(content.text) as {
        topic_index: number;
        confidence: number;
        reasoning: string;
      };

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
    } catch {
      logger.error(
        { chunkId: chunk.id, response: content.text },
        'Failed to parse mapping response'
      );
      return null;
    }
  }

  private async getUnmappedChunks(documentId: string): Promise<Chunk[]> {
    interface ChunkRow {
      id: string;
      cleaned_text: string;
      chunk_type: string;
    }

    const result = await this.pool.query<ChunkRow>(
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
    interface TopicRow {
      id: string;
      name: string;
      description: string | null;
      content_type: string;
    }

    const result = await this.pool.query<TopicRow>(
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
