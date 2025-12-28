import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumn('pipeline_tasks', {
    pipeline_id: {
      type: 'uuid',
      references: 'pipelines(id)',
      onDelete: 'CASCADE',
    },
  });

  pgm.createIndex('pipeline_tasks', 'pipeline_id');

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
