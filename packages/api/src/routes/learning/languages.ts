import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';

const SUPPORTED_LANGUAGES = ['EN', 'ES', 'IT', 'PT', 'SL'] as const;

const UserLanguageSchema = Type.Object({
  language: Type.String(),
  startedAt: Type.String({ format: 'date-time' }),
  orthographyCompleted: Type.Boolean(),
  orthographyAccuracy: Type.Union([Type.Number(), Type.Null()]),
  vocabularyCount: Type.Object({
    unknown: Type.Number(),
    learning: Type.Number(),
    known: Type.Number(),
  }),
  currentUnit: Type.Union([Type.String(), Type.Null()]),
});

const LanguagesResponseSchema = Type.Object({
  languages: Type.Array(UserLanguageSchema),
});

const AddLanguageRequestSchema = Type.Object({
  language: Type.Union(
    SUPPORTED_LANGUAGES.map((l) => Type.Literal(l)),
    { description: 'Language code (EN, ES, IT, PT, SL)' }
  ),
});

type AddLanguageRequest = Static<typeof AddLanguageRequestSchema>;

const AddLanguageResponseSchema = Type.Object({
  success: Type.Boolean(),
  message: Type.String(),
});

interface LanguageRow {
  language: string;
  started_at: Date;
  orthography_completed: boolean;
  orthography_accuracy: string | null;
  current_unit: string | null;
}

interface VocabCountRow {
  unknown_count: string;
  learning_count: string;
  known_count: string;
}

const languagesRoute: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();

  // GET /learning/languages - Get user's languages with progress
  void fastify.get(
    '/languages',
    {
      preHandler: [authMiddleware],
      schema: {
        response: {
          200: LanguagesResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;

      const languagesResult = await fastify.db.query<LanguageRow>(
        `SELECT language, started_at, orthography_completed, orthography_accuracy, current_unit
         FROM user_languages
         WHERE user_id = $1
         ORDER BY started_at ASC`,
        [userId]
      );

      const languages = await Promise.all(
        languagesResult.rows.map(async (row) => {
          const vocabResult = await fastify.db.query<VocabCountRow>(
            `SELECT
               COUNT(*) FILTER (WHERE state = 'unknown') as unknown_count,
               COUNT(*) FILTER (WHERE state = 'learning') as learning_count,
               COUNT(*) FILTER (WHERE state = 'known') as known_count
             FROM user_vocabulary
             WHERE user_id = $1 AND language = $2`,
            [userId, row.language]
          );

          const vocab = vocabResult.rows[0] || {
            unknown_count: '0',
            learning_count: '0',
            known_count: '0',
          };

          return {
            language: row.language,
            startedAt: row.started_at.toISOString(),
            orthographyCompleted: row.orthography_completed,
            orthographyAccuracy: row.orthography_accuracy
              ? parseFloat(row.orthography_accuracy)
              : null,
            vocabularyCount: {
              unknown: parseInt(vocab.unknown_count, 10) || 0,
              learning: parseInt(vocab.learning_count, 10) || 0,
              known: parseInt(vocab.known_count, 10) || 0,
            },
            currentUnit: row.current_unit,
          };
        })
      );

      return reply.status(200).send({ languages });
    }
  );

  // POST /learning/languages - Start learning a new language
  void fastify.post<{ Body: AddLanguageRequest }>(
    '/languages',
    {
      preHandler: [authMiddleware],
      schema: {
        body: AddLanguageRequestSchema,
        response: {
          201: AddLanguageResponseSchema,
          400: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.body;

      // Check if already learning this language
      const existing = await fastify.db.query(
        'SELECT id FROM user_languages WHERE user_id = $1 AND language = $2',
        [userId, language]
      );

      if (existing.rows.length > 0) {
        return reply.status(409).send({
          error: {
            statusCode: 409,
            message: 'Already learning this language',
            requestId: request.id,
            code: 'LANGUAGE_EXISTS',
          },
        });
      }

      // Add language
      await fastify.db.query(
        `INSERT INTO user_languages (user_id, language, started_at, orthography_completed)
         VALUES ($1, $2, CURRENT_TIMESTAMP, false)`,
        [userId, language]
      );

      request.log.info({ userId, language }, 'User started learning language');

      return reply.status(201).send({
        success: true,
        message: `Started learning ${language}`,
      });
    }
  );

  // DELETE /learning/languages/:language - Stop learning a language
  void fastify.delete<{ Params: { language: string } }>(
    '/languages/:language',
    {
      preHandler: [authMiddleware],
      schema: {
        params: Type.Object({
          language: Type.String(),
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            message: Type.String(),
          }),
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.params;

      const result = await fastify.db.query(
        'DELETE FROM user_languages WHERE user_id = $1 AND language = $2 RETURNING id',
        [userId, language]
      );

      if (result.rowCount === 0) {
        return reply.status(404).send({
          error: {
            statusCode: 404,
            message: 'Language not found in your learning list',
            requestId: request.id,
            code: 'LANGUAGE_NOT_FOUND',
          },
        });
      }

      request.log.info({ userId, language }, 'User stopped learning language');

      return reply.status(200).send({
        success: true,
        message: `Stopped learning ${language}`,
      });
    }
  );
};

export default languagesRoute;
