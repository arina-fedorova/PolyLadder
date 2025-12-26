import bcrypt from 'bcrypt';
import { query } from '../connection';

export async function seedDevelopmentData(): Promise<void> {
  process.stdout.write('Seeding development data...\n');

  const passwordHash = await bcrypt.hash('password123', 10);

  await query(
    `
    INSERT INTO users (email, password_hash, role, base_language)
    VALUES
      ('learner@test.com', $1, 'learner', 'EN'),
      ('operator@test.com', $1, 'operator', 'EN')
    ON CONFLICT (email) DO NOTHING
  `,
    [passwordHash]
  );

  await query(`
    INSERT INTO approved_meanings (id, level, tags)
    VALUES ('greeting-hello', 'A0', '["greetings"]')
    ON CONFLICT (id) DO NOTHING
  `);

  await query(`
    INSERT INTO approved_utterances (meaning_id, language, text)
    VALUES
      ('greeting-hello', 'EN', 'Hello'),
      ('greeting-hello', 'IT', 'Ciao'),
      ('greeting-hello', 'PT', 'Olá'),
      ('greeting-hello', 'SL', 'Zdravo'),
      ('greeting-hello', 'ES', 'Hola')
    ON CONFLICT DO NOTHING
  `);

  await query(`
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
    ON CONFLICT (language, cefr_level) DO NOTHING
  `);

  process.stdout.write('✅ Development data seeded\n');
}
