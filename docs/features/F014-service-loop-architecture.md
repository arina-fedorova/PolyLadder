# F014: Service Loop Architecture

**Feature Code**: F014
**Created**: 2025-12-17
**Phase**: 4 - Content Refinement Service
**Status**: ✅ Completed
**Completed**: 2025-12-19
**PR**: #17

---

## Description

Background service that continuously processes content through the refinement pipeline. Main loop checks work, processes data, saves checkpoints, and resumes after failures.

## Success Criteria

- [x] Service process runs independently
- [x] Main loop: check work → process → checkpoint → repeat
- [x] Graceful startup and shutdown
- [x] State persisted to database
- [x] Resumable after crash/restart

---

## Tasks

### Task 1: Create Service Entry Point

**Description**: Main process loop that continuously checks for work and processes content.

**Implementation Plan**:

Create `packages/refinement-service/src/main.ts`:

```typescript
import { Pool } from 'pg';
import { WorkPlanner } from './services/work-planner.service';
import { ContentProcessor } from './services/content-processor.service';
import { CheckpointService } from './services/checkpoint.service';
import { logger } from './utils/logger';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

let isShuttingDown = false;
const LOOP_INTERVAL_MS = 5000; // Check for work every 5 seconds

async function mainLoop() {
  const workPlanner = new WorkPlanner(pool);
  const processor = new ContentProcessor(pool);
  const checkpoint = new CheckpointService(pool);

  logger.info('Refinement Service started');

  // Restore from last checkpoint if exists
  await checkpoint.restoreState();

  while (!isShuttingDown) {
    try {
      // Get next work item
      const workItem = await workPlanner.getNextWork();

      if (!workItem) {
        // No work available, wait and retry
        await sleep(LOOP_INTERVAL_MS);
        continue;
      }

      logger.info({ workItem }, 'Processing work item');

      // Process the item
      await processor.process(workItem);

      // Save checkpoint after successful processing
      await checkpoint.saveState({
        lastProcessedId: workItem.id,
        timestamp: new Date(),
      });

      logger.info({ workItem }, 'Work item completed');
    } catch (error) {
      logger.error({ error }, 'Error in main loop');

      // Save error state
      await checkpoint.saveErrorState(error);

      // Wait before retrying
      await sleep(LOOP_INTERVAL_MS);
    }
  }

  logger.info('Refinement Service stopped');
}

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  isShuttingDown = true;

  // Give current work time to finish
  await sleep(10000);

  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  isShuttingDown = true;

  await pool.end();
  process.exit(0);
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Start the service
mainLoop().catch((error) => {
  logger.fatal({ error }, 'Fatal error in main loop');
  process.exit(1);
});
```

**Files Created**: `packages/refinement-service/src/main.ts`

---

### Task 2: Create Checkpoint Service

**Description**: Service to save and restore processing state for crash recovery.

**Implementation Plan**:

Create `packages/refinement-service/src/services/checkpoint.service.ts`:

