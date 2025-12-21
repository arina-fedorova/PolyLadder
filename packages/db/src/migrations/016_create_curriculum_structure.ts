import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('curriculum_levels', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    language: {
      type: 'language_enum',
      notNull: true,
    },
    cefr_level: {
      type: 'cefr_level_enum',
      notNull: true,
    },
    name: {
      type: 'varchar(100)',
      notNull: true,
    },
    description: {
      type: 'text',
    },
    sort_order: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.addConstraint('curriculum_levels', 'curriculum_levels_language_level_unique', {
    unique: ['language', 'cefr_level'],
  });

  pgm.createIndex('curriculum_levels', 'language');

  pgm.createTable('curriculum_topics', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    level_id: {
      type: 'uuid',
      notNull: true,
      references: 'curriculum_levels(id)',
      onDelete: 'CASCADE',
    },
    name: {
      type: 'varchar(200)',
      notNull: true,
    },
    slug: {
      type: 'varchar(200)',
      notNull: true,
    },
    description: {
      type: 'text',
    },
    content_type: {
      type: 'varchar(50)',
      notNull: true,
      check: "content_type IN ('vocabulary', 'grammar', 'orthography', 'mixed')",
    },
    sort_order: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    estimated_items: {
      type: 'integer',
      default: 0,
    },
    metadata: {
      type: 'jsonb',
      default: '{}',
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.addConstraint('curriculum_topics', 'curriculum_topics_level_slug_unique', {
    unique: ['level_id', 'slug'],
  });

  pgm.createIndex('curriculum_topics', 'level_id');
  pgm.createIndex('curriculum_topics', 'content_type');

  pgm.createTable('topic_prerequisites', {
    topic_id: {
      type: 'uuid',
      notNull: true,
      references: 'curriculum_topics(id)',
      onDelete: 'CASCADE',
    },
    prerequisite_id: {
      type: 'uuid',
      notNull: true,
      references: 'curriculum_topics(id)',
      onDelete: 'CASCADE',
    },
  });

  pgm.addConstraint('topic_prerequisites', 'topic_prerequisites_pkey', {
    primaryKey: ['topic_id', 'prerequisite_id'],
  });

  pgm.addConstraint('topic_prerequisites', 'topic_prerequisites_no_self_reference', {
    check: 'topic_id != prerequisite_id',
  });

  pgm.createIndex('topic_prerequisites', 'topic_id');
  pgm.createIndex('topic_prerequisites', 'prerequisite_id');
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('topic_prerequisites');
  pgm.dropTable('curriculum_topics');
  pgm.dropTable('curriculum_levels');
}
