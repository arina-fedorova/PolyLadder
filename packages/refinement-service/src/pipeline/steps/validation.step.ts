import { Pool } from 'pg';
import { PipelineItem, StepResult } from '../types';

const VALID_LANGUAGES = ['EN', 'ES', 'IT', 'PT', 'SL'];
const VALID_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export interface ValidationRepository {
  checkDuplicateMeaning(
    word: string,
    language: string,
    level: string,
    excludeId: string
  ): Promise<boolean>;
  checkDuplicateUtterance(text: string, language: string, excludeId: string): Promise<boolean>;
  checkDuplicateRule(
    title: string,
    language: string,
    level: string,
    excludeId: string
  ): Promise<boolean>;
  meaningExists(meaningId: string): Promise<boolean>;
}

export class ValidationStep {
  constructor(private readonly repository: ValidationRepository) {}

  async validate(item: PipelineItem): Promise<StepResult> {
    const errors: string[] = [];

    try {
      const schemaResult = this.validateSchema(item);
      if (!schemaResult.success) {
        return schemaResult;
      }

      const requiredResult = this.validateRequiredFields(item);
      if (!requiredResult.success) {
        return requiredResult;
      }

      const languageResult = this.validateLanguage(item);
      if (!languageResult.success) {
        return languageResult;
      }

      switch (item.dataType) {
        case 'meaning':
          return await this.validateMeaning(item);
        case 'utterance':
          return await this.validateUtterance(item);
        case 'rule':
          return await this.validateRule(item);
        case 'exercise':
          return this.validateExercise(item);
        default:
          errors.push(`Unknown data type: ${item.dataType}`);
          return { success: false, errors };
      }
    } catch (error) {
      errors.push((error as Error).message);
      return { success: false, errors };
    }
  }

  private validateSchema(item: PipelineItem): StepResult {
    const data = item.data;

    if (item.dataType === 'meaning') {
      if (typeof data.word !== 'string') {
        return { success: false, errors: ['Word must be a string'] };
      }
    }

    if (item.dataType === 'exercise') {
      if (typeof data.correctIndex !== 'number') {
        return { success: false, errors: ['Correct answer index must be a number'] };
      }
    }

    return { success: true };
  }

  private validateRequiredFields(item: PipelineItem): StepResult {
    const requiredFields: Record<string, string[]> = {
      meaning: ['word', 'definition', 'language', 'level'],
      utterance: ['text', 'language', 'meaningId'],
      rule: ['title', 'explanation', 'language', 'level', 'examples'],
      exercise: ['prompt', 'options', 'correctIndex', 'language', 'level'],
    };

    const required = requiredFields[item.dataType];
    if (!required) {
      return { success: false, errors: [`Unknown data type: ${item.dataType}`] };
    }

    for (const field of required) {
      if (item.data[field] === undefined || item.data[field] === null) {
        return { success: false, errors: [`Missing required field: ${field}`] };
      }
    }

    return { success: true };
  }

  private validateLanguage(item: PipelineItem): StepResult {
    const language = String(item.data.language);

    if (!VALID_LANGUAGES.includes(language)) {
      return { success: false, errors: [`Invalid language: ${language}`] };
    }

    const levelRaw = item.data.level;
    if (levelRaw !== undefined && levelRaw !== null) {
      const level = typeof levelRaw === 'string' ? levelRaw : JSON.stringify(levelRaw);
      if (!VALID_LEVELS.includes(level)) {
        return { success: false, errors: [`Invalid CEFR level: ${level}`] };
      }
    }

    return { success: true };
  }

  private async validateMeaning(item: PipelineItem): Promise<StepResult> {
    const errors: string[] = [];
    const data = item.data;

    const isDuplicate = await this.repository.checkDuplicateMeaning(
      String(data.word),
      String(data.language),
      String(data.level),
      item.id
    );

    if (isDuplicate) {
      errors.push(`Duplicate word "${String(data.word)}" already exists for this level`);
    }

    const definition = String(data.definition);
    if (definition.length < 5) {
      errors.push('Definition too short (min 5 characters)');
    }

    if (definition.length > 1000) {
      errors.push('Definition too long (max 1000 characters)');
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true };
  }

