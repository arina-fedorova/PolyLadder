# F020: Operational Endpoints

**Feature Code**: F020
**Created**: 2025-12-17
**Phase**: 5 - API Layer
**Status**: Not Started

---

## Description

REST API endpoints for operators: pipeline health, candidate browsing, approval/rejection, and validation failure viewing.

## Success Criteria

- [ ] GET /api/v1/operational/health - Pipeline metrics
- [ ] GET /api/v1/operational/candidates - Browse candidates
- [ ] GET /api/v1/operational/validated - Browse validated items
- [ ] POST /api/v1/operational/approve/:id - Approve item
- [ ] POST /api/v1/operational/reject/:id - Reject item
- [ ] GET /api/v1/operational/failures - Validation failures
- [ ] All require operator role

---

## Tasks

### Task 1: Create Pipeline Health Dashboard Endpoint

**Description**: GET /operational/health - Returns pipeline metrics, content counts by state, and service health.

**Implementation Plan**:

Create `packages/api/src/routes/operational/health.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authMiddleware, requireOperator } from '../../middleware/auth.middleware';

const PipelineHealthSchema = Type.Object({
  pipeline: Type.Object({
    draft: Type.Number(),
    candidate: Type.Number(),
    validated: Type.Number(),
    approved: Type.Number(),
  }),
  byTable: Type.Array(Type.Object({
    tableName: Type.String(),
    draft: Type.Number(),
    candidate: Type.Number(),
    validated: Type.Number(),
    approved: Type.Number(),
  })),
  recentActivity: Type.Object({
    last24h: Type.Object({
      created: Type.Number(),
      approved: Type.Number(),
      failed: Type.Number(),
    }),
  }),
  serviceStatus: Type.Object({
    refinementService: Type.Object({
      status: Type.Union([Type.Literal('healthy'), Type.Literal('unhealthy')]),
      lastCheckpoint: Type.Optional(Type.String({ format: 'date-time' })),
    }),
  }),
});

export const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', {
    preHandler: [authMiddleware, requireOperator()],
    schema: {
      response: {
        200: PipelineHealthSchema,
      },
    },
  }, async (request, reply) => {
    try {
      // Get counts from pipeline_health view (created in F017)
      const healthResult = await fastify.pg.query(`
        SELECT * FROM pipeline_health
      `);

      // Aggregate totals
      const totals = {
        draft: 0,
        candidate: 0,
        validated: 0,
        approved: 0,
      };

      healthResult.rows.forEach(row => {
        totals.draft += parseInt(row.draft_count) || 0;
        totals.candidate += parseInt(row.candidate_count) || 0;
        totals.validated += parseInt(row.validated_count) || 0;
        totals.approved += parseInt(row.approved_count) || 0;
      });

      // Get recent activity (last 24 hours)
      const activityResult = await fastify.pg.query(`
        SELECT
          COUNT(*) FILTER (WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours') as created_24h,
          COUNT(*) FILTER (WHERE state = 'APPROVED' AND updated_at > CURRENT_TIMESTAMP - INTERVAL '24 hours') as approved_24h
        FROM (
          SELECT created_at, updated_at, state FROM meanings
          UNION ALL
          SELECT created_at, updated_at, state FROM utterances
          UNION ALL
          SELECT created_at, updated_at, state FROM rules
          UNION ALL
          SELECT created_at, updated_at, state FROM exercises
        ) all_content
      `);

      const failuresResult = await fastify.pg.query(`
        SELECT COUNT(*) as count
        FROM pipeline_failures
        WHERE failed_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
      `);

      // Check refinement service status
      const serviceResult = await fastify.pg.query(`
        SELECT last_checkpoint
        FROM service_state
        WHERE service_name = 'refinement_service'
      `);

      const lastCheckpoint = serviceResult.rows[0]?.last_checkpoint;
      const isHealthy = lastCheckpoint &&
        new Date(lastCheckpoint) > new Date(Date.now() - 5 * 60 * 1000); // Healthy if checkpoint < 5min ago

      return reply.status(200).send({
        pipeline: totals,
        byTable: healthResult.rows.map(row => ({
          tableName: row.table_name,
          draft: parseInt(row.draft_count) || 0,
          candidate: parseInt(row.candidate_count) || 0,
          validated: parseInt(row.validated_count) || 0,
          approved: parseInt(row.approved_count) || 0,
        })),
        recentActivity: {
          last24h: {
            created: parseInt(activityResult.rows[0]?.created_24h) || 0,
            approved: parseInt(activityResult.rows[0]?.approved_24h) || 0,
            failed: parseInt(failuresResult.rows[0]?.count) || 0,
          },
        },
        serviceStatus: {
          refinementService: {
            status: isHealthy ? 'healthy' : 'unhealthy',
            lastCheckpoint: lastCheckpoint?.toISOString(),
          },
        },
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to fetch pipeline health');
      throw error;
    }
  });
};
```

**Files Created**: `packages/api/src/routes/operational/health.ts`

---

### Task 2: Create Review Queue Browse Endpoint

**Description**: GET /operational/review-queue - Returns paginated list of items awaiting manual review.

**Implementation Plan**:

Create `packages/api/src/routes/operational/review-queue.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authMiddleware, requireOperator } from '../../middleware/auth.middleware';
import { PaginationQuerySchema, PaginatedResponseSchema } from '../../schemas/common';

const ReviewQueueItemSchema = Type.Object({
  itemId: Type.String({ format: 'uuid' }),
  tableName: Type.String(),
  priority: Type.Number(),
  queuedAt: Type.String({ format: 'date-time' }),
  contentPreview: Type.Object({
    type: Type.String(),
    text: Type.String(),
    language: Type.Optional(Type.String()),
    level: Type.Optional(Type.String()),
  }),
});

export const reviewQueueRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/review-queue', {
    preHandler: [authMiddleware, requireOperator()],
    schema: {
      querystring: PaginationQuerySchema,
      response: {
        200: PaginatedResponseSchema(ReviewQueueItemSchema),
      },
    },
  }, async (request, reply) => {
    const { limit = 20, offset = 0 } = request.query;

    try {
      // Get total count
      const countResult = await fastify.pg.query(
        'SELECT COUNT(*) as total FROM review_queue WHERE reviewed_at IS NULL'
      );
      const total = parseInt(countResult.rows[0].total);

      // Get paginated items
      const itemsResult = await fastify.pg.query(
        `SELECT item_id, table_name, priority, queued_at
         FROM review_queue
         WHERE reviewed_at IS NULL
         ORDER BY priority ASC, queued_at ASC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      // Fetch content preview for each item
      const items = await Promise.all(
        itemsResult.rows.map(async (row) => {
          const contentResult = await fastify.pg.query(
            `SELECT * FROM ${row.table_name} WHERE id = $1`,
            [row.item_id]
          );

          const content = contentResult.rows[0];

          let preview = {
            type: row.table_name,
            text: '',
            language: content?.language,
            level: content?.level,
          };

          // Build preview based on content type
          switch (row.table_name) {
            case 'meanings':
              preview.text = `${content.word}: ${content.definition}`;
              break;
            case 'utterances':
              preview.text = content.text;
              break;
            case 'rules':
              preview.text = `${content.title} - ${content.explanation.substring(0, 100)}...`;
              break;
            case 'exercises':
              preview.text = content.prompt;
              break;
          }

          return {
            itemId: row.item_id,
            tableName: row.table_name,
            priority: row.priority,
            queuedAt: row.queued_at.toISOString(),
            contentPreview: preview,
          };
        })
      );

      return reply.status(200).send({
        items,
        total,
        limit,
        offset,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to fetch review queue');
      throw error;
    }
  });
};
```

**Files Created**: `packages/api/src/routes/operational/review-queue.ts`

---

### Task 3: Create Item Detail Endpoint

**Description**: GET /operational/items/:id - Returns full details of a specific content item for review.

**Implementation Plan**:

Create `packages/api/src/routes/operational/item-detail.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authMiddleware, requireOperator } from '../../middleware/auth.middleware';
import { UuidSchema } from '../../schemas/common';

