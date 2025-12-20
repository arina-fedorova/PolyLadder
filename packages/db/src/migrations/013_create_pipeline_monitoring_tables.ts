import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('pipeline_failures', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    item_id: {
      type: 'uuid',
      notNull: true,
    },
    data_type: {
      type: 'varchar(50)',
      notNull: true,
    },
    state: {
      type: 'varchar(20)',
      notNull: true,
    },
    error_message: {
      type: 'text',
      notNull: true,
    },
    failed_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.createIndex('pipeline_failures', 'item_id', { name: 'idx_pipeline_failures_item' });
  pgm.createIndex('pipeline_failures', 'failed_at', { name: 'idx_pipeline_failures_date' });

  pgm.createTable('review_queue', {
    item_id: {
      type: 'uuid',
      primaryKey: true,
    },
    data_type: {
      type: 'varchar(50)',
      notNull: true,
    },
    queued_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    priority: {
      type: 'integer',
      notNull: true,
      default: 5,
    },
    assigned_to: {
      type: 'uuid',
      references: 'users(id)',
    },
    reviewed_at: {
      type: 'timestamptz',
    },
    review_decision: {
      type: 'varchar(20)',
      check: "review_decision IN ('approve', 'reject', 'revise')",
    },
  });

  pgm.createIndex('review_queue', ['priority', 'queued_at'], { name: 'idx_review_queue_priority' });
  pgm.createIndex('review_queue', 'assigned_to', { name: 'idx_review_queue_assigned' });

  pgm.createTable('pipeline_metrics', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    stage: {
      type: 'varchar(50)',
      notNull: true,
    },
    data_type: {
      type: 'varchar(50)',
      notNull: true,
    },
    items_processed: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    items_failed: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    avg_duration_ms: {
      type: 'integer',
    },
    recorded_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.createIndex('pipeline_metrics', 'recorded_at', { name: 'idx_pipeline_metrics_date' });
  pgm.createIndex('pipeline_metrics', ['stage', 'data_type'], {
    name: 'idx_pipeline_metrics_stage_type',
  });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('pipeline_metrics');
  pgm.dropTable('review_queue');
  pgm.dropTable('pipeline_failures');
}
