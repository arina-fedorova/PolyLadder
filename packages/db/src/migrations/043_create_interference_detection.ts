import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();

  // Create interference_patterns table
  pgm.createTable('interference_patterns', {
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
    // Target language (what user was practicing)
    target_language: {
      type: 'varchar(20)',
      notNull: true,
    },
    target_item_id: {
      type: 'varchar(100)',
      notNull: true,
    },
    target_text: {
      type: 'text',
      notNull: true,
    },
    // Source language (where interference came from)
    source_language: {
      type: 'varchar(20)',
      notNull: true,
    },
    interfering_item_id: {
      type: 'varchar(100)',
      notNull: true,
    },
    interfering_text: {
      type: 'text',
      notNull: true,
    },
    // Pattern metadata
    interference_type: {
      type: 'varchar(20)',
      notNull: true,
      check: "interference_type IN ('vocabulary', 'grammar', 'syntax')",
    },
    confidence_score: {
      type: 'float',
      notNull: true,
      check: 'confidence_score >= 0 AND confidence_score <= 1',
    },
    occurrence_count: {
      type: 'integer',
      notNull: true,
      default: 1,
    },
    last_occurrence: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    // Remediation
    remediation_completed: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Add unique constraint
  pgm.addConstraint('interference_patterns', 'interference_patterns_unique', {
    unique: [
      'user_id',
      'target_language',
      'source_language',
      'target_item_id',
      'interfering_item_id',
    ],
  });

  // Create indexes for interference_patterns
  pgm.createIndex('interference_patterns', ['user_id', 'target_language']);
  pgm.createIndex('interference_patterns', ['user_id', 'remediation_completed']);
  pgm.createIndex('interference_patterns', ['user_id', 'occurrence_count']);
  pgm.createIndex('interference_patterns', 'last_occurrence');

  // Create remediation_exercises table
  pgm.createTable('remediation_exercises', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    pattern_id: {
      type: 'uuid',
      notNull: true,
      references: 'interference_patterns(id)',
      onDelete: 'CASCADE',
    },
    exercise_type: {
      type: 'varchar(20)',
      notNull: true,
      check: "exercise_type IN ('contrast', 'fill_blank', 'multiple_choice')",
    },
    prompt: {
      type: 'text',
      notNull: true,
    },
    correct_answer: {
      type: 'text',
      notNull: true,
    },
    distractors: {
      type: 'jsonb',
      notNull: true,
    },
    metadata: {
      type: 'jsonb',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('remediation_exercises', 'pattern_id');

  // Create remediation_attempts table
  pgm.createTable('remediation_attempts', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    exercise_id: {
      type: 'uuid',
      notNull: true,
      references: 'remediation_exercises(id)',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    user_answer: {
      type: 'text',
      notNull: true,
    },
    is_correct: {
      type: 'boolean',
      notNull: true,
    },
    time_spent: {
      type: 'integer',
      notNull: true,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('remediation_attempts', ['user_id', 'created_at']);
  pgm.createIndex('remediation_attempts', 'exercise_id');
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('remediation_attempts');
  pgm.dropTable('remediation_exercises');
  pgm.dropTable('interference_patterns');
}
