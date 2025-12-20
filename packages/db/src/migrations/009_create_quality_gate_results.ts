import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('quality_gate_results', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    entity_type: {
      type: 'varchar(50)',
      notNull: true,
      check: "entity_type IN ('meaning', 'utterance', 'grammar_rule', 'exercise')",
    },
    entity_id: {
      type: 'uuid',
      notNull: true,
    },
    gate_name: {
      type: 'varchar(100)',
      notNull: true,
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      check: "status IN ('passed', 'failed')",
    },
    error_message: {
      type: 'text',
    },
    metadata: {
      type: 'jsonb',
      default: '{}',
    },
    attempt_number: {
      type: 'integer',
      notNull: true,
      default: 1,
      check: 'attempt_number >= 1 AND attempt_number <= 10',
    },
    execution_time_ms: {
      type: 'integer',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('quality_gate_results', ['entity_type', 'entity_id']);
  pgm.createIndex('quality_gate_results', ['gate_name']);
  pgm.createIndex('quality_gate_results', ['status']);
  pgm.createIndex('quality_gate_results', ['created_at'], { method: 'btree' });

  pgm.createIndex('quality_gate_results', ['status', 'gate_name', 'created_at'], {
    where: "status = 'failed'",
    name: 'idx_quality_gate_results_failed',
  });

  pgm.createIndex(
    'quality_gate_results',
    ['entity_type', 'entity_id', 'gate_name', 'attempt_number'],
    {
      unique: true,
      name: 'idx_quality_gate_unique_attempt',
    }
  );
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('quality_gate_results');
}