```typescript
import { Pool } from 'pg';

interface CheckpointState {
  lastProcessedId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export class CheckpointService {
  constructor(private readonly pool: Pool) {}

  async saveState(state: CheckpointState): Promise<void> {
    await this.pool.query(
      `INSERT INTO service_state (service_name, state, last_checkpoint)
       VALUES ('refinement_service', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (service_name)
       DO UPDATE SET state = $1, last_checkpoint = CURRENT_TIMESTAMP`,
      [JSON.stringify(state)]
    );
  }

  async restoreState(): Promise<CheckpointState | null> {
    const result = await this.pool.query(
      `SELECT state, last_checkpoint FROM service_state
       WHERE service_name = 'refinement_service'`
    );

    if (result.rows.length === 0) {
      return null;
    }

    return JSON.parse(result.rows[0].state) as CheckpointState;
  }

  async saveErrorState(error: Error): Promise<void> {
    await this.pool.query(
      `INSERT INTO service_state (service_name, state, last_checkpoint)
       VALUES ('refinement_service_errors', $1, CURRENT_TIMESTAMP)`,
      [
        JSON.stringify({
          error: error.message,
          stack: error.stack,
          timestamp: new Date(),
        }),
      ]
    );
  }

  async getLastCheckpointTime(): Promise<Date | null> {
    const result = await this.pool.query(
      `SELECT last_checkpoint FROM service_state
       WHERE service_name = 'refinement_service'`
    );

    if (result.rows.length === 0) {
      return null;
    }

    return new Date(result.rows[0].last_checkpoint);
  }

  async isServiceHealthy(): Promise<boolean> {
    const lastCheckpoint = await this.getLastCheckpointTime();

    if (!lastCheckpoint) {
      return false;
    }

    // Service is unhealthy if last checkpoint > 5 minutes ago
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return lastCheckpoint > fiveMinutesAgo;
  }
}
```

**Files Created**: `packages/refinement-service/src/services/checkpoint.service.ts`

---

### Task 3: Add Service State Table Migration

**Description**: Database table to store service checkpoint data.

**Implementation Plan**:

This table was already defined in F001, but verify it exists:

```sql
CREATE TABLE IF NOT EXISTS service_state (
  service_name VARCHAR(100) PRIMARY KEY,
  state JSONB NOT NULL,
  last_checkpoint TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_service_state_checkpoint ON service_state(last_checkpoint);
```

If not exists, create migration `packages/db/migrations/008-service-state.sql`.

**Files Created**: Verify in F001, or create migration if missing

---

### Task 4: Add Service Monitoring Script

**Description**: Script to check if refinement service is running and healthy.

**Implementation Plan**:

Create `scripts/check-refinement-service.sh`:

```bash
#!/bin/bash

# Check if refinement service is healthy

DATABASE_URL=${DATABASE_URL:-"postgres://dev:dev@localhost:5432/polyladder"}

# Query last checkpoint time
LAST_CHECKPOINT=$(psql "$DATABASE_URL" -t -c "
  SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_checkpoint))
  FROM service_state
  WHERE service_name = 'refinement_service'
")

if [ -z "$LAST_CHECKPOINT" ]; then
  echo "❌ Service has never run (no checkpoint found)"
  exit 1
fi

# Check if checkpoint is recent (< 5 minutes)
if (( $(echo "$LAST_CHECKPOINT < 300" | bc -l) )); then
  echo "✅ Service is healthy (last checkpoint: ${LAST_CHECKPOINT}s ago)"
  exit 0
else
  echo "⚠️  Service may be stuck (last checkpoint: ${LAST_CHECKPOINT}s ago)"
  exit 2
fi
```

Make executable:

```bash
chmod +x scripts/check-refinement-service.sh
```

**Files Created**: `scripts/check-refinement-service.sh`

---

### Task 5: Add Service to Docker Compose

**Description**: Ensure refinement service starts with docker-compose.

**Implementation Plan**:

Already configured in F003 docker-compose.yml:

```yaml
refinement:
  build:
    context: .
    dockerfile: docker/Dockerfile.dev
    target: development
  volumes:
    - ./packages/refinement-service/src:/app/packages/refinement-service/src
    - ./packages/core/src:/app/packages/core/src
    - ./packages/db/src:/app/packages/db/src
  environment:
    DATABASE_URL: postgres://dev:dev@db:5432/polyladder
    NODE_ENV: development
    LOG_LEVEL: debug
  command: pnpm --filter @polyladder/refinement-service dev
  depends_on:
    db:
      condition: service_healthy
```

Verify this exists in docker-compose.yml.

**Files Created**: None (verify existing)

---

### Task 6: Add Package.json Scripts

**Description**: Scripts to run refinement service.

**Implementation Plan**:

Update `packages/refinement-service/package.json`:

```json
{
  "name": "@polyladder/refinement-service",
  "scripts": {
    "dev": "nodemon",
    "build": "tsc",
    "start": "node dist/main.js",
    "check-health": "bash ../../scripts/check-refinement-service.sh"
  },
  "dependencies": {
    "@polyladder/core": "workspace:*",
    "@polyladder/db": "workspace:*",
    "pg": "^8.11.0",
    "pino": "^8.16.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/pg": "^8.10.0",
    "nodemon": "^3.0.2",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  }
}
```

**Files Created**: None (update existing)

---

## Dependencies

- **Blocks**: F015, F016, F017
- **Depends on**: F001, F003

---

## Notes

- Runs as separate process from API
- No HTTP server, direct database access
- Supervisor manages restarts

---

## Open Questions

### 1. Loop Interval Frequency

**Question**: What is the optimal interval between work checks when the queue is empty?

**Current Approach**: The service waits 5 seconds (`LOOP_INTERVAL_MS = 5000`) between checks when no work is available. This balances responsiveness with CPU usage.

**Alternatives**:

1. **Shorter interval (1-2 seconds)**: More responsive to new work, but higher CPU usage and database query load
2. **Longer interval (10-30 seconds)**: Lower overhead, but delays processing of newly arriving content
3. **Adaptive interval**: Start with short interval (5s), exponentially back off to longer interval (60s) when queue remains empty, reset to short on work found
4. **Event-driven approach**: Use PostgreSQL NOTIFY/LISTEN to wake service immediately when work arrives (eliminates polling)

**Recommendation**: Implement **adaptive interval** (Option 3) as a good compromise. Start at 5s for quick response, back off to 30s maximum when idle. This reduces unnecessary database queries during quiet periods while maintaining reasonable responsiveness. Event-driven approach (Option 4) would be ideal long-term but requires more architectural changes.

---

### 2. Error Handling Strategy

**Question**: How should the service handle processing errors - retry immediately, skip the item, or implement exponential backoff?

**Current Approach**: On error, the service saves error state, waits 5 seconds, then continues to the next iteration. The failed item is not explicitly marked, so it may be retried on the next loop.

**Alternatives**:

1. **Immediate retry with limit**: Retry failed item 3 times with exponential backoff (5s, 15s, 45s), then skip
2. **Skip and log**: Mark item as failed, move to next item immediately, require manual intervention to retry
3. **Dead letter queue**: Move persistently failing items to separate table for later investigation, continue processing
4. **Circuit breaker pattern**: If error rate exceeds threshold (e.g., 50% in 1 minute), pause service for cooldown period

**Recommendation**: Implement **dead letter queue** (Option 3) combined with retry limits. Retry each item up to 3 times with exponential backoff, then move to `failed_work_items` table with error details. This prevents one bad item from blocking the queue while preserving failure information for debugging. Add a manual re-queue mechanism in the operational UI (F026).

---

### 3. Graceful Shutdown Mechanism

**Question**: How should the service handle in-progress work when receiving shutdown signals?

**Current Approach**: On SIGTERM, service sets `isShuttingDown = true`, waits 10 seconds for current work to finish, then exits. On SIGINT, exits immediately without waiting.

**Alternatives**:

1. **Complete current item**: Wait indefinitely for current work item to complete, with configurable maximum timeout (60s)
2. **Immediate abort**: Cancel current work immediately, rely on checkpoint system to resume on restart
3. **Graceful drain**: Stop accepting new work, complete current item, then exit (no timeout)
4. **Two-phase shutdown**: First signal (SIGTERM) triggers graceful drain, second signal (SIGINT) forces immediate exit

**Recommendation**: Implement **two-phase shutdown** (Option 4). SIGTERM triggers graceful completion of current item with 60s timeout, after which service exits cleanly. If SIGINT received during graceful shutdown, exit immediately. This balances data consistency (completing work) with operational requirements (responsive shutdown). Add logging to indicate shutdown state for monitoring.
