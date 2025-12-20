import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();

  // User languages tracking
  pgm.createTable('user_languages', {
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
    started_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    orthography_completed: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    orthography_accuracy: {
      type: 'decimal(5,2)',
      notNull: false,
    },
    current_unit: {
      type: 'varchar(100)',
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

  pgm.createIndex('user_languages', ['user_id', 'language'], { unique: true });
  pgm.createIndex('user_languages', ['user_id']);

  // User exercise results for analytics
  pgm.createTable('user_exercise_results', {
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
    exercise_id: {
      type: 'uuid',
      notNull: true,
    },
    language: {
      type: 'varchar(2)',
      notNull: true,
    },
    exercise_type: {
      type: 'varchar(50)',
      notNull: true,
    },
    correct: {
      type: 'boolean',
      notNull: true,
    },
    time_spent_ms: {
      type: 'integer',
      notNull: false,
    },
    user_answer: {
      type: 'text',
      notNull: false,
    },
    submitted_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createIndex('user_exercise_results', ['user_id']);
  pgm.createIndex('user_exercise_results', ['exercise_id']);
  pgm.createIndex('user_exercise_results', ['user_id', 'language']);
  pgm.createIndex('user_exercise_results', ['submitted_at']);

  // View for exercise accuracy per user
  pgm.sql(`
    CREATE VIEW user_exercise_accuracy AS
    SELECT
      user_id,
      language,
      exercise_type,
      COUNT(*) as total_attempts,
      COUNT(*) FILTER (WHERE correct = true) as correct_attempts,
      ROUND(100.0 * COUNT(*) FILTER (WHERE correct = true) / NULLIF(COUNT(*), 0), 1) as accuracy_pct
    FROM user_exercise_results
    GROUP BY user_id, language, exercise_type
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();

  pgm.sql('DROP VIEW IF EXISTS user_exercise_accuracy');
  pgm.dropTable('user_exercise_results');
  pgm.dropTable('user_languages');
}
