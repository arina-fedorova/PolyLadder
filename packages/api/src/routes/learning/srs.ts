import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../../schemas/common';
import { authMiddleware } from '../../middleware/auth';

const SRSItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  itemType: Type.String(),
  itemId: Type.String(),
  dueDate: Type.String({ format: 'date-time' }),
  intervalDays: Type.Number(),
  easeFactor: Type.Number(),
  repetitions: Type.Number(),
});

const SRSDueQuerySchema = Type.Object({
  language: Type.Optional(Type.String()),
  itemType: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
});

type SRSDueQuery = Static<typeof SRSDueQuerySchema>;

const SRSReviewRequestSchema = Type.Object({
  itemId: Type.String(),
  itemType: Type.String(),
  quality: Type.Number({ minimum: 0, maximum: 5 }),
});

type SRSReviewRequest = Static<typeof SRSReviewRequestSchema>;

interface SRSRow {
  id: string;
  item_type: string;
  item_id: string;
  due_date: Date;
  interval_days: number;
  ease_factor: string;
  repetitions: number;
}

interface CountRow {
  total: string;
}

const srsRoute: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve();

  void fastify.get<{ Querystring: SRSDueQuery }>(
    '/srs/due',
    {
      preHandler: [authMiddleware],
      schema: {
        querystring: SRSDueQuerySchema,
        response: {
          200: Type.Object({
            items: Type.Array(SRSItemSchema),
            totalDue: Type.Number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { itemType, limit = 20 } = request.query;

      const conditions: string[] = ['user_id = $1', 'due_date <= CURRENT_TIMESTAMP'];
      const values: unknown[] = [userId];
      let paramIndex = 2;

      if (itemType) {
        conditions.push(`item_type = $${paramIndex++}`);
        values.push(itemType);
      }

      const whereClause = conditions.join(' AND ');

      const dueResult = await fastify.db.query<SRSRow>(
        `SELECT id, item_type, item_id, due_date, interval_days, ease_factor, repetitions
         FROM user_srs_schedule
         WHERE ${whereClause}
         ORDER BY due_date ASC
         LIMIT $${paramIndex}`,
        [...values, limit]
      );

      const countResult = await fastify.db.query<CountRow>(
        `SELECT COUNT(*) as total FROM user_srs_schedule WHERE ${whereClause}`,
        values
      );

      const items = dueResult.rows.map((row) => ({
        id: row.id,
        itemType: row.item_type,
        itemId: row.item_id,
        dueDate: row.due_date.toISOString(),
        intervalDays: row.interval_days,
        easeFactor: parseFloat(row.ease_factor),
        repetitions: row.repetitions,
      }));

      return reply.status(200).send({
        items,
        totalDue: parseInt(countResult.rows[0].total, 10),
      });
    }
  );

  void fastify.post<{ Body: SRSReviewRequest }>(
    '/srs/review',
    {
      preHandler: [authMiddleware],
      schema: {
        body: SRSReviewRequestSchema,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            nextDueDate: Type.String({ format: 'date-time' }),
            newInterval: Type.Number(),
            newEaseFactor: Type.Number(),
          }),
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { itemId, itemType, quality } = request.body;

      const srsResult = await fastify.db.query<SRSRow>(
        `SELECT id, interval_days, ease_factor, repetitions
         FROM user_srs_schedule
         WHERE user_id = $1 AND item_type = $2 AND item_id = $3`,
        [userId, itemType, itemId]
      );

      let intervalDays: number;
      let easeFactor: number;
      let repetitions: number;
      let isNew = false;

      if (srsResult.rows.length === 0) {
        isNew = true;
        intervalDays = 1;
        easeFactor = 2.5;
        repetitions = 0;
      } else {
        const current = srsResult.rows[0];
        intervalDays = current.interval_days;
        easeFactor = parseFloat(current.ease_factor);
        repetitions = current.repetitions;
      }

      if (quality < 3) {
        intervalDays = 1;
        repetitions = 0;
      } else {
        if (repetitions === 0) {
          intervalDays = 1;
        } else if (repetitions === 1) {
          intervalDays = 6;
        } else {
          intervalDays = Math.round(intervalDays * easeFactor);
        }
        repetitions += 1;

        intervalDays = Math.min(intervalDays, 180);
      }

      easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
      easeFactor = Math.max(1.3, easeFactor); // Minimum ease factor

      const nextDueDate = new Date();
      nextDueDate.setDate(nextDueDate.getDate() + intervalDays);

      if (isNew) {
        await fastify.db.query(
          `INSERT INTO user_srs_schedule
           (user_id, item_type, item_id, due_date, interval_days, ease_factor, repetitions)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [userId, itemType, itemId, nextDueDate, intervalDays, easeFactor, repetitions]
        );
      } else {
        await fastify.db.query(
          `UPDATE user_srs_schedule
           SET due_date = $4, interval_days = $5, ease_factor = $6, repetitions = $7, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $1 AND item_type = $2 AND item_id = $3`,
          [userId, itemType, itemId, nextDueDate, intervalDays, easeFactor, repetitions]
        );
      }

      request.log.info(
        { userId, itemType, itemId, quality, nextDueDate, intervalDays },
        'SRS review completed'
      );

      return reply.status(200).send({
        success: true,
        nextDueDate: nextDueDate.toISOString(),
        newInterval: intervalDays,
        newEaseFactor: Math.round(easeFactor * 100) / 100,
      });
    }
  );

  void fastify.get(
    '/srs/stats',
    {
      preHandler: [authMiddleware],
      schema: {
        response: {
          200: Type.Object({
            totalItems: Type.Number(),
            dueToday: Type.Number(),
            dueThisWeek: Type.Number(),
            byType: Type.Array(
              Type.Object({
                itemType: Type.String(),
                count: Type.Number(),
                dueCount: Type.Number(),
              })
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;

      const statsResult = await fastify.db.query<{
        total: string;
        due_today: string;
        due_week: string;
      }>(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE due_date <= CURRENT_TIMESTAMP) as due_today,
           COUNT(*) FILTER (WHERE due_date <= CURRENT_TIMESTAMP + INTERVAL '7 days') as due_week
         FROM user_srs_schedule
         WHERE user_id = $1`,
        [userId]
      );

      const stats = statsResult.rows[0] || { total: '0', due_today: '0', due_week: '0' };

      const byTypeResult = await fastify.db.query<{
        item_type: string;
        count: string;
        due_count: string;
      }>(
        `SELECT
           item_type,
           COUNT(*) as count,
           COUNT(*) FILTER (WHERE due_date <= CURRENT_TIMESTAMP) as due_count
         FROM user_srs_schedule
         WHERE user_id = $1
         GROUP BY item_type`,
        [userId]
      );

      const byType = byTypeResult.rows.map((row) => ({
        itemType: row.item_type,
        count: parseInt(row.count, 10),
        dueCount: parseInt(row.due_count, 10),
      }));

      return reply.status(200).send({
        totalItems: parseInt(stats.total, 10),
        dueToday: parseInt(stats.due_today, 10),
        dueThisWeek: parseInt(stats.due_week, 10),
        byType,
      });
    }
  );
};

export default srsRoute;