  private async validateUtterance(item: PipelineItem): Promise<StepResult> {
    const errors: string[] = [];
    const data = item.data;

    const meaningExists = await this.repository.meaningExists(String(data.meaningId));
    if (!meaningExists) {
      errors.push(`Meaning ID ${String(data.meaningId)} does not exist`);
    }

    const isDuplicate = await this.repository.checkDuplicateUtterance(
      String(data.text),
      String(data.language),
      item.id
    );

    if (isDuplicate) {
      errors.push('Duplicate utterance text already exists');
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true };
  }

  private async validateRule(item: PipelineItem): Promise<StepResult> {
    const errors: string[] = [];
    const data = item.data;

    const isDuplicate = await this.repository.checkDuplicateRule(
      String(data.title),
      String(data.language),
      String(data.level),
      item.id
    );

    if (isDuplicate) {
      errors.push(`Duplicate grammar rule "${String(data.title)}" already exists`);
    }

    const examples = Array.isArray(data.examples) ? data.examples : [];
    if (examples.length < 1) {
      errors.push('Grammar rule must have at least 1 example');
    }

    for (const example of examples) {
      if (typeof example !== 'object' || example === null) {
        errors.push('Each example must be an object');
        break;
      }
      const ex = example as Record<string, unknown>;
      if (!ex.correct) {
        errors.push('Each example must have a "correct" field');
        break;
      }
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true };
  }

  private validateExercise(item: PipelineItem): StepResult {
    const errors: string[] = [];
    const data = item.data;

    const options = Array.isArray(data.options) ? data.options : [];
    const correctIndex = Number(data.correctIndex);

    if (correctIndex < 0 || correctIndex >= options.length) {
      errors.push(`Correct answer index ${correctIndex} is out of range`);
    }

    const uniqueOptions = new Set(options.map(String));
    if (uniqueOptions.size !== options.length) {
      errors.push('Exercise options must be unique');
    }

    for (const option of options) {
      if (typeof option !== 'string' || option.trim().length === 0) {
        errors.push('All exercise options must be non-empty strings');
        break;
      }
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true };
  }
}

export function createValidationRepository(pool: Pool): ValidationRepository {
  return {
    async checkDuplicateMeaning(
      word: string,
      language: string,
      level: string,
      excludeId: string
    ): Promise<boolean> {
      const result = await pool.query(
        `SELECT 1 FROM drafts
         WHERE data_type = 'meaning'
           AND raw_data->>'word' = $1
           AND raw_data->>'language' = $2
           AND raw_data->>'level' = $3
           AND id != $4
         UNION
         SELECT 1 FROM candidates
         WHERE data_type = 'meaning'
           AND normalized_data->>'word' = $1
           AND normalized_data->>'language' = $2
           AND normalized_data->>'level' = $3
         UNION
         SELECT 1 FROM approved_meanings
         WHERE text = $1 AND language = $2 AND level = $3
         LIMIT 1`,
        [word, language, level, excludeId]
      );
      return result.rows.length > 0;
    },

    async checkDuplicateUtterance(
      text: string,
      language: string,
      excludeId: string
    ): Promise<boolean> {
      const result = await pool.query(
        `SELECT 1 FROM drafts
         WHERE data_type = 'utterance'
           AND raw_data->>'text' = $1
           AND raw_data->>'language' = $2
           AND id != $3
         UNION
         SELECT 1 FROM approved_utterances
         WHERE text = $1 AND language = $2
         LIMIT 1`,
        [text, language, excludeId]
      );
      return result.rows.length > 0;
    },

    async checkDuplicateRule(
      title: string,
      language: string,
      level: string,
      excludeId: string
    ): Promise<boolean> {
      const result = await pool.query(
        `SELECT 1 FROM drafts
         WHERE data_type = 'rule'
           AND raw_data->>'title' = $1
           AND raw_data->>'language' = $2
           AND raw_data->>'level' = $3
           AND id != $4
         UNION
         SELECT 1 FROM approved_rules
         WHERE topic = $1 AND language = $2 AND level = $3
         LIMIT 1`,
        [title, language, level, excludeId]
      );
      return result.rows.length > 0;
    },

    async meaningExists(meaningId: string): Promise<boolean> {
      const result = await pool.query(
        `SELECT 1 FROM approved_meanings WHERE id = $1
         UNION
         SELECT 1 FROM candidates WHERE id = $1 AND data_type = 'meaning'
         LIMIT 1`,
        [meaningId]
      );
      return result.rows.length > 0;
    },
  };
}
