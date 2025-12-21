# F015: Document Processing Pipeline

**Feature Code**: F015
**Created**: 2025-12-21
**Phase**: 4 - Content Refinement Service
**Status**: 🔄 Planned
**Replaces**: F015-work-planner-priority-system (deprecated)

---

## Description

System for uploading, parsing, and chunking educational documents (PDF textbooks, grammar guides). Extracts raw content and prepares it for semantic mapping and LLM transformation.

## Success Criteria

- [ ] Document upload UI (PDF, DOCX support)
- [ ] File storage integration (S3-compatible or Fly Volumes)
- [ ] PDF text extraction with structure detection
- [ ] Content chunking by semantic boundaries
- [ ] Processing status tracking with progress
- [ ] Document library UI for operators
- [ ] OCR support for scanned PDFs

---

## Tasks

### Task 1: Database Schema for Documents

**Description**: Create tables to store document metadata and extracted content chunks.

**Implementation Plan**:

Create `packages/db/migrations/016-document-sources.sql`:

```sql
CREATE TYPE document_status_enum AS ENUM (
  'pending',
  'extracting',
  'chunking',
  'ready',
  'error'
);

CREATE TYPE document_type_enum AS ENUM (
  'textbook',
  'grammar_guide',
  'vocabulary_list',
  'dialogue_corpus',
  'exercise_book',
  'other'
);

CREATE TABLE document_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(500) NOT NULL,
  original_filename VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  storage_path VARCHAR(1000) NOT NULL,

  language language_enum NOT NULL,
  target_level cefr_level_enum,
  document_type document_type_enum NOT NULL DEFAULT 'other',

  title VARCHAR(500),
  description TEXT,
  source_info TEXT,

  status document_status_enum NOT NULL DEFAULT 'pending',
  error_message TEXT,

  total_pages INTEGER,
  processed_pages INTEGER DEFAULT 0,
  total_chunks INTEGER DEFAULT 0,

  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP WITH TIME ZONE,

  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_document_sources_language ON document_sources(language);
CREATE INDEX idx_document_sources_status ON document_sources(status);
CREATE INDEX idx_document_sources_uploaded ON document_sources(uploaded_at);

CREATE TYPE chunk_type_enum AS ENUM (
  'vocabulary_section',
  'grammar_explanation',
  'dialogue',
  'exercise',
  'reading_passage',
  'cultural_note',
  'unknown'
);

CREATE TABLE raw_content_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES document_sources(id) ON DELETE CASCADE,

  chunk_index INTEGER NOT NULL,
  page_number INTEGER,

  raw_text TEXT NOT NULL,
  cleaned_text TEXT,

  chunk_type chunk_type_enum NOT NULL DEFAULT 'unknown',
  confidence_score DECIMAL(3, 2),

  word_count INTEGER,
  char_count INTEGER,

  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(document_id, chunk_index)
);

CREATE INDEX idx_raw_chunks_document ON raw_content_chunks(document_id);
CREATE INDEX idx_raw_chunks_type ON raw_content_chunks(chunk_type);

CREATE TABLE document_processing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES document_sources(id) ON DELETE CASCADE,
  step VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_processing_log_document ON document_processing_log(document_id);
```

**Files Created**: `packages/db/migrations/016-document-sources.sql`

---

### Task 2: File Storage Service

**Description**: Abstract file storage for documents (S3 or local).

**Implementation Plan**:

Create `packages/api/src/services/storage.service.ts`:

