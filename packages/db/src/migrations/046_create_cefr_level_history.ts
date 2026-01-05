import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();

  // CEFR Level History Table
  // Records historical CEFR level assessments over time
  pgm.createTable('cefr_level_history', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    language: {
      type: 'varchar(20)',
      notNull: true,
    },
    cefr_level: {
      type: 'varchar(5)',
      notNull: true,
      check: "cefr_level IN ('A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2')",
    },
    vocabulary_percentage: {
      type: 'float',
      notNull: true,
    },
    grammar_percentage: {
      type: 'float',
      notNull: true,
    },
    overall_percentage: {
      type: 'float',
      notNull: true,
    },
    assessed_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Indexes for efficient querying
  pgm.createIndex('cefr_level_history', ['user_id', 'language']);
  pgm.createIndex('cefr_level_history', ['assessed_at'], { name: 'idx_cefr_history_assessed_at' });
  pgm.createIndex('cefr_level_history', ['user_id', 'language', 'assessed_at'], {
    name: 'idx_cefr_history_user_lang_date',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();

  pgm.dropTable('cefr_level_history');
}
