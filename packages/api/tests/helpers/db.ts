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

export async function createTestDocument(
  pool: Pool,
  overrides: {
    id?: string;
    uploadedBy: string;
    filename?: string;
    language?: string;
    targetLevel?: string;
    status?: string;
  }
): Promise<{ id: string; original_filename: string }> {
  const id = overrides.id ?? uuidv4();
  const filename = overrides.filename ?? `test-doc-${id}.pdf`;
  const language = overrides.language ?? 'EN';
  const targetLevel = overrides.targetLevel ?? 'A1';
  const status = overrides.status ?? 'pending';

  await pool.query(
    `INSERT INTO document_sources
     (id, original_filename, storage_path, language, target_level, document_type, status, uploaded_by, created_at)
     VALUES ($1, $2, $3, $4, $5, 'textbook', $6, $7, CURRENT_TIMESTAMP)`,
    [id, filename, `/test/${filename}`, language, targetLevel, status, overrides.uploadedBy]
  );

  return { id, original_filename: filename };
}

export async function createTestChunk(
  pool: Pool,
  data: {
    id?: string;
    documentId: string;
    text?: string;
  }
): Promise<{ id: string }> {
  const id = data.id ?? uuidv4();
  const text = data.text ?? 'Test chunk text content';

  await pool.query(
    `INSERT INTO raw_content_chunks
     (id, document_id, chunk_index, text_content, created_at)
     VALUES ($1, $2, 0, $3, CURRENT_TIMESTAMP)`,
    [id, data.documentId, text]
  );

  return { id };
}

export async function createTestTopic(
  pool: Pool,
  data: {
    id?: string;
    levelId: string;
    name?: string;
  }
): Promise<{ id: string }> {
  const id = data.id ?? uuidv4();
  const name = data.name ?? 'Test Topic';

  await pool.query(
    `INSERT INTO curriculum_topics
     (id, level_id, name, description, content_type, estimated_items, created_at)
     VALUES ($1, $2, $3, 'Test description', 'vocabulary', 10, CURRENT_TIMESTAMP)`,
    [id, data.levelId, name]
  );

  return { id };
}

export async function createTestMapping(
  pool: Pool,
  data: {
    id?: string;
    chunkId: string;
    topicId: string;
    status?: string;
  }
): Promise<{ id: string }> {
  const id = data.id ?? uuidv4();
  const status = data.status ?? 'auto_mapped';

  await pool.query(
    `INSERT INTO content_topic_mappings
     (id, chunk_id, topic_id, confidence_score, status, created_at)
     VALUES ($1, $2, $3, 0.95, $4, CURRENT_TIMESTAMP)`,
    [id, data.chunkId, data.topicId, status]
  );

  return { id };
}
