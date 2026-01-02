import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();

  // Grammar exercises table
  pgm.createTable('grammar_exercises', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    grammar_rule_id: {
      type: 'varchar(100)',
      notNull: true,
      references: 'approved_rules(id)',
      onDelete: 'CASCADE',
    },
    exercise_type: {
      type: 'varchar(20)',
      notNull: true,
      check:
        "exercise_type IN ('fill_blank', 'transformation', 'multiple_choice', 'reorder', 'error_correction')",
    },
    difficulty: {
      type: 'integer',
      notNull: true,
      check: 'difficulty >= 1 AND difficulty <= 5',
    },
    prompt: {
      type: 'text',
      notNull: true,
    },
    sentence_text: {
      type: 'text',
      notNull: true,
    },
    correct_answer: {
      type: 'jsonb',
      notNull: true,
    },
    distractors: {
      type: 'jsonb',
      notNull: false,
    },
    explanation: {
      type: 'text',
      notNull: true,
    },
    hint: {
      type: 'text',
      notNull: false,
    },
    audio_url: {
      type: 'varchar(500)',
      notNull: false,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createIndex('grammar_exercises', ['grammar_rule_id']);
  pgm.createIndex('grammar_exercises', ['exercise_type']);
  pgm.createIndex('grammar_exercises', ['difficulty']);
  pgm.createIndex('grammar_exercises', ['grammar_rule_id', 'difficulty']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();

  pgm.dropTable('grammar_exercises');
}
