import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  logger,
  logError,
  logPerformance,
  createChildLogger,
  ErrorContext,
  PerformanceMetrics,
} from '../../../src/utils/logger';

describe('Logger Utilities', () => {
  describe('logger', () => {
    it('should be a pino logger instance', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should have service binding', () => {
      const bindings = logger.bindings();
      expect(bindings.service).toBe('api');
    });
  });

  describe('logError', () => {
    const originalError = logger.error.bind(logger);
    let errorCalls: Array<{ obj: unknown; msg: string }>;

    beforeEach(() => {
      errorCalls = [];
      logger.error = vi.fn((obj: unknown, msg: string) => {
        errorCalls.push({ obj, msg });
        return logger;
      }) as unknown as typeof logger.error;
    });

    afterEach(() => {
      logger.error = originalError;
    });

    it('should log error with message and stack', () => {
      const error = new Error('Test error');
      logError(error);

      expect(errorCalls).toHaveLength(1);
      const call = errorCalls[0];
      expect(call.msg).toBe('Error: Test error');
      expect(call.obj).toMatchObject({
        error: {
          name: 'Error',
          message: 'Test error',
        },
      });
      expect((call.obj as { error: { stack?: string } }).error.stack).toBeDefined();
    });

    it('should include context in log', () => {
      const error = new Error('Context error');
      const context: ErrorContext = {
        requestId: 'req-123',
        method: 'POST',
        url: '/api/test',
        userId: 'user-456',
      };

      logError(error, context);

      expect(errorCalls).toHaveLength(1);
      const call = errorCalls[0];
      expect(call.obj).toMatchObject({
        requestId: 'req-123',
        method: 'POST',
        url: '/api/test',
        userId: 'user-456',
      });
    });

    it('should use custom logger when provided', () => {
      const customLogger = createChildLogger({ component: 'test' });
      const customErrorCalls: Array<{ obj: unknown; msg: string }> = [];
      const originalCustomError = customLogger.error.bind(customLogger);

      customLogger.error = vi.fn((obj: unknown, msg: string) => {
        customErrorCalls.push({ obj, msg });
        return customLogger;
      }) as unknown as typeof customLogger.error;

      const error = new Error('Custom logger error');
      logError(error, undefined, customLogger);

      expect(customErrorCalls).toHaveLength(1);
      expect(errorCalls).toHaveLength(0);

      customLogger.error = originalCustomError;
    });
  });

  describe('logPerformance', () => {
    const originalInfo = logger.info.bind(logger);
    const originalWarn = logger.warn.bind(logger);
    let infoCalls: Array<{ obj: unknown; msg: string }>;
    let warnCalls: Array<{ obj: unknown; msg: string }>;

    beforeEach(() => {
      infoCalls = [];
      warnCalls = [];
      logger.info = vi.fn((obj: unknown, msg: string) => {
        infoCalls.push({ obj, msg });
        return logger;
      }) as unknown as typeof logger.info;
      logger.warn = vi.fn((obj: unknown, msg: string) => {
        warnCalls.push({ obj, msg });
        return logger;
      }) as unknown as typeof logger.warn;
    });

    afterEach(() => {
      logger.info = originalInfo;
      logger.warn = originalWarn;
    });

    it('should log successful operation at info level', () => {
      const metrics: PerformanceMetrics = {
        operation: 'database.query',
        durationMs: 45,
        success: true,
      };

      logPerformance(metrics);

      expect(infoCalls).toHaveLength(1);
      expect(warnCalls).toHaveLength(0);
      const call = infoCalls[0];
      expect(call.msg).toBe('database.query completed in 45ms');
      expect(call.obj).toMatchObject({
        performance: {
          operation: 'database.query',
          durationMs: 45,
          success: true,
        },
      });
    });

    it('should log failed operation at warn level', () => {
      const metrics: PerformanceMetrics = {
        operation: 'api.call',
        durationMs: 5000,
        success: false,
      };

      logPerformance(metrics);

      expect(warnCalls).toHaveLength(1);
      expect(infoCalls).toHaveLength(0);
      const call = warnCalls[0];
      expect(call.msg).toBe('api.call completed in 5000ms');
      expect(call.obj).toMatchObject({
        performance: {
          operation: 'api.call',
          durationMs: 5000,
          success: false,
        },
      });
    });

    it('should include metadata in log', () => {
      const metrics: PerformanceMetrics = {
        operation: 'file.upload',
        durationMs: 1200,
        success: true,
        metadata: {
          fileSize: 1024,
          contentType: 'image/png',
        },
      };

      logPerformance(metrics);

      expect(infoCalls).toHaveLength(1);
      const call = infoCalls[0];
      expect(call.obj).toMatchObject({
        performance: {
          operation: 'file.upload',
          durationMs: 1200,
          success: true,
          fileSize: 1024,
          contentType: 'image/png',
        },
      });
    });
  });

  describe('createChildLogger', () => {
    it('should create child logger with bindings', () => {
      const childLogger = createChildLogger({
        component: 'auth',
        requestId: 'req-789',
      });

      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');

      const bindings = childLogger.bindings();
      expect(bindings.component).toBe('auth');
      expect(bindings.requestId).toBe('req-789');
    });

    it('should inherit parent service binding', () => {
      const childLogger = createChildLogger({ module: 'test' });
      const bindings = childLogger.bindings();

      expect(bindings.service).toBe('api');
      expect(bindings.module).toBe('test');
    });
  });
});
