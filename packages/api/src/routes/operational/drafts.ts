import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const ApproveBodySchema = z.object({
  overrideTopicId: z.string().uuid().optional(),
  overrideLevel: z.string().max(2).optional(),
});

const RejectBodySchema = z.object({
  reason: z.string().max(2000).optional(),
});

const RerunBodySchema = z.object({
  comment: z.string().max(2000).optional(),
});

const BulkApproveBodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

const BulkRejectBodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  reason: z.string().max(2000).optional(),
});

interface DraftRow {
  id: string;
  data_type: string;
  original_content: string;
  suggested_topic_id: string;
  suggested_topic_name: string;
  suggested_level: string;
  content_type: string;
  llm_reasoning: string;
  document_name: string;
  document_id: string;
  pipeline_id: string | null;
  created_at: string;
  approval_status: string;
}

interface CountRow {
  count: string;
}

export const draftRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/operational/drafts/review', async (request, reply) => {
    const {
      page = 1,
      limit = 20,
      level,
      topic_id,
      pipeline_id,
    } = request.query as {
      page?: number;
      limit?: number;
      level?: string;
      topic_id?: string;
      pipeline_id?: string;
    };

    const offset = (Number(page) - 1) * Number(limit);
    const params: (string | number)[] = [];
    const conditions: string[] = ["d.approval_status = 'pending'"];

    if (level) {
      params.push(level);
      conditions.push(`d.suggested_level = $${params.length}`);
    }

    if (topic_id) {
      params.push(topic_id);
      conditions.push(`d.suggested_topic_id = $${params.length}`);
    }

    if (pipeline_id) {
      params.push(pipeline_id);
      conditions.push(`drq.pipeline_id = $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');
    params.push(Number(limit), offset);

    const result = await fastify.db.query<DraftRow>(
      `SELECT 
        d.id,
        d.data_type,
        d.original_content,
        d.suggested_topic_id,
        t.name as suggested_topic_name,
        d.suggested_level,
        t.content_type,
        d.llm_reasoning,
        ds.original_filename as document_name,
        ds.id as document_id,
        drq.pipeline_id,
        d.created_at,
        d.approval_status
       FROM drafts d
       LEFT JOIN curriculum_topics t ON d.suggested_topic_id = t.id
       LEFT JOIN document_sources ds ON d.document_id = ds.id
       LEFT JOIN draft_review_queue drq ON d.id = drq.draft_id
       WHERE ${whereClause}
       ORDER BY drq.queued_at DESC, d.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = params.slice(0, -2);
    const countResult = await fastify.db.query<CountRow>(
      `SELECT COUNT(*) as count
       FROM drafts d
       LEFT JOIN draft_review_queue drq ON d.id = drq.draft_id
       WHERE ${whereClause}`,
      countParams
    );

    return reply.send({
      drafts: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: Number(page),
      limit: Number(limit),
    });
  });

  fastify.post('/operational/drafts/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = ApproveBodySchema.parse(request.body || {});

    interface DraftCheckRow {
      id: string;
      data_type: string;
      raw_data: string;
      document_id: string;
      chunk_id: string;
      topic_id: string;
      suggested_topic_id: string;
      suggested_level: string;
      approval_status: string;
    }

    const draftResult = await fastify.db.query<DraftCheckRow>(
      `SELECT id, data_type, raw_data, document_id, chunk_id, topic_id, 
              suggested_topic_id, suggested_level, approval_status
       FROM drafts WHERE id = $1`,
      [id]
    );

    if (draftResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Draft not found' });
    }

    const draft = draftResult.rows[0];

    if (draft.approval_status !== 'pending') {
      return reply.status(400).send({ error: `Draft already ${draft.approval_status}` });
    }

    const finalTopicId = body.overrideTopicId || draft.suggested_topic_id || draft.topic_id;
    void (body.overrideLevel || draft.suggested_level);

    const client = await fastify.db.connect();

    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE drafts 
         SET approval_status = 'approved', 
             approved_by = $1, 
             approved_at = CURRENT_TIMESTAMP,
             topic_id = $2
         WHERE id = $3`,
        [request.user!.userId, finalTopicId, id]
      );

      await client.query(
        `UPDATE draft_review_queue 
         SET reviewed_at = CURRENT_TIMESTAMP 
         WHERE draft_id = $1`,
        [id]
      );

      interface CandidateRow {
        id: string;
      }

      const candidateResult = await client.query<CandidateRow>(
        `INSERT INTO candidates (data_type, normalized_data, draft_id)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [draft.data_type, draft.raw_data, id]
      );

      const candidateId = candidateResult.rows[0].id;

      await client.query('COMMIT');

      return reply.send({ success: true, candidateId });
    } catch (error) {
      await client.query('ROLLBACK');
      fastify.log.error({ error, draftId: id }, 'Failed to approve draft');
      return reply.status(500).send({ error: 'Failed to approve draft' });
    } finally {
      client.release();
    }
  });

  fastify.post('/operational/drafts/:id/reject', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = RejectBodySchema.parse(request.body || {});

    interface DraftCheckRow {
      approval_status: string;
    }

    const draftResult = await fastify.db.query<DraftCheckRow>(
      `SELECT approval_status FROM drafts WHERE id = $1`,
      [id]
    );

    if (draftResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Draft not found' });
    }

    if (draftResult.rows[0].approval_status !== 'pending') {
      return reply
        .status(400)
        .send({ error: `Draft already ${draftResult.rows[0].approval_status}` });
    }

    const client = await fastify.db.connect();

    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE drafts 
         SET approval_status = 'rejected', 
             rejection_reason = $1
         WHERE id = $2`,
        [body.reason || null, id]
      );

      await client.query(
        `UPDATE draft_review_queue 
         SET reviewed_at = CURRENT_TIMESTAMP 
         WHERE draft_id = $1`,
        [id]
      );

      await client.query('COMMIT');

      return reply.send({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      fastify.log.error({ error, draftId: id }, 'Failed to reject draft');
      return reply.status(500).send({ error: 'Failed to reject draft' });
    } finally {
      client.release();
    }
  });

  fastify.post('/operational/drafts/:id/rerun', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = RerunBodySchema.parse(request.body || {});

    interface DraftCheckRow {
      chunk_id: string;
      approval_status: string;
    }

    const draftResult = await fastify.db.query<DraftCheckRow>(
      `SELECT chunk_id, approval_status FROM drafts WHERE id = $1`,
      [id]
    );

    if (draftResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Draft not found' });
    }

    const draft = draftResult.rows[0];

    if (draft.approval_status !== 'pending') {
      return reply.status(400).send({ error: `Draft already ${draft.approval_status}` });
    }

    const client = await fastify.db.connect();

    try {
      await client.query('BEGIN');

      await client.query(`DELETE FROM draft_review_queue WHERE draft_id = $1`, [id]);
      await client.query(`DELETE FROM drafts WHERE id = $1`, [id]);

      if (body.comment && draft.chunk_id) {
        await client.query(
          `INSERT INTO operator_feedback (item_id, item_type, operator_id, action, category, comment)
           VALUES ($1, 'chunk', $2, 'revise', 'other', $3)`,
          [draft.chunk_id, request.user!.userId, body.comment]
        );
      }

      await client.query('COMMIT');

      return reply.send({ success: true, chunkId: draft.chunk_id });
    } catch (error) {
      await client.query('ROLLBACK');
      fastify.log.error({ error, draftId: id }, 'Failed to rerun draft');
      return reply.status(500).send({ error: 'Failed to rerun draft' });
    } finally {
      client.release();
    }
  });

  fastify.post('/operational/drafts/bulk-approve', async (request, reply) => {
    const body = BulkApproveBodySchema.parse(request.body);

    let approved = 0;
    const errors: string[] = [];

    for (const draftId of body.ids) {
      try {
        interface DraftCheckRow {
          id: string;
          data_type: string;
          raw_data: string;
          topic_id: string;
          suggested_topic_id: string;
          approval_status: string;
        }

        const draftResult = await fastify.db.query<DraftCheckRow>(
          `SELECT id, data_type, raw_data, topic_id, suggested_topic_id, approval_status
           FROM drafts WHERE id = $1`,
          [draftId]
        );

        if (draftResult.rows.length === 0) {
          errors.push(`Draft ${draftId} not found`);
          continue;
        }

        const draft = draftResult.rows[0];

        if (draft.approval_status !== 'pending') {
          errors.push(`Draft ${draftId} already ${draft.approval_status}`);
          continue;
        }

        const finalTopicId = draft.suggested_topic_id || draft.topic_id;

        const client = await fastify.db.connect();

        try {
          await client.query('BEGIN');

          await client.query(
            `UPDATE drafts 
             SET approval_status = 'approved', 
                 approved_by = $1, 
                 approved_at = CURRENT_TIMESTAMP,
                 topic_id = $2
             WHERE id = $3`,
            [request.user!.userId, finalTopicId, draftId]
          );

          await client.query(
            `UPDATE draft_review_queue 
             SET reviewed_at = CURRENT_TIMESTAMP 
             WHERE draft_id = $1`,
            [draftId]
          );

          await client.query(
            `INSERT INTO candidates (data_type, normalized_data, draft_id)
             VALUES ($1, $2, $3)`,
            [draft.data_type, draft.raw_data, draftId]
          );

          await client.query('COMMIT');
          approved++;
        } catch (e) {
          void e;
          await client.query('ROLLBACK');
          errors.push(`Failed to approve draft ${draftId}`);
        } finally {
          client.release();
        }
      } catch (e) {
        void e;
        errors.push(`Error processing draft ${draftId}`);
      }
    }

    return reply.send({ approved, total: body.ids.length, errors });
  });

  fastify.post('/operational/drafts/bulk-reject', async (request, reply) => {
    const body = BulkRejectBodySchema.parse(request.body);

    let rejected = 0;
    const errors: string[] = [];

    for (const draftId of body.ids) {
      try {
        interface DraftCheckRow {
          approval_status: string;
        }

        const draftResult = await fastify.db.query<DraftCheckRow>(
          `SELECT approval_status FROM drafts WHERE id = $1`,
          [draftId]
        );

        if (draftResult.rows.length === 0) {
          errors.push(`Draft ${draftId} not found`);
          continue;
        }

        if (draftResult.rows[0].approval_status !== 'pending') {
          errors.push(`Draft ${draftId} already ${draftResult.rows[0].approval_status}`);
          continue;
        }

        await fastify.db.query(
          `UPDATE drafts 
           SET approval_status = 'rejected', rejection_reason = $1
           WHERE id = $2`,
          [body.reason || null, draftId]
        );

        await fastify.db.query(
          `UPDATE draft_review_queue 
           SET reviewed_at = CURRENT_TIMESTAMP 
           WHERE draft_id = $1`,
          [draftId]
        );

        rejected++;
      } catch (e) {
        void e;
        errors.push(`Error processing draft ${draftId}`);
      }
    }

    return reply.send({ rejected, total: body.ids.length, errors });
  });

  fastify.get('/operational/drafts/stats', async (request, reply) => {
    const { pipeline_id } = request.query as { pipeline_id?: string };

    let baseCondition = '1=1';
    const params: string[] = [];

    if (pipeline_id) {
      params.push(pipeline_id);
      baseCondition = `drq.pipeline_id = $1`;
    }

    interface StatsRow {
      approval_status: string;
      count: string;
    }

    const statsResult = await fastify.db.query<StatsRow>(
      `SELECT d.approval_status, COUNT(*) as count
       FROM drafts d
       LEFT JOIN draft_review_queue drq ON d.id = drq.draft_id
       WHERE ${baseCondition}
       GROUP BY d.approval_status`,
      params
    );

    const stats: Record<string, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
    };

    for (const row of statsResult.rows) {
      stats[row.approval_status] = parseInt(row.count, 10);
    }

    return reply.send(stats);
  });

  await Promise.resolve();
};
