-- Seed test data for PolyLadder

-- Create draft meanings (only if empty)
INSERT INTO drafts (id, data_type, raw_data, source) 
SELECT gen_random_uuid(), 'meaning', '{"word": "hello", "level": "A1"}', 'manual_seed'
WHERE NOT EXISTS (SELECT 1 FROM drafts WHERE source = 'manual_seed');

INSERT INTO drafts (id, data_type, raw_data, source) VALUES
  (gen_random_uuid(), 'meaning', '{"word": "goodbye", "level": "A1"}', 'manual_seed'),
  (gen_random_uuid(), 'meaning', '{"word": "thank you", "level": "A1"}', 'manual_seed'),
  (gen_random_uuid(), 'meaning', '{"word": "please", "level": "A1"}', 'manual_seed'),
  (gen_random_uuid(), 'utterance', '{"text": "Buenos dias", "language": "es"}', 'manual_seed'),
  (gen_random_uuid(), 'utterance', '{"text": "Buongiorno", "language": "it"}', 'manual_seed'),
  (gen_random_uuid(), 'rule', '{"title": "Present Tense", "language": "es"}', 'manual_seed'),
  (gen_random_uuid(), 'exercise', '{"type": "multiple_choice", "prompt": "Translate hello"}', 'manual_seed')
ON CONFLICT DO NOTHING;

-- Create candidates from drafts
INSERT INTO candidates (data_type, normalized_data, draft_id)
SELECT data_type, raw_data, id
FROM drafts
WHERE NOT EXISTS (SELECT 1 FROM candidates WHERE candidates.draft_id = drafts.id)
LIMIT 5;

-- Create validated items from candidates
INSERT INTO validated (data_type, validated_data, candidate_id, validation_results)
SELECT data_type, normalized_data, id, '{"gates_passed": ["schema", "language", "quality"]}'
FROM candidates
WHERE NOT EXISTS (SELECT 1 FROM validated WHERE validated.candidate_id = candidates.id)
LIMIT 3;

-- Create approved content
INSERT INTO approved_meanings (id, level, created_at) 
SELECT gen_random_uuid(), 'A1', NOW()
WHERE (SELECT COUNT(*) FROM approved_meanings) < 3;

INSERT INTO approved_meanings (id, level, created_at) 
SELECT gen_random_uuid(), 'A1', NOW()
WHERE (SELECT COUNT(*) FROM approved_meanings) < 3;

INSERT INTO approved_meanings (id, level, created_at) 
SELECT gen_random_uuid(), 'A0', NOW()
WHERE (SELECT COUNT(*) FROM approved_meanings) < 3;

-- Show summary
SELECT 'drafts' as table_name, COUNT(*) as count FROM drafts
UNION ALL SELECT 'candidates', COUNT(*) FROM candidates
UNION ALL SELECT 'validated', COUNT(*) FROM validated
UNION ALL SELECT 'approved_meanings', COUNT(*) FROM approved_meanings
UNION ALL SELECT 'approved_rules', COUNT(*) FROM approved_rules
UNION ALL SELECT 'approved_exercises', COUNT(*) FROM approved_exercises;

