import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();

  // Create mixed_practice_sessions table
  pgm.createTable('mixed_practice_sessions', {
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
    languages: {
      type: 'varchar(20)[]',
      notNull: true,
    },
    mixing_strategy: {
      type: 'varchar(20)',
      notNull: true,
      check: "mixing_strategy IN ('equal', 'weighted', 'random')",
    },
    total_items: {
      type: 'integer',
      notNull: true,
    },
    completed_items: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    switching_efficiency: {
      type: 'float',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    completed_at: {
      type: 'timestamp',
    },
  });

  // Create mixed_session_attempts table
  pgm.createTable('mixed_session_attempts', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    session_id: {
      type: 'uuid',
      notNull: true,
      references: 'mixed_practice_sessions(id)',
      onDelete: 'CASCADE',
    },
    item_id: {
      type: 'varchar(100)',
      notNull: true,
    },
    item_type: {
      type: 'varchar(50)',
      notNull: true,
    },
    language: {
      type: 'varchar(20)',
      notNull: true,
    },
    previous_language: {
      type: 'varchar(20)',
    },
    is_correct: {
      type: 'boolean',
      notNull: true,
    },
    time_spent: {
      type: 'integer',
      notNull: true,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Create indexes for efficient querying
  pgm.createIndex('mixed_practice_sessions', 'user_id');
  pgm.createIndex('mixed_practice_sessions', 'created_at');
  pgm.createIndex('mixed_practice_sessions', ['user_id', 'created_at']);

  pgm.createIndex('mixed_session_attempts', 'session_id');
  pgm.createIndex('mixed_session_attempts', ['session_id', 'language']);
  pgm.createIndex('mixed_session_attempts', ['session_id', 'created_at']);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('mixed_session_attempts');
  pgm.dropTable('mixed_practice_sessions');
}
