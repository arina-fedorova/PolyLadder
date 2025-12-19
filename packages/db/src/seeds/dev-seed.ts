import bcrypt from 'bcrypt';
import { query } from '../connection';

export async function seedDevelopmentData(): Promise<void> {
  console.log('Seeding development data...');

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

  console.log('✅ Development data seeded');
}
