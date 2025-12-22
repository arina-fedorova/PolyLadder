import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema, PaginationQuerySchema } from '../../schemas/common';

const CorpusSearchQuerySchema = Type.Intersect([
  PaginationQuerySchema,
  Type.Object({
    contentType: Type.Optional(
      Type.Union([
        Type.Literal('meaning'),
        Type.Literal('utterance'),
        Type.Literal('rule'),
        Type.Literal('exercise'),
      ])
    ),
    language: Type.Optional(Type.String()),
    level: Type.Optional(Type.String()),
    search: Type.Optional(Type.String()),
  }),
]);

type CorpusSearchQuery = Static<typeof CorpusSearchQuerySchema>;

const CorpusItemSchema = Type.Object({
  id: Type.String(),
  contentType: Type.String(),
  language: Type.Optional(Type.String()),
  level: Type.String(),
  createdAt: Type.String(),
  content: Type.Any(),
});

const CorpusSearchResponseSchema = Type.Object({
  items: Type.Array(CorpusItemSchema),
  total: Type.Number(),
  limit: Type.Number(),
  offset: Type.Number(),
});

const ExportBodySchema = Type.Object({
  itemIds: Type.Array(Type.String()),
  contentType: Type.String(),
  format: Type.Union([Type.Literal('json'), Type.Literal('csv')]),
});

const LanguagesResponseSchema = Type.Object({
  languages: Type.Array(Type.String()),
});

const StatisticsResponseSchema = Type.Object({
  totalItems: Type.Number(),
  byContentType: Type.Record(Type.String(), Type.Number()),
  byLanguage: Type.Record(Type.String(), Type.Number()),
  byLevel: Type.Record(Type.String(), Type.Number()),
  byLanguageAndLevel: Type.Array(
    Type.Object({
      language: Type.String(),
      A0: Type.Number(),
      A1: Type.Number(),
      A2: Type.Number(),
      B1: Type.Number(),
      B2: Type.Number(),
      C1: Type.Number(),
      C2: Type.Number(),
    })
  ),
});

interface MeaningRow {
  id: string;
  level: string;
  tags: unknown;
  created_at: Date;
}

interface UtteranceRow {
  id: string;
  meaning_id: string;
  language: string;
  text: string;
  register: string | null;
  usage_notes: string | null;
  created_at: Date;
}

interface RuleRow {
  id: string;
  language: string;
  level: string;
  category: string;
  title: string;
  explanation: string;
  examples: unknown;
  created_at: Date;
}

interface ExerciseRow {
  id: string;
  type: string;
  level: string;
  languages: unknown;
  prompt: string;
  correct_answer: string;
  options: unknown;
  metadata: unknown;
  created_at: Date;
}

