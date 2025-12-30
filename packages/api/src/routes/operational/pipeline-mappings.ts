import { FastifyPluginAsync } from 'fastify';
import { authMiddleware } from '../../middleware/auth';

interface MappingParams {
  pipelineId: string;
}

interface ConfirmMappingBody {
  mappingId: string;
}

interface RejectMappingBody {
  mappingId: string;
  reason?: string;
}

const pipelineMappingsRoute: FastifyPluginAsync = async (fastify) => {
  // DEBUG endpoint - get ALL mappings
  fastify.get(
    '/pipelines/:pipelineId/mappings/debug',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      const { pipelineId } = request.params as { pipelineId: string };

      // Get document_id from pipeline
      const pipelineResult = await fastify.db.query<{ document_id: string }>(
        `SELECT document_id FROM pipelines WHERE id = $1`,
        [pipelineId]
      );

      if (pipelineResult.rows.length === 0) {
        return reply.send({ error: 'Pipeline not found' });
      }

      const documentId = pipelineResult.rows[0].document_id;

      // Get all mappings without JOIN to see raw data
      const allMappingsRaw = await fastify.db.query(
        `SELECT * FROM content_topic_mappings LIMIT 10`
      );

      // Get chunks for this document
      const chunks = await fastify.db.query<{
        id: string;
        document_id: string;
        chunk_index: number;
      }>(
        `SELECT id, document_id, chunk_index FROM raw_content_chunks WHERE document_id = $1 LIMIT 5`,
        [documentId]
      );

      const chunkIds = chunks.rows.map((c) => c.id);
      const mappingsForChunks =
        chunkIds.length > 0
          ? await fastify.db.query(
              `SELECT * FROM content_topic_mappings WHERE chunk_id = ANY($1)`,
              [chunkIds]
            )
          : { rows: [] };

      return reply.send({
        pipelineId,
        documentId,
        totalMappingsInDb: allMappingsRaw.rows.length,
        sampleMappings: allMappingsRaw.rows,
        chunksForDocument: chunks.rows.length,
        sampleChunks: chunks.rows,
        mappingsForTheseChunks: mappingsForChunks.rows.length,
        sampleMappingsData: mappingsForChunks.rows,
      });
    }
  );

  // Get mappings for a specific pipeline
  fastify.get<{ Params: MappingParams }>(
    '/pipelines/:pipelineId/mappings',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      if (request.user?.role !== 'operator') {
        return reply.status(403).send({
          error: {
            statusCode: 403,
            message: 'Operator role required',
            requestId: request.id,
            code: 'FORBIDDEN',
          },
        });
      }

      const { pipelineId } = request.params;

      // Get document_id from pipeline
      const pipelineResult = await fastify.db.query<{ document_id: string }>(
        `SELECT document_id FROM pipelines WHERE id = $1`,
        [pipelineId]
      );

      if (pipelineResult.rows.length === 0) {
        return reply.status(404).send({
          error: {
            statusCode: 404,
            message: 'Pipeline not found',
            requestId: request.id,
            code: 'NOT_FOUND',
          },
        });
      }

      const documentId = pipelineResult.rows[0].document_id;

      const chunksCount = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM raw_content_chunks WHERE document_id = $1`,
        [documentId]
      );

      const totalMappings = await fastify.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM content_topic_mappings`
      );

      request.log.info(
        {
          pipelineId,
          documentId,
          chunksCount: chunksCount.rows[0]?.count,
          totalMappingsInDb: totalMappings.rows[0]?.count,
        },
        'Debug: Mappings query'
      );

      // Get all mappings for this document
      const mappingsResult = await fastify.db.query<{
        id: string;
        chunk_id: string;
        topic_id: string;
        status: string;
        confidence_score: number;
        llm_reasoning: string;
        chunk_text: string;
        topic_name: string;
        topic_description: string;
        created_at: string;
      }>(
        `SELECT
          m.id,
          m.chunk_id,
          m.topic_id,
          m.status,
          m.confidence_score,
          m.llm_reasoning,
          c.cleaned_text as chunk_text,
          t.name as topic_name,
          t.description as topic_description,
          m.created_at
        FROM content_topic_mappings m
        JOIN raw_content_chunks c ON c.id = m.chunk_id
        JOIN curriculum_topics t ON t.id = m.topic_id
        WHERE c.document_id = $1
        ORDER BY c.chunk_index, m.confidence_score DESC`,
        [documentId]
      );

      const statsResult = await fastify.db.query<{
        total: string;
        auto_mapped: string;
        confirmed: string;
        rejected: string;
      }>(
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE m.status = 'auto_mapped') as auto_mapped,
          COUNT(*) FILTER (WHERE m.status = 'confirmed') as confirmed,
          COUNT(*) FILTER (WHERE m.status = 'rejected') as rejected
        FROM content_topic_mappings m
        JOIN raw_content_chunks c ON c.id = m.chunk_id
        WHERE c.document_id = $1`,
        [documentId]
      );

      const stats = statsResult.rows[0] || {
        total: '0',
        auto_mapped: '0',
        confirmed: '0',
        rejected: '0',
      };

      request.log.info(
        {
          mappingsCount: mappingsResult.rows.length,
          stats: {
            total: parseInt(stats.total, 10),
            autoMapped: parseInt(stats.auto_mapped, 10),
            confirmed: parseInt(stats.confirmed, 10),
            rejected: parseInt(stats.rejected, 10),
          },
        },
        'Debug: Returning mappings data'
      );

      return reply.send({
        mappings: mappingsResult.rows,
        stats: {
          total: parseInt(stats.total, 10),
          autoMapped: parseInt(stats.auto_mapped, 10),
          confirmed: parseInt(stats.confirmed, 10),
          rejected: parseInt(stats.rejected, 10),
        },
      });
    }
  );

  // Confirm mapping
  fastify.post<{ Params: MappingParams; Body: ConfirmMappingBody }>(
    '/pipelines/:pipelineId/mappings/confirm',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      if (request.user?.role !== 'operator') {
        return reply.status(403).send({
          error: {
            statusCode: 403,
            message: 'Operator role required',
            requestId: request.id,
            code: 'FORBIDDEN',
          },
        });
      }

      const { mappingId } = request.body;

      await fastify.db.query(
        `UPDATE content_topic_mappings
         SET status = 'confirmed', confirmed_by = $2, confirmed_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [mappingId, request.user?.userId]
      );

      return reply.send({
        success: true,
        message: 'Mapping confirmed',
      });
    }
  );

  // Reject mapping
  fastify.post<{ Params: MappingParams; Body: RejectMappingBody }>(
    '/pipelines/:pipelineId/mappings/reject',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      if (request.user?.role !== 'operator') {
        return reply.status(403).send({
          error: {
            statusCode: 403,
            message: 'Operator role required',
            requestId: request.id,
            code: 'FORBIDDEN',
          },
        });
      }

      const { mappingId, reason } = request.body;

      await fastify.db.query(
        `UPDATE content_topic_mappings
         SET status = 'rejected',
             llm_reasoning = COALESCE($2, llm_reasoning)
         WHERE id = $1`,
        [mappingId, reason]
      );

      return reply.send({
        success: true,
        message: 'Mapping rejected',
      });
    }
  );
  await Promise.resolve();
};

export default pipelineMappingsRoute;
