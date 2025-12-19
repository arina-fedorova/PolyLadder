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
