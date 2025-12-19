import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('drafts', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    data_type: {
      type: 'varchar(20)',
      notNull: true,
      check: "data_type IN ('meaning', 'utterance', 'rule', 'exercise')",
    },
    raw_data: {
      type: 'jsonb',
      notNull: true,
    },
    source: {
      type: 'varchar(100)',
      notNull: true,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createTable('candidates', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    data_type: {
      type: 'varchar(20)',
      notNull: true,
    },
    normalized_data: {
      type: 'jsonb',
      notNull: true,
    },
    draft_id: {
      type: 'uuid',
      notNull: true,
      references: 'drafts(id)',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createTable('validated', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    data_type: {
      type: 'varchar(20)',
      notNull: true,
    },
    validated_data: {
      type: 'jsonb',
      notNull: true,
    },
    candidate_id: {
      type: 'uuid',
      notNull: true,
      references: 'candidates(id)',
    },
    validation_results: {
      type: 'jsonb',
      notNull: true,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createTable('validation_failures', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    candidate_id: {
      type: 'uuid',
      notNull: true,
      references: 'candidates(id)',
    },
    gate_name: {
      type: 'varchar(100)',
      notNull: true,
    },
    failure_reason: {
      type: 'text',
      notNull: true,
    },
    failure_details: {
      type: 'jsonb',
      notNull: true,
      default: '{}',
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
  });

  pgm.createTable('approval_events', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    validated_id: {
      type: 'uuid',
      notNull: true,
      references: 'validated(id)',
    },
    approved_table: {
      type: 'varchar(50)',
      notNull: true,
    },
    approved_id: {
      type: 'varchar(100)',
      notNull: true,
    },
    operator_id: {
      type: 'uuid',
      notNull: false,
      references: 'users(id)',
    },
    approval_type: {
      type: 'varchar(20)',
      notNull: true,
      check: "approval_type IN ('automatic', 'manual')",
    },
    notes: {
      type: 'text',
      notNull: false,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createTable('service_state', {
    id: {
      type: 'varchar(50)',
      primaryKey: true,
    },
    state_data: {
      type: 'jsonb',
      notNull: true,
      default: '{}',
    },
    last_checkpoint: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createIndex('drafts', 'data_type');
  pgm.createIndex('candidates', 'data_type');
  pgm.createIndex('validated', 'data_type');
  pgm.createIndex('validation_failures', 'candidate_id');
  pgm.createIndex('approval_events', ['approved_table', 'approved_id']);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('service_state');
  pgm.dropTable('approval_events');
  pgm.dropTable('validation_failures');
  pgm.dropTable('validated');
  pgm.dropTable('candidates');
  pgm.dropTable('drafts');
}
