import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();

  // Create table for tracking which grammar comparisons users have viewed
  pgm.createTable('user_grammar_comparisons_viewed', {
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
    concept_key: {
      type: 'varchar(100)',
      notNull: true,
    },
    languages: {
      type: 'varchar(20)[]',
      notNull: true,
    },
    viewed_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Unique constraint on user + concept + languages combination
  pgm.addConstraint('user_grammar_comparisons_viewed', 'unique_user_concept_languages', {
    unique: ['user_id', 'concept_key', 'languages'],
  });

  // Index for user lookups
  pgm.createIndex('user_grammar_comparisons_viewed', 'user_id', {
    name: 'idx_user_grammar_comparisons_user',
  });

  // Index for recent comparisons
  pgm.createIndex('user_grammar_comparisons_viewed', 'viewed_at', {
    name: 'idx_user_grammar_comparisons_viewed_at',
  });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropIndex('user_grammar_comparisons_viewed', 'viewed_at', {
    name: 'idx_user_grammar_comparisons_viewed_at',
  });
  pgm.dropIndex('user_grammar_comparisons_viewed', 'user_id', {
    name: 'idx_user_grammar_comparisons_user',
  });
  pgm.dropTable('user_grammar_comparisons_viewed');
}
