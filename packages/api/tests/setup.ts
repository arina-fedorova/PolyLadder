import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { beforeAll, afterAll, beforeEach } from 'vitest';
import { resetEnv } from '../src/config/env';

let testServer: FastifyInstance | null = null;
let testPool: Pool | null = null;

function getTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }

  const defaultTestUrl = 'postgresql://test:test@localhost:5434/polyladder_test';

  if (process.env.DATABASE_URL) {
    const devUrl = process.env.DATABASE_URL;
    if (devUrl.includes('polyladder') && !devUrl.includes('polyladder_test')) {
      return defaultTestUrl;
    }
    return devUrl;
  }

  return defaultTestUrl;
}

export function setupTestEnv(): void {
  process.env.NODE_ENV = 'test';

  const testDbUrl = getTestDatabaseUrl();
  process.env.DATABASE_URL = testDbUrl;
  process.env.TEST_DATABASE_URL = testDbUrl;

  process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long';
  process.env.JWT_ACCESS_EXPIRY = '15m';
  process.env.JWT_REFRESH_EXPIRY = '7d';
  process.env.FRONTEND_URL = 'http://localhost:5173';
  process.env.LOG_LEVEL = 'error';
  process.env.RATE_LIMIT_MAX = '1000';
  process.env.RATE_LIMIT_WINDOW = '1 minute';

  resetEnv();
}

export async function createTestServer(): Promise<FastifyInstance> {
  setupTestEnv();

  const { buildServer } = await import('../src/server');
  testServer = await buildServer();
  await testServer.ready();

  return testServer;
}

export async function closeTestServer(): Promise<void> {
  if (testServer) {
    await testServer.close();
    testServer = null;
  }
  resetEnv();
}

export function getTestServer(): FastifyInstance {
  if (!testServer) {
    throw new Error('Test server not initialized. Call createTestServer() first.');
  }
  return testServer;
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const testUrl = getTestDatabaseUrl();
    const testPool = new Pool({
      connectionString: testUrl,
      max: 1,
    });
    await testPool.query('SELECT 1');
    await testPool.end();
    return true;
  } catch {
    return false;
  }
}

export function getTestPool(): Pool {
  if (!testPool) {
    testPool = new Pool({
      connectionString: getTestDatabaseUrl(),
      max: 5,
    });
  }
  return testPool;
}

export async function closeTestPool(): Promise<void> {
  if (testPool) {
    await testPool.end();
    testPool = null;
  }
}

export async function cleanupTestData(): Promise<void> {
  const pool = getTestPool();

  const tables = [
    'pipeline_events',
    'pipeline_tasks',
    'document_processing_tasks',
    'transformation_jobs',
    'content_topic_mappings',
    'raw_content_chunks',
    'pipelines',
    'document_sources',
    'retry_queue',
    'item_versions',
    'operator_feedback',
    'feedback_templates',
    'topic_prerequisites',
    'curriculum_topics',
    'curriculum_levels',
    'refresh_tokens',
    'approval_events',
    'review_queue',
    'pipeline_failures',
    'pipeline_metrics',
    'quality_gate_results',
    'validated',
    'candidates',
    'drafts',
  ];

  for (const table of tables) {
    try {
      await pool.query(`DELETE FROM ${table}`);
    } catch (_error) {
      void _error;
    }
  }

  try {
    await pool.query(
      "DELETE FROM users WHERE email NOT IN ('operator@test.com', 'learner@test.com')"
    );
  } catch (_error) {
    void _error;
  }

  try {
    await pool.query('DELETE FROM refresh_tokens');
  } catch (_error) {
    void _error;
  }
}

export function useTestServer() {
  beforeAll(async () => {
    await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer();
    await closeTestPool();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  return {
    get server() {
      return getTestServer();
    },
    get pool() {
      return getTestPool();
    },
  };
}
