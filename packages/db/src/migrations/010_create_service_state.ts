import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('service_state', {
    service_name: {
      type: 'varchar(100)',
      primaryKey: true,
    },
    state: {
      type: 'jsonb',
      notNull: true,
    },
    last_checkpoint: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('service_state', ['last_checkpoint']);

  pgm.createTable('service_errors', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    service_name: {
      type: 'varchar(100)',
      notNull: true,
    },
    error_message: {
      type: 'text',
      notNull: true,
    },
    error_stack: {
      type: 'text',
    },
    metadata: {
      type: 'jsonb',
      default: "'{}'::jsonb",
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('service_errors', ['service_name']);
  pgm.createIndex('service_errors', ['created_at']);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('service_errors');
  pgm.dropTable('service_state');
}
