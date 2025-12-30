import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { PipelineEventLogger } from './pipeline-event-logger.service';

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
  private eventLogger: PipelineEventLogger;

  constructor(
    private readonly pool: Pool,
    apiKey: string
  ) {
    this.client = new Anthropic({ apiKey });
    this.eventLogger = new PipelineEventLogger(pool);
  }

  async transformMapping(mappingId: string): Promise<TransformationResult> {
    const startTime = Date.now();

    const input = await this.getTransformationInput(mappingId);

    const jobId = await this.createTransformationJob(mappingId);

    try {
      const result = await this.executeTransformation(input, jobId, startTime);

      await this.completeJob(jobId);
      await this.createDrafts(result, input, jobId);

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
      model: 'claude-sonnet-4-20250514',
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

    if (
      input.topicType === 'grammar' ||
      input.topicType === 'orthography' ||
      input.topicType === 'mixed'
    ) {
      const typeLabel =
        input.topicType === 'orthography'
          ? 'orthographic rule'
          : input.topicType === 'mixed'
            ? 'learning rule'
            : 'grammar rule';
      return `${basePrompt}

## Output Format (JSON array):
[
  {
    "title": "${typeLabel} title (concise, descriptive)",
    "explanation": "Clear, structured explanation of the rule in ENGLISH. This explanation is for learners who are studying ${input.language} but their base language is English. Use simple English appropriate for ${input.level} level learners. Break down complex rules into understandable parts. The explanation should help English speakers understand how the ${input.language} grammar rule works.",
    "examples": [
      {
        "correct": "Complete sentence in ${input.language} demonstrating correct usage",
        "incorrect": "Common incorrect usage in ${input.language} (if applicable)",
        "note": "Brief explanation in ENGLISH of why the example is correct or what it demonstrates"
      }
    ],
    "commonMistakes": "List of typical errors learners make with this rule (in English)"
  }
]

## CRITICAL REQUIREMENTS:
- You MUST provide at least 2-3 examples in the "examples" array for every rule
- Examples must be complete, meaningful sentences (not fragments) in ${input.language}
- Each example must have:
  - "correct": A full sentence in ${input.language} showing proper usage
  - "note": A brief explanation in ENGLISH explaining what the example demonstrates
  - "incorrect": (optional) A common mistake in ${input.language} if relevant
- The "explanation" field MUST be in ENGLISH - this is for learners whose base language is English
- The "commonMistakes" field MUST be in ENGLISH
- Only the example sentences ("correct" and "incorrect") should be in ${input.language}
- If the source text doesn't contain explicit examples, create appropriate, realistic examples based on the rule
- Examples are REQUIRED - never return an empty examples array
- The "explanation" should be clear and structured, breaking down complex concepts into digestible parts
- Make explanations accessible for ${input.level} level learners who speak English as their base language

Extract ${typeLabel}s with all provided examples. If examples are not explicit in the text, create realistic, educational examples based on the rule.`;
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

    // Map topic types to data types
    // - vocabulary -> meaning
    // - grammar -> rule
    // - orthography -> rule (orthographic rules)
    // - mixed -> rule (treat as general learning rules)
    const dataType =
      topicType === 'vocabulary'
        ? 'meaning'
        : topicType === 'grammar' || topicType === 'orthography' || topicType === 'mixed'
          ? 'rule'
          : 'exercise';

    return { dataType, items };
  }

  private async createDrafts(
    result: TransformationResult,
    _input: TransformationInput,
    transformationJobId: string
  ): Promise<void> {
    interface MappingRow {
      document_id: string;
      chunk_id: string;
      topic_id: string;
      topic_name: string;
      language: string;
      level: string;
    }

    const mapping = await this.pool.query<MappingRow>(
      `SELECT c.document_id, m.chunk_id, m.topic_id, t.name as topic_name, l.language, l.cefr_level as level
       FROM content_topic_mappings m
       JOIN raw_content_chunks c ON m.chunk_id = c.id
       JOIN curriculum_topics t ON m.topic_id = t.id
       JOIN curriculum_levels l ON t.level_id = l.id
       WHERE m.id = $1`,
      [result.mappingId]
    );

    if (mapping.rows.length === 0) return;

    const { document_id, chunk_id, topic_id, topic_name, language, level } = mapping.rows[0];

    for (const item of result.items) {
      const enrichedItem = {
        ...item,
        topic: topic_name,
        language: language,
        level: level,
      };

      const itemKey =
        result.dataType === 'meaning' ? (item as VocabularyItem).word : (item as GrammarItem).title;

      if (!itemKey) {
        logger.warn({ item, dataType: result.dataType }, 'Skipping item without key');
        continue;
      }

      const existingDraft = await this.pool.query<{ id: string }>(
        `SELECT id FROM drafts
         WHERE data_type = $1
           AND document_id = $2
           AND topic_id = $3
           AND (
             (data_type = 'meaning' AND raw_data->>'word' = $4)
             OR (data_type = 'rule' AND raw_data->>'title' = $5)
           )
         LIMIT 1`,
        [result.dataType, document_id, topic_id, itemKey, itemKey]
      );

      if (existingDraft.rows.length > 0) {
        logger.info(
          {
            itemKey,
            dataType: result.dataType,
            topicId: topic_id,
            existingDraftId: existingDraft.rows[0].id,
            mappingId: result.mappingId,
          },
          'Skipping duplicate draft (same topic)'
        );
        continue;
      }

      const existingCandidate = await this.pool.query<{ id: string }>(
        `SELECT c.id FROM candidates c
         JOIN drafts d ON c.draft_id = d.id
         WHERE d.data_type = $1
           AND d.document_id = $2
           AND d.topic_id = $3
           AND (
             (d.data_type = 'meaning' AND d.raw_data->>'word' = $4)
             OR (d.data_type = 'rule' AND d.raw_data->>'title' = $5)
           )
         LIMIT 1`,
        [result.dataType, document_id, topic_id, itemKey, itemKey]
      );

      if (existingCandidate.rows.length > 0) {
        logger.info(
          {
            itemKey,
            dataType: result.dataType,
            topicId: topic_id,
            existingCandidateId: existingCandidate.rows[0].id,
            mappingId: result.mappingId,
          },
          'Skipping duplicate candidate (same topic)'
        );
        continue;
      }

      const existingValidated = await this.pool.query<{ id: string }>(
        `SELECT v.id FROM validated v
         JOIN candidates c ON v.candidate_id = c.id
         JOIN drafts d ON c.draft_id = d.id
         WHERE v.data_type = $1
           AND d.document_id = $2
           AND d.topic_id = $3
           AND (
             (v.data_type = 'meaning' AND v.validated_data->>'word' = $4)
             OR (v.data_type = 'rule' AND v.validated_data->>'title' = $5)
           )
           AND NOT EXISTS (
             SELECT 1 FROM rejected_items ri WHERE ri.validated_id = v.id
           )
         LIMIT 1`,
        [result.dataType, document_id, topic_id, itemKey, itemKey]
      );

      if (existingValidated.rows.length > 0) {
        logger.info(
          {
            itemKey,
            dataType: result.dataType,
            topicId: topic_id,
            existingValidatedId: existingValidated.rows[0].id,
            mappingId: result.mappingId,
          },
          'Skipping duplicate validated (same topic, not rejected)'
        );
        continue;
      }

      const existingRejected = await this.pool.query<{ id: string }>(
        `SELECT ri.id FROM rejected_items ri
         JOIN validated v ON ri.validated_id = v.id
         JOIN candidates c ON v.candidate_id = c.id
         JOIN drafts d ON c.draft_id = d.id
         WHERE ri.data_type = $1
           AND d.document_id = $2
           AND d.topic_id = $3
           AND (
             (ri.data_type = 'meaning' AND ri.rejected_data->>'word' = $4)
             OR (ri.data_type = 'rule' AND ri.rejected_data->>'title' = $5)
           )
         LIMIT 1`,
        [result.dataType, document_id, topic_id, itemKey, itemKey]
      );

      if (existingRejected.rows.length > 0) {
        logger.info(
          {
            itemKey,
            dataType: result.dataType,
            topicId: topic_id,
            existingRejectedId: existingRejected.rows[0].id,
            mappingId: result.mappingId,
          },
          'Skipping content that was previously rejected for this topic'
        );
        continue;
      }

      const draftResult = await this.pool.query<{ id: string }>(
        `INSERT INTO drafts
         (data_type, raw_data, source, document_id, chunk_id, topic_id, transformation_job_id)
         VALUES ($1, $2, 'document_transform', $3, $4, $5, $6)
         RETURNING id`,
        [
          result.dataType,
          JSON.stringify(enrichedItem),
          document_id,
          chunk_id,
          topic_id,
          transformationJobId,
        ]
      );

      const draftId = draftResult.rows[0].id;

      await this.eventLogger.logEvent({
        itemId: draftId,
        itemType: 'draft',
        eventType: 'draft_created',
        stage: 'DRAFT',
        status: 'pending',
        dataType: result.dataType,
        source: 'document_transform',
        documentId: document_id,
        chunkId: chunk_id,
        topicId: topic_id,
        mappingId: result.mappingId,
        payload: {
          language,
          level,
          itemTitle: (item as GrammarItem).title || (item as VocabularyItem).word || 'unknown',
        },
      });
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

  async transformCandidate(candidateId: string): Promise<{ validatedId: string } | null> {
    interface CandidateRow {
      id: string;
      data_type: string;
      normalized_data: Record<string, unknown>;
      draft_id: string;
    }

    interface DraftRow {
      topic_id: string;
      document_id: string;
    }

    interface TopicRow {
      name: string;
      content_type: string;
      language: string;
      level: string;
    }

    const candidateResult = await this.pool.query<CandidateRow>(
      `SELECT id, data_type, normalized_data, draft_id FROM candidates WHERE id = $1`,
      [candidateId]
    );

    if (candidateResult.rows.length === 0) {
      logger.warn({ candidateId }, 'Candidate not found for transformation');
      return null;
    }

    const candidate = candidateResult.rows[0];
    const rawData = candidate.normalized_data;

    const draftResult = await this.pool.query<DraftRow>(
      `SELECT topic_id, document_id FROM drafts WHERE id = $1`,
      [candidate.draft_id]
    );

    if (draftResult.rows.length === 0) {
      logger.warn({ draftId: candidate.draft_id }, 'Draft not found for candidate');
      return null;
    }

    const draft = draftResult.rows[0];

    const topicResult = await this.pool.query<TopicRow>(
      `SELECT t.name, t.content_type, l.language, l.cefr_level as level
       FROM curriculum_topics t
       JOIN curriculum_levels l ON t.level_id = l.id
       WHERE t.id = $1`,
      [draft.topic_id]
    );

    if (topicResult.rows.length === 0) {
      logger.warn({ topicId: draft.topic_id }, 'Topic not found for candidate transformation');
      return null;
    }

    const topic = topicResult.rows[0];
    const startTime = Date.now();

    try {
      const prompt = this.buildCandidateTransformPrompt(
        rawData,
        candidate.data_type,
        topic.name,
        topic.content_type,
        topic.language,
        topic.level
      );

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from LLM');
      }

      const transformedData = this.parseCandidateTransformResponse(
        content.text,
        candidate.data_type
      );

      const enrichedData = {
        ...transformedData,
        topic: topic.name,
        language: topic.language,
        level: topic.level,
      };

      const validatedResult = await this.pool.query<{ id: string }>(
        `INSERT INTO validated (data_type, validated_data, candidate_id)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [candidate.data_type, JSON.stringify(enrichedData), candidateId]
      );

      const validatedId = validatedResult.rows[0].id;

      const cost = this.calculateCost(response.usage);
      const durationMs = Date.now() - startTime;

      await this.eventLogger.logEvent({
        itemId: validatedId,
        itemType: 'validated',
        eventType: 'candidate_transformed',
        stage: 'VALIDATED',
        status: 'pending',
        dataType: candidate.data_type,
        source: 'candidate_transform',
        documentId: draft.document_id,
        topicId: draft.topic_id,
        payload: {
          candidateId,
          tokensInput: response.usage.input_tokens,
          tokensOutput: response.usage.output_tokens,
          cost,
          durationMs,
        },
      });

      logger.info(
        {
          candidateId,
          validatedId,
          dataType: candidate.data_type,
          durationMs,
          tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        },
        'Candidate transformed to validated'
      );

      return { validatedId };
    } catch (error) {
      logger.error(
        {
          candidateId,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        'Failed to transform candidate'
      );
      throw error;
    }
  }

  private buildCandidateTransformPrompt(
    rawData: Record<string, unknown>,
    dataType: string,
    topicName: string,
    contentType: string,
    language: string,
    level: string
  ): string {
    const rawContent = JSON.stringify(rawData, null, 2);

    const basePrompt = `You are transforming raw educational content into a structured lesson item.

## Context
- Language being learned: ${language}
- CEFR Level: ${level}
- Topic: ${topicName}
- Content Type: ${contentType}

## Raw Content (extracted from textbook):
${rawContent}

## Instructions
Transform this raw content into a polished, structured learning item.
- Preserve the original meaning and key information
- Write ALL explanations and notes in ENGLISH (the learner's base language)
- Example sentences should be in ${language} (the target language)
- Make explanations clear and appropriate for ${level} learners`;

    if (dataType === 'meaning') {
      return `${basePrompt}

## Output Format (JSON object):
{
  "word": "the word in ${language}",
  "definition": "clear definition/translation in ENGLISH",
  "partOfSpeech": "noun/verb/adjective/etc",
  "usageNotes": "usage context in ENGLISH",
  "examples": ["example sentence in ${language}"]
}`;
    }

    if (dataType === 'rule') {
      return `${basePrompt}

## Output Format (JSON object):
{
  "title": "concise rule title",
  "explanation": "clear explanation in ENGLISH, structured for ${level} learners",
  "examples": [
    {
      "correct": "correct sentence in ${language}",
      "incorrect": "optional: common mistake in ${language}",
      "note": "explanation in ENGLISH of what this example demonstrates"
    }
  ],
  "commonMistakes": "list of typical errors in ENGLISH"
}

## CRITICAL REQUIREMENTS:
- Provide at least 2-3 examples
- Examples must be complete sentences in ${language}
- All explanations and notes MUST be in ENGLISH
- Make the explanation structured and easy to understand`;
    }

    if (dataType === 'utterance') {
      return `${basePrompt}

## Output Format (JSON object):
{
  "text": "the phrase/sentence in ${language}",
  "translation": "translation in ENGLISH",
  "context": "when/how to use this phrase in ENGLISH",
  "pronunciation": "optional: pronunciation guide"
}`;
    }

    return `${basePrompt}

## Output Format (JSON object):
Transform into a structured learning item with appropriate fields for the content type.`;
  }

  private parseCandidateTransformResponse(
    response: string,
    dataType: string
  ): Record<string, unknown> {
    let jsonText = response.trim();

    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    }

    const objectMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!objectMatch) {
      throw new Error('No JSON object found in response');
    }

    const parsed = JSON.parse(objectMatch[0]) as Record<string, unknown>;

    if (dataType === 'meaning' && !parsed.word) {
      throw new Error('Missing required field: word');
    }
    if (dataType === 'rule' && !parsed.title) {
      throw new Error('Missing required field: title');
    }
    if (dataType === 'utterance' && !parsed.text) {
      throw new Error('Missing required field: text');
    }

    return parsed;
  }
}
