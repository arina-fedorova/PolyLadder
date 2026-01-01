import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  // Table to track word learning state for each user
  pgm.createTable('user_word_state', {
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
    meaning_id: {
      type: 'varchar(100)',
      notNull: true,
      references: 'approved_meanings(id)',
      onDelete: 'CASCADE',
    },
    language: {
      type: 'varchar(2)',
      notNull: true,
    },
    state: {
      type: 'varchar(20)',
      notNull: true,
      check: "state IN ('unknown', 'learning', 'known')",
      default: 'unknown',
    },
    first_seen_at: {
      type: 'timestamp',
      notNull: false,
    },
    marked_learning_at: {
      type: 'timestamp',
      notNull: false,
    },
    marked_known_at: {
      type: 'timestamp',
      notNull: false,
    },
    successful_reviews: {
      type: 'integer',
      notNull: true,
      default: 0,
      check: 'successful_reviews >= 0',
    },
    total_reviews: {
      type: 'integer',
      notNull: true,
      default: 0,
      check: 'total_reviews >= 0',
    },
    last_reviewed_at: {
      type: 'timestamp',
      notNull: false,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Constraints
  pgm.addConstraint('user_word_state', 'user_word_state_unique', {
    unique: ['user_id', 'meaning_id'],
  });

  pgm.addConstraint('user_word_state', 'valid_total_reviews', {
    check: 'total_reviews >= successful_reviews',
  });

  // Indexes for fast lookups
  pgm.createIndex('user_word_state', ['user_id', 'language']);
  pgm.createIndex('user_word_state', 'state');
  pgm.createIndex('user_word_state', 'meaning_id');
  pgm.createIndex('user_word_state', ['user_id', 'state']);

  // Trigger to update updated_at timestamp
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_user_word_state_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = current_timestamp;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE TRIGGER user_word_state_updated_at
      BEFORE UPDATE ON user_word_state
      FOR EACH ROW
      EXECUTE FUNCTION update_user_word_state_timestamp();
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql('DROP TRIGGER IF EXISTS user_word_state_updated_at ON user_word_state;');
  pgm.sql('DROP FUNCTION IF EXISTS update_user_word_state_timestamp();');
  pgm.dropTable('user_word_state');
}
