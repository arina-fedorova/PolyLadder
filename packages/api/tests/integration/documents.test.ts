import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import FormData from 'form-data';
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

describe('Document Upload Integration Tests', () => {
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

  function createPDFBuffer(): Buffer {
    const pdfHeader = Buffer.from('%PDF-1.4\n');
    const pdfContent = Buffer.from(
      '1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 0\ntrailer\n<< /Size 0 /Root 1 0 R >>\nstartxref\n0\n%%EOF'
    );
    return Buffer.concat([pdfHeader, pdfContent]);
  }

  function createInvalidBuffer(): Buffer {
    const invalidContent = Buffer.alloc(200);
    invalidContent.fill(0);
    invalidContent.write('This is not a valid PDF or DOCX file', 0);
    return invalidContent;
  }

  describe('POST /operational/documents/upload', () => {
    it('should upload valid PDF file', async () => {
      const token = await getOperatorToken();
      const pdfBuffer = createPDFBuffer();

      const formData = new FormData();
      formData.append('file', pdfBuffer, {
        filename: 'test.pdf',
        contentType: 'application/pdf',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/documents/upload',
        headers: {
          authorization: `Bearer ${token}`,
          ...formData.getHeaders(),
        },
        payload: formData,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ document: { id: string; filename: string } }>();
      expect(body.document).toBeDefined();
      expect(body.document.id).toBeDefined();
    });

    it('should reject file with incorrect magic bytes', async () => {
      const token = await getOperatorToken();
      const invalidBuffer = createInvalidBuffer();

      const formData = new FormData();
      formData.append('file', invalidBuffer, {
        filename: 'test.pdf',
        contentType: 'application/pdf',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/documents/upload',
        headers: {
          authorization: `Bearer ${token}`,
          ...formData.getHeaders(),
        },
        payload: formData,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: { message: string } }>();
      expect(body.error.message).toContain('Magic bytes validation failed');
    });

    it('should reject empty file', async () => {
      const token = await getOperatorToken();
      const emptyBuffer = Buffer.alloc(0);

      const formData = new FormData();
      formData.append('file', emptyBuffer, {
        filename: 'empty.pdf',
        contentType: 'application/pdf',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/documents/upload',
        headers: {
          authorization: `Bearer ${token}`,
          ...formData.getHeaders(),
        },
        payload: formData,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: { message: string } }>();
      expect(body.error.message).toContain('File is empty');
    });

    it('should reject file that is too small', async () => {
      const token = await getOperatorToken();
      const smallBuffer = Buffer.alloc(50);

      const formData = new FormData();
      formData.append('file', smallBuffer, {
        filename: 'small.pdf',
        contentType: 'application/pdf',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/documents/upload',
        headers: {
          authorization: `Bearer ${token}`,
          ...formData.getHeaders(),
        },
        payload: formData,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: { message: string } }>();
      expect(body.error.message).toContain('File is too small');
    });

    it('should reject filename with dangerous characters', async () => {
      const token = await getOperatorToken();
      const pdfBuffer = createPDFBuffer();

      const formData = new FormData();
      formData.append('file', pdfBuffer, {
        filename: 'file<with>invalid:chars.pdf',
        contentType: 'application/pdf',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/documents/upload',
        headers: {
          authorization: `Bearer ${token}`,
          ...formData.getHeaders(),
        },
        payload: formData,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: { message: string } }>();
      expect(body.error.message).toContain('invalid characters');
    });

    it('should reject invalid MIME type', async () => {
      const token = await getOperatorToken();
      const pdfBuffer = createPDFBuffer();

      const formData = new FormData();
      formData.append('file', pdfBuffer, {
        filename: 'test.zip',
        contentType: 'application/zip',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/documents/upload',
        headers: {
          authorization: `Bearer ${token}`,
          ...formData.getHeaders(),
        },
        payload: formData,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: { message: string } }>();
      expect(body.error.message).toContain('Invalid file type');
    });

    it('should reject request without authentication', async () => {
      const pdfBuffer = createPDFBuffer();

      const formData = new FormData();
      formData.append('file', pdfBuffer, {
        filename: 'test.pdf',
        contentType: 'application/pdf',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/documents/upload',
        headers: {
          ...formData.getHeaders(),
        },
        payload: formData,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject request without file', async () => {
      const token = await getOperatorToken();

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/operational/documents/upload',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {},
      });

      expect([400, 406]).toContain(response.statusCode);
      if (response.statusCode === 400) {
        const body = response.json<{ error: { message: string } }>();
        expect(body.error.message).toContain('No file uploaded');
      }
    });
  });
});
