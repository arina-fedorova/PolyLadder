import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  // Add metadata field to curriculum_graph for storing concept-specific data
  pgm.addColumn('curriculum_graph', {
    metadata: {
      type: 'jsonb',
      notNull: true,
      default: '{}',
    },
  });

  // Create index on metadata for efficient JSON queries
  pgm.sql(`CREATE INDEX idx_curriculum_graph_metadata ON curriculum_graph USING GIN(metadata)`);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`DROP INDEX IF EXISTS idx_curriculum_graph_metadata`);
  pgm.dropColumn('curriculum_graph', 'metadata');
}
