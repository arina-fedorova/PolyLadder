import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema, PaginationQuerySchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';

const VocabularyItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  word: Type.String(),
  language: Type.String(),
  state: Type.Union([Type.Literal('unknown'), Type.Literal('learning'), Type.Literal('known')]),
  firstSeen: Type.String({ format: 'date-time' }),
  lastReviewed: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  reviewCount: Type.Number(),
});

const VocabularyResponseSchema = Type.Object({
  items: Type.Array(VocabularyItemSchema),
  total: Type.Number(),
  limit: Type.Number(),
  offset: Type.Number(),
  stats: Type.Object({
    unknown: Type.Number(),
    learning: Type.Number(),
    known: Type.Number(),
  }),
});

const VocabularyQuerySchema = Type.Intersect([
  PaginationQuerySchema,
  Type.Object({
    language: Type.String(),
    state: Type.Optional(
      Type.Union([Type.Literal('unknown'), Type.Literal('learning'), Type.Literal('known')])
    ),
    search: Type.Optional(Type.String()),
  }),
]);

type VocabularyQuery = Static<typeof VocabularyQuerySchema>;

const UpdateVocabularyRequestSchema = Type.Object({
  word: Type.String(),
  language: Type.String(),
  state: Type.Union([Type.Literal('unknown'), Type.Literal('learning'), Type.Literal('known')]),
});

type UpdateVocabularyRequest = Static<typeof UpdateVocabularyRequestSchema>;

interface VocabularyRow {
  id: string;
  word: string;
  language: string;
  state: string;
  first_seen: Date;
  last_reviewed: Date | null;
  review_count: number;
}

interface StatsRow {
  unknown_count: string;
  learning_count: string;
  known_count: string;
}

interface CountRow {
  total: string;
}

