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

function validateFilename(filename: string): { valid: boolean; error?: string } {
  if (!filename || filename.trim().length === 0) {
    return { valid: false, error: 'Filename is required' };
  }

  if (filename.length > 255) {
    return { valid: false, error: 'Filename is too long (max 255 characters)' };
  }

  const dangerousChars = /[<>:"|?*]/;
  if (dangerousChars.test(filename)) {
    return {
      valid: false,
      error: 'Filename contains invalid characters',
    };
  }

  for (let i = 0; i < filename.length; i++) {
    const charCode = filename.charCodeAt(i);
    if (charCode >= 0 && charCode <= 31) {
      return {
        valid: false,
        error: 'Filename contains invalid characters',
      };
    }
  }

  const pathTraversal = /\.\./;
  if (pathTraversal.test(filename)) {
    return { valid: false, error: 'Filename contains path traversal characters' };
  }

  const normalizedFilename = filename.split(/[/\\]/).pop() || filename;
  if (normalizedFilename !== filename) {
    return { valid: false, error: 'Filename contains path separators' };
  }

  return { valid: true };
}

function validateMagicBytes(buffer: Buffer, mimeType: string): { valid: boolean; error?: string } {
  if (buffer.length < 4) {
    return { valid: false, error: 'File is too small to validate' };
  }

  const pdfMagicBytes = Buffer.from([0x25, 0x50, 0x44, 0x46]);
  const docxMagicBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

  if (mimeType === 'application/pdf') {
    const header = buffer.slice(0, 4);
    if (!header.equals(pdfMagicBytes)) {
      return {
        valid: false,
        error: 'File content does not match PDF format. Magic bytes validation failed.',
      };
    }
  } else if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const header = buffer.slice(0, 4);
    if (!header.equals(docxMagicBytes)) {
      return {
        valid: false,
        error: 'File content does not match DOCX format. Magic bytes validation failed.',
      };
    }

    const zipCentralDir = buffer.indexOf(Buffer.from('PK\x05\x06'));
    if (zipCentralDir === -1) {
      return {
        valid: false,
        error: 'File does not appear to be a valid ZIP archive (DOCX requirement)',
      };
    }
  }

  return { valid: true };
}

