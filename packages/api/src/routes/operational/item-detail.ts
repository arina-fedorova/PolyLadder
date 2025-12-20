import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema } from '../../schemas/common';

const ItemDetailParamsSchema = Type.Object({
  tableName: Type.String(),
  id: Type.String(),
});

type ItemDetailParams = Static<typeof ItemDetailParamsSchema>;

const GateResultSchema = Type.Object({
  gateName: Type.String(),
  status: Type.String(),
  errorMessage: Type.Union([Type.String(), Type.Null()]),
  attemptNumber: Type.Number(),
  createdAt: Type.String(),
});

const ItemDetailResponseSchema = Type.Object({
  id: Type.String(),
  tableName: Type.String(),
  data: Type.Record(Type.String(), Type.Unknown()),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  gateResults: Type.Array(GateResultSchema),
});

const VALID_TABLES = ['meanings', 'utterances', 'rules', 'exercises'] as const;
type ValidTable = (typeof VALID_TABLES)[number];

function isValidTable(name: string): name is ValidTable {
  return VALID_TABLES.includes(name as ValidTable);
}

interface ContentRow {
  id: string;
  data: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  [key: string]: unknown;
}

interface GateResultRow {
  gate_name: string;
  status: string;
  error_message: string | null;
  attempt_number: number;
  created_at: Date;
}

const itemDetailRoute: FastifyPluginAsync = async function (fastify) {
  await Promise.resolve();

  fastify.get<{ Params: ItemDetailParams }>(
    '/items/:tableName/:id',
    {
      preHandler: [authMiddleware],
      schema: {
        params: ItemDetailParamsSchema,
        response: {
          200: ItemDetailResponseSchema,
          400: ErrorResponseSchema,
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

      const { tableName, id } = request.params;

      if (!isValidTable(tableName)) {
        return reply.status(400).send({
          error: {
            statusCode: 400,
            message: `Invalid table name: ${tableName}. Valid tables: ${VALID_TABLES.join(', ')}`,
            requestId: request.id,
            code: 'INVALID_TABLE',
          },
        });
      }

      const validatedTable = `validated_${tableName}`;
      const itemResult = await fastify.db.query<ContentRow>(
        `SELECT * FROM ${validatedTable} WHERE id = $1`,
        [id]
      );

      if (itemResult.rows.length === 0) {
        return reply.status(404).send({
          error: {
            statusCode: 404,
            message: `Item not found in ${validatedTable}`,
            requestId: request.id,
            code: 'NOT_FOUND',
          },
        });
      }

      const item = itemResult.rows[0];

      const gateResultsResult = await fastify.db.query<GateResultRow>(
        `SELECT gate_name, status, error_message, attempt_number, created_at
         FROM quality_gate_results
         WHERE entity_type = $1 AND entity_id = $2
         ORDER BY created_at DESC`,
        [tableName, id]
      );

      const gateResults = gateResultsResult.rows.map((row) => ({
        gateName: row.gate_name,
        status: row.status,
        errorMessage: row.error_message,
        attemptNumber: row.attempt_number,
        createdAt: row.created_at.toISOString(),
      }));

      return reply.status(200).send({
        id: item.id,
        tableName,
        data: item.data ?? item,
        createdAt: item.created_at.toISOString(),
        updatedAt: item.updated_at.toISOString(),
        gateResults,
      });
    }
  );
};

export default itemDetailRoute;
