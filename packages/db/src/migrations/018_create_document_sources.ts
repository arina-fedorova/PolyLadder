import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createType('document_status_enum', ['pending', 'extracting', 'chunking', 'ready', 'error']);

  pgm.createType('document_type_enum', [
    'textbook',
    'grammar_guide',
    'vocabulary_list',
    'dialogue_corpus',
    'exercise_book',
    'other',
  ]);

  pgm.createTable('document_sources', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    filename: {
      type: 'varchar(500)',
      notNull: true,
    },
    original_filename: {
      type: 'varchar(500)',
      notNull: true,
    },
    mime_type: {
      type: 'varchar(100)',
      notNull: true,
    },
    file_size_bytes: {
      type: 'bigint',
      notNull: true,
    },
    storage_path: {
      type: 'varchar(1000)',
      notNull: true,
    },
    language: {
      type: 'varchar(2)',
      notNull: true,
      check: "language IN ('EN', 'IT', 'PT', 'SL', 'ES')",
    },
    target_level: {
      type: 'varchar(2)',
      check: "target_level IN ('A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2')",
    },
    document_type: {
      type: 'document_type_enum',
      notNull: true,
      default: pgm.func("'other'::document_type_enum"),
    },
    title: {
      type: 'varchar(500)',
    },
    description: {
      type: 'text',
    },
    source_info: {
      type: 'text',
    },
    status: {
      type: 'document_status_enum',
      notNull: true,
      default: pgm.func("'pending'::document_status_enum"),
    },
    error_message: {
      type: 'text',
    },
    total_pages: {
      type: 'integer',
    },
    processed_pages: {
      type: 'integer',
      default: 0,
    },
    total_chunks: {
      type: 'integer',
      default: 0,
    },
    uploaded_by: {
      type: 'uuid',
      references: 'users(id)',
    },
    uploaded_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    processed_at: {
      type: 'timestamp with time zone',
    },
    metadata: {
      type: 'jsonb',
      default: pgm.func("'{}'::jsonb"),
    },
  });

  pgm.createIndex('document_sources', 'language');
  pgm.createIndex('document_sources', 'status');
  pgm.createIndex('document_sources', 'uploaded_at');

  pgm.createType('chunk_type_enum', [
    'vocabulary_section',
    'grammar_explanation',
    'dialogue',
    'exercise',
    'reading_passage',
    'cultural_note',
    'unknown',
  ]);

  pgm.createTable('raw_content_chunks', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    document_id: {
      type: 'uuid',
      notNull: true,
      references: 'document_sources(id)',
      onDelete: 'CASCADE',
    },
    chunk_index: {
      type: 'integer',
      notNull: true,
    },
    page_number: {
      type: 'integer',
    },
    raw_text: {
      type: 'text',
      notNull: true,
    },
    cleaned_text: {
      type: 'text',
    },
    chunk_type: {
      type: 'chunk_type_enum',
      notNull: true,
      default: pgm.func("'unknown'::chunk_type_enum"),
    },
    confidence_score: {
      type: 'decimal(3, 2)',
    },
    word_count: {
      type: 'integer',
    },
    char_count: {
      type: 'integer',
    },
    metadata: {
      type: 'jsonb',
      default: pgm.func("'{}'::jsonb"),
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.addConstraint('raw_content_chunks', 'raw_content_chunks_document_index_unique', {
    unique: ['document_id', 'chunk_index'],
  });

  pgm.createIndex('raw_content_chunks', 'document_id');
  pgm.createIndex('raw_content_chunks', 'chunk_type');

  pgm.createTable('document_processing_log', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    document_id: {
      type: 'uuid',
      notNull: true,
      references: 'document_sources(id)',
      onDelete: 'CASCADE',
    },
    step: {
      type: 'varchar(100)',
      notNull: true,
    },
    status: {
      type: 'varchar(50)',
      notNull: true,
    },
    message: {
      type: 'text',
    },
    duration_ms: {
      type: 'integer',
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.createIndex('document_processing_log', 'document_id');
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('document_processing_log');
  pgm.dropTable('raw_content_chunks');
  pgm.dropTable('document_sources');
  pgm.dropType('chunk_type_enum');
  pgm.dropType('document_type_enum');
  pgm.dropType('document_status_enum');
}
