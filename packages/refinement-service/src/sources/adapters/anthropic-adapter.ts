import Anthropic from '@anthropic-ai/sdk';
import {
  SourceAdapter,
  SourceRequest,
  GeneratedContent,
  SourceLanguage,
  SourceCEFRLevel,
} from '../source-adapter.interface';
import { ContentType } from '../../services/work-planner.service';
import { logger } from '../../utils/logger';

const INPUT_COST_PER_1M = 3.0;
const OUTPUT_COST_PER_1M = 15.0;

interface MeaningData {
  word: string;
  definition: string;
  partOfSpeech: string;
  usageNotes?: string;
  [key: string]: unknown;
}

interface UtteranceData {
  text: string;
  translation: string;
  usageNotes?: string;
  [key: string]: unknown;
}

interface GrammarData {
  title: string;
  explanation: string;
  examples: Array<{ correct: string; incorrect?: string; note?: string }>;
  commonMistakes?: string;
  [key: string]: unknown;
}

interface ExerciseData {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  [key: string]: unknown;
}

export class AnthropicAdapter implements SourceAdapter {
  readonly name = 'anthropic-claude';
  readonly supportedTypes = [
    ContentType.MEANING,
    ContentType.UTTERANCE,
    ContentType.GRAMMAR_RULE,
    ContentType.EXERCISE,
  ];

  private client: Anthropic;
  private model = 'claude-3-5-sonnet-20241022';

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  canHandle(request: SourceRequest): boolean {
    return this.supportedTypes.includes(request.type);
  }

  async generate(request: SourceRequest): Promise<GeneratedContent> {
    const prompt = this.buildPrompt(request);

    logger.debug(
      { type: request.type, language: request.language },
      'Generating content via Claude'
    );

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const parsedData = this.parseResponse(content.text, request.type);
    const cost = this.calculateCost(response.usage.input_tokens, response.usage.output_tokens);

    return {
      contentType: request.type,
      language: request.language,
      level: request.level,
      data: parsedData,
      sourceMetadata: {
        sourceName: this.name,
        generatedAt: new Date(),
        tokens: response.usage.input_tokens + response.usage.output_tokens,
        cost,
        confidence: 0.85,
      },
    };
  }

  private parseResponse(
    text: string,
    type: ContentType
  ): MeaningData | UtteranceData | GrammarData | ExerciseData {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    const parsed: unknown = JSON.parse(jsonMatch[0]);

    switch (type) {
      case ContentType.MEANING:
        return parsed as MeaningData;
      case ContentType.UTTERANCE:
        return parsed as UtteranceData;
      case ContentType.GRAMMAR_RULE:
        return parsed as GrammarData;
      case ContentType.EXERCISE:
        return parsed as ExerciseData;
      default:
        throw new Error(`Unsupported content type: ${type}`);
    }
  }

  private buildPrompt(request: SourceRequest): string {
    switch (request.type) {
      case ContentType.MEANING:
        return this.buildMeaningPrompt(request.language, request.level);
      case ContentType.UTTERANCE:
        return this.buildUtterancePrompt(request);
      case ContentType.GRAMMAR_RULE:
        return this.buildGrammarPrompt(request);
      case ContentType.EXERCISE:
        return this.buildExercisePrompt(request.language, request.level);
      default:
        throw new Error(`Unsupported content type: ${request.type}`);
    }
  }

  private buildMeaningPrompt(language: SourceLanguage, level?: SourceCEFRLevel): string {
    const levelText = level ?? 'A1';
    return `Generate a vocabulary word for language learning.

Language: ${language}
CEFR Level: ${levelText}
Requirements:
- Choose a common, useful word appropriate for ${levelText} learners
- Provide the word in the target language
- Provide English definition
- Provide part of speech (noun, verb, adjective, adverb, preposition, conjunction)
- Provide brief usage notes

Return ONLY valid JSON in this exact format:
{
  "word": "example",
  "definition": "a thing characteristic of its kind",
  "partOfSpeech": "noun",
  "usageNotes": "Common in educational contexts"
}`;
  }

  private buildUtterancePrompt(request: SourceRequest): string {
    const word = request.metadata.word as string;
    const levelText = request.level ?? 'A1';

    return `Generate an example sentence using a specific word.

Word: "${word}"
Language: ${request.language}
CEFR Level: ${levelText}
Requirements:
- Create a natural, authentic sentence using this word
- Sentence should be appropriate for ${levelText} learners
- Provide English translation
- Keep sentence length appropriate (A1: 5-8 words, B1: 8-12 words)

Return ONLY valid JSON:
{
  "text": "Example sentence in target language",
  "translation": "Example sentence in English",
  "usageNotes": "Context if needed"
}`;
  }

  private buildGrammarPrompt(request: SourceRequest): string {
    const category = (request.metadata.category as string) ?? 'general';
    const levelText = request.level ?? 'A1';

    return `Generate a grammar rule explanation for language learners.

Language: ${request.language}
CEFR Level: ${levelText}
Grammar Category: ${category}
Requirements:
- Explain one specific grammar rule clearly and concisely
- Provide 2-3 example sentences demonstrating the rule
- Include common mistakes learners make
- Use simple language appropriate for ${levelText} learners

Return ONLY valid JSON:
{
  "title": "Present Simple Tense",
  "explanation": "Clear explanation of the grammar rule",
  "examples": [
    { "correct": "I eat breakfast", "incorrect": "I eating breakfast", "note": "Don't use -ing" }
  ],
  "commonMistakes": "List of typical errors"
}`;
  }

  private buildExercisePrompt(language: SourceLanguage, level?: SourceCEFRLevel): string {
    const levelText = level ?? 'A1';

    return `Generate a practice exercise for language learners.

Language: ${language}
CEFR Level: ${levelText}
Exercise Type: Multiple choice vocabulary
Requirements:
- Create a fill-in-the-blank sentence with 4 answer options
- One correct answer, three plausible distractors
- Appropriate difficulty for ${levelText}

Return ONLY valid JSON:
{
  "prompt": "I ___ to school every day.",
  "options": ["go", "going", "goes", "went"],
  "correctIndex": 0,
  "explanation": "Present simple for habitual actions with 'I' uses base form"
}`;
  }

  private calculateCost(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1_000_000) * INPUT_COST_PER_1M;
    const outputCost = (outputTokens / 1_000_000) * OUTPUT_COST_PER_1M;
    return inputCost + outputCost;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
