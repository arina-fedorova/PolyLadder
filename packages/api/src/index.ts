export const API_VERSION = '0.1.0';

export { default as authorizationPlugin } from './plugins/authorization';
export { authMiddleware, optionalAuthMiddleware } from './middleware/auth';
export { requestLoggerMiddleware, responseLoggerHook } from './middleware/request-logger';
export {
  protectRoute,
  protectOperatorRoute,
  protectLearnerRoute,
  optionalAuth,
} from './decorators/route-protection';

export { buildServer, startServer, closeServer } from './server';
export { validateEnv, getEnv, resetEnv } from './config/env';
export type { Env } from './config/env';

export * from './schemas/common';
export * from './utils/db.utils';

export { logger, logError, logPerformance, createChildLogger } from './utils/logger';
export type { Logger, ErrorContext, PerformanceMetrics } from './utils/logger';
