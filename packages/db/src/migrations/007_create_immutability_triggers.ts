import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('immutability_violations', {
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
    attempted_operation: {
      type: 'varchar(10)',
      notNull: true,
      check: "attempted_operation IN ('UPDATE', 'DELETE')",
    },
    user_id: {
      type: 'uuid',
    },
    attempted_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createIndex('immutability_violations', 'item_id');
  pgm.createIndex('immutability_violations', 'attempted_at');

  pgm.sql(`
    CREATE OR REPLACE FUNCTION prevent_approved_modification()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'Cannot modify approved data (id: %). Use deprecation instead.', OLD.id;
    END;
    $$ LANGUAGE plpgsql;
  `);

  const approvedTables = [
    'approved_meanings',
    'approved_utterances',
    'approved_rules',
    'approved_exercises',
  ];

  for (const table of approvedTables) {
    pgm.sql(`
      CREATE TRIGGER immutable_${table}_update
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      EXECUTE FUNCTION prevent_approved_modification();
    `);

    pgm.sql(`
      CREATE TRIGGER immutable_${table}_delete
      BEFORE DELETE ON ${table}
      FOR EACH ROW
      EXECUTE FUNCTION prevent_approved_modification();
    `);
  }
}

export function down(pgm: MigrationBuilder): void {
  const approvedTables = [
    'approved_meanings',
    'approved_utterances',
    'approved_rules',
    'approved_exercises',
  ];

  for (const table of approvedTables) {
    pgm.sql(`DROP TRIGGER IF EXISTS immutable_${table}_update ON ${table};`);
    pgm.sql(`DROP TRIGGER IF EXISTS immutable_${table}_delete ON ${table};`);
  }

  pgm.sql('DROP FUNCTION IF EXISTS prevent_approved_modification();');
  pgm.dropTable('immutability_violations');
}
