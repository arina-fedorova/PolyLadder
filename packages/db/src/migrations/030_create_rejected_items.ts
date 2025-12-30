import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('rejected_items', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    validated_id: {
      type: 'uuid',
      notNull: true,
      references: 'validated(id)',
      onDelete: 'CASCADE',
    },
    data_type: {
      type: 'varchar(50)',
      notNull: true,
    },
    operator_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
    },
    reason: {
      type: 'text',
      notNull: true,
    },
    rejected_data: {
      type: 'jsonb',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.createIndex('rejected_items', 'validated_id', { unique: true });
  pgm.createIndex('rejected_items', 'data_type');
  pgm.createIndex('rejected_items', 'operator_id');
  pgm.createIndex('rejected_items', 'created_at');
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('rejected_items');
}