export const documentRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024,
    },
  });

  const storageConfig = {
    type: (process.env.STORAGE_TYPE as 'local' | 's3') || 'local',
    localPath:
      process.env.STORAGE_LOCAL_PATH ||
      (process.env.NODE_ENV === 'test' ? './test-uploads' : '/app/uploads/documents'),
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
      let data;
      try {
        data = await request.file();
      } catch (error) {
        if (error instanceof Error && error.message.includes('multipart')) {
          return reply.status(400).send({
            error: { statusCode: 400, message: 'No file uploaded' },
          });
        }
        throw error;
      }

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

      if (buffer.length === 0) {
        return reply.status(400).send({
          error: { statusCode: 400, message: 'File is empty' },
        });
      }

      const MIN_FILE_SIZE = 100;
      if (buffer.length < MIN_FILE_SIZE) {
        return reply.status(400).send({
          error: {
            statusCode: 400,
            message: `File is too small. Minimum size is ${MIN_FILE_SIZE} bytes.`,
          },
        });
      }

      if (!data.filename) {
        return reply.status(400).send({
          error: { statusCode: 400, message: 'Filename is required' },
        });
      }

      const receivedFilename = data.filename;
      const filenameValidation = validateFilename(receivedFilename);
      if (!filenameValidation.valid) {
        return reply.status(400).send({
          error: { statusCode: 400, message: filenameValidation.error },
        });
      }

      const magicBytesValidation = validateMagicBytes(buffer, data.mimetype);
      if (!magicBytesValidation.valid) {
        return reply.status(400).send({
          error: { statusCode: 400, message: magicBytesValidation.error },
        });
      }

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

      const document = result.rows[0] as DocumentRow;

      const pipelineResult = await fastify.db.query<{ id: string }>(
        `INSERT INTO pipelines (document_id, status, current_stage, metadata, started_at)
         VALUES ($1, 'processing', 'extracting', $2, CURRENT_TIMESTAMP)
         RETURNING id`,
        [
          document.id,
          JSON.stringify({
            language: metadata.language,
            targetLevel: metadata.targetLevel,
            documentType: metadata.documentType,
            uploadedBy: request.user?.userId,
          }),
        ]
      );

      const pipelineId = pipelineResult.rows[0].id;

      await fastify.db.query(
        `INSERT INTO document_processing_tasks (pipeline_id, task_type, status, item_id, started_at)
         VALUES ($1, 'extract', 'pending', $2, CURRENT_TIMESTAMP)`,
        [pipelineId, document.id]
      );

      return reply.status(201).send({ document });
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

      const client = await fastify.db.connect();
      try {
        await client.query('BEGIN');

        const doc = await client.query<{ storage_path: string }>(
          `SELECT storage_path FROM document_sources WHERE id = $1`,
          [id]
        );

        if (doc.rows.length === 0) {
          await client.query('ROLLBACK');
          return reply.status(404).send({
            error: {
              statusCode: 404,
              message: 'Document not found',
              requestId: request.id,
              code: 'NOT_FOUND',
            },
          });
        }

        const chunkIdsResult = await client.query<{ id: string }>(
          `SELECT id FROM raw_content_chunks WHERE document_id = $1`,
          [id]
        );
        const chunkIds = chunkIdsResult.rows.map((row) => row.id);

        if (chunkIds.length > 0) {
          const mappingIdsResult = await client.query<{ id: string }>(
            `SELECT id FROM content_topic_mappings WHERE chunk_id = ANY($1)`,
            [chunkIds]
          );
          const mappingIds = mappingIdsResult.rows.map((row) => row.id);

          if (mappingIds.length > 0) {
            const transformationJobIdsResult = await client.query<{ id: string }>(
              `SELECT id FROM transformation_jobs WHERE mapping_id = ANY($1)`,
              [mappingIds]
            );
            const transformationJobIds = transformationJobIdsResult.rows.map((row) => row.id);

            if (transformationJobIds.length > 0) {
              await client.query(
                `UPDATE drafts SET transformation_job_id = NULL WHERE transformation_job_id = ANY($1)`,
                [transformationJobIds]
              );
            }

            await client.query(`DELETE FROM transformation_jobs WHERE mapping_id = ANY($1)`, [
              mappingIds,
            ]);
          }

          await client.query(`DELETE FROM content_topic_mappings WHERE chunk_id = ANY($1)`, [
            chunkIds,
          ]);
        }

        await client.query(`DELETE FROM raw_content_chunks WHERE document_id = $1`, [id]);

        const validatedIdsResult = await client.query<{ id: string }>(
          `SELECT v.id
           FROM validated v
           JOIN candidates c ON v.candidate_id = c.id
           JOIN drafts d ON c.draft_id = d.id
           WHERE d.document_id = $1
             AND NOT EXISTS (
               SELECT 1 FROM approved_meanings am WHERE am.id = v.id
               UNION ALL
               SELECT 1 FROM approved_utterances au WHERE au.id = v.id
               UNION ALL
               SELECT 1 FROM approved_rules ar WHERE ar.id = v.id
               UNION ALL
               SELECT 1 FROM approved_exercises ae WHERE ae.id = v.id
             )`,
          [id]
        );

        const validatedIds = validatedIdsResult.rows.map((row) => row.id);

        if (validatedIds.length > 0) {
          await client.query(`DELETE FROM review_queue WHERE item_id = ANY($1)`, [validatedIds]);
          await client.query(`DELETE FROM validated WHERE id = ANY($1)`, [validatedIds]);
        }

        await client.query(`DELETE FROM pipelines WHERE document_id = $1`, [id]);

        await client.query(`DELETE FROM document_sources WHERE id = $1`, [id]);

        if (doc.rows[0].storage_path) {
          try {
            await storage.deleteFile(doc.rows[0].storage_path);
          } catch {
            /* ignore deletion errors */
          }
        }

        await client.query('COMMIT');

        return reply.status(204).send();
      } catch (error) {
        await client.query('ROLLBACK');
        request.log.error({ err: error, documentId: id }, 'Failed to delete document');
        throw error;
      } finally {
        client.release();
      }
    }
  );
};
