import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('user_orthography_gates', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    language: {
      type: 'varchar(2)',
      notNull: true,
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      check: "status IN ('locked', 'unlocked', 'completed')",
      default: 'locked',
    },
    completed_at: {
      type: 'timestamp',
      notNull: false,
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
  });

  pgm.addConstraint('user_orthography_gates', 'user_orthography_gates_unique', {
    unique: ['user_id', 'language'],
  });

  pgm.createIndex('user_orthography_gates', 'user_id');
  pgm.createIndex('user_orthography_gates', 'status');
  pgm.createIndex('user_orthography_gates', ['user_id', 'language']);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('user_orthography_gates');
}
