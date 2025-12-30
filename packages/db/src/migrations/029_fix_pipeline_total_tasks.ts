import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_pipeline_status()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND NEW.status != OLD.status THEN
        UPDATE pipelines
        SET
          total_tasks = (
            SELECT COUNT(*)
            FROM document_processing_tasks
            WHERE pipeline_id = NEW.pipeline_id
          ),
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

      IF TG_OP = 'INSERT' THEN
        UPDATE pipelines
        SET
          total_tasks = (
            SELECT COUNT(*)
            FROM document_processing_tasks
            WHERE pipeline_id = NEW.pipeline_id
          ),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.pipeline_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE TRIGGER update_pipeline_status_on_insert
    AFTER INSERT ON document_processing_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_pipeline_status();
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTrigger('document_processing_tasks', 'update_pipeline_status_on_insert', {
    ifExists: true,
  });

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
}
