export const API_VERSION = '0.1.0';

export { default as authorizationPlugin } from './plugins/authorization';
export { authMiddleware, optionalAuthMiddleware } from './middleware/auth';
export {
  protectRoute,
  protectOperatorRoute,
  protectLearnerRoute,
  optionalAuth,
} from './decorators/route-protection';
