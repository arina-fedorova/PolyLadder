import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  role: 'learner' | 'operator';
}

export async function createTestUser(
  pool: Pool,
  overrides: Partial<TestUser> = {}
): Promise<TestUser> {
  const id = overrides.id ?? uuidv4();
  const email = overrides.email ?? `test-${id}@example.com`;
  const password = overrides.password ?? 'TestPassword123!';
  const role = overrides.role ?? 'learner';

  const passwordHash = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [id, email, passwordHash, role]
  );

  return { id, email, password, role };
}

export async function createTestOperator(
  pool: Pool,
  overrides: Partial<TestUser> = {}
): Promise<TestUser> {
  return createTestUser(pool, { ...overrides, role: 'operator' });
}

export async function createTestLearner(
  pool: Pool,
  overrides: Partial<TestUser> = {}
): Promise<TestUser> {
  return createTestUser(pool, { ...overrides, role: 'learner' });
}

export async function insertReviewQueueItem(
  pool: Pool,
  data: {
    itemId: string;
    tableName: string;
    priority?: number;
    reason?: string;
  }
): Promise<string> {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO review_queue (id, item_id, table_name, priority, reason, queued_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
    [id, data.itemId, data.tableName, data.priority ?? 5, data.reason ?? null]
  );
  return id;
}

export async function insertPipelineFailure(
  pool: Pool,
  data: {
    itemId: string;
    tableName: string;
    stage: string;
    errorMessage: string;
    retryCount?: number;
  }
): Promise<string> {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO pipeline_failures (id, item_id, table_name, stage, error_message, retry_count, failed_at)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
    [id, data.itemId, data.tableName, data.stage, data.errorMessage, data.retryCount ?? 0]
  );
  return id;
}

export async function insertValidatedMeaning(
  pool: Pool,
  data: {
    id?: string;
    language?: string;
    level?: string;
    word?: string;
    definition?: string;
  } = {}
): Promise<string> {
  const id = data.id ?? uuidv4();
  await pool.query(
    `INSERT INTO validated_meanings (id, language, level, word, definition, data, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      id,
      data.language ?? 'EN',
      data.level ?? 'A1',
      data.word ?? 'test',
      data.definition ?? 'a test definition',
      JSON.stringify({
        word: data.word ?? 'test',
        definition: data.definition ?? 'a test definition',
      }),
    ]
  );
  return id;
}

export async function insertServiceState(
  pool: Pool,
  data: {
    serviceName: string;
    lastCheckpoint?: Date;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO service_state (service_name, last_checkpoint, last_processed_id)
     VALUES ($1, $2, NULL)
     ON CONFLICT (service_name) DO UPDATE SET last_checkpoint = $2`,
    [data.serviceName, data.lastCheckpoint ?? new Date()]
  );
}
