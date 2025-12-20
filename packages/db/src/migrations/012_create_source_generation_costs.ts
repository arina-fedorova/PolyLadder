import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('source_generation_costs', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    source_name: {
      type: 'varchar(100)',
      notNull: true,
    },
    content_type: {
      type: 'varchar(50)',
      notNull: true,
    },
    language: {
      type: 'varchar(2)',
      notNull: true,
      check: "language IN ('EN', 'IT', 'PT', 'SL', 'ES')",
    },
    tokens_used: {
      type: 'integer',
    },
    cost_usd: {
      type: 'decimal(10, 6)',
    },
    generated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.createIndex('source_generation_costs', 'generated_at', {
    name: 'idx_source_costs_date',
  });
  pgm.createIndex('source_generation_costs', 'source_name', {
    name: 'idx_source_costs_source',
  });

  pgm.sql(`
    CREATE VIEW daily_generation_costs AS
    SELECT
      DATE(generated_at) as date,
      source_name,
      content_type,
      SUM(tokens_used) as total_tokens,
      SUM(cost_usd) as total_cost
    FROM source_generation_costs
    GROUP BY DATE(generated_at), source_name, content_type
    ORDER BY date DESC
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql('DROP VIEW IF EXISTS daily_generation_costs');
  pgm.dropTable('source_generation_costs');
}
