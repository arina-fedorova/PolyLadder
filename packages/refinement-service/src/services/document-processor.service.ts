import { Pool, PoolClient } from 'pg';
import { PDFExtractorService } from './pdf-extractor.service';
import { ChunkerService, ContentChunk } from './chunker.service';
import { logger } from '../utils/logger';

export interface DocumentRow {
  id: string;
  storage_path: string;
  status: string;
}

export class DocumentProcessorService {
  private pdfExtractor: PDFExtractorService;
  private chunker: ChunkerService;

  constructor(private readonly pool: Pool) {
    this.pdfExtractor = new PDFExtractorService();
    this.chunker = new ChunkerService();
  }

  async processDocument(documentId: string, fileBuffer: Buffer): Promise<void> {
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      await this.updateStatusWithClient(client, documentId, 'extracting');
      await this.logStep(documentId, 'start', 'success', 'Starting document processing');

      const extracted = await this.pdfExtractor.extractFromBuffer(fileBuffer);

      await client.query(`UPDATE document_sources SET total_pages = $1 WHERE id = $2`, [
        extracted.totalPages,
        documentId,
      ]);

      await this.logStep(
        documentId,
        'extract',
        'success',
        `Extracted ${extracted.totalPages} pages`
      );

      await this.updateStatusWithClient(client, documentId, 'chunking');

      const chunks = this.chunker.chunkDocument(extracted.pages);

      await this.saveChunksWithClient(client, documentId, chunks);

      await client.query(
        `UPDATE document_sources 
         SET status = 'ready', 
             total_chunks = $1, 
             processed_pages = $2,
             processed_at = CURRENT_TIMESTAMP,
             error_message = NULL
         WHERE id = $3`,
        [chunks.length, extracted.totalPages, documentId]
      );

      await client.query('COMMIT');

      const duration = Date.now() - startTime;
      await this.logStep(
        documentId,
        'complete',
        'success',
        `Processing complete: ${chunks.length} chunks created`,
        duration
      );
    } catch (error) {
      await client.query('ROLLBACK');

      await this.cleanupPartialProcessing(client, documentId);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const fileSize = fileBuffer.length;
      const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);

      logger.error(
        {
          documentId,
          error: errorMessage,
          fileSizeBytes: fileSize,
          fileSizeMB,
        },
        'Document processing failed'
      );

      await this.pool.query(
        `UPDATE document_sources SET status = 'error', error_message = $1 WHERE id = $2`,
        [errorMessage, documentId]
      );

