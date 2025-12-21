export interface ChunkConfig {
  minChunkSize: number;
  maxChunkSize: number;
  overlapSize: number;
}

export type ChunkType =
  | 'vocabulary_section'
  | 'grammar_explanation'
  | 'dialogue'
  | 'exercise'
  | 'reading_passage'
  | 'cultural_note'
  | 'unknown';

export interface ContentChunk {
  index: number;
  text: string;
  cleanedText: string;
  pageNumber?: number;
  chunkType: ChunkType;
  confidence: number;
  wordCount: number;
  charCount: number;
}

const DEFAULT_CONFIG: ChunkConfig = {
  minChunkSize: 100,
  maxChunkSize: 1000,
  overlapSize: 50,
};

export class ChunkerService {
  private config: ChunkConfig;

  constructor(config: Partial<ChunkConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  chunkDocument(pages: { pageNumber: number; text: string }[]): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    let chunkIndex = 0;

    for (const page of pages) {
      const pageChunks = this.chunkPage(page.text, page.pageNumber, chunkIndex);
      chunks.push(...pageChunks);
      chunkIndex += pageChunks.length;
    }

    return chunks;
  }

  private chunkPage(text: string, pageNumber: number, startIndex: number): ContentChunk[] {
    const chunks: ContentChunk[] = [];

    const paragraphs = this.splitIntoParagraphs(text);
    let currentChunk = '';
    let chunkIndex = startIndex;

    for (const paragraph of paragraphs) {
      if (this.isPotentialSectionBreak(paragraph)) {
        if (currentChunk.length >= this.config.minChunkSize) {
          chunks.push(this.createChunk(currentChunk, chunkIndex++, pageNumber));
          currentChunk = '';
        }
      }

      const combinedLength = currentChunk.length + paragraph.length;

      if (
        combinedLength > this.config.maxChunkSize &&
        currentChunk.length >= this.config.minChunkSize
      ) {
        chunks.push(this.createChunk(currentChunk, chunkIndex++, pageNumber));
        currentChunk = paragraph;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }

    if (currentChunk.length >= this.config.minChunkSize) {
      chunks.push(this.createChunk(currentChunk, chunkIndex, pageNumber));
    }

    return chunks;
  }

  private splitIntoParagraphs(text: string): string[] {
    return text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  private isPotentialSectionBreak(text: string): boolean {
    const sectionPatterns = [
      /^(?:Chapter|Section|Unit|Lesson|Part)\s+\d+/i,
      /^(?:Vocabulary|Grammar|Dialogue|Exercise|Reading)/i,
      /^\d+\.\s+[A-Z]/,
      /^[A-Z]{2,}:/,
    ];

    return sectionPatterns.some((pattern) => pattern.test(text));
  }

  private createChunk(text: string, index: number, pageNumber: number): ContentChunk {
    const cleanedText = this.cleanText(text);
    const chunkType = this.detectChunkType(cleanedText);

    return {
      index,
      text,
      cleanedText,
      pageNumber,
      chunkType: chunkType.type,
      confidence: chunkType.confidence,
      wordCount: cleanedText.split(/\s+/).filter((w) => w.length > 0).length,
      charCount: cleanedText.length,
    };
  }

  private cleanText(text: string): string {
    let cleaned = text;
    for (let i = 0; i < 32; i++) {
      if (i !== 9 && i !== 10 && i !== 13) {
        cleaned = cleaned.split(String.fromCharCode(i)).join('');
      }
    }
    cleaned = cleaned.split(String.fromCharCode(127)).join('');
    return cleaned
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private detectChunkType(text: string): { type: ChunkType; confidence: number } {
    const patterns: { type: ChunkType; regex: RegExp; weight: number }[] = [
      { type: 'vocabulary_section', regex: /vocabul|word list|glosar|palabra/i, weight: 0.9 },
      {
        type: 'grammar_explanation',
        regex: /grammar|conjugat|tense|verb form|regla|gramática/i,
        weight: 0.85,
      },
      { type: 'dialogue', regex: /dialogue|conversation|diálogo|conversación/i, weight: 0.8 },
      { type: 'dialogue', regex: /^[A-Z][a-z]+:\s/m, weight: 0.7 },
      {
        type: 'exercise',
        regex: /exercise|practice|fill in|complete|ejercicio|práctica/i,
        weight: 0.85,
      },
      { type: 'exercise', regex: /\d+\.\s*_{2,}|_+\s*\(/i, weight: 0.75 },
      { type: 'reading_passage', regex: /read|passage|text|lectura|texto/i, weight: 0.6 },
      { type: 'cultural_note', regex: /culture|tradition|history|cultura|tradición/i, weight: 0.7 },
    ];

    let bestMatch: { type: ChunkType; confidence: number } = {
      type: 'unknown',
      confidence: 0.5,
    };

    for (const pattern of patterns) {
      if (pattern.regex.test(text)) {
        if (pattern.weight > bestMatch.confidence) {
          bestMatch = { type: pattern.type, confidence: pattern.weight };
        }
      }
    }

    return bestMatch;
  }
}
