import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool, PoolClient } from 'pg';
import { DocumentProcessorService } from '../../src/services/document-processor.service';
import { PDFExtractorService } from '../../src/services/pdf-extractor.service';
import { ChunkerService } from '../../src/services/chunker.service';

vi.mock('../../src/services/pdf-extractor.service');
vi.mock('../../src/services/chunker.service');
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

describe('DocumentProcessorService', () => {
  let service: DocumentProcessorService;
  let mockPool: Pool;
  let mockClient: PoolClient;
  let mockConnect: ReturnType<typeof vi.fn>;
  let mockPoolQuery: ReturnType<typeof vi.fn>;
  let mockClientQuery: ReturnType<typeof vi.fn>;
  let mockRelease: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockClientQuery = vi.fn();
    mockRelease = vi.fn();
    mockClient = {
      query: mockClientQuery,
      release: mockRelease,
    } as unknown as PoolClient;

    mockConnect = vi.fn().mockResolvedValue(mockClient);
    mockPoolQuery = vi.fn();
    mockPool = {
      connect: mockConnect,
      query: mockPoolQuery,
    } as unknown as Pool;

    service = new DocumentProcessorService(mockPool);
  });

  describe('processDocument', () => {
    it('should process document successfully', async () => {
      const documentId = 'test-doc-id';
      const fileBuffer = Buffer.from('test content');

      const mockExtracted = {
        totalPages: 5,
        pages: ['page1', 'page2', 'page3', 'page4', 'page5'],
      };

      const mockChunks = [
        {
          index: 0,
          pageNumber: 1,
          text: 'chunk1',
          cleanedText: 'chunk1',
          chunkType: 'vocabulary_section',
          confidence: 0.9,
          wordCount: 10,
          charCount: 50,
        },
        {
          index: 1,
          pageNumber: 2,
          text: 'chunk2',
          cleanedText: 'chunk2',
          chunkType: 'grammar_explanation',
          confidence: 0.85,
          wordCount: 15,
          charCount: 75,
        },
      ];

      (
        PDFExtractorService.prototype.extractFromBuffer as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockExtracted);
      (ChunkerService.prototype.chunkDocument as ReturnType<typeof vi.fn>).mockReturnValue(
        mockChunks
      );

      mockClientQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockPoolQuery.mockResolvedValue({ rows: [] });

      await service.processDocument(documentId, fileBuffer);

      expect(mockConnect).toHaveBeenCalled();
      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should handle errors and cleanup partial processing', async () => {
      const documentId = 'test-doc-id';
      const fileBuffer = Buffer.from('test content');

      const error = new Error('Extraction failed');
      (
        PDFExtractorService.prototype.extractFromBuffer as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      mockClientQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockPoolQuery.mockResolvedValue({ rows: [] });

      await expect(service.processDocument(documentId, fileBuffer)).rejects.toThrow(
        'Extraction failed'
      );

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM raw_content_chunks'),
        [documentId]
      );
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'error'"),
        expect.arrayContaining([expect.stringContaining('Extraction failed'), documentId])
      );
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should handle chunking errors and cleanup', async () => {
      const documentId = 'test-doc-id';
      const fileBuffer = Buffer.from('test content');

      const mockExtracted = {
        totalPages: 2,
        pages: ['page1', 'page2'],
      };

      (
        PDFExtractorService.prototype.extractFromBuffer as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockExtracted);

      const chunkingError = new Error('Chunking failed');
      (ChunkerService.prototype.chunkDocument as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw chunkingError;
        }
      );

      mockClientQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockPoolQuery.mockResolvedValue({ rows: [] });

      await expect(service.processDocument(documentId, fileBuffer)).rejects.toThrow(
        'Chunking failed'
      );

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM raw_content_chunks'),
        [documentId]
      );
    });
  });

  describe('processPendingDocuments', () => {
    it('should process pending documents successfully', async () => {
      const mockDocs = [
        { id: 'doc1', storage_path: '/path/to/doc1.pdf', status: 'pending' },
        { id: 'doc2', storage_path: '/path/to/doc2.pdf', status: 'pending' },
      ];

      mockPoolQuery.mockResolvedValue({
        rows: mockDocs,
      });

      const mockExtracted = {
        totalPages: 1,
        pages: ['page1'],
      };

      const mockChunks = [
        {
          index: 0,
          pageNumber: 1,
          text: 'chunk1',
          cleanedText: 'chunk1',
          chunkType: 'vocabulary_section',
          confidence: 0.9,
          wordCount: 10,
          charCount: 50,
        },
      ];

      mockClientQuery.mockResolvedValue({ rows: [] });

      const { readFile } = await import('fs/promises');
      vi.mocked(readFile)
        .mockResolvedValueOnce(Buffer.from('test content'))
        .mockResolvedValueOnce(Buffer.from('test content'));

      (PDFExtractorService.prototype.extractFromBuffer as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockExtracted)
        .mockResolvedValueOnce(mockExtracted);

      (ChunkerService.prototype.chunkDocument as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(mockChunks)
        .mockReturnValueOnce(mockChunks);

      const processed = await service.processPendingDocuments();

      expect(processed).toBe(2);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        "SELECT id, storage_path FROM document_sources WHERE status = 'pending' LIMIT 5"
      );
    });

    it('should update document status to error on processing failure', async () => {
      const mockDocs = [{ id: 'doc1', storage_path: '/path/to/doc1.pdf', status: 'pending' }];

      mockPoolQuery.mockResolvedValue({
        rows: mockDocs,
      });

      const error = new Error('File read failed');
      const { readFile } = await import('fs/promises');
      vi.mocked(readFile).mockRejectedValue(error);

      const processed = await service.processPendingDocuments();

      expect(processed).toBe(0);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'error'"),
        expect.arrayContaining([expect.stringContaining('File read failed'), 'doc1'])
      );
    });

    it('should continue processing other documents if one fails', async () => {
      const mockDocs = [
        { id: 'doc1', storage_path: '/path/to/doc1.pdf', status: 'pending' },
        { id: 'doc2', storage_path: '/path/to/doc2.pdf', status: 'pending' },
      ];

      mockPoolQuery.mockResolvedValue({
        rows: mockDocs,
      });

      const mockExtracted = {
        totalPages: 1,
        pages: ['page1'],
      };

      const mockChunks = [
        {
          index: 0,
          pageNumber: 1,
          text: 'chunk1',
          cleanedText: 'chunk1',
          chunkType: 'vocabulary_section',
          confidence: 0.9,
          wordCount: 10,
          charCount: 50,
        },
      ];

      mockClientQuery.mockResolvedValue({ rows: [] });

      const { readFile } = await import('fs/promises');
      vi.mocked(readFile)
        .mockResolvedValueOnce(Buffer.from('test content'))
        .mockResolvedValueOnce(Buffer.from('test content'));

      (PDFExtractorService.prototype.extractFromBuffer as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('First doc failed'))
        .mockResolvedValueOnce(mockExtracted);

      (ChunkerService.prototype.chunkDocument as ReturnType<typeof vi.fn>).mockReturnValue(
        mockChunks
      );

      const processed = await service.processPendingDocuments();

      expect(processed).toBe(1);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'error'"),
        expect.arrayContaining([expect.stringContaining('First doc failed'), 'doc1'])
      );
    });
  });
});
