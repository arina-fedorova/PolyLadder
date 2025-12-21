import { Pool, PoolClient } from 'pg';
import { PDFExtractorService } from './pdf-extractor.service';
import { ChunkerService, ContentChunk } from './chunker.service';

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

    try {
      await this.updateStatus(documentId, 'extracting');
      await this.logStep(documentId, 'start', 'success', 'Starting document processing');

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

      const chunks = this.chunker.chunkDocument(extracted.pages);

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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.pool.query(
        `UPDATE document_sources SET status = 'error', error_message = $1 WHERE id = $2`,
        [errorMessage, documentId]
      );

      await this.logStep(documentId, 'error', 'error', errorMessage);
      throw error;
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
        const fileBuffer = await fs.readFile(doc.storage_path);
        await this.processDocument(doc.id, fileBuffer);
        processed++;
      } catch (error) {
        console.error(`Failed to process document ${doc.id}:`, error);
      }
    }

    return processed;
  }

  private async updateStatus(documentId: string, status: string): Promise<void> {
    await this.pool.query(`UPDATE document_sources SET status = $1 WHERE id = $2`, [
      status,
      documentId,
    ]);
  }

  private async saveChunks(documentId: string, chunks: ContentChunk[]): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const chunk of chunks) {
        await this.insertChunk(client, documentId, chunk);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
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
}
