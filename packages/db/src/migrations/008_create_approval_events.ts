import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('approval_events', {
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
    operator_id: {
      type: 'uuid',
      references: 'users(id)',
    },
    approval_type: {
      type: 'varchar(20)',
      notNull: true,
      check: "approval_type IN ('MANUAL', 'AUTOMATIC')",
    },
    notes: {
      type: 'text',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createIndex('approval_events', 'item_id');
  pgm.createIndex('approval_events', 'item_type');
  pgm.createIndex('approval_events', 'operator_id');
  pgm.createIndex('approval_events', 'approval_type');
  pgm.createIndex('approval_events', 'created_at');
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('approval_events');
}
