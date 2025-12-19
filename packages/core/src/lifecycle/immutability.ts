export type AttemptedOperation = 'UPDATE' | 'DELETE';

export interface ViolationParams {
  itemId: string;
  itemType: string;
  attemptedOperation: AttemptedOperation;
  userId?: string;
}

export interface ViolationRecord {
  id: string;
  itemId: string;
  itemType: string;
  attemptedOperation: AttemptedOperation;
  userId?: string;
  attemptedAt: Date;
}

export interface ViolationRepository {
  logViolation(params: ViolationParams): Promise<ViolationRecord>;
  getViolations(itemId: string): Promise<ViolationRecord[]>;
  getViolationCount(itemId: string): Promise<number>;
}

export class ImmutabilityViolationError extends Error {
  public readonly itemId: string;
  public readonly operation: AttemptedOperation;

  constructor(itemId: string, operation: AttemptedOperation) {
    super(`Cannot ${operation.toLowerCase()} approved item ${itemId}. Use deprecation instead.`);
    this.name = 'ImmutabilityViolationError';
    this.itemId = itemId;
    this.operation = operation;
  }
}

export function assertMutable(
  isApproved: boolean,
  itemId: string,
  operation: AttemptedOperation
): void {
  if (isApproved) {
    throw new ImmutabilityViolationError(itemId, operation);
  }
}