const corpusRoute: FastifyPluginAsync = async function (fastify) {
  await Promise.resolve();

  fastify.get<{ Querystring: CorpusSearchQuery }>(
    '/corpus/search',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: CorpusSearchQuerySchema,
        response: {
          200: CorpusSearchResponseSchema,
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

      const limit = request.query.limit ?? 50;
      const offset = request.query.offset ?? 0;
      const { contentType, language, level, search } = request.query;

      interface CombinedItem {
        id: string;
        content_type: string;
        language: string | null;
        level: string;
        created_at: Date;
        content: Record<string, unknown>;
      }

      const items: CombinedItem[] = [];
      let total = 0;

      if (!contentType || contentType === 'meaning') {
        let conditions = 'WHERE 1=1';
        const values: unknown[] = [];
        let paramIndex = 1;

        if (level) {
          conditions += ` AND level = $${paramIndex++}`;
          values.push(level);
        }
        if (search) {
          conditions += ` AND id ILIKE $${paramIndex++}`;
          values.push(`%${search}%`);
        }

        const countResult = await fastify.db.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM approved_meanings ${conditions}`,
          values
        );
        total += parseInt(countResult.rows[0]?.count ?? '0', 10);

        if (!contentType) {
          const result = await fastify.db.query<MeaningRow>(
            `SELECT * FROM approved_meanings ${conditions} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...values, limit, offset]
          );
          items.push(
            ...result.rows.map((row) => ({
              id: row.id,
              content_type: 'meaning',
              language: null,
              level: row.level,
              created_at: row.created_at,
              content: { id: row.id, level: row.level, tags: row.tags },
            }))
          );
        } else if (contentType === 'meaning') {
          const result = await fastify.db.query<MeaningRow>(
            `SELECT * FROM approved_meanings ${conditions} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...values, limit, offset]
          );
          items.push(
            ...result.rows.map((row) => ({
              id: row.id,
              content_type: 'meaning',
              language: null,
              level: row.level,
              created_at: row.created_at,
              content: { id: row.id, level: row.level, tags: row.tags },
            }))
          );
        }
      }

      if (!contentType || contentType === 'utterance') {
        let conditions = 'WHERE 1=1';
        const values: unknown[] = [];
        let paramIndex = 1;

        if (language) {
          conditions += ` AND language = $${paramIndex++}`;
          values.push(language);
        }
        if (search) {
          conditions += ` AND text ILIKE $${paramIndex++}`;
          values.push(`%${search}%`);
        }

        const countResult = await fastify.db.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM approved_utterances ${conditions}`,
          values
        );
        total += parseInt(countResult.rows[0]?.count ?? '0', 10);

        if (contentType === 'utterance') {
          const result = await fastify.db.query<UtteranceRow>(
            `SELECT u.*, m.level FROM approved_utterances u JOIN approved_meanings m ON u.meaning_id = m.id ${conditions} ORDER BY u.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...values, limit, offset]
          );
          items.push(
            ...result.rows.map((row) => ({
              id: row.id,
              content_type: 'utterance',
              language: row.language,
              level: (row as UtteranceRow & { level: string }).level,
              created_at: row.created_at,
              content: {
                text: row.text,
                register: row.register,
                usageNotes: row.usage_notes,
                meaningId: row.meaning_id,
              },
            }))
          );
        }
      }

      if (!contentType || contentType === 'rule') {
        let conditions = 'WHERE 1=1';
        const values: unknown[] = [];
        let paramIndex = 1;

        if (language) {
          conditions += ` AND language = $${paramIndex++}`;
          values.push(language);
        }
        if (level) {
          conditions += ` AND level = $${paramIndex++}`;
          values.push(level);
        }
        if (search) {
          conditions += ` AND (title ILIKE $${paramIndex} OR explanation ILIKE $${paramIndex++})`;
          values.push(`%${search}%`);
        }

        const countResult = await fastify.db.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM approved_rules ${conditions}`,
          values
        );
        total += parseInt(countResult.rows[0]?.count ?? '0', 10);

        if (contentType === 'rule') {
          const result = await fastify.db.query<RuleRow>(
            `SELECT * FROM approved_rules ${conditions} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...values, limit, offset]
          );
          items.push(
            ...result.rows.map((row) => ({
              id: row.id,
              content_type: 'rule',
              language: row.language,
              level: row.level,
              created_at: row.created_at,
              content: {
                title: row.title,
                category: row.category,
                explanation: row.explanation,
                examples: row.examples,
              },
            }))
          );
        }
      }

      if (!contentType || contentType === 'exercise') {
        let conditions = 'WHERE 1=1';
        const values: unknown[] = [];
        let paramIndex = 1;

        if (level) {
          conditions += ` AND level = $${paramIndex++}`;
          values.push(level);
        }
        if (search) {
          conditions += ` AND prompt ILIKE $${paramIndex++}`;
          values.push(`%${search}%`);
        }

        const countResult = await fastify.db.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM approved_exercises ${conditions}`,
          values
        );
        total += parseInt(countResult.rows[0]?.count ?? '0', 10);

        if (contentType === 'exercise') {
          const result = await fastify.db.query<ExerciseRow>(
            `SELECT * FROM approved_exercises ${conditions} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...values, limit, offset]
          );
          items.push(
            ...result.rows.map((row) => ({
              id: row.id,
              content_type: 'exercise',
              language: null,
              level: row.level,
              created_at: row.created_at,
              content: {
                type: row.type,
                prompt: row.prompt,
                correctAnswer: row.correct_answer,
                options: row.options,
                languages: row.languages,
              },
            }))
          );
        }
      }

      const responseItems = items.map((item) => ({
        id: item.id,
        contentType: item.content_type,
        language: item.language ?? undefined,
        level: item.level,
        createdAt: item.created_at.toISOString(),
        content: item.content,
      }));

      return reply.status(200).send({
        items: responseItems,
        total,
        limit,
        offset,
      });
    }
  );

  fastify.get(
    '/corpus/languages',
    {
      preHandler: [authMiddleware],
      schema: {
        response: {
          200: LanguagesResponseSchema,
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

      const result = await fastify.db.query<{ language: string }>(`
        SELECT DISTINCT language FROM (
          SELECT language FROM approved_utterances
          UNION
          SELECT language FROM approved_rules
        ) AS all_langs
        ORDER BY language ASC
      `);

      return reply.status(200).send({
        languages: result.rows.map((row) => row.language),
      });
    }
  );

  fastify.get(
    '/corpus/statistics',
    {
      preHandler: [authMiddleware],
      schema: {
        response: {
          200: StatisticsResponseSchema,
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

      const [meaningsCount, utterancesCount, rulesCount, exercisesCount] = await Promise.all([
        fastify.db.query<{ count: string }>('SELECT COUNT(*) as count FROM approved_meanings'),
        fastify.db.query<{ count: string }>('SELECT COUNT(*) as count FROM approved_utterances'),
        fastify.db.query<{ count: string }>('SELECT COUNT(*) as count FROM approved_rules'),
        fastify.db.query<{ count: string }>('SELECT COUNT(*) as count FROM approved_exercises'),
      ]);

      const byContentType: Record<string, number> = {
        meaning: parseInt(meaningsCount.rows[0]?.count ?? '0', 10),
        utterance: parseInt(utterancesCount.rows[0]?.count ?? '0', 10),
        rule: parseInt(rulesCount.rows[0]?.count ?? '0', 10),
        exercise: parseInt(exercisesCount.rows[0]?.count ?? '0', 10),
      };

      const totalItems = Object.values(byContentType).reduce((a, b) => a + b, 0);

      const byLanguageResult = await fastify.db.query<{ language: string; count: string }>(`
        SELECT language, COUNT(*) as count FROM (
          SELECT language FROM approved_utterances
          UNION ALL
          SELECT language FROM approved_rules
        ) AS all_langs
        GROUP BY language
        ORDER BY count DESC
      `);

      const byLanguage: Record<string, number> = {};
      for (const row of byLanguageResult.rows) {
        byLanguage[row.language] = parseInt(row.count, 10);
      }

      const byLevelResult = await fastify.db.query<{ level: string; count: string }>(`
        SELECT level, COUNT(*) as count FROM (
          SELECT level FROM approved_meanings
          UNION ALL
          SELECT level FROM approved_rules
          UNION ALL
          SELECT level FROM approved_exercises
        ) AS all_levels
        GROUP BY level
        ORDER BY level ASC
      `);

      const byLevel: Record<string, number> = {};
      for (const row of byLevelResult.rows) {
        byLevel[row.level] = parseInt(row.count, 10);
      }

      const byLanguageAndLevelResult = await fastify.db.query<{
        language: string;
        A0: string;
        A1: string;
        A2: string;
        B1: string;
        B2: string;
        C1: string;
        C2: string;
      }>(`
        SELECT
          language,
          COUNT(CASE WHEN level = 'A0' THEN 1 END) as "A0",
          COUNT(CASE WHEN level = 'A1' THEN 1 END) as "A1",
          COUNT(CASE WHEN level = 'A2' THEN 1 END) as "A2",
          COUNT(CASE WHEN level = 'B1' THEN 1 END) as "B1",
          COUNT(CASE WHEN level = 'B2' THEN 1 END) as "B2",
          COUNT(CASE WHEN level = 'C1' THEN 1 END) as "C1",
          COUNT(CASE WHEN level = 'C2' THEN 1 END) as "C2"
        FROM approved_rules
        GROUP BY language
        ORDER BY language ASC
      `);

      const byLanguageAndLevel = byLanguageAndLevelResult.rows.map((row) => ({
        language: row.language,
        A0: parseInt(row.A0, 10),
        A1: parseInt(row.A1, 10),
        A2: parseInt(row.A2, 10),
        B1: parseInt(row.B1, 10),
        B2: parseInt(row.B2, 10),
        C1: parseInt(row.C1, 10),
        C2: parseInt(row.C2, 10),
      }));

      return reply.status(200).send({
        totalItems,
        byContentType,
        byLanguage,
        byLevel,
        byLanguageAndLevel,
      });
    }
  );

  fastify.post<{ Body: Static<typeof ExportBodySchema> }>(
    '/corpus/export',
    {
      preHandler: [authMiddleware],
      schema: {
        body: ExportBodySchema,
        response: {
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

      const { itemIds, contentType, format } = request.body;

      if (itemIds.length === 0) {
        return reply.status(400).send({
          error: {
            statusCode: 400,
            message: 'No items selected',
            requestId: request.id,
            code: 'BAD_REQUEST',
          },
        });
      }

      const MAX_EXPORT_ITEMS = 10000;
      if (itemIds.length > MAX_EXPORT_ITEMS) {
        return reply.status(400).send({
          error: {
            statusCode: 400,
            message: `Export limit is ${MAX_EXPORT_ITEMS} items. For larger exports, please use pagination or contact support.`,
            requestId: request.id,
            code: 'BAD_REQUEST',
          },
        });
      }

      const tableMap: Record<string, string> = {
        meaning: 'approved_meanings',
        utterance: 'approved_utterances',
        rule: 'approved_rules',
        exercise: 'approved_exercises',
      };

      const tableName = tableMap[contentType];
      if (!tableName) {
        return reply.status(400).send({
          error: {
            statusCode: 400,
            message: 'Invalid content type',
            requestId: request.id,
            code: 'BAD_REQUEST',
          },
        });
      }

      const firstBatchResult = await fastify.db.query(
        `SELECT * FROM ${tableName} WHERE id = ANY($1) LIMIT 1`,
        [itemIds.slice(0, Math.min(500, itemIds.length))]
      );

      if (firstBatchResult.rows.length === 0) {
        return reply.status(400).send({
          error: {
            statusCode: 400,
            message: 'No items found',
            requestId: request.id,
            code: 'BAD_REQUEST',
          },
        });
      }

      const BATCH_SIZE = 500;
      const totalBatches = Math.ceil(itemIds.length / BATCH_SIZE);

      if (format === 'json') {
        reply
          .header('Content-Type', 'application/json')
          .header('Content-Disposition', `attachment; filename="corpus-export-${Date.now()}.json"`)
          .header('Transfer-Encoding', 'chunked');

        reply.raw.write('[\n');

        let totalItemsWritten = 0;

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
          const batchStart = batchIndex * BATCH_SIZE;
          const batchEnd = Math.min(batchStart + BATCH_SIZE, itemIds.length);
          const batchIds = itemIds.slice(batchStart, batchEnd);

          const result = await fastify.db.query(
            `SELECT * FROM ${tableName} WHERE id = ANY($1) ORDER BY created_at`,
            [batchIds]
          );

          for (let i = 0; i < result.rows.length; i++) {
            const item = result.rows[i] as Record<string, unknown>;
            totalItemsWritten++;
            const isLast = totalItemsWritten === itemIds.length;
            const json = JSON.stringify(item, null, 2);
            const indented = json
              .split('\n')
              .map((line) => `  ${line}`)
              .join('\n');
            reply.raw.write(indented);
            if (!isLast) {
              reply.raw.write(',\n');
            } else {
              reply.raw.write('\n');
            }
          }
        }

        reply.raw.write(']\n');
        reply.raw.end();
        return;
      } else {
        reply
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', `attachment; filename="corpus-export-${Date.now()}.csv"`)
          .header('Transfer-Encoding', 'chunked');

        const firstItem = firstBatchResult.rows[0] as Record<string, unknown> | undefined;
        if (!firstItem) {
          return reply.status(400).send({
            error: {
              statusCode: 400,
              message: 'No items found',
              requestId: request.id,
              code: 'BAD_REQUEST',
            },
          });
        }
        const headers = Object.keys(firstItem).join(',');
        reply.raw.write(`${headers}\n`);

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
          const batchStart = batchIndex * BATCH_SIZE;
          const batchEnd = Math.min(batchStart + BATCH_SIZE, itemIds.length);
          const batchIds = itemIds.slice(batchStart, batchEnd);

          const result = await fastify.db.query(
            `SELECT * FROM ${tableName} WHERE id = ANY($1) ORDER BY created_at`,
            [batchIds]
          );

          for (const item of result.rows) {
            const row = Object.values(item as Record<string, unknown>)
              .map((val: unknown) => {
                if (val === null || val === undefined) return '';
                if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
                if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
                if (typeof val === 'number' || typeof val === 'boolean') return String(val);
                return '';
              })
              .join(',');

            reply.raw.write(`${row}\n`);
          }
        }

        reply.raw.end();
        return;
      }
    }
  );
};

export default corpusRoute;
