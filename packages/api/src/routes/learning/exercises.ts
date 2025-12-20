import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';

const ExerciseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  type: Type.String(),
  language: Type.String(),
  level: Type.String(),
  prompt: Type.String(),
  options: Type.Union([Type.Array(Type.String()), Type.Null()]),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

const ExerciseQuerySchema = Type.Object({
  language: Type.String(),
  level: Type.Optional(Type.String()),
  type: Type.Optional(Type.String()),
  count: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 10 })),
});

type ExerciseQuery = Static<typeof ExerciseQuerySchema>;

const SubmitExerciseRequestSchema = Type.Object({
  exerciseId: Type.String({ format: 'uuid' }),
  answer: Type.String(),
  timeSpentMs: Type.Optional(Type.Number()),
});

type SubmitExerciseRequest = Static<typeof SubmitExerciseRequestSchema>;

const SubmitExerciseResponseSchema = Type.Object({
  correct: Type.Boolean(),
  correctAnswer: Type.String(),
  explanation: Type.Union([Type.String(), Type.Null()]),
});

interface ExerciseRow {
  id: string;
  type: string;
  level: string;
  languages: string[];
  prompt: string;
  options: string[] | null;
  metadata: Record<string, unknown>;
  correct_answer: string;
}

const exercisesRoute: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();

  // GET /learning/exercises - Fetch exercises for practice
  void fastify.get<{ Querystring: ExerciseQuery }>(
    '/exercises',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: ExerciseQuerySchema,
        response: {
          200: Type.Object({
            exercises: Type.Array(ExerciseSchema),
            total: Type.Number(),
          }),
          403: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language, level, type, count = 10 } = request.query;

      // Check if user is learning this language
      const userLangResult = await fastify.db.query(
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

      // Build query conditions
      const conditions: string[] = ['languages ? $1'];
      const values: unknown[] = [language];
      let paramIndex = 2;

      if (level) {
        conditions.push(`level = $${paramIndex++}`);
        values.push(level);
      }

      if (type) {
        conditions.push(`type = $${paramIndex++}`);
        values.push(type);
      }

      const whereClause = conditions.join(' AND ');

      // Fetch random exercises (excluding correct_answer)
      const exercisesResult = await fastify.db.query<ExerciseRow>(
        `SELECT id, type, level, languages, prompt, options, metadata
         FROM approved_exercises
         WHERE ${whereClause}
         ORDER BY RANDOM()
         LIMIT $${paramIndex}`,
        [...values, count]
      );

      const exercises = exercisesResult.rows.map((row) => ({
        id: row.id,
        type: row.type,
        language,
        level: row.level,
        prompt: row.prompt,
        options: row.options,
        metadata: row.metadata,
      }));

      return reply.status(200).send({
        exercises,
        total: exercises.length,
      });
    }
  );

  // POST /learning/exercises/submit - Submit exercise answer
  void fastify.post<{ Body: SubmitExerciseRequest }>(
    '/exercises/submit',
    {
      preHandler: [authMiddleware],
      schema: {
        body: SubmitExerciseRequestSchema,
        response: {
          200: SubmitExerciseResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { exerciseId, answer, timeSpentMs } = request.body;

      // Fetch exercise with correct answer
      const exerciseResult = await fastify.db.query<{
        correct_answer: string;
        metadata: { explanation?: string };
        type: string;
        languages: string[];
      }>('SELECT correct_answer, metadata, type, languages FROM approved_exercises WHERE id = $1', [
        exerciseId,
      ]);

      if (exerciseResult.rows.length === 0) {
        return reply.status(404).send({
          error: {
            statusCode: 404,
            message: 'Exercise not found',
            requestId: request.id,
            code: 'EXERCISE_NOT_FOUND',
          },
        });
      }

      const exercise = exerciseResult.rows[0];
      const correctAnswer = exercise.correct_answer;

      // Compare answers (case-insensitive, trimmed)
      const normalizedAnswer = answer.trim().toLowerCase();
      const normalizedCorrect = correctAnswer.trim().toLowerCase();
      const correct = normalizedAnswer === normalizedCorrect;

      // Record result for analytics
      const language = exercise.languages[0] || 'EN';
      await fastify.db.query(
        `INSERT INTO user_exercise_results
         (user_id, exercise_id, language, exercise_type, correct, time_spent_ms, user_answer, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [userId, exerciseId, language, exercise.type, correct, timeSpentMs || null, answer]
      );

      request.log.info({ userId, exerciseId, correct }, 'Exercise submitted');

      return reply.status(200).send({
        correct,
        correctAnswer,
        explanation: exercise.metadata?.explanation || null,
      });
    }
  );

  // GET /learning/exercises/stats - Get exercise performance stats
  void fastify.get<{ Querystring: { language: string } }>(
    '/exercises/stats',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: Type.Object({
          language: Type.String(),
        }),
        response: {
          200: Type.Object({
            totalAttempts: Type.Number(),
            correctAttempts: Type.Number(),
            accuracyPercent: Type.Number(),
            byType: Type.Array(
              Type.Object({
                type: Type.String(),
                attempts: Type.Number(),
                correct: Type.Number(),
                accuracy: Type.Number(),
              })
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { language } = request.query;

      // Get overall stats
      const overallResult = await fastify.db.query<{
        total: string;
        correct: string;
      }>(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE correct = true) as correct
         FROM user_exercise_results
         WHERE user_id = $1 AND language = $2`,
        [userId, language]
      );

      const overall = overallResult.rows[0] || { total: '0', correct: '0' };
      const totalAttempts = parseInt(overall.total, 10);
      const correctAttempts = parseInt(overall.correct, 10);

      // Get stats by type
      const byTypeResult = await fastify.db.query<{
        exercise_type: string;
        attempts: string;
        correct: string;
      }>(
        `SELECT
           exercise_type,
           COUNT(*) as attempts,
           COUNT(*) FILTER (WHERE correct = true) as correct
         FROM user_exercise_results
         WHERE user_id = $1 AND language = $2
         GROUP BY exercise_type`,
        [userId, language]
      );

      const byType = byTypeResult.rows.map((row) => {
        const attempts = parseInt(row.attempts, 10);
        const correct = parseInt(row.correct, 10);
        return {
          type: row.exercise_type,
          attempts,
          correct,
          accuracy: attempts > 0 ? Math.round((correct / attempts) * 100) : 0,
        };
      });

      return reply.status(200).send({
        totalAttempts,
        correctAttempts,
        accuracyPercent:
          totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0,
        byType,
      });
    }
  );
};

export default exercisesRoute;
