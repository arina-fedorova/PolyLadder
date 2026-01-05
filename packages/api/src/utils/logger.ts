import pino from 'pino';

const logLevel = process.env.LOG_LEVEL ?? 'info';

export const logger = pino({
  level: logLevel,
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  base: {
    service: 'api',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;

export interface ErrorContext {
  requestId?: string;
  method?: string;
  url?: string;
  userId?: string;
  [key: string]: unknown;
}

export interface PerformanceMetrics {
  operation: string;
  durationMs: number;
  success: boolean;
  metadata?: Record<string, unknown>;
}

export function logError(error: Error, context?: ErrorContext, customLogger?: Logger): void {
  const log = customLogger ?? logger;
  log.error(
    {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      ...context,
    },
    `Error: ${error.message}`
  );
}

export function logPerformance(metrics: PerformanceMetrics, customLogger?: Logger): void {
  const log = customLogger ?? logger;
  const level = metrics.success ? 'info' : 'warn';

  log[level](
    {
      performance: {
        operation: metrics.operation,
        durationMs: metrics.durationMs,
        success: metrics.success,
        ...metrics.metadata,
      },
    },
    `${metrics.operation} completed in ${metrics.durationMs}ms`
  );
}

export function createChildLogger(bindings: Record<string, unknown>): pino.Logger {
  return logger.child(bindings);
}
