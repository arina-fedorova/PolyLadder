import { LifecycleState, StateTransition, InvalidTransitionError } from './states';
import { assertValidTransition } from './validator';
import { ApprovalType } from '../domain/enums';
import {
  recordApproval,
  type ApprovalEventRepository,
  type CreateApprovalParams,
} from './approval-events';

export interface TransitionParams {
  itemId: string;
  itemType: string;
  fromState: LifecycleState;
  toState: LifecycleState;
  metadata?: Record<string, unknown>;
  approval?: {
    operatorId?: string;
    approvalType: ApprovalType;
    notes?: string;
  };
}

export interface TransitionRepository {
  recordTransition(params: TransitionParams): Promise<StateTransition>;
  moveItemToState(
    itemId: string,
    itemType: string,
    fromState: LifecycleState,
    toState: LifecycleState,
    metadata?: Record<string, unknown>
  ): Promise<void>;
}

export interface TransitionContext {
  transitionRepository: TransitionRepository;
  approvalRepository?: ApprovalEventRepository;
}

export async function executeTransition(
  context: TransitionContext,
  params: TransitionParams
): Promise<StateTransition> {
  const { itemId, itemType, fromState, toState, approval, metadata } = params;

  assertValidTransition(fromState, toState);

  const transition = await context.transitionRepository.recordTransition(params);
  await context.transitionRepository.moveItemToState(
    itemId,
    itemType,
    fromState,
    toState,
    metadata
  );

  if (toState === LifecycleState.APPROVED && context.approvalRepository) {
    const approvalParams: CreateApprovalParams = {
      itemId,
      itemType,
      operatorId: approval?.operatorId,
      approvalType: approval?.approvalType ?? ApprovalType.AUTOMATIC,
      notes: approval?.notes,
    };
    await recordApproval(context.approvalRepository, approvalParams);
  }

  return transition;
}

export async function executeTransitionSimple(
  repository: TransitionRepository,
  params: TransitionParams
): Promise<StateTransition> {
  return executeTransition({ transitionRepository: repository }, params);
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
