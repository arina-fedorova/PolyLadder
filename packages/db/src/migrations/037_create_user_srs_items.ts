import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();

  // SRS (Spaced Repetition System) items for vocabulary recall practice
  pgm.createTable('user_srs_items', {
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
    // SM-2 algorithm fields
    interval: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Days until next review',
    },
    repetitions: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Number of consecutive successful reviews',
    },
    ease_factor: {
      type: 'real',
      notNull: true,
      default: 2.5,
      comment: 'SM-2 ease factor (minimum 1.3)',
    },
    next_review_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
      comment: 'When this item should be reviewed next',
    },
    last_reviewed_at: {
      type: 'timestamp',
      notNull: false,
      comment: 'When this item was last reviewed',
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
  pgm.addConstraint('user_srs_items', 'user_srs_items_unique', {
    unique: ['user_id', 'meaning_id'],
  });

  pgm.addConstraint('user_srs_items', 'valid_ease_factor', {
    check: 'ease_factor >= 1.3',
  });

  pgm.addConstraint('user_srs_items', 'valid_interval', {
    check: 'interval >= 0',
  });

  pgm.addConstraint('user_srs_items', 'valid_repetitions', {
    check: 'repetitions >= 0',
  });

  // Indexes for efficient queries
  pgm.createIndex('user_srs_items', ['user_id', 'language']);
  pgm.createIndex('user_srs_items', 'meaning_id');
  pgm.createIndex('user_srs_items', ['user_id', 'next_review_at']);
  pgm.createIndex('user_srs_items', 'next_review_at');

  // Trigger to update updated_at timestamp
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_user_srs_items_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = current_timestamp;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE TRIGGER user_srs_items_updated_at
      BEFORE UPDATE ON user_srs_items
      FOR EACH ROW
      EXECUTE FUNCTION update_user_srs_items_timestamp();
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql('DROP TRIGGER IF EXISTS user_srs_items_updated_at ON user_srs_items;');
  pgm.sql('DROP FUNCTION IF EXISTS update_user_srs_items_timestamp();');
  pgm.dropTable('user_srs_items');
}