```typescript
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuid } from 'uuid';

export interface StorageConfig {
  type: 'local' | 's3';
  localPath?: string;
  s3Bucket?: string;
  s3Region?: string;
}

export interface UploadResult {
  storagePath: string;
  publicUrl?: string;
}

export class StorageService {
  private s3Client?: S3Client;
  private config: StorageConfig;

  constructor(config: StorageConfig) {
    this.config = config;

    if (config.type === 's3' && config.s3Region) {
      this.s3Client = new S3Client({ region: config.s3Region });
    }
  }

  async uploadFile(buffer: Buffer, filename: string, mimeType: string): Promise<UploadResult> {
    const uniqueFilename = `${uuid()}-${filename}`;

    if (this.config.type === 's3' && this.s3Client && this.config.s3Bucket) {
      const key = `documents/${uniqueFilename}`;

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.config.s3Bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
        })
      );

      return {
        storagePath: key,
        publicUrl: `https://${this.config.s3Bucket}.s3.amazonaws.com/${key}`,
      };
    }

    const localDir = this.config.localPath || './uploads/documents';
    await fs.mkdir(localDir, { recursive: true });

    const filePath = path.join(localDir, uniqueFilename);
    await fs.writeFile(filePath, buffer);

    return {
      storagePath: filePath,
    };
  }

  async getFile(storagePath: string): Promise<Buffer> {
    if (this.config.type === 's3' && this.s3Client && this.config.s3Bucket) {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.config.s3Bucket,
          Key: storagePath,
        })
      );

      return Buffer.from(await response.Body!.transformToByteArray());
    }

    return fs.readFile(storagePath);
  }

  async deleteFile(storagePath: string): Promise<void> {
    if (this.config.type === 's3' && this.s3Client && this.config.s3Bucket) {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.config.s3Bucket,
          Key: storagePath,
        })
      );
      return;
    }

    await fs.unlink(storagePath);
  }

  async getSignedDownloadUrl(storagePath: string, expiresIn = 3600): Promise<string> {
    if (this.config.type === 's3' && this.s3Client && this.config.s3Bucket) {
      const command = new GetObjectCommand({
        Bucket: this.config.s3Bucket,
        Key: storagePath,
      });

      return getSignedUrl(this.s3Client, command, { expiresIn });
    }

    return storagePath;
  }
}
```

**Files Created**: `packages/api/src/services/storage.service.ts`

---

### Task 3: PDF Extraction Service

**Description**: Extract text and structure from PDF documents.

**Implementation Plan**:

Create `packages/refinement-service/src/services/pdf-extractor.service.ts`:

```typescript
import * as pdfParse from 'pdf-parse';
import { getDocument } from 'pdfjs-dist';

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  metadata: {
    hasImages: boolean;
    wordCount: number;
  };
}

export interface ExtractionResult {
  totalPages: number;
  pages: ExtractedPage[];
  metadata: {
    title?: string;
    author?: string;
    creationDate?: string;
  };
}

export class PDFExtractorService {
  async extractFromBuffer(buffer: Buffer): Promise<ExtractionResult> {
    const data = await pdfParse(buffer);

    const pages: ExtractedPage[] = [];
    const textPerPage = await this.extractPagesWithPdfJs(buffer);

    for (let i = 0; i < textPerPage.length; i++) {
      pages.push({
        pageNumber: i + 1,
        text: textPerPage[i],
        metadata: {
          hasImages: false,
          wordCount: textPerPage[i].split(/\s+/).filter((w) => w.length > 0).length,
        },
      });
    }

    return {
      totalPages: data.numpages,
      pages,
      metadata: {
        title: data.info?.Title,
        author: data.info?.Author,
        creationDate: data.info?.CreationDate,
      },
    };
  }

  private async extractPagesWithPdfJs(buffer: Buffer): Promise<string[]> {
    const uint8Array = new Uint8Array(buffer);
    const loadingTask = getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;

    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      pages.push(pageText);
    }

    return pages;
  }
}
```

**Files Created**: `packages/refinement-service/src/services/pdf-extractor.service.ts`

---

### Task 4: Content Chunking Service

**Description**: Split extracted content into semantic chunks.

**Implementation Plan**:

Create `packages/refinement-service/src/services/chunker.service.ts`:

```typescript
export interface ChunkConfig {
  minChunkSize: number;
  maxChunkSize: number;
  overlapSize: number;
}

export interface ContentChunk {
  index: number;
  text: string;
  cleanedText: string;
  pageNumber?: number;
  chunkType:
    | 'vocabulary_section'
    | 'grammar_explanation'
    | 'dialogue'
    | 'exercise'
    | 'reading_passage'
    | 'cultural_note'
    | 'unknown';
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

