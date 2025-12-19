import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import {
  recordApproval,
  getApprovalHistory,
  isApproved,
  ApprovalError,
  ApprovalEventRepository,
  ApprovalEventRecord,
} from '../../src/lifecycle/approval-events';
import { ApprovalType } from '../../src/domain/enums';

describe('Approval Event Service', () => {
  let recordApprovalMock: Mock;
  let getApprovalEventMock: Mock;
  let getApprovalsByOperatorMock: Mock;
  let getApprovalsByTypeMock: Mock;
  let getApprovalStatsMock: Mock;
  let mockRepo: ApprovalEventRepository;

  beforeEach(() => {
    recordApprovalMock = vi.fn();
    getApprovalEventMock = vi.fn();
    getApprovalsByOperatorMock = vi.fn();
    getApprovalsByTypeMock = vi.fn();
    getApprovalStatsMock = vi.fn();
    mockRepo = {
      recordApproval: recordApprovalMock,
      getApprovalEvent: getApprovalEventMock,
      getApprovalsByOperator: getApprovalsByOperatorMock,
      getApprovalsByType: getApprovalsByTypeMock,
      getApprovalStats: getApprovalStatsMock,
    };
  });

  describe('recordApproval', () => {
    it('should record automatic approval', async () => {
      const params = {
        itemId: 'item-1',
        itemType: 'meaning',
        approvalType: ApprovalType.AUTOMATIC,
      };

      const expectedEvent: ApprovalEventRecord = {
        id: 'event-1',
        ...params,
        createdAt: new Date(),
      };

      recordApprovalMock.mockResolvedValue(expectedEvent);

      const result = await recordApproval(mockRepo, params);

      expect(recordApprovalMock).toHaveBeenCalledWith(params);
      expect(result).toEqual(expectedEvent);
    });

    it('should record manual approval with operator', async () => {
      const params = {
        itemId: 'item-1',
        itemType: 'meaning',
        operatorId: 'operator-1',
        approvalType: ApprovalType.MANUAL,
        notes: 'Reviewed and approved',
      };

      const expectedEvent: ApprovalEventRecord = {
        id: 'event-1',
        ...params,
        createdAt: new Date(),
      };

      recordApprovalMock.mockResolvedValue(expectedEvent);

      const result = await recordApproval(mockRepo, params);

      expect(result.operatorId).toBe('operator-1');
      expect(result.notes).toBe('Reviewed and approved');
    });

    it('should throw if manual approval without operator', async () => {
      const params = {
        itemId: 'item-1',
        itemType: 'meaning',
        approvalType: ApprovalType.MANUAL,
      };

      await expect(recordApproval(mockRepo, params)).rejects.toThrow(ApprovalError);
    });

    it('should throw ApprovalError with correct message', async () => {
      const params = {
        itemId: 'item-1',
        itemType: 'meaning',
        approvalType: ApprovalType.MANUAL,
      };

      try {
        await recordApproval(mockRepo, params);
      } catch (error) {
        expect(error).toBeInstanceOf(ApprovalError);
        expect((error as ApprovalError).message).toContain('operator');
      }
    });
  });

  describe('getApprovalHistory', () => {
    it('should return approval event if exists', async () => {
      const event: ApprovalEventRecord = {
        id: 'event-1',
        itemId: 'item-1',
        itemType: 'meaning',
        approvalType: ApprovalType.AUTOMATIC,
        createdAt: new Date(),
      };

      getApprovalEventMock.mockResolvedValue(event);

      const result = await getApprovalHistory(mockRepo, 'item-1');

      expect(getApprovalEventMock).toHaveBeenCalledWith('item-1');
      expect(result).toEqual(event);
    });

    it('should return null if not approved', async () => {
      getApprovalEventMock.mockResolvedValue(null);

      const result = await getApprovalHistory(mockRepo, 'item-1');

      expect(result).toBeNull();
    });
  });

  describe('isApproved', () => {
    it('should return true if approval event exists', async () => {
      getApprovalEventMock.mockResolvedValue({
        id: 'event-1',
        itemId: 'item-1',
        itemType: 'meaning',
        approvalType: ApprovalType.AUTOMATIC,
        createdAt: new Date(),
      });

      const result = await isApproved(mockRepo, 'item-1');

      expect(result).toBe(true);
    });

    it('should return false if no approval event', async () => {
      getApprovalEventMock.mockResolvedValue(null);

      const result = await isApproved(mockRepo, 'item-1');

      expect(result).toBe(false);
    });
  });
});
