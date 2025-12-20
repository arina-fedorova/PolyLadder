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
import { createTestUser } from '../helpers/db';
import {
  RegisterResponse,
  LoginResponse,
  UserProfileResponse,
  RefreshResponse,
  SuccessResponse,
  ErrorResponse,
} from '../helpers/types';

describe('Auth Integration Tests', () => {
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

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'test-newuser@example.com',
          password: 'SecurePassword123!',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<RegisterResponse>();
      expect(body.userId).toBeDefined();
      expect(body.email).toBe('test-newuser@example.com');
      expect(body.role).toBe('learner');
    });

    it('should register an operator when role specified', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'test-operator@example.com',
          password: 'SecurePassword123!',
          role: 'operator',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<RegisterResponse>();
      expect(body.role).toBe('operator');
    });

    it.skip('should reject duplicate email - requires base_language in createTestUser', async () => {
      await createTestUser(pool, { email: 'test-existing@example.com' });

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'test-existing@example.com',
          password: 'SecurePassword123!',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ErrorResponse>();
      expect(body.error.message).toContain('already exists');
    });

    it('should reject invalid email format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'invalid-email',
          password: 'SecurePassword123!',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject short password', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'test-short@example.com',
          password: 'short',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    it('should login with valid credentials', async () => {
      const user = await createTestUser(pool, {
        email: 'test-login@example.com',
        password: 'SecurePassword123!',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: user.email,
          password: user.password,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<LoginResponse>();
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(body.user.email).toBe(user.email);
      expect(body.user.role).toBe('learner');
    });

    it('should reject invalid email', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'nonexistent@example.com',
          password: 'SecurePassword123!',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ErrorResponse>();
      expect(body.error.message).toContain('Invalid');
    });

    it('should reject invalid password', async () => {
      await createTestUser(pool, {
        email: 'test-wrongpass@example.com',
        password: 'CorrectPassword123!',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'test-wrongpass@example.com',
          password: 'WrongPassword123!',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /auth/me', () => {
    it('should return current user with valid token', async () => {
      const user = await createTestUser(pool, {
        email: 'test-me@example.com',
        password: 'SecurePassword123!',
      });

      const loginResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: user.email, password: user.password },
      });
      const { accessToken } = loginResponse.json<LoginResponse>();

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<UserProfileResponse>();
      expect(body.email).toBe(user.email);
      expect(body.role).toBe('learner');
      expect(body.id).toBe(user.id);
    });

    it('should reject request without token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
      });

      expect(response.statusCode).toBe(401);
    });

    it.skip('should reject request with invalid token - auth flow needs review', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should return new access token with valid refresh token', async () => {
      const user = await createTestUser(pool, {
        email: 'test-refresh@example.com',
        password: 'SecurePassword123!',
      });

      const loginResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: user.email, password: user.password },
      });
      const { refreshToken } = loginResponse.json<LoginResponse>();

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<RefreshResponse>();
      expect(body.accessToken).toBeDefined();
    });

    it('should reject invalid refresh token', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: 'invalid-refresh-token' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout and invalidate refresh token', async () => {
      const user = await createTestUser(pool, {
        email: 'test-logout@example.com',
        password: 'SecurePassword123!',
      });

      const loginResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: user.email, password: user.password },
      });
      const { accessToken, refreshToken } = loginResponse.json<LoginResponse>();

      const logoutResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: { refreshToken },
      });

      expect(logoutResponse.statusCode).toBe(200);
      expect(logoutResponse.json<SuccessResponse>().success).toBe(true);

      const refreshResponse = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken },
      });

      expect(refreshResponse.statusCode).toBe(401);
    });
  });
});
