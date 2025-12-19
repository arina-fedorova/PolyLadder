import { LifecycleState } from '../domain/enums';

export { LifecycleState };

export const VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  [LifecycleState.DRAFT]: [LifecycleState.CANDIDATE],
  [LifecycleState.CANDIDATE]: [LifecycleState.VALIDATED],
  [LifecycleState.VALIDATED]: [LifecycleState.APPROVED],
  [LifecycleState.APPROVED]: [],
};

export interface StateTransition {
  id: string;
  itemId: string;
  itemType: string;
  fromState: LifecycleState;
  toState: LifecycleState;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export class InvalidTransitionError extends Error {
  public readonly fromState: LifecycleState;
  public readonly toState: LifecycleState;

  constructor(from: LifecycleState, to: LifecycleState) {
    super(`Invalid transition from ${from} to ${to}`);
    this.name = 'InvalidTransitionError';
    this.fromState = from;
    this.toState = to;
  }
}
