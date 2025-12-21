import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createType('feedback_category_enum', [
    'incorrect_content',
    'wrong_level',
    'poor_quality',
    'missing_context',
    'grammatical_error',
    'inappropriate',
    'duplicate',
    'off_topic',
    'other',
  ]);

  pgm.createTable('operator_feedback', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    item_id: {
      type: 'uuid',
      notNull: true,
    },
    item_type: {
      type: 'varchar(50)',
      notNull: true,
    },
    operator_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
    },
    action: {
      type: 'varchar(20)',
      notNull: true,
    },
    category: {
      type: 'feedback_category_enum',
      notNull: true,
    },
    comment: {
      type: 'text',
      notNull: true,
    },
    suggested_correction: {
      type: 'text',
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.addConstraint('operator_feedback', 'operator_feedback_action_check', {
    check: "action IN ('reject', 'revise', 'flag')",
  });

  pgm.createIndex('operator_feedback', 'item_id');
  pgm.createIndex('operator_feedback', 'operator_id');
  pgm.createIndex('operator_feedback', 'category');
  pgm.createIndex('operator_feedback', 'created_at');

  pgm.createTable('item_versions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    item_id: {
      type: 'uuid',
      notNull: true,
    },
    item_type: {
      type: 'varchar(50)',
      notNull: true,
    },
    version_number: {
      type: 'integer',
      notNull: true,
    },
    data: {
      type: 'jsonb',
      notNull: true,
    },
    source: {
      type: 'varchar(100)',
    },
    feedback_id: {
      type: 'uuid',
      references: 'operator_feedback(id)',
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.addConstraint('item_versions', 'item_versions_item_version_unique', {
    unique: ['item_id', 'version_number'],
  });

  pgm.createIndex('item_versions', 'item_id');

  pgm.createTable('feedback_templates', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: {
      type: 'varchar(200)',
      notNull: true,
    },
    category: {
      type: 'feedback_category_enum',
      notNull: true,
    },
    template_text: {
      type: 'text',
      notNull: true,
    },
    use_count: {
      type: 'integer',
      default: 0,
    },
    created_by: {
      type: 'uuid',
      references: 'users(id)',
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.addConstraint('feedback_templates', 'feedback_templates_name_unique', {
    unique: ['name'],
  });

  pgm.createIndex('feedback_templates', 'category');

  pgm.createTable('retry_queue', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    item_id: {
      type: 'uuid',
      notNull: true,
    },
    item_type: {
      type: 'varchar(50)',
      notNull: true,
    },
    feedback_id: {
      type: 'uuid',
      notNull: true,
      references: 'operator_feedback(id)',
    },
    status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'pending',
    },
    retry_count: {
      type: 'integer',
      default: 0,
    },
    max_retries: {
      type: 'integer',
      default: 3,
    },
    scheduled_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    processed_at: {
      type: 'timestamp with time zone',
    },
    error_message: {
      type: 'text',
    },
  });

  pgm.createIndex('retry_queue', 'status');
  pgm.createIndex('retry_queue', 'scheduled_at');

  pgm.sql(`
    CREATE VIEW feedback_analytics AS
    SELECT
      category,
      DATE(created_at) as date,
      COUNT(*) as feedback_count,
      COUNT(DISTINCT operator_id) as unique_operators,
      COUNT(DISTINCT item_id) as unique_items
    FROM operator_feedback
    GROUP BY category, DATE(created_at)
    ORDER BY date DESC, feedback_count DESC;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql('DROP VIEW IF EXISTS feedback_analytics');
  pgm.dropTable('retry_queue');
  pgm.dropTable('feedback_templates');
  pgm.dropTable('item_versions');
  pgm.dropTable('operator_feedback');
  pgm.dropType('feedback_category_enum');
}