const ItemDetailSchema = Type.Object({
  id: UuidSchema,
  tableName: Type.String(),
  state: Type.String(),
  content: Type.Record(Type.String(), Type.Any()),
  metadata: Type.Object({
    createdAt: Type.String({ format: 'date-time' }),
    updatedAt: Type.String({ format: 'date-time' }),
    sourceMetadata: Type.Optional(Type.Any()),
  }),
  validationHistory: Type.Optional(Type.Array(Type.Object({
    gateName: Type.String(),
    passed: Type.Boolean(),
    reason: Type.Optional(Type.String()),
    checkedAt: Type.String({ format: 'date-time' }),
  }))),
});

export const itemDetailRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/items/:tableName/:id', {
    preHandler: [authMiddleware, requireOperator()],
    schema: {
      params: Type.Object({
        tableName: Type.String(),
        id: UuidSchema,
      }),
      response: {
        200: ItemDetailSchema,
        404: Type.Object({
          error: Type.Object({
            statusCode: Type.Literal(404),
            message: Type.String(),
            requestId: Type.String(),
          }),
        }),
      },
    },
  }, async (request, reply) => {
    const { tableName, id } = request.params;

    // Validate table name (security)
    const validTables = ['meanings', 'utterances', 'rules', 'exercises'];
    if (!validTables.includes(tableName)) {
      return reply.status(400).send({
        error: {
          statusCode: 400,
          message: `Invalid table name: ${tableName}`,
          requestId: request.id,
        },
      });
    }

    try {
      // Fetch item
      const itemResult = await fastify.pg.query(
        `SELECT * FROM ${tableName} WHERE id = $1`,
        [id]
      );

      if (itemResult.rows.length === 0) {
        return reply.status(404).send({
          error: {
            statusCode: 404,
            message: `Item not found in ${tableName}`,
            requestId: request.id,
          },
        });
      }

      const item = itemResult.rows[0];

      // Fetch validation history (if exists)
      // TODO: Implement validation_history table to track gate results
      const validationHistory = [];

      return reply.status(200).send({
        id: item.id,
        tableName,
        state: item.state,
        content: item,
        metadata: {
          createdAt: item.created_at.toISOString(),
          updatedAt: item.updated_at.toISOString(),
          sourceMetadata: item.source_metadata,
        },
        validationHistory,
      });
    } catch (error) {
      request.log.error({ err: error, tableName, id }, 'Failed to fetch item detail');
      throw error;
    }
  });
};
```

**Files Created**: `packages/api/src/routes/operational/item-detail.ts`

---

### Task 4: Create Approval Endpoint

**Description**: POST /operational/approve/:id - Approve a VALIDATED item and promote to APPROVED state.

**Implementation Plan**:

Create `packages/api/src/routes/operational/approve.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authMiddleware, requireOperator } from '../../middleware/auth.middleware';
import { UuidSchema, SuccessResponseSchema } from '../../schemas/common';
import { withTransaction } from '../../utils/db.utils';

