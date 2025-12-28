import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('pipelines', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    document_id: {
      type: 'uuid',
      notNull: true,
      unique: true,
      references: 'document_sources(id)',
      onDelete: 'CASCADE',
    },
    status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'pending',
      comment: 'Current pipeline status: pending, processing, completed, failed, cancelled',
    },
    current_stage: {
      type: 'varchar(50)',
      notNull: true,
      default: 'created',
      comment:
        'Current stage: created, extracting, chunking, mapping, transforming, validating, approving, completed',
    },
    progress_percentage: {
      type: 'integer',
      notNull: true,
      default: 0,
      check: 'progress_percentage >= 0 AND progress_percentage <= 100',
    },
    error_message: {
      type: 'text',
      comment: 'Error message if pipeline failed',
    },
    total_tasks: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Total number of tasks in this pipeline',
    },
    completed_tasks: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Number of completed tasks',
    },
    failed_tasks: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Number of failed tasks',
    },
    started_at: {
      type: 'timestamp',
      comment: 'When pipeline processing started',
    },
    completed_at: {
      type: 'timestamp',
      comment: 'When pipeline completed (success or failure)',
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
    metadata: {
      type: 'jsonb',
      default: '{}',
      comment: 'Additional pipeline metadata',
    },
  });

  pgm.createTable('document_processing_tasks', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    pipeline_id: {
      type: 'uuid',
      notNull: true,
      references: 'pipelines(id)',
      onDelete: 'CASCADE',
    },
    task_type: {
      type: 'varchar(50)',
      notNull: true,
      comment: 'Type of task: extract, chunk, map, transform, validate, approve',
    },
    status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'pending',
      comment: 'Task status: pending, processing, completed, failed',
    },
    item_id: {
      type: 'uuid',
      comment: 'ID of the item being processed (document_id, chunk_id, mapping_id, etc.)',
    },
    depends_on_task_id: {
      type: 'uuid',
      references: 'document_processing_tasks(id)',
      onDelete: 'SET NULL',
      comment: 'Task dependency',
    },
    error_message: {
      type: 'text',
    },
    retry_count: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    started_at: {
      type: 'timestamp',
    },
    completed_at: {
      type: 'timestamp',
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
    metadata: {
      type: 'jsonb',
      default: '{}',
    },
  });

  pgm.createIndex('pipelines', 'document_id');
  pgm.createIndex('pipelines', 'status');
  pgm.createIndex('pipelines', 'current_stage');
  pgm.createIndex('pipelines', 'created_at');
  pgm.createIndex('pipelines', ['status', 'current_stage']);

  pgm.createIndex('document_processing_tasks', 'pipeline_id');
  pgm.createIndex('document_processing_tasks', 'task_type');
  pgm.createIndex('document_processing_tasks', 'status');
  pgm.createIndex('document_processing_tasks', 'depends_on_task_id');
  pgm.createIndex('document_processing_tasks', ['pipeline_id', 'status']);

  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_pipeline_status()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND NEW.status != OLD.status THEN
        UPDATE pipelines
        SET
          completed_tasks = (
            SELECT COUNT(*)
            FROM document_processing_tasks
            WHERE pipeline_id = NEW.pipeline_id
              AND status = 'completed'
          ),
          failed_tasks = (
            SELECT COUNT(*)
            FROM document_processing_tasks
            WHERE pipeline_id = NEW.pipeline_id
              AND status = 'failed'
          ),
          progress_percentage = LEAST(100, (
            SELECT (COUNT(*) FILTER (WHERE status = 'completed') * 100 / NULLIF(COUNT(*), 0))
            FROM document_processing_tasks
            WHERE pipeline_id = NEW.pipeline_id
          )),
          status = CASE
            WHEN (SELECT COUNT(*) FROM document_processing_tasks WHERE pipeline_id = NEW.pipeline_id AND status = 'failed') > 0
              THEN 'failed'
            WHEN (SELECT COUNT(*) FROM document_processing_tasks WHERE pipeline_id = NEW.pipeline_id AND status IN ('pending', 'processing')) = 0
              THEN 'completed'
            ELSE 'processing'
          END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.pipeline_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE TRIGGER update_pipeline_status_trigger
    AFTER UPDATE ON document_processing_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_pipeline_status();
  `);

  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_pipelines_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER update_pipelines_updated_at
    BEFORE UPDATE ON pipelines
    FOR EACH ROW
    EXECUTE FUNCTION update_pipelines_updated_at();
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTrigger('document_processing_tasks', 'update_pipeline_status_trigger', {
    ifExists: true,
  });
  pgm.dropFunction('update_pipeline_status', []);
  pgm.dropTrigger('pipelines', 'update_pipelines_updated_at', { ifExists: true });
  pgm.dropFunction('update_pipelines_updated_at', []);

  pgm.dropTable('document_processing_tasks');
  pgm.dropTable('pipelines');
}
