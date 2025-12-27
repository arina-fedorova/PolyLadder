import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  // Add pipeline_id column to pipeline_tasks table
  pgm.addColumn('pipeline_tasks', {
    pipeline_id: {
      type: 'uuid',
      references: 'pipelines(id)',
      onDelete: 'CASCADE',
    },
  });

  // Create index for pipeline_id
  pgm.createIndex('pipeline_tasks', 'pipeline_id');

  // Backfill pipeline_id from document_id
  // Find pipeline_id by matching document_id
  pgm.sql(`
    UPDATE pipeline_tasks pt
    SET pipeline_id = p.id
    FROM pipelines p
    WHERE pt.document_id = p.document_id
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropIndex('pipeline_tasks', 'pipeline_id');
  pgm.dropColumn('pipeline_tasks', 'pipeline_id');
}
