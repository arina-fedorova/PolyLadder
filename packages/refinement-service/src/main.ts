import { Pool } from 'pg';
import { logger } from './utils/logger';
import {
  CheckpointService,
  CheckpointState,
  createCheckpointRepository,
} from './services/checkpoint.service';
import { WorkPlanner, createWorkPlannerRepository } from './services/work-planner.service';
import {
  ContentProcessor,
  createContentProcessorRepository,
} from './services/content-processor.service';

const DEFAULT_LOOP_INTERVAL_MS = 5000;
const MIN_LOOP_INTERVAL_MS = 1000;
const MAX_LOOP_INTERVAL_MS = 30000;
const SHUTDOWN_TIMEOUT_MS = 60000;

let isShuttingDown = false;
let currentLoopInterval = DEFAULT_LOOP_INTERVAL_MS;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLoopInterval(): number {
  return parseInt(process.env.LOOP_INTERVAL_MS ?? String(DEFAULT_LOOP_INTERVAL_MS), 10);
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  return url;
}

async function mainLoop(
  checkpoint: CheckpointService,
  workPlanner: WorkPlanner,
  contentProcessor: ContentProcessor
): Promise<void> {
  logger.info('Refinement Service starting main loop');

  const previousState = await checkpoint.restoreState();
  if (previousState) {
    logger.info(
      { lastProcessedId: previousState.lastProcessedId, timestamp: previousState.timestamp },
      'Restored from checkpoint'
    );
  }

  let consecutiveEmptyIterations = 0;

  while (!isShuttingDown) {
    try {
      const workItem = await workPlanner.getNextWork();

      if (!workItem) {
        consecutiveEmptyIterations++;
        currentLoopInterval = Math.min(
          getLoopInterval() * Math.pow(1.5, Math.min(consecutiveEmptyIterations, 5)),
          MAX_LOOP_INTERVAL_MS
        );

        logger.debug(
          { intervalMs: currentLoopInterval },
          'No work available, waiting with adaptive interval'
        );
        await sleep(currentLoopInterval);
        continue;
      }

      consecutiveEmptyIterations = 0;
      currentLoopInterval = Math.max(getLoopInterval(), MIN_LOOP_INTERVAL_MS);

      await contentProcessor.process(workItem);

      await workPlanner.markWorkComplete(workItem.id);

      const state: CheckpointState = {
        lastProcessedId: workItem.id,
        lastProcessedType: workItem.type,
        timestamp: new Date(),
        metadata: { priority: workItem.priority },
      };

      await checkpoint.saveState(state);
      logger.debug({ workId: workItem.id }, 'Work completed and checkpoint saved');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error({ error: err.message, stack: err.stack }, 'Error in main loop');

      await checkpoint.saveErrorState(err, { phase: 'main_loop' });

      await sleep(currentLoopInterval);
    }
  }

  logger.info('Main loop exited');
}

async function gracefulShutdown(pool: Pool, reason: string): Promise<void> {
  logger.info({ reason }, 'Initiating graceful shutdown');
  isShuttingDown = true;

  const shutdownTimer = setTimeout(() => {
    logger.warn('Shutdown timeout reached, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    await sleep(2000);

    await pool.end();
    logger.info('Database pool closed');

    clearTimeout(shutdownTimer);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ error: err.message }, 'Error during shutdown');
    clearTimeout(shutdownTimer);
    process.exit(1);
  }
}

async function start(): Promise<void> {
  logger.info('Refinement Service starting');

  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    logger.error({ error: err.message }, 'Unexpected database pool error');
  });

  try {
    const client = await pool.connect();
    client.release();
    logger.info('Database connection established');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.fatal({ error: err.message }, 'Failed to connect to database');
    process.exit(1);
  }

  const checkpointRepo = createCheckpointRepository(pool);
  const checkpoint = new CheckpointService(checkpointRepo);

  const workPlannerRepo = createWorkPlannerRepository(pool);
  const workPlanner = new WorkPlanner(workPlannerRepo);

  const contentProcessorRepo = createContentProcessorRepository(pool);
  const contentProcessor = new ContentProcessor(contentProcessorRepo);

  process.on('SIGTERM', () => {
    void gracefulShutdown(pool, 'SIGTERM');
  });

  process.on('SIGINT', () => {
    void gracefulShutdown(pool, 'SIGINT');
  });

  try {
    await mainLoop(checkpoint, workPlanner, contentProcessor);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.fatal({ error: err.message, stack: err.stack }, 'Fatal error in main loop');
    await pool.end();
    process.exit(1);
  }
}

void start();
