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

  async function createTestLevel(
    language: string,
    cefrLevel: string,
    uniqueName?: string
  ): Promise<string> {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    const levelName = uniqueName ?? `${cefrLevel} Level ${timestamp}-${randomSuffix}`;

    const result = await pool.query<{ id: string }>(
      `INSERT INTO curriculum_levels (language, cefr_level, name, description, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (language, cefr_level) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [language, cefrLevel, levelName, `Description for ${levelName}`, 0]
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
      const levelId = await createTestLevel('EN', 'A1', `Test Level ${Date.now()}`);

      const timestamp = Date.now();
      const firstTopic = {
        levelId,
        name: `Basic Greetings ${timestamp}`,
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

      const bulkTimestamp = Date.now();
      const topics = [
        {
          levelId,
          name: `Advanced Greetings ${bulkTimestamp}`,
          contentType: 'vocabulary' as const,
          prerequisites: [firstTopicId],
        },
        {
          levelId,
          name: `Formal Greetings ${bulkTimestamp}`,
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
      const levelId = await createTestLevel('EN', 'A1', `Test Level ${Date.now()}`);

      const invalidTopicId = '00000000-0000-0000-0000-000000000000';

      const timestamp = Date.now();
      const topics = [
        {
          levelId,
          name: `Valid Topic ${timestamp}`,
          contentType: 'vocabulary' as const,
        },
        {
          levelId,
          name: `Topic with Invalid Prerequisite ${timestamp}`,
          contentType: 'vocabulary' as const,
          prerequisites: [invalidTopicId],
        },
        {
          levelId,
          name: `Another Valid Topic ${timestamp}`,
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

      const timestamp = Date.now();
      const topics = [
        {
          name: `Imported Topic 1 ${timestamp}`,
          description: 'First imported topic',
          contentType: 'vocabulary' as const,
          sortOrder: 0,
        },
        {
          name: `Imported Topic 2 ${timestamp}`,
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
