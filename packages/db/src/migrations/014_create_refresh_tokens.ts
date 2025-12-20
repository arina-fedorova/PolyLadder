import { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('refresh_tokens', {
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
    token: {
      type: 'text',
      notNull: true,
      unique: true,
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.createIndex('refresh_tokens', 'user_id', { name: 'idx_refresh_tokens_user' });
  pgm.createIndex('refresh_tokens', 'expires_at', { name: 'idx_refresh_tokens_expiry' });
  pgm.createIndex('refresh_tokens', 'token', { name: 'idx_refresh_tokens_token' });

  pgm.sql(`
    CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens() RETURNS void AS $$
    BEGIN
      DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP;
    END;
    $$ LANGUAGE plpgsql;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql('DROP FUNCTION IF EXISTS cleanup_expired_refresh_tokens();');
  pgm.dropTable('refresh_tokens');
}
