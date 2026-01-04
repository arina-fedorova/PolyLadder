import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();

  // Reading passages table
  pgm.createTable('approved_reading_passages', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    title: {
      type: 'varchar(200)',
      notNull: true,
    },
    text: {
      type: 'text',
      notNull: true,
    },
    language: {
      type: 'varchar(5)',
      notNull: true,
    },
    cefr_level: {
      type: 'varchar(5)',
      notNull: true,
      check: "cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')",
    },
    word_count: {
      type: 'integer',
      notNull: true,
    },
    source: {
      type: 'varchar(500)',
      notNull: false,
    },
    audio_url: {
      type: 'varchar(500)',
      notNull: false,
    },
    topic: {
      type: 'varchar(100)',
      notNull: false,
    },
    metadata: {
      type: 'jsonb',
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

  pgm.createIndex('approved_reading_passages', ['language', 'cefr_level']);
  pgm.createIndex('approved_reading_passages', ['language']);
  pgm.createIndex('approved_reading_passages', ['cefr_level']);

  // Vocabulary hints for reading passages
  pgm.createTable('reading_vocabulary_hints', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    reading_passage_id: {
      type: 'uuid',
      notNull: true,
      references: 'approved_reading_passages(id)',
      onDelete: 'CASCADE',
    },
    word: {
      type: 'varchar(100)',
      notNull: true,
    },
    definition: {
      type: 'text',
      notNull: true,
    },
    position: {
      type: 'integer',
      notNull: true,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createIndex('reading_vocabulary_hints', ['reading_passage_id']);

  // Comprehension questions for reading passages
  pgm.createTable('reading_comprehension_questions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    reading_passage_id: {
      type: 'uuid',
      notNull: true,
      references: 'approved_reading_passages(id)',
      onDelete: 'CASCADE',
    },
    question_text: {
      type: 'text',
      notNull: true,
    },
    question_type: {
      type: 'varchar(20)',
      notNull: true,
      check: "question_type IN ('factual', 'inferential', 'vocabulary', 'main_idea')",
    },
    options: {
      type: 'jsonb',
      notNull: true,
    },
    correct_answer_index: {
      type: 'integer',
      notNull: true,
    },
    explanation: {
      type: 'text',
      notNull: false,
    },
    display_order: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createIndex('reading_comprehension_questions', ['reading_passage_id']);
  pgm.createIndex('reading_comprehension_questions', ['question_type']);

  // Add reading_passage_id column to user_srs_items for tracking passage reviews
  pgm.addColumn('user_srs_items', {
    reading_passage_id: {
      type: 'uuid',
      notNull: false,
      references: 'approved_reading_passages(id)',
      onDelete: 'CASCADE',
    },
  });

  pgm.createIndex('user_srs_items', ['reading_passage_id'], {
    where: 'reading_passage_id IS NOT NULL',
    name: 'idx_user_srs_items_reading_passage_id',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();

  pgm.dropIndex('user_srs_items', ['reading_passage_id'], {
    name: 'idx_user_srs_items_reading_passage_id',
  });
  pgm.dropColumn('user_srs_items', 'reading_passage_id');
  pgm.dropTable('reading_comprehension_questions');
  pgm.dropTable('reading_vocabulary_hints');
  pgm.dropTable('approved_reading_passages');
}