const ApproveRequestSchema = Type.Object({
  tableName: Type.String(),
  notes: Type.Optional(Type.String()),
});

export const approveRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/approve/:id', {
    preHandler: [authMiddleware, requireOperator()],
    schema: {
      params: Type.Object({
        id: UuidSchema,
      }),
      body: ApproveRequestSchema,
      response: {
        200: SuccessResponseSchema,
        400: Type.Object({
          error: Type.Object({
            statusCode: Type.Literal(400),
            message: Type.String(),
            requestId: Type.String(),
          }),
        }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { tableName, notes } = request.body;
    const operatorId = request.user!.userId;

    // Validate table name
    const validTables = ['meanings', 'utterances', 'rules', 'exercises'];
    if (!validTables.includes(tableName)) {
      return reply.status(400).send({
        error: {
          statusCode: 400,
          message: `Invalid table name: ${tableName}`,
          requestId: request.id,
        },
      });
    }

    const client = await fastify.pg.connect();

    try {
      await withTransaction(client, async (txClient) => {
        // Check item exists and is VALIDATED
        const itemResult = await txClient.query(
          `SELECT * FROM ${tableName} WHERE id = $1 FOR UPDATE`,
          [id]
        );

        if (itemResult.rows.length === 0) {
          throw new Error(`Item not found in ${tableName}`);
        }

        const item = itemResult.rows[0];

        if (item.state !== 'VALIDATED') {
          throw new Error(`Item must be in VALIDATED state (current: ${item.state})`);
        }

        // Copy to approved_* table
        const approvedTable = `approved_${tableName}`;
        const columns = Object.keys(item).filter(k => k !== 'id' && k !== 'state');
        const values = columns.map(k => item[k]);

        await txClient.query(
          `INSERT INTO ${approvedTable} (${columns.join(', ')})
           VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
          values
        );

        // Update state to APPROVED
        await txClient.query(
          `UPDATE ${tableName} SET state = 'APPROVED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [id]
        );

        // Record approval event
        await txClient.query(
          `INSERT INTO approval_events (user_id, entity_type, entity_id, event_type, metadata)
           VALUES ($1, $2, $3, 'manual_approval', $4)`,
          [operatorId, tableName, id, JSON.stringify({ notes })]
        );

        // Remove from review queue
        await txClient.query(
          `UPDATE review_queue
           SET reviewed_at = CURRENT_TIMESTAMP, review_decision = 'approve', assigned_to = $1
           WHERE item_id = $2`,
          [operatorId, id]
        );
      });

      request.log.info({ itemId: id, tableName, operatorId }, 'Item approved');

      return reply.status(200).send({
        success: true,
        message: 'Item approved successfully',
      });
    } catch (error) {
      request.log.error({ err: error, itemId: id, tableName }, 'Approval failed');

      return reply.status(400).send({
        error: {
          statusCode: 400,
          message: error.message || 'Approval failed',
          requestId: request.id,
        },
      });
    } finally {
      client.release();
    }
  });
};
```

**Files Created**: `packages/api/src/routes/operational/approve.ts`

---

### Task 5: Create Rejection Endpoint

**Description**: POST /operational/reject/:id - Reject an item and move it back to DRAFT state for regeneration.

**Implementation Plan**:

Create `packages/api/src/routes/operational/reject.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authMiddleware, requireOperator } from '../../middleware/auth.middleware';
import { UuidSchema, SuccessResponseSchema } from '../../schemas/common';

