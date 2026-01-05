import { describe, it, expect, vi, beforeEach, afterEach, MockInstance } from 'vitest';
import pino from 'pino';
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
    let errorSpy: MockInstance<pino.Logger['error']>;

    beforeEach(() => {
      errorSpy = vi.spyOn(logger, 'error').mockReturnValue(logger);
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it('should log error with message and stack', () => {
      const error = new Error('Test error');
      logError(error);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            name: 'Error',
            message: 'Test error',
            stack: expect.stringContaining('Error') as unknown,
          }) as unknown,
        }),
        'Error: Test error'
      );
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

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-123',
          method: 'POST',
          url: '/api/test',
          userId: 'user-456',
        }),
        expect.stringContaining('Error') as unknown
      );
    });

    it('should use custom logger when provided', () => {
      const customLogger = createChildLogger({ component: 'test' });
      const customErrorSpy: MockInstance<pino.Logger['error']> = vi
        .spyOn(customLogger, 'error')
        .mockReturnValue(customLogger);

      const error = new Error('Custom logger error');
      logError(error, undefined, customLogger);

      expect(customErrorSpy).toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();

      customErrorSpy.mockRestore();
    });
  });

  describe('logPerformance', () => {
    let infoSpy: MockInstance<pino.Logger['info']>;
    let warnSpy: MockInstance<pino.Logger['warn']>;

    beforeEach(() => {
      infoSpy = vi.spyOn(logger, 'info').mockReturnValue(logger);
      warnSpy = vi.spyOn(logger, 'warn').mockReturnValue(logger);
    });

    afterEach(() => {
      infoSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('should log successful operation at info level', () => {
      const metrics: PerformanceMetrics = {
        operation: 'database.query',
        durationMs: 45,
        success: true,
      };

      logPerformance(metrics);

      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          performance: expect.objectContaining({
            operation: 'database.query',
            durationMs: 45,
            success: true,
          }) as unknown,
        }),
        'database.query completed in 45ms'
      );
    });

    it('should log failed operation at warn level', () => {
      const metrics: PerformanceMetrics = {
        operation: 'api.call',
        durationMs: 5000,
        success: false,
      };

      logPerformance(metrics);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          performance: expect.objectContaining({
            operation: 'api.call',
            durationMs: 5000,
            success: false,
          }) as unknown,
        }),
        'api.call completed in 5000ms'
      );
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

      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          performance: expect.objectContaining({
            operation: 'file.upload',
            durationMs: 1200,
            success: true,
            fileSize: 1024,
            contentType: 'image/png',
          }) as unknown,
        }),
        expect.stringContaining('completed') as unknown
      );
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
