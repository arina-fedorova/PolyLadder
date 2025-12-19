import { LifecycleState, StateTransition, InvalidTransitionError } from './states';
import { assertValidTransition } from './validator';

export interface TransitionParams {
  itemId: string;
  itemType: string;
  fromState: LifecycleState;
  toState: LifecycleState;
  metadata?: Record<string, unknown>;
}

export interface TransitionRepository {
  recordTransition(params: TransitionParams): Promise<StateTransition>;
  moveItemToState(
    itemId: string,
    itemType: string,
    fromState: LifecycleState,
    toState: LifecycleState
  ): Promise<void>;
}

export async function executeTransition(
  repository: TransitionRepository,
  params: TransitionParams
): Promise<StateTransition> {
  const { itemId, itemType, fromState, toState } = params;

  assertValidTransition(fromState, toState);

  const transition = await repository.recordTransition(params);
  await repository.moveItemToState(itemId, itemType, fromState, toState);

  return transition;
}

export function getTableForState(itemType: string, state: LifecycleState): string {
  const stateTableMap: Record<LifecycleState, string> = {
    [LifecycleState.DRAFT]: 'drafts',
    [LifecycleState.CANDIDATE]: 'candidates',
    [LifecycleState.VALIDATED]: 'validated',
    [LifecycleState.APPROVED]: `approved_${itemType.toLowerCase()}s`,
  };
  return stateTableMap[state];
}

export { InvalidTransitionError };
