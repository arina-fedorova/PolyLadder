import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();

  // Grammar progress tracking table
  pgm.createTable('grammar_progress', {
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
    grammar_id: {
      type: 'varchar(100)',
      notNull: true,
      references: 'approved_rules(id)',
      onDelete: 'CASCADE',
    },
    language: {
      type: 'varchar(5)',
      notNull: true,
    },
    // Progress metrics
    is_completed: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    mastery_level: {
      type: 'integer',
      notNull: true,
      default: 0,
      check: 'mastery_level >= 0 AND mastery_level <= 100',
    },
    practice_count: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    correct_count: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    // Timestamps
    first_practiced: {
      type: 'timestamp',
      notNull: false,
    },
    last_practiced: {
      type: 'timestamp',
      notNull: false,
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

  // Unique constraint on user_id + grammar_id
  pgm.addConstraint('grammar_progress', 'grammar_progress_user_grammar_unique', {
    unique: ['user_id', 'grammar_id'],
  });

  // Indexes for common queries
  pgm.createIndex('grammar_progress', ['user_id', 'language']);
  pgm.createIndex('grammar_progress', ['user_id', 'is_completed']);
  pgm.createIndex('grammar_progress', ['user_id', 'mastery_level']);
  pgm.createIndex('grammar_progress', ['grammar_id']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();

  pgm.dropTable('grammar_progress');
}
