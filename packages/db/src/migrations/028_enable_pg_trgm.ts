import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  // Enable pg_trgm extension for trigram similarity matching
  // Used by duplication detection in quality gates
  pgm.sql('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql('DROP EXTENSION IF EXISTS pg_trgm;');
}
