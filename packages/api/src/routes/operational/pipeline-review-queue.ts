import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema } from '../../schemas/common';

const ValidationResultSchema = Type.Object({
  gate: Type.String(),
  passed: Type.Boolean(),
  score: Type.Optional(Type.Number()),
});

const ReviewQueueItemSchema = Type.Object({
  id: Type.String(),
  contentType: Type.Union([
    Type.Literal('vocabulary'),
    Type.Literal('grammar'),
    Type.Literal('orthography'),
  ]),
  dataType: Type.Union([
    Type.Literal('meaning'),
    Type.Literal('utterance'),
    Type.Literal('rule'),
    Type.Literal('exercise'),
  ]),
  languageCode: Type.String(),
  languageName: Type.String(),
  cefrLevel: Type.String(),
  validatedAt: Type.String(),
  content: Type.Any(),
  validationResults: Type.Array(ValidationResultSchema),
});

const ReviewQueueResponseSchema = Type.Object({
  items: Type.Array(ReviewQueueItemSchema),
  total: Type.Number(),
  page: Type.Number(),
  pageSize: Type.Number(),
});

interface PipelineParams {
  pipelineId: string;
}

const QuerystringSchema = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1 })),
  pageSize: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  contentType: Type.Optional(
    Type.Union([Type.Literal('vocabulary'), Type.Literal('grammar'), Type.Literal('orthography')])
  ),
});

type ReviewQueueQuery = Static<typeof QuerystringSchema>;

