import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { getTestPool, cleanupTestData, closeTestPool, setupTestEnv } from '../setup';
import { UtteranceService } from '../../src/services/vocabulary/utterance.service';

describe('Utterance Service Integration Tests', () => {
  let pool: Pool;
  let service: UtteranceService;
  let meaningId: string;

  beforeAll(() => {
    setupTestEnv();
    pool = getTestPool();
    service = new UtteranceService(pool);
  });

  afterAll(async () => {
    await closeTestPool();
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Clean up user_word_state
    await pool.query(`DELETE FROM user_word_state`);

    // Create test meaning
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    meaningId = `en-utterance-test-${timestamp}-${random}`;

    await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, 'A1', $2)`, [
      meaningId,
      JSON.stringify(['test']),
    ]);
  });

  describe('getUtterancesForMeaning', () => {
    it('should return utterances for a meaning', async () => {
      // Create test utterances
      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'This is a short sentence.')`,
        [meaningId]
      );

      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'This is a longer sentence with more words.')`,
        [meaningId]
      );

      const utterances = await service.getUtterancesForMeaning(meaningId, 10);

      expect(utterances.length).toBe(2);
      expect(utterances[0].meaningId).toBe(meaningId);
      expect(utterances[0].text).toBeTruthy();
      // Shorter sentence should come first
      expect(utterances[0].text.length).toBeLessThan(utterances[1].text.length);
    });

    it('should respect limit parameter', async () => {
      // Create 5 utterances
      for (let i = 0; i < 5; i++) {
        await pool.query(
          `INSERT INTO approved_utterances (meaning_id, language, text)
           VALUES ($1, 'EN', $2)`,
          [meaningId, `Example sentence number ${i}.`]
        );
      }

      const utterances = await service.getUtterancesForMeaning(meaningId, 3);

      expect(utterances.length).toBe(3);
    });

    it('should return empty array for meaning with no utterances', async () => {
      const utterances = await service.getUtterancesForMeaning(meaningId, 10);

      expect(utterances).toEqual([]);
    });

    it('should include audio_url and usage_notes when available', async () => {
      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text, audio_url, usage_notes, register)
         VALUES ($1, 'EN', 'Example with metadata.', 'https://example.com/audio.mp3', 'Common in formal contexts', 'formal')`,
        [meaningId]
      );

      const utterances = await service.getUtterancesForMeaning(meaningId, 10);

      expect(utterances.length).toBe(1);
      expect(utterances[0].audioUrl).toBe('https://example.com/audio.mp3');
      expect(utterances[0].usageNotes).toBe('Common in formal contexts');
      expect(utterances[0].register).toBe('formal');
    });
  });

  describe('getUtterancesForMeanings', () => {
    it('should return utterances for multiple meanings', async () => {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const meaning1 = `en-multi1-${timestamp}-${random}`;
      const meaning2 = `en-multi2-${timestamp}-${random}`;

      // Create meanings
      await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, 'A1', $2)`, [
        meaning1,
        JSON.stringify([]),
      ]);
      await pool.query(`INSERT INTO approved_meanings (id, level, tags) VALUES ($1, 'A1', $2)`, [
        meaning2,
        JSON.stringify([]),
      ]);

      // Create utterances for meaning1
      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'First meaning utterance.')`,
        [meaning1]
      );

      // Create utterances for meaning2
      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'Second meaning utterance.')`,
        [meaning2]
      );

      const utteranceMap = await service.getUtterancesForMeanings([meaning1, meaning2], 10);

      expect(utteranceMap.size).toBe(2);
      expect(utteranceMap.get(meaning1)).toHaveLength(1);
      expect(utteranceMap.get(meaning2)).toHaveLength(1);
      expect(utteranceMap.get(meaning1)?.[0].text).toBe('First meaning utterance.');
      expect(utteranceMap.get(meaning2)?.[0].text).toBe('Second meaning utterance.');
    });

    it('should respect per-meaning limit', async () => {
      // Create 5 utterances for the same meaning
      for (let i = 0; i < 5; i++) {
        await pool.query(
          `INSERT INTO approved_utterances (meaning_id, language, text)
           VALUES ($1, 'EN', $2)`,
          [meaningId, `Example ${i}`]
        );
      }

      const utteranceMap = await service.getUtterancesForMeanings([meaningId], 2);

      expect(utteranceMap.get(meaningId)).toHaveLength(2);
    });

    it('should return empty map for empty input', async () => {
      const utteranceMap = await service.getUtterancesForMeanings([], 10);

      expect(utteranceMap.size).toBe(0);
    });
  });

  describe('getMeaningWithUtterances', () => {
    it('should return meaning with its utterances', async () => {
      // Create utterances
      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'Example utterance.')`,
        [meaningId]
      );

      const result = await service.getMeaningWithUtterances(meaningId, 10);

      expect(result).not.toBeNull();
      expect(result?.meaningId).toBe(meaningId);
      expect(result?.level).toBe('A1');
      expect(result?.tags).toEqual(['test']);
      expect(result?.utterances.length).toBe(1);
      expect(result?.utterances[0].text).toBe('Example utterance.');
    });

    it('should return null for non-existent meaning', async () => {
      const result = await service.getMeaningWithUtterances('nonexistent-id', 10);

      expect(result).toBeNull();
    });

    it('should return meaning even with no utterances', async () => {
      const result = await service.getMeaningWithUtterances(meaningId, 10);

      expect(result).not.toBeNull();
      expect(result?.meaningId).toBe(meaningId);
      expect(result?.utterances).toEqual([]);
    });
  });

  describe('getRandomUtterance', () => {
    it('should return a random utterance', async () => {
      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'Random utterance.')`,
        [meaningId]
      );

      const utterance = await service.getRandomUtterance(meaningId);

      expect(utterance).not.toBeNull();
      expect(utterance?.meaningId).toBe(meaningId);
      expect(utterance?.text).toBe('Random utterance.');
    });

    it('should return null for meaning with no utterances', async () => {
      const utterance = await service.getRandomUtterance(meaningId);

      expect(utterance).toBeNull();
    });
  });

  describe('getUtterancesByLanguage', () => {
    it('should filter utterances by language', async () => {
      // Create English utterance
      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'English utterance.')`,
        [meaningId]
      );

      // Create Italian utterance
      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'IT', 'Italian utterance.')`,
        [meaningId]
      );

      const enUtterances = await service.getUtterancesByLanguage(meaningId, 'EN', 10);
      const itUtterances = await service.getUtterancesByLanguage(meaningId, 'IT', 10);

      expect(enUtterances.length).toBe(1);
      expect(enUtterances[0].language).toBe('EN');
      expect(enUtterances[0].text).toBe('English utterance.');

      expect(itUtterances.length).toBe(1);
      expect(itUtterances[0].language).toBe('IT');
      expect(itUtterances[0].text).toBe('Italian utterance.');
    });

    it('should return empty array for language with no utterances', async () => {
      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'English only.')`,
        [meaningId]
      );

      const utterances = await service.getUtterancesByLanguage(meaningId, 'PT', 10);

      expect(utterances).toEqual([]);
    });
  });

  describe('hasUtterances', () => {
    it('should return true when utterances exist', async () => {
      await pool.query(
        `INSERT INTO approved_utterances (meaning_id, language, text)
         VALUES ($1, 'EN', 'Test utterance.')`,
        [meaningId]
      );

      const has = await service.hasUtterances(meaningId);

      expect(has).toBe(true);
    });

    it('should return false when no utterances exist', async () => {
      const has = await service.hasUtterances(meaningId);

      expect(has).toBe(false);
    });
  });

  describe('getUtteranceCount', () => {
    it('should return correct count', async () => {
      // Create 3 utterances
      for (let i = 0; i < 3; i++) {
        await pool.query(
          `INSERT INTO approved_utterances (meaning_id, language, text)
           VALUES ($1, 'EN', $2)`,
          [meaningId, `Utterance ${i}`]
        );
      }

      const count = await service.getUtteranceCount(meaningId);

      expect(count).toBe(3);
    });

    it('should return 0 for meaning with no utterances', async () => {
      const count = await service.getUtteranceCount(meaningId);

      expect(count).toBe(0);
    });
  });
});
