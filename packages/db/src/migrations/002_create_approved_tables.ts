import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('approved_meanings', {
    id: {
      type: 'varchar(100)',
      primaryKey: true,
    },
    level: {
      type: 'varchar(2)',
      notNull: true,
      check: "level IN ('A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2')",
    },
    tags: {
      type: 'jsonb',
      notNull: true,
      default: '[]',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createTable('approved_utterances', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    meaning_id: {
      type: 'varchar(100)',
      notNull: true,
      references: 'approved_meanings(id)',
    },
    language: {
      type: 'varchar(2)',
      notNull: true,
      check: "language IN ('EN', 'IT', 'PT', 'SL', 'ES')",
    },
    text: {
      type: 'text',
      notNull: true,
    },
    register: {
      type: 'varchar(20)',
      notNull: false,
    },
    usage_notes: {
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

  pgm.createTable('approved_rules', {
    id: {
      type: 'varchar(100)',
      primaryKey: true,
    },
    language: {
      type: 'varchar(2)',
      notNull: true,
      check: "language IN ('EN', 'IT', 'PT', 'SL', 'ES')",
    },
    level: {
      type: 'varchar(2)',
      notNull: true,
    },
    category: {
      type: 'varchar(50)',
      notNull: true,
    },
    title: {
      type: 'text',
      notNull: true,
    },
    explanation: {
      type: 'text',
      notNull: true,
    },
    examples: {
      type: 'jsonb',
      notNull: true,
      default: '[]',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createTable('approved_exercises', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    type: {
      type: 'varchar(20)',
      notNull: true,
      check: "type IN ('flashcard', 'multiple_choice', 'cloze', 'translation', 'dictation')",
    },
    level: {
      type: 'varchar(2)',
      notNull: true,
    },
    languages: {
      type: 'jsonb',
      notNull: true,
    },
    prompt: {
      type: 'text',
      notNull: true,
    },
    correct_answer: {
      type: 'text',
      notNull: true,
    },
    options: {
      type: 'jsonb',
      notNull: false,
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

  pgm.createTable('curriculum_graph', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    concept_id: {
      type: 'varchar(100)',
      notNull: true,
      unique: true,
    },
    concept_type: {
      type: 'varchar(20)',
      notNull: true,
      check: "concept_type IN ('orthography', 'grammar', 'meaning', 'exercise_bundle')",
    },
    language: {
      type: 'varchar(2)',
      notNull: false,
    },
    prerequisites: {
      type: 'jsonb',
      notNull: true,
      default: '[]',
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

  pgm.createIndex('approved_utterances', ['meaning_id']);
  pgm.createIndex('approved_utterances', ['language']);
  pgm.createIndex('approved_rules', ['language', 'level']);
  pgm.createIndex('approved_exercises', ['type', 'level']);
  pgm.createIndex('curriculum_graph', ['concept_id']);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('curriculum_graph');
  pgm.dropTable('approved_exercises');
  pgm.dropTable('approved_rules');
  pgm.dropTable('approved_utterances');
  pgm.dropTable('approved_meanings');
}