  async chunkDocument(pages: { pageNumber: number; text: string }[]): Promise<ContentChunk[]> {
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
    return text
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private detectChunkType(text: string): { type: ContentChunk['chunkType']; confidence: number } {
    const patterns: { type: ContentChunk['chunkType']; regex: RegExp; weight: number }[] = [
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

    let bestMatch: { type: ContentChunk['chunkType']; confidence: number } = {
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
```

**Files Created**: `packages/refinement-service/src/services/chunker.service.ts`

---

### Task 5: Document Processing Orchestrator

**Description**: Coordinates the full document processing pipeline.

**Implementation Plan**:

Create `packages/refinement-service/src/services/document-processor.service.ts`:

```typescript
import { Pool } from 'pg';
import { PDFExtractorService } from './pdf-extractor.service';
import { ChunkerService, ContentChunk } from './chunker.service';
import { StorageService } from '@polyladder/api/services/storage.service';
import { logger } from '../utils/logger';

export class DocumentProcessorService {
  private pdfExtractor: PDFExtractorService;
  private chunker: ChunkerService;

  constructor(
    private readonly pool: Pool,
    private readonly storage: StorageService
  ) {
    this.pdfExtractor = new PDFExtractorService();
    this.chunker = new ChunkerService();
  }

  async processDocument(documentId: string): Promise<void> {
    const startTime = Date.now();

    try {
      await this.updateStatus(documentId, 'extracting');
      await this.logStep(documentId, 'start', 'success', 'Starting document processing');

      const document = await this.getDocument(documentId);
      const fileBuffer = await this.storage.getFile(document.storage_path);

      await this.logStep(documentId, 'download', 'success', 'File downloaded from storage');

      const extracted = await this.pdfExtractor.extractFromBuffer(fileBuffer);

      await this.pool.query(`UPDATE document_sources SET total_pages = $1 WHERE id = $2`, [
        extracted.totalPages,
        documentId,
      ]);

      await this.logStep(
        documentId,
        'extract',
        'success',
        `Extracted ${extracted.totalPages} pages`
      );

      await this.updateStatus(documentId, 'chunking');

      const chunks = await this.chunker.chunkDocument(extracted.pages);

      await this.saveChunks(documentId, chunks);

      await this.pool.query(
        `UPDATE document_sources 
         SET status = 'ready', 
             total_chunks = $1, 
             processed_pages = $2,
             processed_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [chunks.length, extracted.totalPages, documentId]
      );

      const duration = Date.now() - startTime;
      await this.logStep(
        documentId,
        'complete',
        'success',
        `Processing complete: ${chunks.length} chunks created`,
        duration
      );

      logger.info(
        { documentId, chunks: chunks.length, duration },
        'Document processed successfully'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.pool.query(
        `UPDATE document_sources SET status = 'error', error_message = $1 WHERE id = $2`,
        [errorMessage, documentId]
      );

      await this.logStep(documentId, 'error', 'error', errorMessage);

      logger.error({ documentId, error }, 'Document processing failed');
      throw error;
    }
  }

  private async getDocument(id: string): Promise<any> {
    const result = await this.pool.query(`SELECT * FROM document_sources WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      throw new Error(`Document not found: ${id}`);
    }

    return result.rows[0];
  }

  private async updateStatus(documentId: string, status: string): Promise<void> {
    await this.pool.query(`UPDATE document_sources SET status = $1 WHERE id = $2`, [
      status,
      documentId,
    ]);
  }

  private async saveChunks(documentId: string, chunks: ContentChunk[]): Promise<void> {
    for (const chunk of chunks) {
      await this.pool.query(
        `INSERT INTO raw_content_chunks 
         (document_id, chunk_index, page_number, raw_text, cleaned_text, 
          chunk_type, confidence_score, word_count, char_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          documentId,
          chunk.index,
          chunk.pageNumber,
          chunk.text,
          chunk.cleanedText,
          chunk.chunkType,
          chunk.confidence,
          chunk.wordCount,
          chunk.charCount,
        ]
      );
    }
  }

  private async logStep(
    documentId: string,
    step: string,
    status: string,
    message: string,
    durationMs?: number
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO document_processing_log (document_id, step, status, message, duration_ms)
       VALUES ($1, $2, $3, $4, $5)`,
      [documentId, step, status, message, durationMs]
    );
  }
}
```

**Files Created**: `packages/refinement-service/src/services/document-processor.service.ts`

---

### Task 6: Document Upload API Endpoints

**Description**: REST API for uploading and managing documents.

**Implementation Plan**:

Create `packages/api/src/routes/operational/documents.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import multipart from '@fastify/multipart';
import { StorageService } from '../../services/storage.service';

const UploadMetadataSchema = z.object({
  language: z.enum(['ES', 'IT', 'PT', 'SL']),
  targetLevel: z.enum(['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional(),
  documentType: z.enum([
    'textbook',
    'grammar_guide',
    'vocabulary_list',
    'dialogue_corpus',
    'exercise_book',
    'other',
  ]),
  title: z.string().optional(),
  description: z.string().optional(),
  sourceInfo: z.string().optional(),
});

export const documentRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024,
    },
  });

  const storageConfig = {
    type: (process.env.STORAGE_TYPE as 'local' | 's3') || 'local',
    localPath: process.env.STORAGE_LOCAL_PATH || './uploads',
    s3Bucket: process.env.S3_BUCKET,
    s3Region: process.env.S3_REGION,
  };

  const storage = new StorageService(storageConfig);

  fastify.post('/operational/documents/upload', async (request, reply) => {
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowedMimeTypes.includes(data.mimetype)) {
      return reply.status(400).send({ error: 'Invalid file type. Only PDF and DOCX allowed.' });
    }

    const buffer = await data.toBuffer();
    const metadata = data.fields.metadata
      ? UploadMetadataSchema.parse(JSON.parse((data.fields.metadata as any).value))
      : UploadMetadataSchema.parse({});

    const uploadResult = await storage.uploadFile(buffer, data.filename, data.mimetype);

    const result = await fastify.db.query(
      `INSERT INTO document_sources 
       (filename, original_filename, mime_type, file_size_bytes, storage_path,
        language, target_level, document_type, title, description, source_info,
        uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        uploadResult.storagePath.split('/').pop(),
        data.filename,
        data.mimetype,
        buffer.length,
        uploadResult.storagePath,
        metadata.language,
        metadata.targetLevel,
        metadata.documentType,
        metadata.title,
        metadata.description,
        metadata.sourceInfo,
        request.user.userId,
      ]
    );

    return reply.status(201).send({ document: result.rows[0] });
  });

  fastify.get('/operational/documents', async (request, reply) => {
    const { language, status, page = 1, limit = 20 } = request.query as any;

    let whereClause = '1=1';
    const params: any[] = [];

    if (language) {
      params.push(language);
      whereClause += ` AND language = $${params.length}`;
    }

    if (status) {
      params.push(status);
      whereClause += ` AND status = $${params.length}`;
    }

    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const result = await fastify.db.query(
      `SELECT d.*, u.email as uploaded_by_email
       FROM document_sources d
       LEFT JOIN users u ON d.uploaded_by = u.id
       WHERE ${whereClause}
       ORDER BY d.uploaded_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countResult = await fastify.db.query(
      `SELECT COUNT(*) FROM document_sources WHERE ${whereClause}`,
      params.slice(0, -2)
    );

    return reply.send({
      documents: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    });
  });

  fastify.get('/operational/documents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const docResult = await fastify.db.query(`SELECT * FROM document_sources WHERE id = $1`, [id]);

    if (docResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Document not found' });
    }

    const chunksResult = await fastify.db.query(
      `SELECT id, chunk_index, page_number, chunk_type, confidence_score, word_count
       FROM raw_content_chunks
       WHERE document_id = $1
       ORDER BY chunk_index`,
      [id]
    );

    const logsResult = await fastify.db.query(
      `SELECT * FROM document_processing_log
       WHERE document_id = $1
       ORDER BY created_at`,
      [id]
    );

    return reply.send({
      document: docResult.rows[0],
      chunks: chunksResult.rows,
      processingLog: logsResult.rows,
    });
  });

  fastify.post('/operational/documents/:id/reprocess', async (request, reply) => {
    const { id } = request.params as { id: string };

    await fastify.db.query(
      `UPDATE document_sources SET status = 'pending', error_message = NULL WHERE id = $1`,
      [id]
    );

    await fastify.db.query(`DELETE FROM raw_content_chunks WHERE document_id = $1`, [id]);

    return reply.send({ success: true, message: 'Document queued for reprocessing' });
  });

  fastify.delete('/operational/documents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const doc = await fastify.db.query(`SELECT storage_path FROM document_sources WHERE id = $1`, [
      id,
    ]);

    if (doc.rows.length > 0) {
      await storage.deleteFile(doc.rows[0].storage_path);
    }

    await fastify.db.query(`DELETE FROM document_sources WHERE id = $1`, [id]);

    return reply.status(204).send();
  });
};
```

**Files Created**: `packages/api/src/routes/operational/documents.ts`

---

### Task 7: Document Library UI

**Description**: React components for document management.

**Implementation Plan**:

Create `packages/web/src/pages/operator/DocumentLibraryPage.tsx`:

```typescript
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FileText, Trash2, RefreshCw, Eye, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { api } from '../../api/client';

interface Document {
  id: string;
  original_filename: string;
  language: string;
  target_level: string | null;
  document_type: string;
  status: 'pending' | 'extracting' | 'chunking' | 'ready' | 'error';
  total_pages: number | null;
  total_chunks: number | null;
  uploaded_at: string;
  error_message: string | null;
}

const STATUS_CONFIG = {
  pending: { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-100' },
  extracting: { icon: RefreshCw, color: 'text-blue-500', bg: 'bg-blue-100' },
  chunking: { icon: RefreshCw, color: 'text-yellow-500', bg: 'bg-yellow-100' },
  ready: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100' },
  error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100' },
};

export function DocumentLibraryPage() {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api.get('/operational/documents'),
    refetchInterval: 5000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/operational/documents/${id}`),
    onSuccess: () => queryClient.invalidateQueries(['documents']),
  });

  const reprocessMutation = useMutation({
    mutationFn: (id: string) => api.post(`/operational/documents/${id}/reprocess`),
    onSuccess: () => queryClient.invalidateQueries(['documents']),
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Document Library</h1>
        <button
          onClick={() => setUploadModalOpen(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Upload Document
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading documents...</div>
      ) : data?.documents.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No documents yet</h3>
          <p className="text-gray-500 mt-1">Upload a PDF textbook to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data?.documents.map((doc: Document) => {
            const statusConfig = STATUS_CONFIG[doc.status];
            const StatusIcon = statusConfig.icon;

            return (
              <div
                key={doc.id}
                className="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${statusConfig.bg}`}>
                    <FileText className={`w-6 h-6 ${statusConfig.color}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate">{doc.original_filename}</h3>
                      <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">
                        {doc.language}
                      </span>
                      {doc.target_level && (
                        <span className="text-xs px-2 py-0.5 bg-primary-100 text-primary-700 rounded">
                          {doc.target_level}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <StatusIcon className={`w-4 h-4 ${statusConfig.color} ${doc.status === 'extracting' || doc.status === 'chunking' ? 'animate-spin' : ''}`} />
                        {doc.status}
                      </span>
                      {doc.total_pages && <span>{doc.total_pages} pages</span>}
                      {doc.total_chunks && <span>{doc.total_chunks} chunks</span>}
                      <span>
                        {new Date(doc.uploaded_at).toLocaleDateString()}
                      </span>
                    </div>
                    {doc.error_message && (
                      <div className="flex items-center gap-1 mt-2 text-sm text-red-600">
                        <AlertCircle className="w-4 h-4" />
                        {doc.error_message}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedDoc(doc.id)}
                      className="p-2 hover:bg-gray-100 rounded"
                      title="View details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {(doc.status === 'error' || doc.status === 'ready') && (
                      <button
                        onClick={() => reprocessMutation.mutate(doc.id)}
                        className="p-2 hover:bg-blue-100 text-blue-600 rounded"
                        title="Reprocess"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteMutation.mutate(doc.id)}
                      className="p-2 hover:bg-red-100 text-red-600 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {uploadModalOpen && (
        <UploadModal
          onClose={() => setUploadModalOpen(false)}
          onSuccess={() => {
            setUploadModalOpen(false);
            queryClient.invalidateQueries(['documents']);
          }}
        />
      )}

      {selectedDoc && (
        <DocumentDetailModal
          documentId={selectedDoc}
          onClose={() => setSelectedDoc(null)}
        />
      )}
    </div>
  );
}
```

**Files Created**: `packages/web/src/pages/operator/DocumentLibraryPage.tsx`

---

## Dependencies

- **Blocks**: F016 (Content Transformation Engine)
- **Depends on**: F014 (Curriculum Structure), F018-F020 (API infrastructure)

---

## Notes

- Documents are processed asynchronously by the Refinement Service
- Chunk types are detected heuristically, refined in F016 via LLM
- Large documents (>100 pages) may take several minutes to process
- OCR for scanned PDFs requires additional configuration (tesseract.js)

---

## Open Questions

### Question 1: File Size Limits

**Context**: Large textbooks can be 200+ pages, 50+ MB.

**Options**:

1. **Conservative** (20MB): Covers most grammar guides
2. **Moderate** (50MB): Covers most textbooks
3. **Large** (100MB): Covers comprehensive reference books

**Recommendation**: Start with 50MB limit. Increase if needed.

### Question 2: Supported File Formats

**Context**: Besides PDF, what formats should be supported?

**MVP**: PDF only (most common for textbooks)
**Post-MVP**: DOCX, EPUB, HTML, plain text

### Question 3: Storage Strategy

**Context**: Where to store uploaded files?

**Options**:

1. **Local (Fly Volumes)**: Simple, ~$0.15/GB/month
2. **S3-compatible (Backblaze B2)**: Cheaper at scale, $0.005/GB/month
3. **Hybrid**: Local for processing, S3 for long-term

**Recommendation**: Start with local storage. Migrate to S3 when storage exceeds 10GB.
