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
    `INSERT INTO users (id, email, password_hash, role, base_language, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [id, email, passwordHash, role, 'EN']
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
  }
): Promise<string> {
  await pool.query(
    `INSERT INTO review_queue (item_id, data_type, priority, queued_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
    [data.itemId, data.tableName, data.priority ?? 5]
  );
  return data.itemId;
}

export async function insertPipelineFailure(
  pool: Pool,
  data: {
    itemId: string;
    tableName: string;
    stage: string;
    errorMessage: string;
  }
): Promise<string> {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO pipeline_failures (id, item_id, data_type, state, error_message, failed_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
    [id, data.itemId, data.tableName, data.stage, data.errorMessage]
  );
  return id;
}

export async function insertValidatedItem(
  pool: Pool,
  data: {
    id?: string;
    dataType?: string;
    candidateId?: string;
    validatedData?: Record<string, unknown>;
  } = {}
): Promise<string> {
  const id = data.id ?? uuidv4();
  const candidateId = data.candidateId ?? uuidv4();
  const dataType = data.dataType ?? 'meaning';
  const validatedData = data.validatedData ?? {
    id: id,
    word: 'test',
    definition: 'a test definition',
    language: 'EN',
    level: 'A1',
  };

  // First create a dummy draft and candidate
  await pool.query(
    `INSERT INTO drafts (id, data_type, raw_data, source, created_at)
     VALUES ($1, $2, $3, 'test', CURRENT_TIMESTAMP)`,
    [candidateId, dataType, JSON.stringify(validatedData)]
  );

  await pool.query(
    `INSERT INTO candidates (id, data_type, normalized_data, draft_id, created_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
    [candidateId, dataType, JSON.stringify(validatedData), candidateId]
  );

  await pool.query(
    `INSERT INTO validated (id, data_type, validated_data, candidate_id, validation_results, created_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
    [id, dataType, JSON.stringify(validatedData), candidateId, JSON.stringify({ passed: true })]
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
    `INSERT INTO service_state (service_name, state, last_checkpoint)
     VALUES ($1, $2, $3)
     ON CONFLICT (service_name) DO UPDATE SET last_checkpoint = $3`,
    [data.serviceName, '{}', data.lastCheckpoint ?? new Date()]
  );
}
