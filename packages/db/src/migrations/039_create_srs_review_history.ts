import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();

  // SRS review history for analytics and tracking learning patterns
  pgm.createTable('srs_review_history', {
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
    item_id: {
      type: 'varchar(100)',
      notNull: true,
      comment: 'Reference to the reviewed item (meaning_id for vocabulary)',
    },
    item_type: {
      type: 'varchar(20)',
      notNull: true,
      comment: 'Type of item: vocabulary, grammar, orthography, reading',
    },
    language: {
      type: 'varchar(2)',
      notNull: true,
    },
    rating: {
      type: 'varchar(10)',
      notNull: true,
      comment: 'Performance rating: again, hard, good, easy',
    },
    // SM-2 state before review
    previous_interval: {
      type: 'integer',
      notNull: true,
      comment: 'Interval before this review',
    },
    previous_ease_factor: {
      type: 'real',
      notNull: true,
      comment: 'Ease factor before this review',
    },
    previous_repetitions: {
      type: 'integer',
      notNull: true,
      comment: 'Repetitions count before this review',
    },
    // SM-2 state after review
    new_interval: {
      type: 'integer',
      notNull: true,
      comment: 'Interval after this review',
    },
    new_ease_factor: {
      type: 'real',
      notNull: true,
      comment: 'Ease factor after this review',
    },
    new_repetitions: {
      type: 'integer',
      notNull: true,
      comment: 'Repetitions count after this review',
    },
    // Timing
    response_time_ms: {
      type: 'integer',
      notNull: false,
      comment: 'Time taken to respond in milliseconds',
    },
    reviewed_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Constraints
  pgm.addConstraint('srs_review_history', 'valid_rating', {
    check: "rating IN ('again', 'hard', 'good', 'easy')",
  });

  pgm.addConstraint('srs_review_history', 'valid_item_type', {
    check: "item_type IN ('vocabulary', 'grammar', 'orthography', 'reading')",
  });

  // Indexes for querying review history
  pgm.createIndex('srs_review_history', ['user_id', 'reviewed_at']);
  pgm.createIndex('srs_review_history', ['user_id', 'item_type']);
  pgm.createIndex('srs_review_history', ['user_id', 'language']);
  pgm.createIndex('srs_review_history', ['item_id', 'user_id']);
  pgm.createIndex('srs_review_history', 'reviewed_at');
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('srs_review_history');
}
