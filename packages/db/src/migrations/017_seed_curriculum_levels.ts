import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    INSERT INTO curriculum_levels (language, cefr_level, name, description, sort_order)
    SELECT
      lang.language,
      lvl.level,
      lvl.name,
      lvl.description,
      lvl.sort_order
    FROM (
      VALUES
        ('ES'),
        ('IT'),
        ('PT'),
        ('SL')
    ) AS lang(language)
    CROSS JOIN (
      VALUES
        ('A0', 'Pre-A1 (Beginner)', 'Alphabet, basic sounds, foundational phonetics', 0),
        ('A1', 'A1 (Elementary)', 'Basic vocabulary, simple phrases, present tense', 1),
        ('A2', 'A2 (Pre-Intermediate)', 'Everyday expressions, past tense, simple dialogues', 2),
        ('B1', 'B1 (Intermediate)', 'Independent use, subjunctive introduction, complex sentences', 3),
        ('B2', 'B2 (Upper-Intermediate)', 'Fluent interaction, idiomatic expressions, formal writing', 4),
        ('C1', 'C1 (Advanced)', 'Complex texts, nuanced expression, professional contexts', 5),
        ('C2', 'C2 (Mastery)', 'Near-native fluency, subtle meanings, all registers', 6)
    ) AS lvl(level, name, description, sort_order)
    ON CONFLICT (language, cefr_level) DO NOTHING;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`DELETE FROM curriculum_levels;`);
}
