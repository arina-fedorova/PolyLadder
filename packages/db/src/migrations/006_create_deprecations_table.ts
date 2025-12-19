import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('deprecations', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    item_id: {
      type: 'varchar(100)',
      notNull: true,
    },
    item_type: {
      type: 'varchar(50)',
      notNull: true,
    },
    reason: {
      type: 'text',
      notNull: true,
    },
    replacement_id: {
      type: 'varchar(100)',
    },
    operator_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
    },
    deprecated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createIndex('deprecations', 'item_id');
  pgm.createIndex('deprecations', 'item_type');
  pgm.createIndex('deprecations', 'replacement_id');
  pgm.createIndex('deprecations', 'deprecated_at');
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('deprecations');
}
