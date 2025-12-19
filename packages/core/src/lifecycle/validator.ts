import { LifecycleState, VALID_TRANSITIONS, InvalidTransitionError } from './states';

export function isValidTransition(from: LifecycleState, to: LifecycleState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function assertValidTransition(from: LifecycleState, to: LifecycleState): void {
  if (!isValidTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function getNextValidStates(current: LifecycleState): LifecycleState[] {
  return VALID_TRANSITIONS[current];
}

export function isTerminalState(state: LifecycleState): boolean {
  return VALID_TRANSITIONS[state].length === 0;
}

export function canTransition(from: LifecycleState): boolean {
  return !isTerminalState(from);
}

export function getStateOrder(state: LifecycleState): number {
  const order: Record<LifecycleState, number> = {
    [LifecycleState.DRAFT]: 0,
    [LifecycleState.CANDIDATE]: 1,
    [LifecycleState.VALIDATED]: 2,
    [LifecycleState.APPROVED]: 3,
  };
  return order[state];
}

export function isStateAfter(state: LifecycleState, referenceState: LifecycleState): boolean {
  return getStateOrder(state) > getStateOrder(referenceState);
}
