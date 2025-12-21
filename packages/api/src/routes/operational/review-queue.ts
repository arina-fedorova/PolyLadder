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

const QuerystringSchema = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1 })),
  pageSize: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  contentType: Type.Optional(
    Type.Union([Type.Literal('vocabulary'), Type.Literal('grammar'), Type.Literal('orthography')])
  ),
});

type ReviewQueueQuery = Static<typeof QuerystringSchema>;

const reviewQueueRoute: FastifyPluginAsync = async function (fastify) {
  await Promise.resolve();

  fastify.get<{ Querystring: ReviewQueueQuery }>(
    '/review-queue',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: QuerystringSchema,
        response: {
          200: ReviewQueueResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
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

      const page = request.query.page ?? 1;
      const pageSize = request.query.pageSize ?? 20;
      const contentTypeFilter = request.query.contentType;
      const offset = (page - 1) * pageSize;

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
      const dataTypesPlaceholder = dataTypes.map((_, i) => `$${i + 1}`).join(', ');

      const countQuery = `
        SELECT COUNT(*)::int as total
        FROM validated v
        WHERE v.data_type IN (${dataTypesPlaceholder})
      `;
      const countResult = await fastify.db.query<{ total: number }>(countQuery, dataTypes);
      const total = countResult.rows[0]?.total ?? 0;

      const itemsQuery = `
        SELECT 
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
        FROM validated v
        WHERE v.data_type IN (${dataTypesPlaceholder})
        ORDER BY v.created_at DESC
        LIMIT $${dataTypes.length + 1} OFFSET $${dataTypes.length + 2}
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
      }>(itemsQuery, [...dataTypes, pageSize, offset]);

      const response = itemsResult.rows.map((row) => ({
        id: row.id,
        contentType: row.content_type,
        dataType: row.data_type,
        languageCode: row.language_code,
        languageName: row.language_name,
        cefrLevel: row.cefr_level,
        validatedAt: row.validated_at.toISOString(),
        content: row.content,
        validationResults: row.validation_results,
      }));

      return reply.status(200).send({
        items: response,
        total,
        page,
        pageSize,
      });
    }
  );
};

export default reviewQueueRoute;
