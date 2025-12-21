import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import multipart from '@fastify/multipart';
import { StorageService } from '../../services/storage.service';
import { authMiddleware } from '../../middleware/auth';

const UploadMetadataSchema = z.object({
  language: z.enum(['ES', 'IT', 'PT', 'SL', 'EN']),
  targetLevel: z.enum(['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional(),
  documentType: z
    .enum([
      'textbook',
      'grammar_guide',
      'vocabulary_list',
      'dialogue_corpus',
      'exercise_book',
      'other',
    ])
    .default('other'),
  title: z.string().optional(),
  description: z.string().optional(),
  sourceInfo: z.string().optional(),
});

interface DocumentQueryParams {
  language?: string;
  status?: string;
  page?: string;
  limit?: string;
}

interface FieldValue {
  value: string;
}

interface DocumentRow {
  id: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  storage_path: string;
  language: string;
  target_level: string | null;
  document_type: string;
  title: string | null;
  description: string | null;
  status: string;
  error_message: string | null;
  total_pages: number | null;
  total_chunks: number | null;
  uploaded_at: string;
}

interface CountResult {
  count: string;
}

interface ChunkRow {
  id: string;
  chunk_index: number;
  page_number: number | null;
  chunk_type: string;
  confidence_score: number | null;
  word_count: number;
}

interface LogRow {
  id: string;
  step: string;
  status: string;
  message: string;
  duration_ms: number | null;
  created_at: string;
}

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

  fastify.post(
    '/documents/upload',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({
          error: { statusCode: 400, message: 'No file uploaded' },
        });
      }

      const allowedMimeTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];
      if (!allowedMimeTypes.includes(data.mimetype)) {
        return reply.status(400).send({
          error: { statusCode: 400, message: 'Invalid file type. Only PDF and DOCX allowed.' },
        });
      }

      const buffer = await data.toBuffer();

      let metadata: z.infer<typeof UploadMetadataSchema> = {
        language: 'ES',
        documentType: 'other',
      };
      const metadataField = data.fields.metadata as FieldValue | undefined;
      if (metadataField?.value) {
        metadata = UploadMetadataSchema.parse(JSON.parse(metadataField.value));
      }

      const uploadResult = await storage.uploadFile(buffer, data.filename, data.mimetype);

      const result = await fastify.db.query(
        `INSERT INTO document_sources 
         (filename, original_filename, mime_type, file_size_bytes, storage_path,
          language, target_level, document_type, title, description, source_info,
          uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          uploadResult.storagePath.split('/').pop() || uploadResult.storagePath,
          data.filename,
          data.mimetype,
          buffer.length,
          uploadResult.storagePath,
          metadata.language,
          metadata.targetLevel || null,
          metadata.documentType,
          metadata.title || null,
          metadata.description || null,
          metadata.sourceInfo || null,
          request.user?.userId || null,
        ]
      );

      return reply.status(201).send({ document: result.rows[0] as DocumentRow });
    }
  );

  fastify.get(
    '/documents',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const query = request.query as DocumentQueryParams;
      const { language, status, page = '1', limit = '20' } = query;

      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 20;

      let whereClause = '1=1';
      const params: (string | number)[] = [];

      if (language) {
        params.push(language);
        whereClause += ` AND language = $${params.length}`;
      }

      if (status) {
        params.push(status);
        whereClause += ` AND status = $${params.length}`;
      }

      const offset = (pageNum - 1) * limitNum;
      params.push(limitNum, offset);

      const result = await fastify.db.query(
        `SELECT d.*, u.email as uploaded_by_email
         FROM document_sources d
         LEFT JOIN users u ON d.uploaded_by = u.id
         WHERE ${whereClause}
         ORDER BY d.uploaded_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      const countResult = await fastify.db.query<CountResult>(
        `SELECT COUNT(*) FROM document_sources WHERE ${whereClause}`,
        params.slice(0, -2)
      );

      return reply.send({
        documents: result.rows as DocumentRow[],
        total: parseInt(countResult.rows[0].count, 10),
        page: pageNum,
        limit: limitNum,
      });
    }
  );

  fastify.get(
    '/documents/:id',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const docResult = await fastify.db.query(`SELECT * FROM document_sources WHERE id = $1`, [
        id,
      ]);

      if (docResult.rows.length === 0) {
        return reply.status(404).send({
          error: { statusCode: 404, message: 'Document not found' },
        });
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
        document: docResult.rows[0] as DocumentRow,
        chunks: chunksResult.rows as ChunkRow[],
        processingLog: logsResult.rows as LogRow[],
      });
    }
  );

  fastify.get(
    '/documents/:id/chunks/:chunkId',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { id, chunkId } = request.params as { id: string; chunkId: string };

      const result = await fastify.db.query(
        `SELECT * FROM raw_content_chunks WHERE id = $1 AND document_id = $2`,
        [chunkId, id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({
          error: { statusCode: 404, message: 'Chunk not found' },
        });
      }

      return reply.send({ chunk: result.rows[0] as ChunkRow });
    }
  );

  fastify.post(
    '/documents/:id/reprocess',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      await fastify.db.query(
        `UPDATE document_sources SET status = 'pending', error_message = NULL WHERE id = $1`,
        [id]
      );

      await fastify.db.query(`DELETE FROM raw_content_chunks WHERE document_id = $1`, [id]);

      return reply.send({ success: true, message: 'Document queued for reprocessing' });
    }
  );

  fastify.delete(
    '/documents/:id',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const doc = await fastify.db.query<{ storage_path: string }>(
        `SELECT storage_path FROM document_sources WHERE id = $1`,
        [id]
      );

      if (doc.rows.length > 0) {
        try {
          await storage.deleteFile(doc.rows[0].storage_path);
        } catch {
          /* ignore deletion errors */
        }
      }

      await fastify.db.query(`DELETE FROM document_sources WHERE id = $1`, [id]);

      return reply.status(204).send();
    }
  );
};
