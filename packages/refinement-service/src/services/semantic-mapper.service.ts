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
        const mappings = await this.mapSingleChunk(chunk, topics);

        for (const mapping of mappings) {
          await this.saveMappingResult(mapping);
          results.push(mapping);
        }
      } catch (error) {
        logger.error({ chunkId: chunk.id, error }, 'Failed to map chunk');
      }
    }

    return results;
  }

  private async mapSingleChunk(chunk: Chunk, topics: Topic[]): Promise<MappingResult[]> {
    const topicList = topics
      .map((t, i) => `${i + 1}. ${t.name} (${t.contentType}): ${t.description || 'No description'}`)
      .join('\n');

    const chunkTypeHint =
      chunk.chunkType === 'vocabulary_section'
        ? '\n\n## IMPORTANT: This chunk is detected as a VOCABULARY SECTION. Prioritize vocabulary topics over grammar topics when the chunk contains word lists or vocabulary definitions.'
        : chunk.chunkType === 'grammar_explanation'
          ? '\n\n## IMPORTANT: This chunk is detected as a GRAMMAR EXPLANATION. Prioritize grammar topics when the chunk explains grammatical rules.'
          : '';

    const prompt = `You are analyzing educational content for language learning. 
Given a text chunk from a textbook, find ALL relevant curriculum topics it covers.

## Available Topics:
${topicList}

## Text Chunk:
"${chunk.cleanedText.substring(0, 2000)}"
${chunkTypeHint}

## Instructions:
1. Analyze the content of the chunk thoroughly
2. Consider the chunk type (${chunk.chunkType}) when matching to topics - vocabulary sections should primarily map to vocabulary topics, grammar explanations to grammar topics
3. Identify ALL topics that are relevant to this chunk (a chunk can cover multiple topics)
4. For each relevant topic, provide a confidence score (0.0-1.0)
5. Only include topics with confidence >= 0.3
6. A chunk can map to multiple topics if it covers multiple concepts, but prioritize topics that match the chunk type

Respond in JSON format:
{
  "mappings": [
    {
      "topic_index": <number 1-${topics.length}>,
      "confidence": <number 0.0-1.0>,
      "reasoning": "<brief explanation of why this topic is relevant>"
    }
  ]
}

Example: If a chunk covers both "Present tense verbs" and "Basic vocabulary", return:
{
  "mappings": [
    {"topic_index": 5, "confidence": 0.85, "reasoning": "Chunk contains present tense conjugations"},
    {"topic_index": 12, "confidence": 0.65, "reasoning": "Chunk includes vocabulary words"}
  ]
}`;

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') return [];

    try {
      let jsonText = content.text.trim();

      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonText) as {
        mappings?: Array<{
          topic_index: number;
          confidence: number;
          reasoning: string;
        }>;
      };

      if (!parsed.mappings || !Array.isArray(parsed.mappings)) {
        logger.warn(
          { chunkId: chunk.id, response: content.text },
          'Invalid mapping response format'
        );
        return [];
      }

      const results: MappingResult[] = [];

      for (const mapping of parsed.mappings) {
        if (
          mapping.confidence < 0.3 ||
          mapping.topic_index < 1 ||
          mapping.topic_index > topics.length
        ) {
          continue;
        }

        const selectedTopic = topics[mapping.topic_index - 1];
        if (!selectedTopic) continue;

        results.push({
          chunkId: chunk.id,
          topicId: selectedTopic.id,
          confidence: mapping.confidence,
          reasoning: mapping.reasoning,
        });
      }

      logger.info(
        { chunkId: chunk.id, mappingsCount: results.length },
        'Mapped chunk to multiple topics'
      );

      return results;
    } catch (error) {
      logger.error(
        { chunkId: chunk.id, response: content.text, error },
        'Failed to parse mapping response'
      );
      return [];
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
