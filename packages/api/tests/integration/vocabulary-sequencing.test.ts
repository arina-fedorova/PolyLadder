import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { getTestPool, cleanupTestData, closeTestPool, setupTestEnv } from '../setup';
import { VocabularySequencingService } from '../../src/services/vocabulary/sequencing.service';
import { createTestUser } from '../helpers/db';

describe('Vocabulary Sequencing Service Integration Tests', () => {
  let pool: Pool;
  let service: VocabularySequencingService;
  let userId: string;

  beforeAll(() => {
    setupTestEnv();
    pool = getTestPool();
    service = new VocabularySequencingService(pool);
  });

  afterAll(async () => {
    await closeTestPool();
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Clean up only user_word_state (approved tables are immutable)
    await pool.query(`DELETE FROM user_word_state`);

    // Create test user
    const uniqueEmail = `vocab-seq-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`;
    const user = await createTestUser(pool, {
      email: uniqueEmail,
      password: 'Password123!',
      role: 'learner',
    });
    userId = user.id;
  });

  describe('getNextVocabularyBatch', () => {
    it('should return vocabulary that has not been introduced', async () => {
      // Create test meanings with utterances
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const meanings = [
        { id: `en-vocab-seq-word1-${timestamp}-${random}`, level: 'A1' },
        { id: `en-vocab-seq-word2-${timestamp}-${random}`, level: 'A1' },
        { id: `en-vocab-seq-word3-${timestamp}-${random}`, level: 'A2' },
      ];

      for (const meaning of meanings) {
        await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, $2, $3)`, [
          meaning.id,
          meaning.level,
          JSON.stringify([]),
        ]);

        // Add utterances
        await pool.query(
          `INSERT INTO approved_utterances (meaning_id, language, text)
           VALUES ($1, 'EN', 'Example sentence')`,
          [meaning.id]
        );
      }

      const batch = await service.getNextVocabularyBatch(userId, 'EN', 'A2', 100);
      const meaningIds = meanings.map((m) => m.id);
      const filteredBatch = batch.filter((item) => meaningIds.includes(item.meaningId));

      expect(filteredBatch.length).toBe(3);
      const a1Items = filteredBatch.filter((item) => item.level === 'A1');
      expect(a1Items.length).toBe(2);
      expect(filteredBatch[0].utteranceCount).toBeGreaterThan(0);
    });

    it('should respect CEFR level filtering', async () => {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const meanings = [
        { id: `en-vocab-seq-a1-${timestamp}-${random}`, level: 'A1' },
        { id: `en-vocab-seq-b1-${timestamp}-${random}`, level: 'B1' },
        { id: `en-vocab-seq-c1-${timestamp}-${random}`, level: 'C1' },
      ];

      for (const meaning of meanings) {
        await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, $2, $3)`, [
          meaning.id,
          meaning.level,
          JSON.stringify([]),
        ]);

        await pool.query(
          `INSERT INTO approved_utterances (meaning_id, language, text)
           VALUES ($1, 'EN', 'Example sentence')`,
          [meaning.id]
        );
      }

      const batch = await service.getNextVocabularyBatch(userId, 'EN', 'B1', 100);
      const meaningIds = meanings.map((m) => m.id);
      const filteredBatch = batch.filter((item) => meaningIds.includes(item.meaningId));

      // Should get A1 and B1, but not C1
      expect(filteredBatch.length).toBe(2);
      expect(filteredBatch.every((item) => ['A1', 'B1'].includes(item.level))).toBe(true);
      expect(filteredBatch.some((item) => item.level === 'A1')).toBe(true);
      expect(filteredBatch.some((item) => item.level === 'B1')).toBe(true);
    });

    it('should respect batch size limit', async () => {
      const timestamp = Date.now();

      // Create 15 meanings
      for (let i = 0; i < 15; i++) {
        const meaningId = `en-vocab-seq-batch-${timestamp}-${i}`;
        await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, 'A1', $2)`, [
          meaningId,
          JSON.stringify([]),
        ]);

        await pool.query(
          `INSERT INTO approved_utterances (meaning_id, language, text)
           VALUES ($1, 'EN', 'Example sentence')`,
          [meaningId]
        );
      }

      const batch = await service.getNextVocabularyBatch(userId, 'EN', 'C2', 5);

      expect(batch.length).toBe(5);
    });

    it('should exclude already introduced vocabulary', async () => {
      const timestamp = Date.now();
      const meaningId = `en-vocab-seq-introduced-${timestamp}`;

      await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, 'A1', $2)`, [
        meaningId,
        JSON.stringify([]),
      ]);

      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'Example sentence')`,
        [meaningId]
      );

      // Mark as introduced
      await pool.query(
        `INSERT INTO user_word_state (user_id, meaning_id, language, state, first_seen_at)
         VALUES ($1, $2, 'EN', 'learning', current_timestamp)`,
        [userId, meaningId]
      );

      const batch = await service.getNextVocabularyBatch(userId, 'EN', 'C2', 10);

      expect(batch.every((item) => item.meaningId !== meaningId)).toBe(true);
    });

    it('should only return meanings with utterances', async () => {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const meaningWithUtterance = `en-vocab-seq-with-utt-${timestamp}-${random}`;
      const meaningWithoutUtterance = `en-vocab-seq-no-utt-${timestamp}-${random}`;

      // Meaning with utterance
      await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, 'A1', $2)`, [
        meaningWithUtterance,
        JSON.stringify([]),
      ]);

      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'Example sentence')`,
        [meaningWithUtterance]
      );

      // Meaning without utterance
      await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, 'A1', $2)`, [
        meaningWithoutUtterance,
        JSON.stringify([]),
      ]);

      const batch = await service.getNextVocabularyBatch(userId, 'EN', 'C2', 100);

      expect(batch.some((item) => item.meaningId === meaningWithUtterance)).toBe(true);
      expect(batch.some((item) => item.meaningId === meaningWithoutUtterance)).toBe(false);
    });

    it('should throw error for invalid CEFR level', async () => {
      await expect(service.getNextVocabularyBatch(userId, 'EN', 'INVALID', 10)).rejects.toThrow(
        'Invalid CEFR level'
      );
    });
  });

  describe('markVocabularyIntroduced', () => {
    it('should mark vocabulary as introduced', async () => {
      const timestamp = Date.now();
      const meaningId = `en-vocab-seq-mark-${timestamp}`;

      await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, 'A1', $2)`, [
        meaningId,
        JSON.stringify([]),
      ]);

      const result = await service.markVocabularyIntroduced(userId, [meaningId]);

      expect(result.markedCount).toBe(1);

      // Verify it was created
      interface StateRow {
        state: string;
        first_seen_at: Date | null;
      }
      const stateResult = await pool.query<StateRow>(
        `SELECT * FROM user_word_state WHERE user_id = $1 AND meaning_id = $2`,
        [userId, meaningId]
      );

      expect(stateResult.rows.length).toBe(1);
      expect(stateResult.rows[0].state).toBe('unknown');
      expect(stateResult.rows[0].first_seen_at).not.toBeNull();
    });

    it('should handle multiple meanings', async () => {
      const timestamp = Date.now();
      const meaningIds = [
        `en-vocab-seq-multi1-${timestamp}`,
        `en-vocab-seq-multi2-${timestamp}`,
        `en-vocab-seq-multi3-${timestamp}`,
      ];

      for (const meaningId of meaningIds) {
        await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, 'A1', $2)`, [
          meaningId,
          JSON.stringify([]),
        ]);
      }

      const result = await service.markVocabularyIntroduced(userId, meaningIds);

      expect(result.markedCount).toBe(3);
    });

    it('should not overwrite existing first_seen_at', async () => {
      const timestamp = Date.now();
      const meaningId = `en-vocab-seq-existing-${timestamp}`;

      await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, 'A1', $2)`, [
        meaningId,
        JSON.stringify([]),
      ]);

      // Create existing state with first_seen_at
      const existingDate = new Date('2024-01-01');
      await pool.query(
        `INSERT INTO user_word_state (user_id, meaning_id, language, state, first_seen_at)
         VALUES ($1, $2, 'EN', 'unknown', $3)`,
        [userId, meaningId, existingDate]
      );

      await service.markVocabularyIntroduced(userId, [meaningId]);

      // Verify first_seen_at was not changed
      interface StateRow {
        first_seen_at: Date;
      }
      const stateResult = await pool.query<StateRow>(
        `SELECT first_seen_at FROM user_word_state WHERE user_id = $1 AND meaning_id = $2`,
        [userId, meaningId]
      );

      const savedDate = new Date(stateResult.rows[0].first_seen_at);
      expect(savedDate.toISOString()).toBe(existingDate.toISOString());
    });

    it('should return zero count for empty array', async () => {
      const result = await service.markVocabularyIntroduced(userId, []);

      expect(result.markedCount).toBe(0);
    });
  });

  describe('getIntroductionStats', () => {
    it('should return statistics for available vocabulary', async () => {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);

      // Create meanings at different levels
      const meanings = [
        { id: `en-vocab-seq-stats-a1-1-${timestamp}-${random}`, level: 'A1' },
        { id: `en-vocab-seq-stats-a1-2-${timestamp}-${random}`, level: 'A1' },
        { id: `en-vocab-seq-stats-a2-${timestamp}-${random}`, level: 'A2' },
        { id: `en-vocab-seq-stats-b1-${timestamp}-${random}`, level: 'B1' },
      ];

      for (const meaning of meanings) {
        await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, $2, $3)`, [
          meaning.id,
          meaning.level,
          JSON.stringify([]),
        ]);

        await pool.query(
          `INSERT INTO approved_utterances (meaning_id, language, text)
           VALUES ($1, 'EN', 'Example sentence')`,
          [meaning.id]
        );
      }

      // Get stats before introducing
      const statsBefore = await service.getIntroductionStats(userId, 'EN');
      const countBefore = statsBefore.totalAvailable;

      // Mark all of them as introduced to exclude them from stats
      await service.markVocabularyIntroduced(
        userId,
        meanings.map((m) => m.id)
      );

      const statsAfter = await service.getIntroductionStats(userId, 'EN');

      // Should be 4 less after introducing our test data
      expect(statsAfter.totalAvailable).toBe(countBefore - 4);
    });

    it('should exclude introduced vocabulary from stats', async () => {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const meaningId = `en-vocab-seq-stats-excl-${timestamp}-${random}`;

      await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, 'A1', $2)`, [
        meaningId,
        JSON.stringify([]),
      ]);

      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'Example sentence')`,
        [meaningId]
      );

      // Get stats before introducing
      const statsBefore = await service.getIntroductionStats(userId, 'EN');
      const countBefore = statsBefore.totalAvailable;

      // Mark as introduced
      await pool.query(
        `INSERT INTO user_word_state (user_id, meaning_id, language, state, first_seen_at)
         VALUES ($1, $2, 'EN', 'learning', current_timestamp)`,
        [userId, meaningId]
      );

      // Get stats after introducing
      const statsAfter = await service.getIntroductionStats(userId, 'EN');
      const countAfter = statsAfter.totalAvailable;

      // Should be one less after introducing
      expect(countAfter).toBe(countBefore - 1);
    });
  });

  describe('getVocabularyByIds', () => {
    it('should return vocabulary details for given IDs', async () => {
      const timestamp = Date.now();
      const meaningIds = [`en-vocab-seq-byid1-${timestamp}`, `en-vocab-seq-byid2-${timestamp}`];

      for (const meaningId of meaningIds) {
        await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, 'A1', $2)`, [
          meaningId,
          JSON.stringify(['tag1']),
        ]);

        await pool.query(
          `INSERT INTO approved_utterances (meaning_id, language, text)
           VALUES ($1, 'EN', 'Example sentence')`,
          [meaningId]
        );
      }

      const result = await service.getVocabularyByIds(meaningIds);

      expect(result.length).toBe(2);
      expect(result[0].tags).toEqual(['tag1']);
      expect(result[0].utteranceCount).toBeGreaterThan(0);
    });

    it('should throw NotFoundError for non-existent IDs', async () => {
      await expect(service.getVocabularyByIds(['nonexistent-id'])).rejects.toThrow(
        'No vocabulary found for given IDs'
      );
    });

    it('should return empty array for empty input', async () => {
      const result = await service.getVocabularyByIds([]);

      expect(result).toEqual([]);
    });
  });
});
