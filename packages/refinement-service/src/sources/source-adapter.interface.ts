import { ContentType } from '../services/work-planner.service';

type Language = 'EN' | 'ES' | 'IT' | 'PT' | 'SL';
type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface SourceRequest {
  type: ContentType;
  language: Language;
  level?: CEFRLevel;
  metadata: Record<string, unknown>;
}

export interface SourceMetadata {
  sourceName: string;
  generatedAt: Date;
  confidence?: number;
  tokens?: number;
  cost?: number;
}

export interface GeneratedContent {
  contentType: ContentType;
  language: Language;
  level?: CEFRLevel;
  data: Record<string, unknown>;
  sourceMetadata: SourceMetadata;
}

export interface SourceAdapter {
  readonly name: string;
  readonly supportedTypes: ContentType[];

  canHandle(request: SourceRequest): boolean;
  generate(request: SourceRequest): Promise<GeneratedContent>;
  healthCheck(): Promise<boolean>;
}

export type { Language as SourceLanguage, CEFRLevel as SourceCEFRLevel };
