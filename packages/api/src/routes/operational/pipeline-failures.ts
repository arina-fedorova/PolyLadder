import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema } from '../../schemas/common';

const FailureSchema = Type.Object({
  id: Type.String(),
  candidateId: Type.String(),
  gateName: Type.String(),
  failureReason: Type.String(),
  failureDetails: Type.Any(),
  dataType: Type.String(),
  normalizedData: Type.Any(),
  createdAt: Type.String(),
});

const FailuresResponseSchema = Type.Object({
  failures: Type.Array(FailureSchema),
  total: Type.Number(),
  page: Type.Number(),
  pageSize: Type.Number(),
  stats: Type.Object({
    byGate: Type.Record(Type.String(), Type.Number()),
    byDataType: Type.Record(Type.String(), Type.Number()),
  }),
});

interface PipelineParams {
  pipelineId: string;
}

const QuerystringSchema = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1 })),
  pageSize: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  gateName: Type.Optional(Type.String()),
  dataType: Type.Optional(Type.String()),
});

type FailuresQuery = Static<typeof QuerystringSchema>;

const pipelineFailuresRoute: FastifyPluginAsync = async function (fastify) {
  await Promise.resolve();

  fastify.get<{ Params: PipelineParams; Querystring: FailuresQuery }>(
    '/pipelines/:pipelineId/failures',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: QuerystringSchema,
        response: {
          200: FailuresResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
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
      const page = request.query.page ?? 1;
      const pageSize = request.query.pageSize ?? 50;
      const gateNameFilter = request.query.gateName;
      const dataTypeFilter = request.query.dataType;
      const offset = (page - 1) * pageSize;

      // Get pipeline's document_id
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

      // Build WHERE clause
      let whereClause = 'WHERE d.document_id = $1';
      const params: unknown[] = [documentId];
      let paramIndex = 2;

      if (gateNameFilter) {
        whereClause += ` AND vf.gate_name = $${paramIndex++}`;
        params.push(gateNameFilter);
      }

      if (dataTypeFilter) {
        whereClause += ` AND c.data_type = $${paramIndex++}`;
        params.push(dataTypeFilter);
      }

      // Count query
      const countQuery = `
        SELECT COUNT(*)::int as total
        FROM validation_failures vf
        JOIN candidates c ON c.id = vf.candidate_id
        JOIN drafts d ON d.id = c.draft_id
        ${whereClause}
      `;
      const countResult = await fastify.db.query<{ total: number }>(countQuery, params);
      const total = countResult.rows[0]?.total ?? 0;

      // Items query
      const itemsQuery = `
        SELECT
          vf.id,
          vf.candidate_id,
          vf.gate_name,
          vf.failure_reason,
          vf.failure_details,
          vf.created_at,
          c.data_type,
          c.normalized_data
        FROM validation_failures vf
        JOIN candidates c ON c.id = vf.candidate_id
        JOIN drafts d ON d.id = c.draft_id
        ${whereClause}
        ORDER BY vf.created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      const itemsResult = await fastify.db.query<{
        id: string;
        candidate_id: string;
        gate_name: string;
        failure_reason: string;
        failure_details: Record<string, unknown>;
        created_at: Date;
        data_type: string;
        normalized_data: Record<string, unknown>;
      }>(itemsQuery, [...params, pageSize, offset]);

      // Get stats by gate
      const statsByGateQuery = `
        SELECT vf.gate_name, COUNT(*)::int as count
        FROM validation_failures vf
        JOIN candidates c ON c.id = vf.candidate_id
        JOIN drafts d ON d.id = c.draft_id
        WHERE d.document_id = $1
        GROUP BY vf.gate_name
        ORDER BY count DESC
      `;
      const statsByGateResult = await fastify.db.query<{ gate_name: string; count: number }>(
        statsByGateQuery,
        [documentId]
      );

      // Get stats by data type
      const statsByDataTypeQuery = `
        SELECT c.data_type, COUNT(*)::int as count
        FROM validation_failures vf
        JOIN candidates c ON c.id = vf.candidate_id
        JOIN drafts d ON d.id = c.draft_id
        WHERE d.document_id = $1
        GROUP BY c.data_type
        ORDER BY count DESC
      `;
      const statsByDataTypeResult = await fastify.db.query<{ data_type: string; count: number }>(
        statsByDataTypeQuery,
        [documentId]
      );

      const byGate: Record<string, number> = {};
      for (const row of statsByGateResult.rows) {
        byGate[row.gate_name] = row.count;
      }

      const byDataType: Record<string, number> = {};
      for (const row of statsByDataTypeResult.rows) {
        byDataType[row.data_type] = row.count;
      }

      const response = itemsResult.rows.map((row) => ({
        id: row.id,
        candidateId: row.candidate_id,
        gateName: row.gate_name,
        failureReason: row.failure_reason,
        failureDetails: row.failure_details,
        dataType: row.data_type,
        normalizedData: row.normalized_data,
        createdAt: row.created_at.toISOString(),
      }));

      return reply.status(200).send({
        failures: response,
        total,
        page,
        pageSize,
        stats: {
          byGate,
          byDataType,
        },
      });
    }
  );
};

export default pipelineFailuresRoute;