const RejectRequestSchema = Type.Object({
  tableName: Type.String(),
  reason: Type.String({ minLength: 10, maxLength: 500 }),
});

export const rejectRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/reject/:id', {
    preHandler: [authMiddleware, requireOperator()],
    schema: {
      params: Type.Object({
        id: UuidSchema,
      }),
      body: RejectRequestSchema,
      response: {
        200: SuccessResponseSchema,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { tableName, reason } = request.body;
    const operatorId = request.user!.userId;

    // Validate table name
    const validTables = ['meanings', 'utterances', 'rules', 'exercises'];
    if (!validTables.includes(tableName)) {
      return reply.status(400).send({
        error: {
          statusCode: 400,
          message: `Invalid table name: ${tableName}`,
          requestId: request.id,
        },
      });
    }

    try {
      // Update state to DRAFT (will be regenerated or deleted)
      await fastify.pg.query(
        `UPDATE ${tableName} SET state = 'DRAFT', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );

      // Record rejection event
      await fastify.pg.query(
        `INSERT INTO approval_events (user_id, entity_type, entity_id, event_type, metadata)
         VALUES ($1, $2, $3, 'manual_rejection', $4)`,
        [operatorId, tableName, id, JSON.stringify({ reason })]
      );

      // Update review queue
      await fastify.pg.query(
        `UPDATE review_queue
         SET reviewed_at = CURRENT_TIMESTAMP, review_decision = 'reject', assigned_to = $1
         WHERE item_id = $2`,
        [operatorId, id]
      );

      request.log.info({ itemId: id, tableName, operatorId, reason }, 'Item rejected');

      return reply.status(200).send({
        success: true,
        message: 'Item rejected and moved to DRAFT',
      });
    } catch (error) {
      request.log.error({ err: error, itemId: id, tableName }, 'Rejection failed');
      throw error;
    }
  });
};
```

**Files Created**: `packages/api/src/routes/operational/reject.ts`

---

### Task 6: Create Pipeline Failures Endpoint

**Description**: GET /operational/failures - Returns validation failures with filtering options.

**Implementation Plan**:

Create `packages/api/src/routes/operational/failures.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authMiddleware, requireOperator } from '../../middleware/auth.middleware';
import { PaginationQuerySchema, PaginatedResponseSchema } from '../../schemas/common';

const FailureItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  itemId: Type.String({ format: 'uuid' }),
  tableName: Type.String(),
  state: Type.String(),
  errorMessage: Type.String(),
  failedAt: Type.String({ format: 'date-time' }),
});

const FailuresQuerySchema = Type.Intersect([
  PaginationQuerySchema,
  Type.Object({
    tableName: Type.Optional(Type.String()),
    state: Type.Optional(Type.String()),
    since: Type.Optional(Type.String({ format: 'date-time' })),
  }),
]);

export const failuresRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/failures', {
    preHandler: [authMiddleware, requireOperator()],
    schema: {
      querystring: FailuresQuerySchema,
      response: {
        200: PaginatedResponseSchema(FailureItemSchema),
      },
    },
  }, async (request, reply) => {
    const { limit = 20, offset = 0, tableName, state, since } = request.query;

    try {
      // Build WHERE clause
      const conditions: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (tableName) {
        conditions.push(`table_name = $${paramIndex++}`);
        values.push(tableName);
      }

      if (state) {
        conditions.push(`state = $${paramIndex++}`);
        values.push(state);
      }

      if (since) {
        conditions.push(`failed_at > $${paramIndex++}`);
        values.push(since);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countResult = await fastify.pg.query(
        `SELECT COUNT(*) as total FROM pipeline_failures ${whereClause}`,
        values
      );
      const total = parseInt(countResult.rows[0].total);

      // Get paginated failures
      const failuresResult = await fastify.pg.query(
        `SELECT id, item_id, table_name, state, error_message, failed_at
         FROM pipeline_failures
         ${whereClause}
         ORDER BY failed_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      );

      const items = failuresResult.rows.map(row => ({
        id: row.id,
        itemId: row.item_id,
        tableName: row.table_name,
        state: row.state,
        errorMessage: row.error_message,
        failedAt: row.failed_at.toISOString(),
      }));

      return reply.status(200).send({
        items,
        total,
        limit,
        offset,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to fetch pipeline failures');
      throw error;
    }
  });
};
```

**Files Created**: `packages/api/src/routes/operational/failures.ts`

---

### Task 7: Register All Operational Routes

**Description**: Create operational route index and register all endpoints.

**Implementation Plan**:

Create `packages/api/src/routes/operational/index.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { healthRoute } from './health';
import { reviewQueueRoute } from './review-queue';
import { itemDetailRoute } from './item-detail';
import { approveRoute } from './approve';
import { rejectRoute } from './reject';
import { failuresRoute } from './failures';

export const operationalRoutes: FastifyPluginAsync = async (fastify) => {
  // Register all operational routes
  await fastify.register(healthRoute);
  await fastify.register(reviewQueueRoute);
  await fastify.register(itemDetailRoute);
  await fastify.register(approveRoute);
  await fastify.register(rejectRoute);
  await fastify.register(failuresRoute);
};
```

Update `packages/api/src/server.ts`:
```typescript
async function registerRoutes(server: FastifyInstance): Promise<void> {
  // ... health check and root endpoints ...

  // Import and register feature routes
  const { authRoutes } = await import('./routes/auth');
  await server.register(authRoutes, { prefix: '/auth' });

  const { operationalRoutes } = await import('./routes/operational');
  await server.register(operationalRoutes, { prefix: '/operational' });

  // NOTE: F021 routes to be added here
  // await server.register(learningRoutes, { prefix: '/learning' });
}
```

**Files Created**:
- `packages/api/src/routes/operational/index.ts`
- Update `packages/api/src/server.ts`

---

## Open Questions

None - operational endpoints follow standard CRUD patterns with role-based access control.

---

## Dependencies

- **Blocks**: F025, F026, F027
- **Depends on**: F005, F007, F009, F013, F017, F018

---

## Notes

- All endpoints require operator role authentication
- Pagination used for all list endpoints (default: 20 items per page)
- Review queue ordered by priority (1=highest) then FIFO
- Approval/rejection creates audit trail in `approval_events` table
- Rejected items moved back to DRAFT state for regeneration
- Pipeline failures filterable by table, state, and time range
- Transaction used for approval to ensure atomicity (copy to approved_* + update state)
