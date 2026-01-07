-- ============================================================
-- PolyLadder Test Data Seed Script
-- ============================================================
-- This script creates minimal but COMPLETE test data for
-- the learning flow from A0 orthography through A1 vocabulary.
--
-- Usage:
--   psql postgresql://test:test@localhost:5434/polyladder_test -f scripts/seed-test-data.sql
--
-- Created: 2026-01-06
-- ============================================================

BEGIN;

-- ============================================================
-- 1. CREATE TEST USERS (if not exist)
-- ============================================================

INSERT INTO users (id, email, password_hash, role, base_language, created_at, updated_at)
VALUES
  -- Password: password123 (bcrypt hash with 10 rounds)
  ('11111111-1111-1111-1111-111111111111', 'operator@test.com',
   '$2b$10$rQZ8kHxVJK5VJhqMq5JH8.qZYnkjPFqJxqFZQWZx9qZYnkjPFqJxq',
   'operator', 'EN', NOW(), NOW()),
  ('22222222-2222-2222-2222-222222222222', 'learner@test.com',
   '$2b$10$rQZ8kHxVJK5VJhqMq5JH8.qZYnkjPFqJxqFZQWZx9qZYnkjPFqJxq',
   'learner', 'EN', NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET updated_at = NOW();

-- ============================================================
-- 2. A0 ORTHOGRAPHY CURRICULUM (CRITICAL FOR LEARNING FLOW!)
-- ============================================================
-- Without this data, users CANNOT progress past A0

-- Create curriculum levels if not exist
INSERT INTO curriculum_levels (id, language, cefr_level, name, description, sort_order, created_at)
VALUES
  (gen_random_uuid(), 'ES', 'A0', 'Pre-Beginner', 'Alphabet and basic sounds', 0, NOW()),
  (gen_random_uuid(), 'ES', 'A1', 'Beginner', 'Basic vocabulary and grammar', 1, NOW()),
  (gen_random_uuid(), 'ES', 'A2', 'Elementary', 'Simple conversations', 2, NOW())
ON CONFLICT DO NOTHING;

-- Create A0 orthography concepts in curriculum_graph
-- Each concept represents one letter/sound lesson
INSERT INTO curriculum_graph (id, language, concept_id, concept_type, cefr_level, prerequisites, metadata, created_at)
VALUES
  -- Spanish vowels (5 letters)
  (gen_random_uuid(), 'ES', 'es-orth-a', 'orthography', 'A0', '[]'::jsonb,
   '{"letter": "A", "ipa": "/a/", "soundDescription": "Open front vowel, like ''a'' in ''father''", "exampleWords": ["agua", "casa", "amigo"], "order": 1}'::jsonb, NOW()),
  (gen_random_uuid(), 'ES', 'es-orth-e', 'orthography', 'A0', '["es-orth-a"]'::jsonb,
   '{"letter": "E", "ipa": "/e/", "soundDescription": "Close-mid front vowel, like ''e'' in ''bed''", "exampleWords": ["español", "enero", "verde"], "order": 2}'::jsonb, NOW()),
  (gen_random_uuid(), 'ES', 'es-orth-i', 'orthography', 'A0', '["es-orth-e"]'::jsonb,
   '{"letter": "I", "ipa": "/i/", "soundDescription": "Close front vowel, like ''ee'' in ''see''", "exampleWords": ["isla", "libro", "mi"], "order": 3}'::jsonb, NOW()),
  (gen_random_uuid(), 'ES', 'es-orth-o', 'orthography', 'A0', '["es-orth-i"]'::jsonb,
   '{"letter": "O", "ipa": "/o/", "soundDescription": "Close-mid back vowel, like ''o'' in ''go''", "exampleWords": ["ojo", "ocho", "como"], "order": 4}'::jsonb, NOW()),
  (gen_random_uuid(), 'ES', 'es-orth-u', 'orthography', 'A0', '["es-orth-o"]'::jsonb,
   '{"letter": "U", "ipa": "/u/", "soundDescription": "Close back vowel, like ''oo'' in ''moon''", "exampleWords": ["uno", "uva", "azul"], "order": 5}'::jsonb, NOW()),

  -- Key consonants (basic)
  (gen_random_uuid(), 'ES', 'es-orth-n', 'orthography', 'A0', '["es-orth-u"]'::jsonb,
   '{"letter": "N", "ipa": "/n/", "soundDescription": "Alveolar nasal, same as English ''n''", "exampleWords": ["no", "noche", "uno"], "order": 6}'::jsonb, NOW()),
  (gen_random_uuid(), 'ES', 'es-orth-s', 'orthography', 'A0', '["es-orth-n"]'::jsonb,
   '{"letter": "S", "ipa": "/s/", "soundDescription": "Voiceless alveolar fricative, like English ''s''", "exampleWords": ["sí", "sol", "casa"], "order": 7}'::jsonb, NOW()),
  (gen_random_uuid(), 'ES', 'es-orth-l', 'orthography', 'A0', '["es-orth-s"]'::jsonb,
   '{"letter": "L", "ipa": "/l/", "soundDescription": "Alveolar lateral, like English ''l''", "exampleWords": ["la", "libro", "sol"], "order": 8}'::jsonb, NOW()),

  -- Special Spanish letters
  (gen_random_uuid(), 'ES', 'es-orth-ñ', 'orthography', 'A0', '["es-orth-l"]'::jsonb,
   '{"letter": "Ñ", "ipa": "/ɲ/", "soundDescription": "Palatal nasal, like ''ny'' in ''canyon''", "exampleWords": ["año", "niño", "español"], "order": 9}'::jsonb, NOW()),
  (gen_random_uuid(), 'ES', 'es-orth-rr', 'orthography', 'A0', '["es-orth-ñ"]'::jsonb,
   '{"letter": "RR", "ipa": "/r/", "soundDescription": "Alveolar trill, rolled ''r'' sound", "exampleWords": ["perro", "carro", "arroz"], "order": 10}'::jsonb, NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. A1 VOCABULARY (Basic words for learning)
-- ============================================================

-- Meanings (the core vocabulary items)
INSERT INTO approved_meanings (id, lemma, language, cefr_level, part_of_speech, definition, created_at)
VALUES
  -- Greetings (5 words)
  ('aaaaaaaa-0001-0001-0001-000000000001', 'hola', 'ES', 'A1', 'interjection', 'hello; hi (informal greeting)', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'adiós', 'ES', 'A1', 'interjection', 'goodbye; farewell', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000003', 'buenos días', 'ES', 'A1', 'phrase', 'good morning', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000004', 'buenas tardes', 'ES', 'A1', 'phrase', 'good afternoon', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000005', 'buenas noches', 'ES', 'A1', 'phrase', 'good evening; good night', NOW()),

  -- Polite expressions (5 words)
  ('aaaaaaaa-0001-0001-0001-000000000006', 'gracias', 'ES', 'A1', 'noun', 'thanks; thank you', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000007', 'por favor', 'ES', 'A1', 'phrase', 'please', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000008', 'de nada', 'ES', 'A1', 'phrase', 'you''re welcome', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000009', 'perdón', 'ES', 'A1', 'noun', 'sorry; excuse me', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000010', 'lo siento', 'ES', 'A1', 'phrase', 'I''m sorry', NOW()),

  -- Basic questions (5 words)
  ('aaaaaaaa-0001-0001-0001-000000000011', 'qué', 'ES', 'A1', 'pronoun', 'what', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000012', 'cómo', 'ES', 'A1', 'adverb', 'how', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000013', 'dónde', 'ES', 'A1', 'adverb', 'where', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000014', 'cuándo', 'ES', 'A1', 'adverb', 'when', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000015', 'por qué', 'ES', 'A1', 'phrase', 'why', NOW()),

  -- Common nouns (10 words)
  ('aaaaaaaa-0001-0001-0001-000000000016', 'casa', 'ES', 'A1', 'noun', 'house; home', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000017', 'agua', 'ES', 'A1', 'noun', 'water', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000018', 'comida', 'ES', 'A1', 'noun', 'food; meal', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000019', 'libro', 'ES', 'A1', 'noun', 'book', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000020', 'amigo', 'ES', 'A1', 'noun', 'friend (male)', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000021', 'amiga', 'ES', 'A1', 'noun', 'friend (female)', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000022', 'familia', 'ES', 'A1', 'noun', 'family', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000023', 'trabajo', 'ES', 'A1', 'noun', 'work; job', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000024', 'tiempo', 'ES', 'A1', 'noun', 'time; weather', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000025', 'día', 'ES', 'A1', 'noun', 'day', NOW()),

  -- Common verbs (10 words)
  ('aaaaaaaa-0001-0001-0001-000000000026', 'ser', 'ES', 'A1', 'verb', 'to be (permanent)', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000027', 'estar', 'ES', 'A1', 'verb', 'to be (temporary/location)', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000028', 'tener', 'ES', 'A1', 'verb', 'to have', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000029', 'hacer', 'ES', 'A1', 'verb', 'to do; to make', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000030', 'ir', 'ES', 'A1', 'verb', 'to go', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000031', 'comer', 'ES', 'A1', 'verb', 'to eat', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000032', 'beber', 'ES', 'A1', 'verb', 'to drink', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000033', 'hablar', 'ES', 'A1', 'verb', 'to speak; to talk', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000034', 'querer', 'ES', 'A1', 'verb', 'to want; to love', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000035', 'poder', 'ES', 'A1', 'verb', 'to be able to; can', NOW()),

  -- Numbers 1-10 (10 words)
  ('aaaaaaaa-0001-0001-0001-000000000036', 'uno', 'ES', 'A1', 'numeral', 'one; 1', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000037', 'dos', 'ES', 'A1', 'numeral', 'two; 2', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000038', 'tres', 'ES', 'A1', 'numeral', 'three; 3', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000039', 'cuatro', 'ES', 'A1', 'numeral', 'four; 4', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000040', 'cinco', 'ES', 'A1', 'numeral', 'five; 5', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000041', 'seis', 'ES', 'A1', 'numeral', 'six; 6', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000042', 'siete', 'ES', 'A1', 'numeral', 'seven; 7', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000043', 'ocho', 'ES', 'A1', 'numeral', 'eight; 8', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000044', 'nueve', 'ES', 'A1', 'numeral', 'nine; 9', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000045', 'diez', 'ES', 'A1', 'numeral', 'ten; 10', NOW()),

  -- Yes/No and basic words (5 words)
  ('aaaaaaaa-0001-0001-0001-000000000046', 'sí', 'ES', 'A1', 'adverb', 'yes', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000047', 'no', 'ES', 'A1', 'adverb', 'no; not', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000048', 'y', 'ES', 'A1', 'conjunction', 'and', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000049', 'o', 'ES', 'A1', 'conjunction', 'or', NOW()),
  ('aaaaaaaa-0001-0001-0001-000000000050', 'pero', 'ES', 'A1', 'conjunction', 'but', NOW())
ON CONFLICT DO NOTHING;

-- Utterances (word forms linked to meanings)
INSERT INTO approved_utterances (id, meaning_id, language, form, is_primary, created_at)
SELECT gen_random_uuid(), id, 'ES', lemma, true, NOW()
FROM approved_meanings
WHERE language = 'ES'
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. A1 GRAMMAR RULES
-- ============================================================

INSERT INTO approved_rules (id, language, category, subcategory, cefr_level, title, explanation, examples, created_at)
VALUES
  (gen_random_uuid(), 'ES', 'verbs', 'ser_estar', 'A1',
   'Ser vs Estar: Basic Usage',
   'Spanish has two verbs for "to be": SER for permanent characteristics (identity, profession, origin) and ESTAR for temporary states (location, feelings, conditions).',
   '["Soy español. (I am Spanish - permanent)", "Estoy cansado. (I am tired - temporary)", "El libro es rojo. (The book is red - characteristic)", "El libro está en la mesa. (The book is on the table - location)"]'::jsonb,
   NOW()),

  (gen_random_uuid(), 'ES', 'verbs', 'present_regular', 'A1',
   'Present Tense: Regular -AR Verbs',
   'Regular -AR verbs follow a predictable pattern. Remove -AR and add endings: -o (yo), -as (tú), -a (él/ella), -amos (nosotros), -áis (vosotros), -an (ellos).',
   '["hablar → hablo, hablas, habla, hablamos, habláis, hablan", "trabajar → trabajo (I work)", "estudiar → estudias (you study)"]'::jsonb,
   NOW()),

  (gen_random_uuid(), 'ES', 'nouns', 'gender', 'A1',
   'Noun Gender: Masculine and Feminine',
   'Spanish nouns are either masculine or feminine. Most nouns ending in -O are masculine, most ending in -A are feminine. Articles must agree: el (m) / la (f).',
   '["el libro (the book - masculine)", "la casa (the house - feminine)", "el agua (the water - feminine exception!)", "la mano (the hand - feminine exception!)"]'::jsonb,
   NOW()),

  (gen_random_uuid(), 'ES', 'articles', 'definite', 'A1',
   'Definite Articles: El, La, Los, Las',
   'Spanish has 4 definite articles that agree in gender and number: el (m. singular), la (f. singular), los (m. plural), las (f. plural).',
   '["el perro (the dog)", "la gata (the cat)", "los libros (the books)", "las casas (the houses)"]'::jsonb,
   NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. EXERCISES
-- ============================================================

INSERT INTO approved_exercises (id, language, cefr_level, exercise_type, content, options, correct_answer, created_at)
VALUES
  -- Multiple choice exercises
  (gen_random_uuid(), 'ES', 'A1', 'multiple_choice',
   '{"question": "How do you say ''hello'' in Spanish?"}'::jsonb,
   '["hola", "adiós", "gracias", "por favor"]'::jsonb,
   'hola', NOW()),

  (gen_random_uuid(), 'ES', 'A1', 'multiple_choice',
   '{"question": "What is the Spanish word for ''water''?"}'::jsonb,
   '["agua", "comida", "casa", "libro"]'::jsonb,
   'agua', NOW()),

  (gen_random_uuid(), 'ES', 'A1', 'multiple_choice',
   '{"question": "Which verb means ''to eat''?"}'::jsonb,
   '["comer", "beber", "hablar", "ir"]'::jsonb,
   'comer', NOW()),

  -- Cloze (fill-in-blank) exercises
  (gen_random_uuid(), 'ES', 'A1', 'cloze',
   '{"sentence": "Buenos ___, ¿cómo estás?", "blank_word": "días", "hint": "morning greeting"}'::jsonb,
   '[]'::jsonb,
   'días', NOW()),

  (gen_random_uuid(), 'ES', 'A1', 'cloze',
   '{"sentence": "Yo ___ español.", "blank_word": "soy", "hint": "verb ''to be'' for identity"}'::jsonb,
   '[]'::jsonb,
   'soy', NOW()),

  (gen_random_uuid(), 'ES', 'A1', 'cloze',
   '{"sentence": "El libro ___ en la mesa.", "blank_word": "está", "hint": "verb ''to be'' for location"}'::jsonb,
   '[]'::jsonb,
   'está', NOW()),

  -- Flashcard exercises
  (gen_random_uuid(), 'ES', 'A1', 'flashcard',
   '{"front": "water", "back": "agua", "frontLanguage": "EN", "backLanguage": "ES"}'::jsonb,
   '[]'::jsonb,
   'agua', NOW()),

  (gen_random_uuid(), 'ES', 'A1', 'flashcard',
   '{"front": "thank you", "back": "gracias", "frontLanguage": "EN", "backLanguage": "ES"}'::jsonb,
   '[]'::jsonb,
   'gracias', NOW()),

  (gen_random_uuid(), 'ES', 'A1', 'flashcard',
   '{"front": "house", "back": "casa", "frontLanguage": "EN", "backLanguage": "ES"}'::jsonb,
   '[]'::jsonb,
   'casa', NOW()),

  -- Translation exercises
  (gen_random_uuid(), 'ES', 'A1', 'translation',
   '{"sourceText": "I want water.", "sourceLanguage": "EN", "targetLanguage": "ES"}'::jsonb,
   '["Quiero agua.", "Yo quiero agua."]'::jsonb,
   'Quiero agua.', NOW()),

  (gen_random_uuid(), 'ES', 'A1', 'translation',
   '{"sourceText": "The book is red.", "sourceLanguage": "EN", "targetLanguage": "ES"}'::jsonb,
   '["El libro es rojo."]'::jsonb,
   'El libro es rojo.', NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. SET UP LEARNER USER LANGUAGE
-- ============================================================

-- Add Spanish as studied language for learner
INSERT INTO user_languages (id, user_id, language, proficiency_level, is_active, orthography_completed, created_at)
SELECT
  gen_random_uuid(),
  id,
  'ES',
  'A1',
  true,
  false,  -- Orthography NOT completed - user must go through A0 first
  NOW()
FROM users WHERE email = 'learner@test.com'
ON CONFLICT DO NOTHING;

-- ============================================================
-- 7. OPTIONAL: PRE-POPULATE SOME LEARNING PROGRESS
-- ============================================================

-- Mark some vocabulary as "learning" for learner (to test SRS)
INSERT INTO user_word_state (id, user_id, meaning_id, state, review_count, success_count, created_at, updated_at)
SELECT
  gen_random_uuid(),
  u.id,
  m.id,
  'learning',
  0,
  0,
  NOW(),
  NOW()
FROM users u
CROSS JOIN (
  SELECT id FROM approved_meanings
  WHERE language = 'ES'
  ORDER BY lemma
  LIMIT 10
) m
WHERE u.email = 'learner@test.com'
ON CONFLICT DO NOTHING;

-- Initialize SRS items for learning words
INSERT INTO user_srs_items (id, user_id, item_id, item_type, language, next_review_at, ease_factor, interval_days, repetitions, created_at, updated_at)
SELECT
  gen_random_uuid(),
  uws.user_id,
  uws.meaning_id,
  'vocabulary',
  'ES',
  NOW() - INTERVAL '1 hour',  -- Due for review NOW
  2.5,
  1,
  0,
  NOW(),
  NOW()
FROM user_word_state uws
JOIN users u ON uws.user_id = u.id
WHERE u.email = 'learner@test.com'
  AND uws.state = 'learning'
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Check counts
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'curriculum_graph (orthography)', COUNT(*) FROM curriculum_graph WHERE concept_type = 'orthography'
UNION ALL
SELECT 'approved_meanings', COUNT(*) FROM approved_meanings
UNION ALL
SELECT 'approved_utterances', COUNT(*) FROM approved_utterances
UNION ALL
SELECT 'approved_rules', COUNT(*) FROM approved_rules
UNION ALL
SELECT 'approved_exercises', COUNT(*) FROM approved_exercises
UNION ALL
SELECT 'user_languages', COUNT(*) FROM user_languages
UNION ALL
SELECT 'user_word_state', COUNT(*) FROM user_word_state
UNION ALL
SELECT 'user_srs_items', COUNT(*) FROM user_srs_items;

-- Show orthography concepts
SELECT concept_id, metadata->>'letter' as letter, metadata->>'order' as "order"
FROM curriculum_graph
WHERE language = 'ES' AND concept_type = 'orthography'
ORDER BY (metadata->>'order')::int;
