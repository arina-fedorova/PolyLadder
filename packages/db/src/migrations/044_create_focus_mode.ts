import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();

  // Add focus mode columns to user_preferences
  pgm.addColumns('user_preferences', {
    focus_activated_at: {
      type: 'timestamp',
      notNull: false,
    },
    focus_last_toggled: {
      type: 'timestamp',
      notNull: false,
    },
  });

  // Create focus mode history table for tracking
  pgm.createTable('focus_mode_history', {
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
    action: {
      type: 'varchar(20)',
      notNull: true,
      check: "action IN ('enabled', 'disabled', 'switched')",
    },
    metadata: {
      type: 'jsonb',
      notNull: false,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Indexes for efficient queries
  pgm.createIndex('focus_mode_history', ['user_id', 'created_at'], {
    name: 'idx_focus_mode_history_user',
  });
  pgm.createIndex('focus_mode_history', ['language'], {
    name: 'idx_focus_mode_history_language',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();

  pgm.dropTable('focus_mode_history');
  pgm.dropColumns('user_preferences', ['focus_activated_at', 'focus_last_toggled']);
}
