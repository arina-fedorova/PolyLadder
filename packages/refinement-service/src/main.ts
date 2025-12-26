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
import { PipelineOrchestrator, createPipelineRepository } from './pipeline/pipeline-orchestrator';
import { createValidationRepository } from './pipeline/steps/validation.step';
import { createApprovalRepository } from './pipeline/steps/approval.step';
import { SemanticMapperService } from './services/semantic-mapper.service';
import { ContentTransformerService } from './services/content-transformer.service';
import { PromotionWorker } from './services/promotion-worker.service';
import { DocumentProcessorService } from './services/document-processor.service';
import {
  createCEFRConsistencyGate,
  createOrthographyGate,
  createContentSafetyGate,
} from '@polyladder/core';

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

interface DocumentProcessingContext {
  semanticMapper: SemanticMapperService | null;
  contentTransformer: ContentTransformerService | null;
  documentProcessor: DocumentProcessorService;
  pool: Pool;
}

interface UnmappedDocument {
  id: string;
  level_id: string;
}

interface MappingForTransformation {
  id: string;
}

async function findDocumentWithUnmappedChunks(pool: Pool): Promise<UnmappedDocument | null> {
  const result = await pool.query<UnmappedDocument>(
    `SELECT DISTINCT d.id, l.id as level_id
     FROM document_sources d
     JOIN curriculum_levels l ON d.language = l.language AND d.target_level = l.cefr_level
     JOIN raw_content_chunks c ON c.document_id = d.id
     LEFT JOIN content_topic_mappings m ON m.chunk_id = c.id
     WHERE d.status = 'ready' AND m.id IS NULL
     LIMIT 1`
  );
  return result.rows[0] ?? null;
}

async function findConfirmedMappingForTransformation(
  pool: Pool
): Promise<MappingForTransformation | null> {
  const result = await pool.query<MappingForTransformation>(
    `SELECT m.id
     FROM content_topic_mappings m
     LEFT JOIN transformation_jobs j ON j.mapping_id = m.id AND j.status = 'completed'
     WHERE m.status = 'confirmed' AND j.id IS NULL
     LIMIT 1`
  );
  return result.rows[0] ?? null;
}

async function processDocumentPipeline(ctx: DocumentProcessingContext): Promise<boolean> {
  const unmappedDoc = await findDocumentWithUnmappedChunks(ctx.pool);
  if (unmappedDoc && ctx.semanticMapper) {
    logger.info({ documentId: unmappedDoc.id }, 'Mapping chunks to topics');
    await ctx.semanticMapper.mapChunksToTopics(unmappedDoc.id, unmappedDoc.level_id);
    return true;
  }

  const confirmedMapping = await findConfirmedMappingForTransformation(ctx.pool);
  if (confirmedMapping && ctx.contentTransformer) {
    logger.info({ mappingId: confirmedMapping.id }, 'Transforming mapping');
    await ctx.contentTransformer.transformMapping(confirmedMapping.id);
    return true;
  }

  return false;
}

async function mainLoop(
  checkpoint: CheckpointService,
  workPlanner: WorkPlanner,
  contentProcessor: ContentProcessor,
  pipeline: PipelineOrchestrator,
  promotionWorker: PromotionWorker,
  docContext: DocumentProcessingContext
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
  let lastHeartbeat = previousState?.timestamp ?? new Date();
  const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;

  while (!isShuttingDown) {
    try {
      let workDone = false;

      const workItem = await workPlanner.getNextWork();

      if (workItem) {
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
        lastHeartbeat = new Date();
        logger.debug({ workId: workItem.id }, 'Work completed and checkpoint saved');
        workDone = true;
      }

      // Process candidates through quality gates
      const promoted = await promotionWorker.processBatch();
      if (promoted > 0) {
        workDone = true;
        logger.info({ count: promoted }, 'Candidates promoted to VALIDATED');
      }

      await pipeline.processBatch();

      const pendingProcessed = await docContext.documentProcessor.processPendingDocuments();
      if (pendingProcessed > 0) {
        workDone = true;
        logger.info({ count: pendingProcessed }, 'Pending documents processed');
      }

      const docProcessed = await processDocumentPipeline(docContext);
      if (docProcessed) {
        workDone = true;
      }

      const now = new Date();
      const timeSinceHeartbeat = now.getTime() - lastHeartbeat.getTime();

      if (!workDone) {
        consecutiveEmptyIterations++;
        currentLoopInterval = Math.min(
          getLoopInterval() * Math.pow(1.5, Math.min(consecutiveEmptyIterations, 5)),
          MAX_LOOP_INTERVAL_MS
        );

        if (timeSinceHeartbeat >= HEARTBEAT_INTERVAL_MS) {
          const heartbeatState: CheckpointState = {
            lastProcessedId: previousState?.lastProcessedId ?? undefined,
            lastProcessedType: previousState?.lastProcessedType ?? undefined,
            timestamp: now,
            metadata: {
              heartbeat: true,
              consecutiveEmptyIterations,
              status: 'idle',
            },
          };
          await checkpoint.saveState(heartbeatState);
          lastHeartbeat = now;
          logger.debug('Heartbeat checkpoint saved');
        }

        logger.debug(
          { intervalMs: currentLoopInterval },
          'No work available, waiting with adaptive interval'
        );
      } else {
        consecutiveEmptyIterations = 0;
        currentLoopInterval = Math.max(getLoopInterval(), MIN_LOOP_INTERVAL_MS);
      }

      await sleep(currentLoopInterval);
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
  const contentProcessor = new ContentProcessor(contentProcessorRepo, pool);

  const pipelineRepo = createPipelineRepository(pool);
  const validationRepo = createValidationRepository(pool);
  const approvalRepo = createApprovalRepository(pool);
  const pipeline = new PipelineOrchestrator(pipelineRepo, validationRepo, approvalRepo, {
    autoApproval: process.env.AUTO_APPROVAL === 'true',
    retryAttempts: 3,
    batchSize: 10,
  });

  // Create quality gates for promotion worker
  const qualityGates = [
    createCEFRConsistencyGate(),
    createOrthographyGate(),
    createContentSafetyGate(),
  ];
  const promotionWorker = new PromotionWorker(pool, qualityGates);
  logger.info(
    { gateCount: qualityGates.length },
    'Promotion worker initialized with quality gates'
  );

  const documentProcessor = new DocumentProcessorService(pool);
  logger.info('Document processor initialized');

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  let semanticMapper: SemanticMapperService | null = null;
  let contentTransformer: ContentTransformerService | null = null;

  if (process.env.NODE_ENV === 'test') {
    logger.info('Test environment detected - LLM services disabled');
  } else if (anthropicKey) {
    semanticMapper = new SemanticMapperService(pool, anthropicKey);
    contentTransformer = new ContentTransformerService(pool, anthropicKey);
    logger.info('LLM services initialized (semantic mapping and content transformation)');
  } else {
    logger.warn('ANTHROPIC_API_KEY not set - LLM services disabled');
  }

  const docContext: DocumentProcessingContext = {
    semanticMapper,
    contentTransformer,
    documentProcessor,
    pool,
  };

  process.on('SIGTERM', () => {
    void gracefulShutdown(pool, 'SIGTERM');
  });

  process.on('SIGINT', () => {
    void gracefulShutdown(pool, 'SIGINT');
  });

  try {
    await mainLoop(
      checkpoint,
      workPlanner,
      contentProcessor,
      pipeline,
      promotionWorker,
      docContext
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.fatal({ error: err.message, stack: err.stack }, 'Fatal error in main loop');
    await pool.end();
    process.exit(1);
  }
}

void start();
