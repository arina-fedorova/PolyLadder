import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { beforeAll, afterAll, beforeEach } from 'vitest';
import { resetEnv } from '../src/config/env';

let testServer: FastifyInstance | null = null;
let testPool: Pool | null = null;

function getTestDatabaseUrl(): string {
  return (
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/polyladder_test'
  );
}

export function setupTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = getTestDatabaseUrl();
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

  await pool.query('DELETE FROM refresh_tokens');
  await pool.query('DELETE FROM approval_events');
  await pool.query('DELETE FROM review_queue');
  await pool.query('DELETE FROM pipeline_failures');
  await pool.query('DELETE FROM pipeline_metrics');
  await pool.query('DELETE FROM quality_gate_results');
  await pool.query('DELETE FROM validated_meanings');
  await pool.query('DELETE FROM validated_utterances');
  await pool.query('DELETE FROM validated_rules');
  await pool.query('DELETE FROM validated_exercises');
  await pool.query('DELETE FROM candidate_meanings');
  await pool.query('DELETE FROM candidate_utterances');
  await pool.query('DELETE FROM candidate_rules');
  await pool.query('DELETE FROM candidate_exercises');
  await pool.query('DELETE FROM draft_meanings');
  await pool.query('DELETE FROM draft_utterances');
  await pool.query('DELETE FROM draft_rules');
  await pool.query('DELETE FROM draft_exercises');
  await pool.query('DELETE FROM users WHERE email LIKE $1', ['test-%']);
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
