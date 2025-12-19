import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('user_preferences', {
    user_id: {
      type: 'uuid',
      primaryKey: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    studied_languages: {
      type: 'jsonb',
      notNull: true,
      default: '[]',
    },
    focus_mode_enabled: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    focus_language: {
      type: 'varchar(2)',
      notNull: false,
    },
    onboarding_completed: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    settings: {
      type: 'jsonb',
      notNull: true,
      default: '{}',
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createTable('user_progress', {
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
    concept_id: {
      type: 'varchar(100)',
      notNull: true,
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      check: "status IN ('not_started', 'in_progress', 'completed')",
    },
    completion_date: {
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

  pgm.createTable('user_vocabulary', {
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
    word: {
      type: 'varchar(100)',
      notNull: true,
    },
    language: {
      type: 'varchar(2)',
      notNull: true,
    },
    state: {
      type: 'varchar(20)',
      notNull: true,
      check: "state IN ('unknown', 'learning', 'known')",
    },
    first_seen: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    last_reviewed: {
      type: 'timestamp',
      notNull: false,
    },
    review_count: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createTable('user_srs_schedule', {
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
    item_type: {
      type: 'varchar(20)',
      notNull: true,
      check: "item_type IN ('vocabulary', 'grammar', 'sentence', 'exercise')",
    },
    item_id: {
      type: 'varchar(100)',
      notNull: true,
    },
    due_date: {
      type: 'timestamp',
      notNull: true,
    },
    interval_days: {
      type: 'integer',
      notNull: true,
      default: 1,
    },
    ease_factor: {
      type: 'decimal(3,2)',
      notNull: true,
      default: 2.5,
    },
    repetitions: {
      type: 'integer',
      notNull: true,
      default: 0,
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

  pgm.createTable('user_statistics', {
    user_id: {
      type: 'uuid',
      primaryKey: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    total_study_time_minutes: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    exercises_completed: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    current_streak_days: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    longest_streak_days: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    last_study_date: {
      type: 'date',
      notNull: false,
    },
    achievements: {
      type: 'jsonb',
      notNull: true,
      default: '[]',
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createIndex('user_progress', ['user_id', 'concept_id'], { unique: true });
  pgm.createIndex('user_vocabulary', ['user_id', 'word', 'language'], {
    unique: true,
  });
  pgm.createIndex('user_vocabulary', ['user_id', 'state']);
  pgm.createIndex('user_srs_schedule', ['user_id', 'due_date']);
  pgm.createIndex('user_srs_schedule', ['user_id', 'item_type', 'item_id'], {
    unique: true,
  });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('user_statistics');
  pgm.dropTable('user_srs_schedule');
  pgm.dropTable('user_vocabulary');
  pgm.dropTable('user_progress');
  pgm.dropTable('user_preferences');
}
