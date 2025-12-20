import { PipelineItem, StepResult } from '../types';

interface NormalizedData {
  [key: string]: unknown;
}

export class NormalizationStep {
  normalize(item: PipelineItem): StepResult {
    try {
      switch (item.dataType) {
        case 'meaning':
          return this.normalizeMeaning(item);
        case 'utterance':
          return this.normalizeUtterance(item);
        case 'rule':
          return this.normalizeRule(item);
        case 'exercise':
          return this.normalizeExercise(item);
        default:
          return { success: false, errors: [`Unknown data type: ${item.dataType}`] };
      }
    } catch (error) {
      return { success: false, errors: [(error as Error).message] };
    }
  }

  private normalizeMeaning(item: PipelineItem): StepResult {
    const errors: string[] = [];
    const data = item.data as NormalizedData;

    const word = this.trimString(data.word);
    const definition = this.trimString(data.definition);

    if (!word || word.length === 0) {
      errors.push('Word is required');
    }

    if (!definition || definition.length === 0) {
      errors.push('Definition is required');
    }

    if (word && word.length > 100) {
      errors.push('Word is too long (max 100 characters)');
    }

    if (definition && definition.length > 1000) {
      errors.push('Definition is too long (max 1000 characters)');
    }

    if (!data.language) {
      errors.push('Language is required');
    }

    if (!data.level) {
      errors.push('Level is required');
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    item.data.word = word;
    item.data.definition = this.capitalizeFirstLetter(definition ?? '');

    return { success: true };
  }

  private normalizeUtterance(item: PipelineItem): StepResult {
    const errors: string[] = [];
    const data = item.data as NormalizedData;

    const text = this.trimString(data.text);
    const translation = this.trimString(data.translation);

    if (!text || text.length === 0) {
      errors.push('Text is required');
    }

    if (!data.meaningId) {
      errors.push('Meaning ID is required');
    }

    if (text) {
      const wordCount = text.split(/\s+/).length;
      if (wordCount < 2) {
        errors.push('Utterance too short (min 2 words)');
      }
      if (wordCount > 50) {
        errors.push('Utterance too long (max 50 words)');
      }
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    let normalizedText = this.capitalizeFirstLetter(text ?? '');
    if (!this.hasPunctuation(normalizedText)) {
      normalizedText += '.';
    }

    item.data.text = normalizedText;
    if (translation) {
      item.data.translation = this.capitalizeFirstLetter(translation);
    }

    return { success: true };
  }

  private normalizeRule(item: PipelineItem): StepResult {
    const errors: string[] = [];
    const data = item.data as NormalizedData;

    const title = this.trimString(data.title);
    const explanation = this.trimString(data.explanation);

    if (!title || title.length === 0) {
      errors.push('Title is required');
    }

    if (!explanation || explanation.length === 0) {
      errors.push('Explanation is required');
    }

    if (!data.language) {
      errors.push('Language is required');
    }

    if (!data.level) {
      errors.push('Level is required');
    }

    const examples = this.parseArray(data.examples);
    if (!examples || examples.length === 0) {
      errors.push('At least one example is required');
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    item.data.title = title;
    item.data.explanation = explanation;

    return { success: true };
  }

  private normalizeExercise(item: PipelineItem): StepResult {
    const errors: string[] = [];
    const data = item.data as NormalizedData;

    const prompt = this.trimString(data.prompt);

    if (!prompt || prompt.length === 0) {
      errors.push('Prompt is required');
    }

    const options = this.parseArray(data.options);
    if (!options) {
      errors.push('Options must be a valid array');
    } else if (options.length < 2) {
      errors.push('At least 2 options required');
    } else if (options.length > 6) {
      errors.push('Maximum 6 options allowed');
    }

    if (data.correctIndex === undefined || data.correctIndex === null) {
      errors.push('Correct answer index is required');
    } else if (
      options &&
      (Number(data.correctIndex) < 0 || Number(data.correctIndex) >= options.length)
    ) {
      errors.push('Correct answer index out of range');
    }

    if (!data.language) {
      errors.push('Language is required');
    }

    if (!data.level) {
      errors.push('Level is required');
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    item.data.prompt = prompt;

    return { success: true };
  }

  private trimString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    return value.trim();
  }

  private capitalizeFirstLetter(text: string): string {
    if (text.length === 0) return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  private hasPunctuation(text: string): boolean {
    return /[.!?。？！]$/.test(text);
  }

  private parseArray(value: unknown): unknown[] | null {
    if (Array.isArray(value)) return value as unknown[];
    if (typeof value === 'string') {
      try {
        const parsed: unknown = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed as unknown[];
      } catch {
        return null;
      }
    }
    return null;
  }
}
