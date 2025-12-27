-- Cleanup test data from approved tables
-- This script removes test data that was created during integration tests

-- Delete test meanings and their related utterances
DELETE FROM approved_utterances 
WHERE meaning_id LIKE 'test-meaning-%' 
   OR meaning_id LIKE 'test-%';

-- Note: approved_meanings has a trigger that prevents direct deletion
-- Test data should be cleaned up in test cleanup functions, not in production
-- If you need to clean test data, you may need to temporarily disable the trigger

-- For development environment only:
-- ALTER TABLE approved_meanings DISABLE TRIGGER immutable_approved_meanings_delete;
-- DELETE FROM approved_meanings WHERE id LIKE 'test-meaning-%' OR id LIKE 'test-%';
-- ALTER TABLE approved_meanings ENABLE TRIGGER immutable_approved_meanings_delete;

