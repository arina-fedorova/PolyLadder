import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import {
  createTestServer,
  closeTestServer,
  getTestPool,
  cleanupTestData,
  closeTestPool,
  setupTestEnv,
} from '../setup';
import { createTestOperator } from '../helpers/db';
import { LoginResponse } from '../helpers/types';

describe('Curriculum Integration Tests', () => {
  let server: FastifyInstance;
  let pool: Pool;

  beforeAll(async () => {
    setupTestEnv();
    pool = getTestPool();
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer();
    await closeTestPool();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  async function getOperatorToken(): Promise<string> {
    const operator = await createTestOperator(pool, {
      email: `test-operator-${Date.now()}@example.com`,
      password: 'OperatorPassword123!',
    });

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: operator.email, password: operator.password },
    });

    expect(response.statusCode).toBe(200);
    return response.json<LoginResponse>().accessToken;
  }

  async function createTestLevel(language: string, cefrLevel: string): Promise<string> {
    const existing = await pool.query(
      `SELECT id FROM curriculum_levels WHERE language = $1 AND cefr_level = $2`,
      [language, cefrLevel]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0] as { id: string };
      return row.id;
    }

    const result = await pool.query<{ id: string }>(
      `INSERT INTO curriculum_levels (language, cefr_level, name, description, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [language, cefrLevel, `${cefrLevel} Level`, `Description for ${cefrLevel}`, 0]
    );
    return result.rows[0].id;
  }

  describe('POST /operational/curriculum/topics/bulk', () => {
    it('should create multiple topics in bulk', async () => {
      const token = await getOperatorToken();
      const levelId = await createTestLevel('EN', 'A1');

      const topics = [
        {
          levelId,
          name: 'Basic Greetings',
          description: 'Learn how to greet people',
          contentType: 'vocabulary' as const,
          sortOrder: 0,
          estimatedItems: 10,
        },
        {
          levelId,
          name: 'Numbers 1-10',
          description: 'Learn numbers from 1 to 10',
          contentType: 'vocabulary' as const,
          sortOrder: 1,
          estimatedItems: 10,
        },
        {
          levelId,
          name: 'Present Tense',
          description: 'Basic present tense grammar',
          contentType: 'grammar' as const,
          sortOrder: 2,
          estimatedItems: 5,
        },
      ];

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/curriculum/topics/bulk',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: { topics },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{
        created: number;
        failed: number;
        topics: Array<{ name: string }>;
        errors: unknown[];
      }>();
      expect(body.created).toBe(3);
      expect(body.failed).toBe(0);
      expect(body.topics).toHaveLength(3);
      expect(body.errors).toHaveLength(0);

      expect(body.topics[0].name).toBe('Basic Greetings');
      expect(body.topics[1].name).toBe('Numbers 1-10');
      expect(body.topics[2].name).toBe('Present Tense');
    });

    it('should handle prerequisites in bulk create', async () => {
      const token = await getOperatorToken();
      const levelId = await createTestLevel('EN', 'A1');

      const firstTopic = {
        levelId,
        name: 'Basic Greetings',
        contentType: 'vocabulary' as const,
      };

      const createFirstResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/curriculum/topics',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: firstTopic,
      });

      expect(createFirstResponse.statusCode).toBe(201);
      const firstTopicId = createFirstResponse.json<{ topic: { id: string } }>().topic.id;

      const topics = [
        {
          levelId,
          name: 'Advanced Greetings',
          contentType: 'vocabulary' as const,
          prerequisites: [firstTopicId],
        },
        {
          levelId,
          name: 'Formal Greetings',
          contentType: 'vocabulary' as const,
          prerequisites: [firstTopicId],
        },
      ];

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/curriculum/topics/bulk',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: { topics },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{
        created: number;
        topics: Array<{ prerequisites: string[] }>;
      }>();
      expect(body.created).toBe(2);
      expect(body.topics[0].prerequisites).toContain(firstTopicId);
      expect(body.topics[1].prerequisites).toContain(firstTopicId);
    });

    it('should handle partial failures gracefully', async () => {
      const token = await getOperatorToken();
      const levelId = await createTestLevel('EN', 'A1');

      const invalidTopicId = '00000000-0000-0000-0000-000000000000';

      const topics = [
        {
          levelId,
          name: 'Valid Topic',
          contentType: 'vocabulary' as const,
        },
        {
          levelId,
          name: 'Topic with Invalid Prerequisite',
          contentType: 'vocabulary' as const,
          prerequisites: [invalidTopicId],
        },
        {
          levelId,
          name: 'Another Valid Topic',
          contentType: 'grammar' as const,
        },
      ];

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/curriculum/topics/bulk',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: { topics },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{
        created: number;
        failed: number;
        errors: unknown[];
      }>();
      expect(body.created).toBeGreaterThan(0);
      expect(body.failed).toBeGreaterThan(0);
      expect(body.errors.length).toBeGreaterThan(0);
    });

    it('should reject bulk create without authentication', async () => {
      const levelId = await createTestLevel('EN', 'A1');

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/curriculum/topics/bulk',
        payload: {
          topics: [
            {
              levelId,
              name: 'Test Topic',
              contentType: 'vocabulary' as const,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject empty topics array', async () => {
      const token = await getOperatorToken();

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/curriculum/topics/bulk',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: { topics: [] },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.statusCode).toBeLessThan(500);
    });

    it('should enforce maximum limit of 1000 topics', async () => {
      const token = await getOperatorToken();
      const levelId = await createTestLevel('EN', 'A1');

      const topics = Array.from({ length: 1001 }, (_, i) => ({
        levelId,
        name: `Topic ${i}`,
        contentType: 'vocabulary' as const,
      }));

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/curriculum/topics/bulk',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: { topics },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /operational/curriculum/topics/:levelId/import', () => {
    it('should import topics for a specific level', async () => {
      const token = await getOperatorToken();
      const levelId = await createTestLevel('EN', 'A1');

      const topics = [
        {
          name: 'Imported Topic 1',
          description: 'First imported topic',
          contentType: 'vocabulary' as const,
          sortOrder: 0,
        },
        {
          name: 'Imported Topic 2',
          description: 'Second imported topic',
          contentType: 'grammar' as const,
          sortOrder: 1,
        },
      ];

      const response = await server.inject({
        method: 'POST',
        url: `/api/v1/operational/curriculum/topics/${levelId}/import`,
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: { topics },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        imported: number;
        total: number;
      }>();
      expect(body.imported).toBe(2);
      expect(body.total).toBe(2);
    });
  });
});