      await this.logStep(documentId, 'error', 'error', errorMessage);
      throw error;
    } finally {
      client.release();
    }
  }

  async processPendingDocuments(): Promise<number> {
    const result = await this.pool.query<DocumentRow>(
      `SELECT id, storage_path FROM document_sources WHERE status = 'pending' LIMIT 5`
    );

    let processed = 0;

    for (const doc of result.rows) {
      try {
        const fs = await import('fs/promises');
        const pathModule = await import('path');
        let normalizedPath = doc.storage_path.replace(/\\/g, '/');

        if (!normalizedPath.startsWith('/')) {
          if (normalizedPath.startsWith('uploads/')) {
            normalizedPath = `/app/${normalizedPath}`;
          } else {
            normalizedPath = pathModule.join('/app/uploads/documents', normalizedPath);
          }
        }

        const fileBuffer = await fs.readFile(normalizedPath);
        await this.processDocument(doc.id, fileBuffer);
        processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(
          { documentId: doc.id, error: errorMessage, storagePath: doc.storage_path },
          'Failed to process document'
        );

        await this.pool.query(
          `UPDATE document_sources 
           SET status = 'error', 
               error_message = $1 
           WHERE id = $2`,
          [errorMessage, doc.id]
        );

        await this.logStep(doc.id, 'error', 'error', errorMessage);
      }
    }

    return processed;
  }

  private async updateStatusWithClient(
    client: PoolClient,
    documentId: string,
    status: string
  ): Promise<void> {
    await client.query(`UPDATE document_sources SET status = $1 WHERE id = $2`, [
      status,
      documentId,
    ]);
  }

  private async saveChunksWithClient(
    client: PoolClient,
    documentId: string,
    chunks: ContentChunk[]
  ): Promise<void> {
    for (const chunk of chunks) {
      await this.insertChunk(client, documentId, chunk);
    }
  }

  private async cleanupPartialProcessing(client: PoolClient, documentId: string): Promise<void> {
    try {
      await client.query(`DELETE FROM raw_content_chunks WHERE document_id = $1`, [documentId]);
    } catch (cleanupError) {
      logger.error({ documentId, error: cleanupError }, 'Failed to cleanup chunks');
    }
  }

  private async insertChunk(
    client: PoolClient,
    documentId: string,
    chunk: ContentChunk
  ): Promise<void> {
    await client.query(
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

  /**
   * Extract text from a document (used by pipeline orchestrator)
   */
  async extractText(documentId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Delete any existing chunks from previous attempts (for retry support)
      await client.query(`DELETE FROM raw_content_chunks WHERE document_id = $1`, [documentId]);

      // Get document storage path
      const docResult = await client.query<DocumentRow>(
        `SELECT storage_path FROM document_sources WHERE id = $1`,
        [documentId]
      );

      if (docResult.rows.length === 0) {
        throw new Error(`Document ${documentId} not found`);
      }

      const doc = docResult.rows[0];

      // Update status to extracting
      await this.updateStatusWithClient(client, documentId, 'extracting');
      await this.logStep(documentId, 'extract', 'start', 'Starting text extraction');

      // Load file
      const fs = await import('fs/promises');
      const pathModule = await import('path');
      let normalizedPath = doc.storage_path.replace(/\\/g, '/');

      if (!normalizedPath.startsWith('/')) {
        if (normalizedPath.startsWith('uploads/')) {
          normalizedPath = `/app/${normalizedPath}`;
        } else {
          normalizedPath = pathModule.join('/app/uploads/documents', normalizedPath);
        }
      }

      const fileBuffer = await fs.readFile(normalizedPath);

      // Extract
      const extracted = await this.pdfExtractor.extractFromBuffer(fileBuffer);

      // Update document with total pages
      await client.query(`UPDATE document_sources SET total_pages = $1 WHERE id = $2`, [
        extracted.totalPages,
        documentId,
      ]);

      await this.logStep(
        documentId,
        'extract',
        'success',
        `Extracted ${extracted.totalPages} pages`
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.pool.query(
        `UPDATE document_sources SET status = 'error', error_message = $1 WHERE id = $2`,
        [errorMessage, documentId]
      );
      await this.logStep(documentId, 'extract', 'error', errorMessage);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Chunk a document (used by pipeline orchestrator)
   */
  async chunkDocument(documentId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Delete any existing chunks from previous attempts (for retry support)
      await client.query(`DELETE FROM raw_content_chunks WHERE document_id = $1`, [documentId]);

      // Get document storage path
      const docResult = await client.query<DocumentRow>(
        `SELECT storage_path FROM document_sources WHERE id = $1`,
        [documentId]
      );

      if (docResult.rows.length === 0) {
        throw new Error(`Document ${documentId} not found`);
      }

      const doc = docResult.rows[0];

      // Update status to chunking
      await this.updateStatusWithClient(client, documentId, 'chunking');
      await this.logStep(documentId, 'chunk', 'start', 'Starting document chunking');

      // Load file
      const fs = await import('fs/promises');
      const pathModule = await import('path');
      let normalizedPath = doc.storage_path.replace(/\\/g, '/');

      if (!normalizedPath.startsWith('/')) {
        if (normalizedPath.startsWith('uploads/')) {
          normalizedPath = `/app/${normalizedPath}`;
        } else {
          normalizedPath = pathModule.join('/app/uploads/documents', normalizedPath);
        }
      }

      const fileBuffer = await fs.readFile(normalizedPath);

      // Extract and chunk
      const extracted = await this.pdfExtractor.extractFromBuffer(fileBuffer);
      const chunks = this.chunker.chunkDocument(extracted.pages);

      // Save chunks
      await this.saveChunksWithClient(client, documentId, chunks);

      // Update document
      await client.query(
        `UPDATE document_sources
         SET status = 'ready',
             total_chunks = $1,
             processed_pages = $2,
             processed_at = CURRENT_TIMESTAMP,
             error_message = NULL
         WHERE id = $3`,
        [chunks.length, extracted.totalPages, documentId]
      );

      await this.logStep(documentId, 'chunk', 'success', `Created ${chunks.length} chunks`);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      await this.cleanupPartialProcessing(client, documentId);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.pool.query(
        `UPDATE document_sources SET status = 'error', error_message = $1 WHERE id = $2`,
        [errorMessage, documentId]
      );
      await this.logStep(documentId, 'chunk', 'error', errorMessage);
      throw error;
    } finally {
      client.release();
    }
  }
}
