import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('curriculum_graph', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    concept_id: {
      type: 'varchar(100)',
      notNull: true,
    },
    language: {
      type: 'text',
      notNull: true,
    },
    cefr_level: {
      type: 'varchar(2)',
      notNull: true,
      check: "cefr_level IN ('A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2')",
    },
    concept_type: {
      type: 'varchar(50)',
      notNull: true,
      check: "concept_type IN ('orthography', 'vocabulary', 'grammar', 'pronunciation')",
    },
    title: {
      type: 'text',
      notNull: true,
    },
    description: {
      type: 'text',
      notNull: false,
    },
    estimated_duration_minutes: {
      type: 'integer',
      notNull: false,
    },
    priority_order: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    is_optional: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    prerequisites_and: {
      type: 'varchar(100)[]',
      notNull: true,
      default: pgm.func('ARRAY[]::varchar(100)[]'),
    },
    prerequisites_or: {
      type: 'varchar(100)[]',
      notNull: true,
      default: pgm.func('ARRAY[]::varchar(100)[]'),
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('curriculum_graph', 'curriculum_graph_unique', {
    unique: ['concept_id', 'language'],
  });

  pgm.createIndex('curriculum_graph', 'language');
  pgm.createIndex('curriculum_graph', 'cefr_level');
  pgm.createIndex('curriculum_graph', 'concept_type');
  pgm.sql(
    `CREATE INDEX idx_curriculum_graph_prereqs_and ON curriculum_graph USING GIN(prerequisites_and)`
  );
  pgm.sql(
    `CREATE INDEX idx_curriculum_graph_prereqs_or ON curriculum_graph USING GIN(prerequisites_or)`
  );

  pgm.createTable('user_concept_progress', {
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
    concept_id: {
      type: 'varchar(100)',
      notNull: true,
    },
    language: {
      type: 'text',
      notNull: true,
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      check: "status IN ('locked', 'unlocked', 'in_progress', 'completed')",
    },
    started_at: {
      type: 'timestamp',
      notNull: false,
    },
    completed_at: {
      type: 'timestamp',
      notNull: false,
    },
    progress_percentage: {
      type: 'integer',
      notNull: true,
      default: 0,
      check: 'progress_percentage >= 0 AND progress_percentage <= 100',
    },
    total_exercises: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    completed_exercises: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    accuracy_percentage: {
      type: 'decimal(5,2)',
      notNull: false,
    },
  });

  pgm.addConstraint('user_concept_progress', 'user_concept_progress_unique', {
    unique: ['user_id', 'concept_id', 'language'],
  });

  pgm.sql(`
    ALTER TABLE user_concept_progress
    ADD CONSTRAINT user_concept_progress_concept_fk
    FOREIGN KEY (concept_id, language)
    REFERENCES curriculum_graph(concept_id, language)
    ON DELETE CASCADE
  `);

  pgm.createIndex('user_concept_progress', 'user_id');
  pgm.createIndex('user_concept_progress', 'status');
  pgm.createIndex('user_concept_progress', ['user_id', 'language']);

  pgm.createView(
    'user_unlocked_concepts',
    {},
    `
    SELECT
      ucp.user_id,
      ucp.language,
      cg.concept_id,
      cg.title,
      cg.cefr_level,
      cg.concept_type,
      cg.priority_order,
      ucp.status,
      ucp.progress_percentage
    FROM user_concept_progress ucp
    JOIN curriculum_graph cg ON ucp.concept_id = cg.concept_id AND ucp.language = cg.language
    WHERE ucp.status IN ('unlocked', 'in_progress')
  `
  );

  pgm.createView(
    'user_curriculum_stats',
    {},
    `
    SELECT
      user_id,
      language,
      COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
      COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
      COUNT(*) FILTER (WHERE status = 'unlocked') as unlocked_count,
      COUNT(*) FILTER (WHERE status = 'locked') as locked_count,
      AVG(accuracy_percentage) FILTER (WHERE status = 'completed') as avg_accuracy
    FROM user_concept_progress
    GROUP BY user_id, language
  `
  );
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropView('user_curriculum_stats');
  pgm.dropView('user_unlocked_concepts');
  pgm.dropTable('user_concept_progress');
  pgm.dropTable('curriculum_graph');
}
