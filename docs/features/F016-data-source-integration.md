# F016: Data Source Integration Framework

**Feature Code**: F016
**Created**: 2025-12-17
**Phase**: 4 - Content Refinement Service
**Status**: ✅ Completed
**Completed**: 2025-12-19
**PR**: #19

---

## Description

Pluggable framework for integrating data sources: LLMs (OpenAI, Anthropic), external parsers, and rule-based generators. Creates DRAFT content from any source.

## Success Criteria

- [x] Adapter interface for data sources
- [x] LLM integration (OpenAI/Anthropic)
- [x] External resource parsers
- [x] Rule-based generators
- [x] DRAFT creation from any source

---

## Tasks

### Task 1: Define Source Adapter Interface

**Description**: Create pluggable interface for integrating different data sources into the content pipeline.

**Implementation Plan**:

Create `packages/refinement-service/src/sources/source-adapter.interface.ts`:

```typescript
import { Language, CEFRLevel } from '@polyladder/core';
import { ContentType } from '../services/work-planner.service';

export interface SourceRequest {
  type: ContentType;
  language: Language;
  level?: CEFRLevel;
  metadata: Record<string, unknown>;
}

export interface GeneratedContent {
  contentType: ContentType;
  language: Language;
  data: Record<string, unknown>;
  sourceMetadata: {
    sourceName: string;
    generatedAt: Date;
    confidence?: number; // 0-1 quality score
    tokens?: number; // For LLM sources
    cost?: number; // For paid APIs
  };
}

export interface SourceAdapter {
  readonly name: string;
  readonly supportedTypes: ContentType[];

  /**
   * Check if this adapter can handle the request
   */
  canHandle(request: SourceRequest): boolean;

  /**
   * Generate content from this source
   */
  generate(request: SourceRequest): Promise<GeneratedContent>;

  /**
   * Health check for external dependencies (API availability, etc.)
   */
  healthCheck(): Promise<boolean>;
}
```

Create `packages/refinement-service/src/sources/source-registry.ts`:

```typescript
import { SourceAdapter, SourceRequest } from './source-adapter.interface';
import { logger } from '../utils/logger';

export class SourceRegistry {
  private adapters: Map<string, SourceAdapter> = new Map();

  register(adapter: SourceAdapter): void {
    this.adapters.set(adapter.name, adapter);
    logger.info({ adapterName: adapter.name }, 'Registered source adapter');
  }

  async selectAdapter(request: SourceRequest): Promise<SourceAdapter | null> {
    // Find all adapters that can handle this request
    const candidates = Array.from(this.adapters.values()).filter((adapter) =>
      adapter.canHandle(request)
    );

    if (candidates.length === 0) {
      logger.warn({ request }, 'No adapter found for request');
      return null;
    }

    // Priority order: Rule-based → LLM (cheaper) → LLM (premium)
    // For MVP, just return first available
    const selected = candidates[0];

    // Health check before returning
    const isHealthy = await selected.healthCheck();
    if (!isHealthy) {
      logger.error({ adapterName: selected.name }, 'Adapter failed health check');
      // Try next adapter if available
      return candidates[1] || null;
    }

    return selected;
  }

  listAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }
}
```

**Files Created**:

- `packages/refinement-service/src/sources/source-adapter.interface.ts`
- `packages/refinement-service/src/sources/source-registry.ts`

---

### Task 2: Implement LLM Adapter (Anthropic Claude)

**Description**: Integration with Anthropic Claude API for AI-generated content.

**Implementation Plan**:

Create `packages/refinement-service/src/sources/adapters/anthropic-adapter.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { SourceAdapter, SourceRequest, GeneratedContent } from '../source-adapter.interface';
import { ContentType } from '../../services/work-planner.service';
import { Language, CEFRLevel } from '@polyladder/core';

export class AnthropicAdapter implements SourceAdapter {
  readonly name = 'anthropic-claude';
  readonly supportedTypes = [
    ContentType.MEANING,
    ContentType.UTTERANCE,
    ContentType.GRAMMAR_RULE,
    ContentType.EXERCISE,
  ];

  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  canHandle(request: SourceRequest): boolean {
    return this.supportedTypes.includes(request.type);
  }

  async generate(request: SourceRequest): Promise<GeneratedContent> {
    const prompt = this.buildPrompt(request);

    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const parsedData = JSON.parse(content.text);

    return {
      contentType: request.type,
      language: request.language,
      data: parsedData,
      sourceMetadata: {
        sourceName: this.name,
        generatedAt: new Date(),
        tokens: response.usage.input_tokens + response.usage.output_tokens,
        cost: this.calculateCost(response.usage),
        confidence: 0.85, // High confidence for Claude output
      },
    };
  }

  private buildPrompt(request: SourceRequest): string {
    switch (request.type) {
      case ContentType.MEANING:
        return this.buildMeaningPrompt(request);
      case ContentType.UTTERANCE:
        return this.buildUtterancePrompt(request);
      case ContentType.GRAMMAR_RULE:
        return this.buildGrammarPrompt(request);
      case ContentType.EXERCISE:
        return this.buildExercisePrompt(request);
      default:
        throw new Error(`Unsupported content type: ${request.type}`);
    }
  }

  private buildMeaningPrompt(request: SourceRequest): string {
    const { language, level } = request;

    return `Generate a vocabulary word for language learning.