const pipelineReviewQueueRoute: FastifyPluginAsync = async function (fastify) {
  await Promise.resolve();

  fastify.get<{ Params: PipelineParams; Querystring: ReviewQueueQuery }>(
    '/pipelines/:pipelineId/review-queue',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: QuerystringSchema,
        response: {
          200: ReviewQueueResponseSchema,
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
      const pageSize = request.query.pageSize ?? 20;
      const contentTypeFilter = request.query.contentType;
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

      type DataType = 'meaning' | 'utterance' | 'rule' | 'exercise';
      type ContentType = 'vocabulary' | 'grammar' | 'orthography';

      interface TableConfig {
        name: 'meanings' | 'utterances' | 'rules' | 'exercises';
        dataType: DataType;
        contentType: ContentType;
      }

      const tables: TableConfig[] = [
        { name: 'meanings', dataType: 'meaning', contentType: 'vocabulary' },
        { name: 'utterances', dataType: 'utterance', contentType: 'vocabulary' },
        { name: 'rules', dataType: 'rule', contentType: 'grammar' },
        { name: 'exercises', dataType: 'exercise', contentType: 'orthography' },
      ];

      const filteredTables = contentTypeFilter
        ? tables.filter((t) => t.contentType === contentTypeFilter)
        : tables;

      if (filteredTables.length === 0) {
        return reply.status(200).send({
          items: [],
          total: 0,
          page,
          pageSize,
        });
      }

      const dataTypes = filteredTables.map((t) => t.dataType);

      // Count query - only items from this pipeline's document
      const countQuery = `
        WITH filtered_items AS (
          SELECT DISTINCT ON (
            CASE
              WHEN v.data_type = 'meaning' THEN v.validated_data->>'word'
              WHEN v.data_type = 'utterance' THEN v.validated_data->>'text'
              WHEN v.data_type = 'rule' THEN v.validated_data->>'title'
              WHEN v.data_type = 'exercise' THEN v.validated_data->>'prompt'
              ELSE v.id::text
            END || '|' || COALESCE(v.validated_data->>'language', 'EN') || '|' || COALESCE(v.validated_data->>'level', 'A1')
          ) v.id
          FROM review_queue rq
          JOIN validated v ON v.id = rq.item_id
          JOIN candidates c ON v.candidate_id = c.id
          JOIN drafts d ON c.draft_id = d.id
          WHERE rq.data_type = ANY($1::text[])
            AND rq.reviewed_at IS NULL
            AND d.document_id = $2
            AND NOT EXISTS (SELECT 1 FROM approval_events ae WHERE ae.item_id = v.id::varchar)
        )
        SELECT COUNT(*)::int as total FROM filtered_items
      `;
      const countResult = await fastify.db.query<{ total: number }>(countQuery, [
        dataTypes,
        documentId,
      ]);
      const total = countResult.rows[0]?.total ?? 0;

      // Items query - only items from this pipeline's document
      const itemsQuery = `
        SELECT DISTINCT ON (
          CASE
            WHEN v.data_type = 'meaning' THEN v.validated_data->>'word'
            WHEN v.data_type = 'utterance' THEN v.validated_data->>'text'
            WHEN v.data_type = 'rule' THEN v.validated_data->>'title'
            WHEN v.data_type = 'exercise' THEN v.validated_data->>'prompt'
            ELSE v.id::text
          END || '|' || COALESCE(v.validated_data->>'language', 'EN') || '|' || COALESCE(v.validated_data->>'level', 'A1')
        )
          v.id,
          v.data_type::text as data_type,
          CASE
            WHEN v.data_type IN ('meaning', 'utterance') THEN 'vocabulary'
            WHEN v.data_type = 'rule' THEN 'grammar'
            WHEN v.data_type = 'exercise' THEN 'orthography'
          END as content_type,
          COALESCE((v.validated_data->>'language')::text, 'EN') as language_code,
          COALESCE((v.validated_data->>'language')::text, 'EN') as language_name,
          COALESCE((v.validated_data->>'level')::text, 'A1') as cefr_level,
          v.created_at as validated_at,
          v.validated_data as content,
          v.validation_results
        FROM review_queue rq
        JOIN validated v ON v.id = rq.item_id
        JOIN candidates c ON v.candidate_id = c.id
        JOIN drafts d ON c.draft_id = d.id
        WHERE rq.data_type = ANY($1::text[])
          AND rq.reviewed_at IS NULL
          AND d.document_id = $2
          AND NOT EXISTS (SELECT 1 FROM approval_events ae WHERE ae.item_id = v.id::varchar)
        ORDER BY (
          CASE
            WHEN v.data_type = 'meaning' THEN v.validated_data->>'word'
            WHEN v.data_type = 'utterance' THEN v.validated_data->>'text'
            WHEN v.data_type = 'rule' THEN v.validated_data->>'title'
            WHEN v.data_type = 'exercise' THEN v.validated_data->>'prompt'
            ELSE v.id::text
          END || '|' || COALESCE(v.validated_data->>'language', 'EN') || '|' || COALESCE(v.validated_data->>'level', 'A1')
        ), rq.priority DESC, rq.queued_at ASC
        LIMIT $3 OFFSET $4
      `;

      const itemsResult = await fastify.db.query<{
        id: string;
        data_type: DataType;
        content_type: ContentType;
        language_code: string;
        language_name: string;
        cefr_level: string;
        validated_at: Date;
        content: Record<string, unknown>;
        validation_results: Array<{
          gate: string;
          passed: boolean;
          score?: number;
        }>;
      }>(itemsQuery, [dataTypes, documentId, pageSize, offset]);

      const response = itemsResult.rows.map((row) => {
        const validationResults = Array.isArray(row.validation_results)
          ? row.validation_results
          : ((
              row.validation_results as {
                gateResults?: Array<{ gateName: string; passed: boolean }>;
              }
            )?.gateResults?.map((r) => ({
              gate: r.gateName,
              passed: r.passed,
            })) ?? []);

        return {
          id: row.id,
          contentType: row.content_type,
          dataType: row.data_type,
          languageCode: row.language_code,
          languageName: row.language_name,
          cefrLevel: row.cefr_level,
          validatedAt: row.validated_at.toISOString(),
          content: row.content,
          validationResults,
        };
      });

      return reply.status(200).send({
        items: response,
        total,
        page,
        pageSize,
      });
    }
  );
};

export default pipelineReviewQueueRoute;
