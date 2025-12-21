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
      const result = await this.executeTransformation(input, jobId, startTime);

      await this.completeJob(jobId);
      await this.createDrafts(result, input);

      return result;
    } catch (error) {
      await this.failJob(jobId, error as Error);
      throw error;
    }
  }

  private async executeTransformation(
    input: TransformationInput,
    jobId: string,
    startTime: number
  ): Promise<TransformationResult> {
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
  ): { dataType: 'meaning' | 'rule' | 'exercise'; items: Array<VocabularyItem | GrammarItem> } {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
    }

    const items = JSON.parse(jsonMatch[0]) as Array<VocabularyItem | GrammarItem>;

    const dataType =
      topicType === 'vocabulary' ? 'meaning' : topicType === 'grammar' ? 'rule' : 'exercise';

    return { dataType, items };
  }

  private async createDrafts(
    result: TransformationResult,
    _input: TransformationInput
  ): Promise<void> {
    interface MappingRow {
      document_id: string;
      chunk_id: string;
      topic_id: string;
    }

    const mapping = await this.pool.query<MappingRow>(
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
    interface InputRow {
      mapping_id: string;
      chunk_text: string;
      topic_name: string;
      topic_type: 'vocabulary' | 'grammar' | 'orthography' | 'mixed';
      language: string;
      level: string;
    }

    const result = await this.pool.query<InputRow>(
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

    const row = result.rows[0];
    return {
      mappingId: row.mapping_id,
      chunkText: row.chunk_text,
      topicName: row.topic_name,
      topicType: row.topic_type,
      language: row.language,
      level: row.level,
    };
  }

  private async createTransformationJob(mappingId: string): Promise<string> {
    interface JobRow {
      id: string;
    }

    const result = await this.pool.query<JobRow>(
      `INSERT INTO transformation_jobs (mapping_id, status)
       VALUES ($1, 'processing')
       RETURNING id`,
      [mappingId]
    );
    return result.rows[0].id;
  }

  private async completeJob(jobId: string): Promise<void> {
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
