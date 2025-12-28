import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('pipeline_tasks', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    item_id: {
      type: 'uuid',
      notNull: true,
    },
    item_type: {
      type: 'varchar(20)',
      notNull: true,
      check: "item_type IN ('draft', 'candidate', 'validated')",
    },
    data_type: {
      type: 'varchar(20)',
      notNull: true,
      check: "data_type IN ('meaning', 'utterance', 'rule', 'exercise')",
    },
    current_status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'pending',
    },
    current_stage: {
      type: 'varchar(20)',
      notNull: true,
      check: "current_stage IN ('DRAFT', 'CANDIDATE', 'VALIDATED', 'APPROVED')",
    },
    source: {
      type: 'varchar(100)',
    },
    document_id: {
      type: 'uuid',
      references: 'document_sources(id)',
      onDelete: 'SET NULL',
    },
    chunk_id: {
      type: 'uuid',
      references: 'raw_content_chunks(id)',
      onDelete: 'SET NULL',
    },
    topic_id: {
      type: 'uuid',
      references: 'curriculum_topics(id)',
      onDelete: 'SET NULL',
    },
    mapping_id: {
      type: 'uuid',
      references: 'content_topic_mappings(id)',
      onDelete: 'SET NULL',
    },
    error_message: {
      type: 'text',
    },
    retry_count: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    metadata: {
      type: 'jsonb',
      default: '{}',
    },
  });

  pgm.createTable('pipeline_events', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    task_id: {
      type: 'uuid',
      references: 'pipeline_tasks(id)',
      onDelete: 'CASCADE',
    },
    item_id: {
      type: 'uuid',
      notNull: true,
    },
    item_type: {
      type: 'varchar(20)',
      notNull: true,
    },
    event_type: {
      type: 'varchar(100)',
      notNull: true,
    },
    stage: {
      type: 'varchar(20)',
    },
    status: {
      type: 'varchar(50)',
    },
    from_stage: {
      type: 'varchar(20)',
    },
    to_stage: {
      type: 'varchar(20)',
    },
    from_status: {
      type: 'varchar(50)',
    },
    to_status: {
      type: 'varchar(50)',
    },
    success: {
      type: 'boolean',
    },
    error_message: {
      type: 'text',
    },
    duration_ms: {
      type: 'integer',
    },
    payload: {
      type: 'jsonb',
      default: '{}',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createIndex('pipeline_tasks', 'item_id');
  pgm.createIndex('pipeline_tasks', 'item_type');
  pgm.createIndex('pipeline_tasks', 'current_status');
  pgm.createIndex('pipeline_tasks', 'current_stage');
  pgm.createIndex('pipeline_tasks', 'data_type');
  pgm.createIndex('pipeline_tasks', 'document_id');
  pgm.createIndex('pipeline_tasks', 'topic_id');
  pgm.createIndex('pipeline_tasks', 'created_at');
  pgm.createIndex('pipeline_tasks', ['current_stage', 'current_status']);

  pgm.createIndex('pipeline_events', 'task_id');
  pgm.createIndex('pipeline_events', 'item_id');
  pgm.createIndex('pipeline_events', 'item_type');
  pgm.createIndex('pipeline_events', 'event_type');
  pgm.createIndex('pipeline_events', 'stage');
  pgm.createIndex('pipeline_events', 'created_at');
  pgm.createIndex('pipeline_events', ['item_id', 'item_type', 'created_at']);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('pipeline_events');
  pgm.dropTable('pipeline_tasks');
}

