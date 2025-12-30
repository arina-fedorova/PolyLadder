import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumn('drafts', {
    approval_status: {
      type: 'varchar(20)',
      default: 'pending',
      check: "approval_status IN ('pending', 'approved', 'rejected')",
    },
    approved_by: {
      type: 'uuid',
      references: 'users(id)',
      onDelete: 'SET NULL',
    },
    approved_at: {
      type: 'timestamp with time zone',
    },
    rejection_reason: {
      type: 'text',
    },
    suggested_topic_id: {
      type: 'uuid',
      references: 'curriculum_topics(id)',
      onDelete: 'SET NULL',
    },
    suggested_level: {
      type: 'varchar(2)',
    },
    original_content: {
      type: 'text',
    },
    llm_reasoning: {
      type: 'text',
    },
  });

  pgm.createIndex('drafts', 'approval_status');
  pgm.createIndex('drafts', 'suggested_topic_id');

  pgm.createTable('draft_review_queue', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    draft_id: {
      type: 'uuid',
      notNull: true,
      references: 'drafts(id)',
      onDelete: 'CASCADE',
    },
    pipeline_id: {
      type: 'uuid',
      references: 'pipelines(id)',
      onDelete: 'CASCADE',
    },
    priority: {
      type: 'integer',
      default: 5,
    },
    queued_at: {
      type: 'timestamp with time zone',
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    reviewed_at: {
      type: 'timestamp with time zone',
    },
  });

  pgm.addConstraint('draft_review_queue', 'draft_review_queue_draft_id_unique', {
    unique: ['draft_id'],
  });

  pgm.createIndex('draft_review_queue', 'draft_id');
  pgm.createIndex('draft_review_queue', 'pipeline_id');
  pgm.createIndex('draft_review_queue', 'reviewed_at', {
    where: 'reviewed_at IS NULL',
  });

  pgm.sql(`
    UPDATE drafts 
    SET approval_status = 'pending' 
    WHERE approval_status IS NULL
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('draft_review_queue');

  pgm.dropIndex('drafts', 'suggested_topic_id');
  pgm.dropIndex('drafts', 'approval_status');

  pgm.dropColumn('drafts', [
    'approval_status',
    'approved_by',
    'approved_at',
    'rejection_reason',
    'suggested_topic_id',
    'suggested_level',
    'original_content',
    'llm_reasoning',
  ]);
}
