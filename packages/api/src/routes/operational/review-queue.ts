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

      interface ItemRow {
        id: string;
        content_type: 'vocabulary' | 'grammar' | 'orthography';
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
      }

      const tables: Array<{
        name: string;
        type: 'vocabulary' | 'grammar' | 'orthography';
      }> = [
        { name: 'meanings', type: 'vocabulary' },
        { name: 'utterances', type: 'vocabulary' },
        { name: 'rules', type: 'grammar' },
        { name: 'exercises', type: 'orthography' },
      ];

      const filteredTables = contentTypeFilter
        ? tables.filter((t) => t.type === contentTypeFilter)
        : tables;

      const items: ItemRow[] = [];
      let total = 0;

      for (const table of filteredTables) {
        const countQuery = `SELECT COUNT(*) as count FROM validated_${table.name}`;
        const countResult = await fastify.db.query<{ count: string }>(countQuery);
        total += parseInt(countResult.rows[0]?.count ?? '0', 10);
      }

      for (const table of filteredTables) {
        const itemsQuery = `
          SELECT 
            v.id,
            v.language_code,
            l.name as language_name,
            v.cefr_level,
            v.validated_at,
            v.content,
            v.validation_results
          FROM validated_${table.name} v
          LEFT JOIN languages l ON v.language_code = l.code
          ORDER BY v.validated_at DESC
          LIMIT $1 OFFSET $2
        `;
        const itemsResult = await fastify.db.query<{
          id: string;
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
        }>(itemsQuery, [pageSize, offset]);

        items.push(
          ...itemsResult.rows.map((row) => ({
            ...row,
            content_type: table.type,
          }))
        );
      }

      items.sort((a, b) => new Date(b.validated_at).getTime() - new Date(a.validated_at).getTime());
      const paginatedItems = items.slice(0, pageSize);

      const response = paginatedItems.map((row) => ({
        id: row.id,
        contentType: row.content_type,
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
