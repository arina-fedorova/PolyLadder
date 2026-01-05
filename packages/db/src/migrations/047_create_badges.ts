import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();

  // Badges definition table
  pgm.createTable('badges', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: {
      type: 'varchar(100)',
      notNull: true,
    },
    description: {
      type: 'text',
      notNull: true,
    },
    icon_url: {
      type: 'varchar(500)',
      notNull: false,
    },
    category: {
      type: 'varchar(20)',
      notNull: true,
    },
    criteria: {
      type: 'jsonb',
      notNull: true,
      comment:
        'JSON criteria: { type: "streak"|"words_learned"|"total_reviews"|"perfect_sessions", target: number }',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.addConstraint('badges', 'valid_category', {
    check: "category IN ('streak', 'volume', 'accuracy', 'milestone')",
  });

  // User badges (achievements) table
  pgm.createTable('user_badges', {
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
    badge_id: {
      type: 'uuid',
      notNull: true,
      references: 'badges(id)',
      onDelete: 'CASCADE',
    },
    unlocked_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Unique constraint to prevent duplicate badge unlocks
  pgm.addConstraint('user_badges', 'unique_user_badge', {
    unique: ['user_id', 'badge_id'],
  });

  // Indexes
  pgm.createIndex('user_badges', ['user_id']);
  pgm.createIndex('user_badges', ['badge_id']);

  // Insert default badges
  pgm.sql(`
    INSERT INTO badges (name, description, icon_url, category, criteria) VALUES
      ('First Steps', 'Complete your first review', '/badges/first-steps.svg', 'milestone', '{"type": "total_reviews", "target": 1}'::jsonb),
      ('Getting Started', 'Complete 10 reviews', '/badges/getting-started.svg', 'volume', '{"type": "total_reviews", "target": 10}'::jsonb),
      ('Dedicated Learner', 'Complete 100 reviews', '/badges/dedicated.svg', 'volume', '{"type": "total_reviews", "target": 100}'::jsonb),
      ('Master Learner', 'Complete 1000 reviews', '/badges/master.svg', 'volume', '{"type": "total_reviews", "target": 1000}'::jsonb),
      ('7-Day Streak', 'Study for 7 consecutive days', '/badges/7-day-streak.svg', 'streak', '{"type": "streak", "target": 7}'::jsonb),
      ('30-Day Streak', 'Study for 30 consecutive days', '/badges/30-day-streak.svg', 'streak', '{"type": "streak", "target": 30}'::jsonb),
      ('100-Day Streak', 'Study for 100 consecutive days', '/badges/100-day-streak.svg', 'streak', '{"type": "streak", "target": 100}'::jsonb),
      ('Centurion', 'Learn 100 words', '/badges/centurion.svg', 'volume', '{"type": "words_learned", "target": 100}'::jsonb),
      ('Polyglot', 'Learn 1000 words', '/badges/polyglot.svg', 'volume', '{"type": "words_learned", "target": 1000}'::jsonb),
      ('Perfectionist', 'Complete 10 perfect sessions (100% accuracy)', '/badges/perfectionist.svg', 'accuracy', '{"type": "perfect_sessions", "target": 10}'::jsonb)
    ON CONFLICT DO NOTHING;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('user_badges');
  pgm.dropTable('badges');
}