Language: ${language}
CEFR Level: ${level}
Requirements:
- Choose a common, useful word appropriate for ${level} learners
- Provide the word in the target language
- Provide English definition
- Provide part of speech (noun, verb, adjective, etc.)
- Provide usage notes (formal/informal, common contexts)

Return ONLY valid JSON in this exact format:
{
  "word": "example",
  "definition": "a thing characteristic of its kind or illustrating a general rule",
  "partOfSpeech": "noun",
  "usageNotes": "Common in educational contexts"
}`;
  }

  private buildUtterancePrompt(request: SourceRequest): string {
    const { meaningId, word } = request.metadata;

    return `Generate an example sentence using a specific word.

Word: "${word}"
Language: ${request.language}
CEFR Level: ${request.level}
Requirements:
- Create a natural, authentic sentence using this word
- Sentence should be appropriate for ${request.level} learners
- Provide English translation
- Keep sentence length appropriate for level (A1: 5-8 words, B1: 8-12 words, etc.)

Return ONLY valid JSON:
{
  "text": "Example sentence in target language",
  "translation": "Example sentence in English",
  "usageNotes": "Context or explanation if needed"
}`;
  }

  private buildGrammarPrompt(request: SourceRequest): string {
    const { category } = request.metadata;

    return `Generate a grammar rule explanation for language learners.

Language: ${request.language}
CEFR Level: ${request.level}
Grammar Category: ${category}
Requirements:
- Explain one specific grammar rule clearly and concisely
- Provide 2-3 example sentences demonstrating the rule
- Include common mistakes learners make
- Use simple language appropriate for ${request.level} learners

Return ONLY valid JSON:
{
  "title": "Present Simple Tense",
  "explanation": "Clear explanation of the grammar rule",
  "examples": [
    { "correct": "I eat breakfast", "incorrect": "I eating breakfast", "note": "Don't use -ing form" }
  ],
  "commonMistakes": "List of typical errors"
}`;
  }

  private buildExercisePrompt(request: SourceRequest): string {
    return `Generate a practice exercise for language learners.

Language: ${request.language}
CEFR Level: ${request.level}
Exercise Type: Multiple choice vocabulary
Requirements:
- Create a fill-in-the-blank sentence with 4 answer options
- One correct answer, three plausible distractors
- Appropriate difficulty for ${request.level}

Return ONLY valid JSON:
{
  "prompt": "I ___ to school every day.",
  "options": ["go", "going", "goes", "went"],
  "correctIndex": 0,
  "explanation": "Present simple for habitual actions with 'I' uses base form"
}`;
  }

  private calculateCost(usage: { input_tokens: number; output_tokens: number }): number {
    // Claude 3.5 Sonnet pricing (as of 2024)
    const INPUT_COST_PER_1M = 3.0; // $3 per 1M input tokens
    const OUTPUT_COST_PER_1M = 15.0; // $15 per 1M output tokens

    const inputCost = (usage.input_tokens / 1_000_000) * INPUT_COST_PER_1M;
    const outputCost = (usage.output_tokens / 1_000_000) * OUTPUT_COST_PER_1M;

    return inputCost + outputCost;
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Simple ping to verify API key works
      await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}
```

**Files Created**: `packages/refinement-service/src/sources/adapters/anthropic-adapter.ts`

---

### Task 3: Implement Rule-Based Generator

**Description**: Simple deterministic generators for orthography and basic content that doesn't require AI.

**Implementation Plan**:

Create `packages/refinement-service/src/sources/adapters/rule-based-adapter.ts`:

```typescript
import { SourceAdapter, SourceRequest, GeneratedContent } from '../source-adapter.interface';
import { ContentType } from '../../services/work-planner.service';
import { Language } from '@polyladder/core';

interface OrthographyRule {
  letter: string;
  ipa: string; // International Phonetic Alphabet
  soundDescription: string;
  examples: string[];
}

export class RuleBasedAdapter implements SourceAdapter {
  readonly name = 'rule-based';
  readonly supportedTypes = [ContentType.ORTHOGRAPHY];

  // Hardcoded orthography data for supported languages
  private orthographyData: Record<Language, OrthographyRule[]> = {
    EN: [
      {
        letter: 'A',
        ipa: '/eɪ/',
        soundDescription: 'Long "a" as in "day"',
        examples: ['able', 'make', 'table'],
      },
      {
        letter: 'B',
        ipa: '/biː/',
        soundDescription: 'Hard "b" as in "boy"',
        examples: ['ball', 'book', 'baby'],
      },
      // ... full alphabet
    ],
    ES: [
      {
        letter: 'A',
        ipa: '/a/',
        soundDescription: 'Open "a" as in "father"',
        examples: ['agua', 'casa', 'mapa'],
      },
      {
        letter: 'B',
        ipa: '/be/',
        soundDescription: 'Soft "b" as in "vino"',
        examples: ['bueno', 'baño', 'bebé'],
      },
      // ... full alphabet
    ],
    IT: [
      {
        letter: 'A',
        ipa: '/a/',
        soundDescription: 'Open "a" as in "father"',
        examples: ['amore', 'casa', 'pasta'],
      },
      // ... full alphabet
    ],
    PT: [
      { letter: 'A', ipa: '/a/', soundDescription: 'Open "a"', examples: ['água', 'casa', 'mapa'] },
      // ... full alphabet
    ],
    SL: [
      { letter: 'A', ipa: '/aː/', soundDescription: 'Long "a"', examples: ['avto', 'dan', 'mama'] },
      // ... full alphabet
    ],
  };

  canHandle(request: SourceRequest): boolean {
    return (
      request.type === ContentType.ORTHOGRAPHY &&
      this.orthographyData[request.language] !== undefined
    );
  }

  async generate(request: SourceRequest): Promise<GeneratedContent> {
    if (request.type !== ContentType.ORTHOGRAPHY) {
      throw new Error('Rule-based adapter only supports orthography');
    }

    const rules = this.orthographyData[request.language];

    if (!rules) {
      throw new Error(`No orthography rules for language: ${request.language}`);
    }

    // Generate complete orthography lesson for this language
    const lessons = rules.map((rule) => ({
      letter: rule.letter,
      ipa: rule.ipa,
      soundDescription: rule.soundDescription,
      exampleWords: rule.examples,
      audioUrl: null, // Will be generated separately by TTS service
    }));

    return {
      contentType: ContentType.ORTHOGRAPHY,
      language: request.language,
      data: {
        lessons,
        totalLetters: rules.length,
      },
      sourceMetadata: {
        sourceName: this.name,
        generatedAt: new Date(),
        confidence: 1.0, // Perfect confidence - hardcoded data
        tokens: 0,
        cost: 0,
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    // Always available - no external dependencies
    return true;
  }
}
```

**Files Created**: `packages/refinement-service/src/sources/adapters/rule-based-adapter.ts`

---

### Task 4: Create Content Processor with Source Integration

**Description**: Update ContentProcessor from F014 to use source adapters for generating DRAFT content.

**Implementation Plan**:

Create `packages/refinement-service/src/services/content-processor.service.ts`:

