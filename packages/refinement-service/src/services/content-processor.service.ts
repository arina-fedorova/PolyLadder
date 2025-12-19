import { Pool } from 'pg';
import { SourceRegistry } from '../sources/source-registry';
import { GeneratedContent } from '../sources/source-adapter.interface';
import { WorkItem, ContentType } from './work-planner.service';
import { AnthropicAdapter } from '../sources/adapters/anthropic-adapter';
import { RuleBasedAdapter } from '../sources/adapters/rule-based-adapter';
import { logger } from '../utils/logger';

export interface ContentProcessorRepository {
  insertDraftMeaning(content: GeneratedContent): Promise<string>;
  insertDraftUtterance(content: GeneratedContent, meaningId: string): Promise<string>;
  insertDraftGrammarRule(content: GeneratedContent, category: string): Promise<string>;
  insertDraftExercise(content: GeneratedContent): Promise<string>;
  insertOrthographyLessons(content: GeneratedContent): Promise<void>;
  trackGenerationCost(content: GeneratedContent, workType: string): Promise<void>;
}

export class ContentProcessor {
  private sourceRegistry: SourceRegistry;
  private repository: ContentProcessorRepository;

  constructor(repository: ContentProcessorRepository) {
    this.sourceRegistry = new SourceRegistry();
    this.repository = repository;
    this.initializeSources();
  }

  private initializeSources(): void {
    this.sourceRegistry.register(new RuleBasedAdapter());

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      this.sourceRegistry.register(new AnthropicAdapter(anthropicKey));
      logger.info('Anthropic adapter registered');
    } else {
      logger.warn('ANTHROPIC_API_KEY not set - LLM generation disabled');
    }
  }

  async process(workItem: WorkItem): Promise<void> {
    logger.info({ workItem: { id: workItem.id, type: workItem.type } }, 'Processing work item');

    const adapter = await this.sourceRegistry.selectAdapter({
      type: workItem.type,
      language: workItem.language,
      level: workItem.level,
      metadata: workItem.metadata,
    });

    if (!adapter) {
      throw new Error(`No adapter available for work item: ${workItem.id}`);
    }

    const generated = await adapter.generate({
      type: workItem.type,
      language: workItem.language,
      level: workItem.level,
      metadata: workItem.metadata,
    });

    await this.insertDraft(workItem, generated);

    if (generated.sourceMetadata.cost && generated.sourceMetadata.cost > 0) {
      await this.repository.trackGenerationCost(generated, workItem.type);
    }

    logger.info(
      {
        workItemId: workItem.id,
        source: generated.sourceMetadata.sourceName,
        cost: generated.sourceMetadata.cost,
      },
      'DRAFT content created'
    );
  }

  private async insertDraft(workItem: WorkItem, generated: GeneratedContent): Promise<void> {
    switch (workItem.type) {
      case ContentType.ORTHOGRAPHY:
        await this.repository.insertOrthographyLessons(generated);
        break;
      case ContentType.MEANING:
        await this.repository.insertDraftMeaning(generated);
        break;
      case ContentType.UTTERANCE: {
        const meaningId = workItem.metadata.meaningId as string;
        await this.repository.insertDraftUtterance(generated, meaningId);
        break;
      }
      case ContentType.GRAMMAR_RULE: {
        const category = (workItem.metadata.category as string) ?? 'general';
        await this.repository.insertDraftGrammarRule(generated, category);
        break;
      }
      case ContentType.EXERCISE:
        await this.repository.insertDraftExercise(generated);
        break;
    }
  }

  getSourceRegistry(): SourceRegistry {
    return this.sourceRegistry;
  }
}

export function createContentProcessorRepository(pool: Pool): ContentProcessorRepository {
  async function insertDraft(
    dataType: string,
    data: Record<string, unknown>,
    source: string
  ): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO drafts (data_type, raw_data, source)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [dataType, JSON.stringify(data), source]
    );
    return result.rows[0].id;
  }

  return {
    async insertDraftMeaning(content: GeneratedContent): Promise<string> {
      const rawData = {
        ...content.data,
        language: content.language,
        level: content.level ?? 'A1',
        sourceMetadata: content.sourceMetadata,
      };
      return insertDraft('meaning', rawData, content.sourceMetadata.sourceName);
    },

    async insertDraftUtterance(content: GeneratedContent, meaningId: string): Promise<string> {
      const rawData = {
        ...content.data,
        language: content.language,
        meaningId,
        sourceMetadata: content.sourceMetadata,
      };
      return insertDraft('utterance', rawData, content.sourceMetadata.sourceName);
    },

    async insertDraftGrammarRule(content: GeneratedContent, category: string): Promise<string> {
      const rawData = {
        ...content.data,
        language: content.language,
        level: content.level ?? 'A1',
        category,
        sourceMetadata: content.sourceMetadata,
      };
      return insertDraft('rule', rawData, content.sourceMetadata.sourceName);
    },

    async insertDraftExercise(content: GeneratedContent): Promise<string> {
      const rawData = {
        ...content.data,
        language: content.language,
        level: content.level ?? 'A1',
        sourceMetadata: content.sourceMetadata,
      };
      return insertDraft('exercise', rawData, content.sourceMetadata.sourceName);
    },

    async insertOrthographyLessons(content: GeneratedContent): Promise<void> {
      const data = content.data as {
        lessons: Array<{
          letter: string;
          ipa: string;
          soundDescription: string;
          exampleWords: string[];
          audioUrl: string | null;
        }>;
      };

      for (const lesson of data.lessons) {
        const rawData = {
          type: 'orthography',
          language: content.language,
          level: 'A1',
          lesson,
          sourceMetadata: content.sourceMetadata,
        };
        await insertDraft('rule', rawData, content.sourceMetadata.sourceName);
      }
    },

    async trackGenerationCost(content: GeneratedContent, workType: string): Promise<void> {
      await pool.query(
        `INSERT INTO source_generation_costs
         (source_name, content_type, language, tokens_used, cost_usd)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          content.sourceMetadata.sourceName,
          workType,
          content.language,
          content.sourceMetadata.tokens ?? 0,
          content.sourceMetadata.cost ?? 0,
        ]
      );
    },
  };
}