const vocabularyRoute: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();

  void fastify.get<{ Querystring: VocabularyQuery }>(
    '/vocabulary',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: VocabularyQuerySchema,
        response: {
          200: VocabularyResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { limit = 20, offset = 0, language, state, search } = request.query;

      const userLangResult = await fastify.db.query(
        'SELECT id FROM user_languages WHERE user_id = $1 AND language = $2',
        [userId, language]
      );

      if (userLangResult.rows.length === 0) {
        return reply.status(403).send({
          error: {
            statusCode: 403,
            message: 'You are not learning this language',
            requestId: request.id,
            code: 'LANGUAGE_NOT_STARTED',
          },
        });
      }

      const conditions: string[] = ['user_id = $1', 'language = $2'];
      const values: unknown[] = [userId, language];
      let paramIndex = 3;

      if (state) {
        conditions.push(`state = $${paramIndex++}`);
        values.push(state);
      }

      if (search) {
        conditions.push(`word ILIKE $${paramIndex++}`);
        values.push(`%${search}%`);
      }

      const whereClause = conditions.join(' AND ');

      const statsResult = await fastify.db.query<StatsRow>(
        `SELECT
           COUNT(*) FILTER (WHERE state = 'unknown') as unknown_count,
           COUNT(*) FILTER (WHERE state = 'learning') as learning_count,
           COUNT(*) FILTER (WHERE state = 'known') as known_count
         FROM user_vocabulary
         WHERE user_id = $1 AND language = $2`,
        [userId, language]
      );

      const stats = statsResult.rows[0] || {
        unknown_count: '0',
        learning_count: '0',
        known_count: '0',
      };

      const countResult = await fastify.db.query<CountRow>(
        `SELECT COUNT(*) as total FROM user_vocabulary WHERE ${whereClause}`,
        values
      );
      const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

      const vocabResult = await fastify.db.query<VocabularyRow>(
        `SELECT id, word, language, state, first_seen, last_reviewed, review_count
         FROM user_vocabulary
         WHERE ${whereClause}
         ORDER BY last_reviewed DESC NULLS FIRST, first_seen DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      );

      const items = vocabResult.rows.map((row) => ({
        id: row.id,
        word: row.word,
        language: row.language,
        state: row.state as 'unknown' | 'learning' | 'known',
        firstSeen: row.first_seen.toISOString(),
        lastReviewed: row.last_reviewed ? row.last_reviewed.toISOString() : null,
        reviewCount: row.review_count,
      }));

      return reply.status(200).send({
        items,
        total,
        limit,
        offset,
        stats: {
          unknown: parseInt(stats.unknown_count, 10) || 0,
          learning: parseInt(stats.learning_count, 10) || 0,
          known: parseInt(stats.known_count, 10) || 0,
        },
      });
    }
  );

  void fastify.post<{ Body: UpdateVocabularyRequest }>(
    '/vocabulary',
    {
      preHandler: [authMiddleware],
      schema: {
        body: UpdateVocabularyRequestSchema,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            item: VocabularyItemSchema,
          }),
          403: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { word, language, state } = request.body;

      const userLangResult = await fastify.db.query(
        'SELECT id FROM user_languages WHERE user_id = $1 AND language = $2',
        [userId, language]
      );

      if (userLangResult.rows.length === 0) {
        return reply.status(403).send({
          error: {
            statusCode: 403,
            message: 'You are not learning this language',
            requestId: request.id,
            code: 'LANGUAGE_NOT_STARTED',
          },
        });
      }

      const result = await fastify.db.query<VocabularyRow>(
        `INSERT INTO user_vocabulary (user_id, word, language, state, first_seen, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, word, language)
         DO UPDATE SET state = $4, updated_at = CURRENT_TIMESTAMP
         RETURNING id, word, language, state, first_seen, last_reviewed, review_count`,
        [userId, word, language, state]
      );

      const row = result.rows[0];

      return reply.status(200).send({
        success: true,
        item: {
          id: row.id,
          word: row.word,
          language: row.language,
          state: row.state as 'unknown' | 'learning' | 'known',
          firstSeen: row.first_seen.toISOString(),
          lastReviewed: row.last_reviewed ? row.last_reviewed.toISOString() : null,
          reviewCount: row.review_count,
        },
      });
    }
  );

  void fastify.post<{ Body: { word: string; language: string; correct: boolean } }>(
    '/vocabulary/review',
    {
      preHandler: [authMiddleware],
      schema: {
        body: Type.Object({
          word: Type.String(),
          language: Type.String(),
          correct: Type.Boolean(),
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            newState: Type.Union([
              Type.Literal('unknown'),
              Type.Literal('learning'),
              Type.Literal('known'),
            ]),
          }),
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { word, language, correct } = request.body;

      const vocabResult = await fastify.db.query<{ state: string; review_count: number }>(
        'SELECT state, review_count FROM user_vocabulary WHERE user_id = $1 AND word = $2 AND language = $3',
        [userId, word, language]
      );

      if (vocabResult.rows.length === 0) {
        return reply.status(404).send({
          error: {
            statusCode: 404,
            message: 'Vocabulary item not found',
            requestId: request.id,
            code: 'VOCABULARY_NOT_FOUND',
          },
        });
      }

      const current = vocabResult.rows[0];
      const reviewCount = current.review_count + 1;

      let newState = current.state;
      if (correct) {
        if (current.state === 'unknown') {
          newState = 'learning';
        } else if (current.state === 'learning' && reviewCount >= 5) {
          newState = 'known';
        }
      } else {
        if (current.state === 'known') {
          newState = 'learning';
        }
      }

      await fastify.db.query(
        `UPDATE user_vocabulary
         SET state = $4, review_count = $5, last_reviewed = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND word = $2 AND language = $3`,
        [userId, word, language, newState, reviewCount]
      );

      return reply.status(200).send({
        success: true,
        newState: newState as 'unknown' | 'learning' | 'known',
      });
    }
  );
};

export default vocabularyRoute;
