import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('work_in_progress', {
    work_id: {
      type: 'varchar(200)',
      primaryKey: true,
    },
    started_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('work_in_progress', ['started_at']);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('work_in_progress');
}
