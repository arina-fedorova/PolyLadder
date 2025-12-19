import { UserRole } from '../domain/enums';

export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  if (requiredRole === UserRole.LEARNER) {
    return true;
  }
  return userRole === requiredRole;
}

export function isOperator(userRole: UserRole): boolean {
  return userRole === UserRole.OPERATOR;
}

export function isLearner(userRole: UserRole): boolean {
  return userRole === UserRole.LEARNER;
}

export class AuthorizationError extends Error {
  constructor(message: string = 'Insufficient permissions') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export function assertRole(userRole: UserRole, requiredRole: UserRole): void {
  if (!hasRole(userRole, requiredRole)) {
    throw new AuthorizationError(
      `Access denied. Required role: ${requiredRole}, current role: ${userRole}`
    );
  }
}

export function assertOperator(userRole: UserRole): void {
  if (!isOperator(userRole)) {
    throw new AuthorizationError('Access denied. Operator role required.');
  }
}
