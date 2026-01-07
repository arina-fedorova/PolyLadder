import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createType('mapping_status_enum', [
    'pending',
    'auto_mapped',
    'confirmed',
    'rejected',
    'manual',
  ]);

  pgm.createTable('content_topic_mappings', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    chunk_id: {
      type: 'uuid',
      notNull: true,
      references: 'raw_content_chunks(id)',
      onDelete: 'CASCADE',
    },
    topic_id: {
      type: 'uuid',
      notNull: true,
      references: 'curriculum_topics(id)',
      onDelete: 'CASCADE',
    },
    confidence_score: {
      type: 'decimal(3, 2)',
      notNull: true,
    },
    status: {
      type: 'mapping_status_enum',
      notNull: true,
      default: 'pending',
    },
    llm_reasoning: {
      type: 'text',
    },
    confirmed_by: {
      type: 'uuid',
      references: 'users(id)',
    },
    confirmed_at: {
      type: 'timestamp with time zone',
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.addConstraint('content_topic_mappings', 'content_topic_mappings_chunk_topic_unique', {
    unique: ['chunk_id', 'topic_id'],
  });

  pgm.createIndex('content_topic_mappings', 'chunk_id');
  pgm.createIndex('content_topic_mappings', 'topic_id');
  pgm.createIndex('content_topic_mappings', 'status');

  pgm.createTable('transformation_jobs', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    mapping_id: {
      type: 'uuid',
      notNull: true,
      references: 'content_topic_mappings(id)',
      onDelete: 'CASCADE',
    },
    status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'pending',
    },
    prompt_used: {
      type: 'text',
    },
    raw_response: {
      type: 'text',
    },
    parsed_result: {
      type: 'jsonb',
    },
    tokens_input: {
      type: 'integer',
    },
    tokens_output: {
      type: 'integer',
    },
    cost_usd: {
      type: 'decimal(10, 6)',
    },
    duration_ms: {
      type: 'integer',
    },
    error_message: {
      type: 'text',
    },
    retry_count: {
      type: 'integer',
      default: 0,
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    completed_at: {
      type: 'timestamp with time zone',
    },
  });

  pgm.createIndex('transformation_jobs', 'mapping_id');
  pgm.createIndex('transformation_jobs', 'status');

  pgm.addColumn('drafts', {
    document_id: {
      type: 'uuid',
      references: 'document_sources(id)',
      onDelete: 'SET NULL',
    },
    chunk_id: {
      type: 'uuid',
      references: 'raw_content_chunks(id)',
      onDelete: 'SET NULL',
    },
    topic_id: {
      type: 'uuid',
      references: 'curriculum_topics(id)',
      onDelete: 'SET NULL',
    },
    transformation_job_id: {
      type: 'uuid',
      references: 'transformation_jobs(id)',
      onDelete: 'SET NULL',
    },
  });

  pgm.sql(`
    CREATE VIEW transformation_cost_summary AS
    SELECT
      DATE(created_at) as date,
      COUNT(*) as total_jobs,
      SUM(tokens_input) as total_input_tokens,
      SUM(tokens_output) as total_output_tokens,
      SUM(cost_usd) as total_cost_usd,
      AVG(duration_ms) as avg_duration_ms
    FROM transformation_jobs
    WHERE status = 'completed'
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql('DROP VIEW IF EXISTS transformation_cost_summary');

  pgm.dropColumn('drafts', ['document_id', 'chunk_id', 'topic_id', 'transformation_job_id']);

  pgm.dropTable('transformation_jobs');
  pgm.dropTable('content_topic_mappings');
  pgm.dropType('mapping_status_enum');
}