```typescript
import { Pool } from 'pg';
import { SourceRegistry } from '../sources/source-registry';
import { WorkItem, ContentType } from './work-planner.service';
import { AnthropicAdapter } from '../sources/adapters/anthropic-adapter';
import { RuleBasedAdapter } from '../sources/adapters/rule-based-adapter';
import { logger } from '../utils/logger';

export class ContentProcessor {
  private sourceRegistry: SourceRegistry;

  constructor(private readonly pool: Pool) {
    this.sourceRegistry = new SourceRegistry();
    this.initializeSources();
  }

  private initializeSources(): void {
    // Register rule-based adapter (highest priority for orthography)
    this.sourceRegistry.register(new RuleBasedAdapter());

    // Register LLM adapter if API key available
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      this.sourceRegistry.register(new AnthropicAdapter(anthropicKey));
      logger.info('Anthropic adapter registered');
    } else {
      logger.warn('ANTHROPIC_API_KEY not set - LLM generation disabled');
    }
  }

  async process(workItem: WorkItem): Promise<void> {
    logger.info({ workItem }, 'Processing work item');

    // Select appropriate source adapter
    const adapter = await this.sourceRegistry.selectAdapter({
      type: workItem.type,
      language: workItem.language,
      level: workItem.level,
      metadata: workItem.metadata,
    });

    if (!adapter) {
      throw new Error(`No adapter available for work item: ${workItem.id}`);
    }

    // Generate content from source
    const generated = await adapter.generate({
      type: workItem.type,
      language: workItem.language,
      level: workItem.level,
      metadata: workItem.metadata,
    });

    // Insert into appropriate DRAFT table
    await this.insertDraft(workItem, generated);

    logger.info(
      {
        workItemId: workItem.id,
        source: generated.sourceMetadata.sourceName,
        cost: generated.sourceMetadata.cost,
      },
      'DRAFT content created'
    );
  }

  private async insertDraft(workItem: WorkItem, generated: any): Promise<void> {
    switch (workItem.type) {
      case ContentType.ORTHOGRAPHY:
        await this.insertOrthographyDraft(generated);
        break;
      case ContentType.MEANING:
        await this.insertMeaningDraft(generated);
        break;
      case ContentType.UTTERANCE:
        await this.insertUtteranceDraft(generated);
        break;
      case ContentType.GRAMMAR_RULE:
        await this.insertGrammarDraft(generated);
        break;
      case ContentType.EXERCISE:
        await this.insertExerciseDraft(generated);
        break;
    }
  }

  private async insertOrthographyDraft(generated: any): Promise<void> {
    // Insert into curriculum_graph as DRAFT
    for (const lesson of generated.data.lessons) {
      await this.pool.query(
        `INSERT INTO curriculum_graph
         (language, concept_type, concept_id, state, metadata)
         VALUES ($1, 'orthography', $2, 'DRAFT', $3)`,
        [generated.language, `ortho_${lesson.letter.toLowerCase()}`, JSON.stringify(lesson)]
      );
    }
  }

  private async insertMeaningDraft(generated: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO meanings
       (language, level, word, definition, part_of_speech, usage_notes, state)
       VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT')`,
      [
        generated.language,
        generated.data.level || 'A1',
        generated.data.word,
        generated.data.definition,
        generated.data.partOfSpeech,
        generated.data.usageNotes,
      ]
    );
  }

  private async insertUtteranceDraft(generated: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO utterances
       (language, meaning_id, text, translation, usage_notes, state)
       VALUES ($1, $2, $3, $4, $5, 'DRAFT')`,
      [
        generated.language,
        generated.metadata.meaningId,
        generated.data.text,
        generated.data.translation,
        generated.data.usageNotes,
      ]
    );
  }

  private async insertGrammarDraft(generated: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO rules
       (language, level, category, title, explanation, examples, state)
       VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT')`,
      [
        generated.language,
        generated.data.level || 'A1',
        generated.metadata.category || 'general',
        generated.data.title,
        generated.data.explanation,
        JSON.stringify(generated.data.examples),
      ]
    );
  }

  private async insertExerciseDraft(generated: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO exercises
       (language, level, prompt, options, correct_answer, explanation, state)
       VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT')`,
      [
        generated.language,
        generated.data.level || 'A1',
        generated.data.prompt,
        JSON.stringify(generated.data.options),
        generated.data.correctIndex,
        generated.data.explanation,
      ]
    );
  }
}
```

**Files Created**: `packages/refinement-service/src/services/content-processor.service.ts`

---

### Task 5: Add Cost Tracking Table

**Description**: Track LLM API costs for monitoring and budgeting.

**Implementation Plan**:

Create `packages/db/migrations/010-source-costs.sql`:

```sql
CREATE TABLE source_generation_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name VARCHAR(100) NOT NULL,
  content_type VARCHAR(50) NOT NULL,
  language language_enum NOT NULL,
  tokens_used INTEGER,
  cost_usd DECIMAL(10, 6),
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_source_costs_date ON source_generation_costs(generated_at);
CREATE INDEX idx_source_costs_source ON source_generation_costs(source_name);

-- View for daily cost summary
CREATE VIEW daily_generation_costs AS
SELECT
  DATE(generated_at) as date,
  source_name,
  content_type,
  SUM(tokens_used) as total_tokens,
  SUM(cost_usd) as total_cost
