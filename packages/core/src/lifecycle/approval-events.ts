import { ApprovalType } from '../domain/enums';
import type { ApprovalEvent } from '../domain/pipeline';

export { ApprovalType };

export interface CreateApprovalParams {
  itemId: string;
  itemType: string;
  operatorId?: string;
  approvalType: ApprovalType;
  notes?: string;
}

export interface ApprovalEventRecord {
  id: string;
  itemId: string;
  itemType: string;
  operatorId?: string;
  approvalType: ApprovalType;
  notes?: string;
  createdAt: Date;
}

export interface ApprovalEventRepository {
  recordApproval(params: CreateApprovalParams): Promise<ApprovalEventRecord>;
  getApprovalEvent(itemId: string): Promise<ApprovalEventRecord | null>;
  getApprovalsByOperator(operatorId: string, limit?: number): Promise<ApprovalEventRecord[]>;
  getApprovalsByType(itemType: string, limit?: number): Promise<ApprovalEventRecord[]>;
  getApprovalStats(): Promise<ApprovalStats>;
}

export interface ApprovalStats {
  total: number;
  manual: number;
  automatic: number;
  byType: Record<string, number>;
}

export async function recordApproval(
  repository: ApprovalEventRepository,
  params: CreateApprovalParams
): Promise<ApprovalEventRecord> {
  if (params.approvalType === ApprovalType.MANUAL && !params.operatorId) {
    throw new ApprovalError('Manual approval requires operator ID');
  }

  return repository.recordApproval(params);
}

export async function getApprovalHistory(
  repository: ApprovalEventRepository,
  itemId: string
): Promise<ApprovalEventRecord | null> {
  return repository.getApprovalEvent(itemId);
}

export async function isApproved(
  repository: ApprovalEventRepository,
  itemId: string
): Promise<boolean> {
  const event = await repository.getApprovalEvent(itemId);
  return event !== null;
}

export class ApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApprovalError';
  }
}

export type { ApprovalEvent };
