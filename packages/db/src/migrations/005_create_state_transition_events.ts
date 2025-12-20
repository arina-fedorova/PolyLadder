import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('state_transition_events', {
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
      type: 'varchar(50)',
      notNull: true,
    },
    from_state: {
      type: 'varchar(20)',
      notNull: true,
      check: "from_state IN ('DRAFT', 'CANDIDATE', 'VALIDATED', 'APPROVED')",
    },
    to_state: {
      type: 'varchar(20)',
      notNull: true,
      check: "to_state IN ('DRAFT', 'CANDIDATE', 'VALIDATED', 'APPROVED')",
    },
    metadata: {
      type: 'jsonb',
      notNull: true,
      default: '{}',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createIndex('state_transition_events', 'item_id');
  pgm.createIndex('state_transition_events', 'item_type');
  pgm.createIndex('state_transition_events', 'to_state');
  pgm.createIndex('state_transition_events', 'created_at');
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('state_transition_events');
}