FROM source_generation_costs
GROUP BY DATE(generated_at), source_name, content_type
ORDER BY date DESC;
```

Update ContentProcessor to log costs:

```typescript
private async insertDraft(workItem: WorkItem, generated: any): Promise<void> {
  // ... existing insert logic ...

  // Track cost
  if (generated.sourceMetadata.cost) {
    await this.pool.query(
      `INSERT INTO source_generation_costs
       (source_name, content_type, language, tokens_used, cost_usd)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        generated.sourceMetadata.sourceName,
        workItem.type,
        workItem.language,
        generated.sourceMetadata.tokens || 0,
        generated.sourceMetadata.cost,
      ]
    );
  }
}
```

**Files Created**: `packages/db/migrations/010-source-costs.sql`

---

## Open Questions

### Question 1: LLM Provider Selection (DECISION NEEDED for MVP)

**Context**: Multiple LLM options available with different cost/quality tradeoffs.

**Options**:

1. **Anthropic Claude 3.5 Sonnet** (implemented above)
   - Pros: Excellent quality, good at structured output, strong multilingual support
   - Cons: $3/M input + $15/M output tokens
   - Estimated monthly cost: $50-200 for MVP content generation

2. **OpenAI GPT-4**
   - Pros: Very high quality, widely used
   - Cons: Similar pricing to Claude, sometimes verbose
   - Estimated cost: $60-250/month

3. **OpenAI GPT-3.5 Turbo**
   - Pros: Much cheaper ($0.50/M input + $1.50/M output)
   - Cons: Lower quality, especially for complex grammar explanations
   - Estimated cost: $5-20/month

4. **Local Model (Llama 3 70B via Ollama)**
   - Pros: Zero API costs after setup
   - Cons: Requires GPU server (~$100/month on cloud), slower, lower quality
   - Estimated cost: $100/month infrastructure

**Questions**:

1. What's the budget for content generation API costs?
2. Is quality more important than cost for MVP?
3. Should we support multiple providers with fallback?

**Decision Needed**: Before starting content generation.

**Temporary Plan**: Use Anthropic Claude 3.5 Sonnet for MVP. Quality is critical for language learning content. Add cost monitoring to track actual spend. Can switch to cheaper model later if needed.

---

### Question 2: Orthography Audio Generation

**Context**: Orthography lessons need audio pronunciation examples.

**Current State**: Rule-based adapter generates orthography data with `audioUrl: null`.

**Options**:

1. **Text-to-Speech API (Google Cloud TTS, Amazon Polly)**
   - Pros: Automated, supports many languages
   - Cons: Robotic sound, $4 per 1M characters
   - Quality: Acceptable for orthography (single letters/sounds)

2. **Pre-recorded Human Audio**
   - Pros: Perfect quality, authentic pronunciation
   - Cons: Requires hiring native speakers, time-consuming
   - Cost: ~$500-1000 per language for alphabet

3. **Hybrid: Generated for now, human later**
   - Pros: MVP can launch quickly, improve quality over time
   - Cons: User experience starts mediocre

**Questions**:

1. Is TTS quality acceptable for MVP orthography?
2. Budget for human recording?

**Decision Needed**: Before implementing F033 (Orthography Learning Module).

**Temporary Plan**: Use Google Cloud TTS for MVP. Add `audio_url` column to database, generate on-demand or batch process. Replace with human audio post-MVP if budget allows.

---

### Question 3: Content Quality Validation (BLOCKER for automation)

**Context**: LLM-generated content needs validation before promotion to CANDIDATE.

**Current State**: Content goes to DRAFT, but no automated validation.

**Options**:

1. **Manual Review Only** (F025-F028 Operational UI)
   - Pros: Highest quality control
   - Cons: Slow, requires many operator hours
   - Bottleneck: ~10-20 items/hour per operator

2. **Automated Checks + Manual Review**
   - Basic validation: JSON format, required fields, text length
   - LLM self-critique: "Does this sentence sound natural?"
   - Manual review only for flagged items
   - Pros: Faster pipeline, operators focus on edge cases
   - Cons: Some errors might slip through

3. **Fully Automated with Statistical Sampling**
   - Auto-approve items with high confidence scores
   - Manual review 10% random sample
   - Pros: Scales to high volume
   - Cons: Requires strong confidence in LLM quality

**Questions**:

1. How many operator hours available for content review?
2. What quality threshold is acceptable for MVP?
3. Should we implement automated validation in F011-F013 first?

**Decision Needed**: Before implementing F017 (Automated Promotion Pipeline).

**Temporary Plan**: Start with manual review for MVP (option 1). Implement basic automated checks (JSON validation, required fields). Track review time to determine if automation needed post-MVP.

---

## Dependencies

- **Blocks**: F017
- **Depends on**: F014, F015

---

## Notes

- Rule-based adapter has zero API cost (hardcoded data)
- LLM adapter requires `ANTHROPIC_API_KEY` environment variable
- Cost tracking helps monitor budget burn rate
- Source registry allows adding more adapters later (OpenAI, local models, etc.)
