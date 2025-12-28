import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';

const OrthographyLessonSchema = Type.Object({
  conceptId: Type.String(),
  letter: Type.String(),
  ipa: Type.String(),
  soundDescription: Type.String(),
  examples: Type.Array(
    Type.Object({
      word: Type.String(),
      audioUrl: Type.Union([Type.String(), Type.Null()]),
    })
  ),
  completed: Type.Boolean(),
});

const OrthographyResponseSchema = Type.Object({
  lessons: Type.Array(OrthographyLessonSchema),
  totalLessons: Type.Number(),
  completedLessons: Type.Number(),
  orthographyCompleted: Type.Boolean(),
});

const CompleteOrthographyRequestSchema = Type.Object({
  language: Type.String(),
  accuracy: Type.Number({ minimum: 0, maximum: 100 }),
});

type CompleteOrthographyRequest = Static<typeof CompleteOrthographyRequestSchema>;

const CompleteOrthographyResponseSchema = Type.Object({
  success: Type.Boolean(),
  gateCompleted: Type.Boolean(),
  accuracy: Type.Number(),
  requiredAccuracy: Type.Number(),
});

interface CurriculumRow {
  concept_id: string;
  metadata: {
    letter?: string;
    ipa?: string;
    soundDescription?: string;
    exampleWords?: string[];
    order?: number;
  };
}

interface ProgressRow {
  concept_id: string;
}

interface UserLanguageRow {
  orthography_completed: boolean;
}

const ORTHOGRAPHY_PASS_THRESHOLD = 80;

const orthographyRoute: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();

  void fastify.get<{ Params: { language: string } }>(
    '/orthography/:language',
    {
      preHandler: [authMiddleware],
      schema: {
        params: Type.Object({
          language: Type.String(),
        }),
        response: {
          200: OrthographyResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.params;

      const userLangResult = await fastify.db.query<UserLanguageRow>(
        'SELECT orthography_completed FROM user_languages WHERE user_id = $1 AND language = $2',
        [userId, language]
      );

      if (userLangResult.rows.length === 0) {
        return reply.status(403).send({
          error: {
            statusCode: 403,
            message: 'You are not learning this language. Add it first.',
            requestId: request.id,
            code: 'LANGUAGE_NOT_STARTED',
          },
        });
      }

      const orthographyCompleted = userLangResult.rows[0].orthography_completed;

      const conceptsResult = await fastify.db.query<CurriculumRow>(
        `SELECT concept_id, metadata
         FROM curriculum_graph
         WHERE language = $1 AND concept_type = 'orthography'
         ORDER BY (metadata->>'order')::int ASC NULLS LAST, concept_id ASC`,
        [language]
      );

      const progressResult = await fastify.db.query<ProgressRow>(
        `SELECT concept_id
         FROM user_progress
         WHERE user_id = $1 AND status = 'completed'
         AND concept_id LIKE 'ortho-%'`,
        [userId]
      );

      const completedConceptIds = new Set(progressResult.rows.map((r) => r.concept_id));

      const lessons = conceptsResult.rows.map((row) => {
        const metadata = row.metadata || {};

        return {
          conceptId: row.concept_id,
          letter: metadata.letter || '',
          ipa: metadata.ipa || '',
          soundDescription: metadata.soundDescription || '',
          examples: (metadata.exampleWords || []).map((word) => ({
            word,
            audioUrl: null, // TTS URLs will be generated client-side or via separate endpoint
          })),
          completed: completedConceptIds.has(row.concept_id),
        };
      });

      return reply.status(200).send({
        lessons,
        totalLessons: lessons.length,
        completedLessons: completedConceptIds.size,
        orthographyCompleted,
      });
    }
  );

  void fastify.post<{ Body: CompleteOrthographyRequest }>(
    '/orthography/complete',
    {
      preHandler: [authMiddleware],
      schema: {
        body: CompleteOrthographyRequestSchema,
        response: {
          200: CompleteOrthographyResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language, accuracy } = request.body;

      const userLangResult = await fastify.db.query<UserLanguageRow>(
        'SELECT orthography_completed FROM user_languages WHERE user_id = $1 AND language = $2',
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

      if (userLangResult.rows[0].orthography_completed) {
        return reply.status(200).send({
          success: true,
          gateCompleted: true,
          accuracy,
          requiredAccuracy: ORTHOGRAPHY_PASS_THRESHOLD,
        });
      }

      const passed = accuracy >= ORTHOGRAPHY_PASS_THRESHOLD;

      await fastify.db.query(
        `UPDATE user_languages
         SET orthography_accuracy = $3,
             orthography_completed = CASE WHEN $4 THEN true ELSE orthography_completed END,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND language = $2`,
        [userId, language, accuracy, passed]
      );

      if (passed) {
        request.log.info({ userId, language, accuracy }, 'User completed orthography gate');
      } else {
        request.log.info(
          { userId, language, accuracy },
          'User attempted orthography gate but did not pass'
        );
      }

      return reply.status(200).send({
        success: true,
        gateCompleted: passed,
        accuracy,
        requiredAccuracy: ORTHOGRAPHY_PASS_THRESHOLD,
      });
    }
  );

  void fastify.post<{ Body: { conceptId: string } }>(
    '/orthography/progress',
    {
      preHandler: [authMiddleware],
      schema: {
        body: Type.Object({
          conceptId: Type.String(),
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
          }),
          400: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { conceptId } = request.body;

      await fastify.db.query(
        `INSERT INTO user_progress (user_id, concept_id, status, completion_date)
         VALUES ($1, $2, 'completed', CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, concept_id)
         DO UPDATE SET status = 'completed', completion_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
        [userId, conceptId]
      );

      return reply.status(200).send({ success: true });
    }
  );
};

export default orthographyRoute;
