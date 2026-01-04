import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();

  // User review sessions for tracking study sessions
  pgm.createTable('user_review_sessions', {
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
      type: 'varchar(2)',
      notNull: false,
      comment: 'Optional language filter for the session',
    },
    // Session progress
    items_reviewed: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    correct_count: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    total_response_time_ms: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Cumulative response time for all reviews in session',
    },
    // Session lifecycle
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'active',
    },
    started_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    completed_at: {
      type: 'timestamp',
      notNull: false,
    },
    last_activity_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Constraints
  pgm.addConstraint('user_review_sessions', 'valid_status', {
    check: "status IN ('active', 'completed', 'abandoned')",
  });

  pgm.addConstraint('user_review_sessions', 'valid_counts', {
    check: 'correct_count <= items_reviewed',
  });

  pgm.addConstraint('user_review_sessions', 'valid_items_reviewed', {
    check: 'items_reviewed >= 0',
  });

  // Indexes
  pgm.createIndex('user_review_sessions', ['user_id', 'started_at']);
  pgm.createIndex('user_review_sessions', ['user_id', 'status']);
  pgm.createIndex('user_review_sessions', ['status', 'last_activity_at']);

  // Function to cleanup abandoned sessions (active for > 24 hours with no activity)
  pgm.sql(`
    CREATE OR REPLACE FUNCTION cleanup_abandoned_review_sessions()
    RETURNS INTEGER AS $$
    DECLARE
      updated_count INTEGER;
    BEGIN
      WITH updated AS (
        UPDATE user_review_sessions
        SET status = 'abandoned', completed_at = last_activity_at
        WHERE status = 'active'
          AND last_activity_at < CURRENT_TIMESTAMP - INTERVAL '24 hours'
        RETURNING id
      )
      SELECT COUNT(*) INTO updated_count FROM updated;

      RETURN updated_count;
    END;
    $$ LANGUAGE plpgsql;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql('DROP FUNCTION IF EXISTS cleanup_abandoned_review_sessions();');
  pgm.dropTable('user_review_sessions');
}
