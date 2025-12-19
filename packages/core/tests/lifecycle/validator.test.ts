import { describe, it, expect } from 'vitest';
import { LifecycleState, InvalidTransitionError } from '../../src/lifecycle/states';
import {
  isValidTransition,
  assertValidTransition,
  getNextValidStates,
  isTerminalState,
  canTransition,
  getStateOrder,
  isStateAfter,
} from '../../src/lifecycle/validator';

describe('Lifecycle Validator', () => {
  describe('isValidTransition', () => {
    it('should allow DRAFT → CANDIDATE', () => {
      expect(isValidTransition(LifecycleState.DRAFT, LifecycleState.CANDIDATE)).toBe(true);
    });

    it('should allow CANDIDATE → VALIDATED', () => {
      expect(isValidTransition(LifecycleState.CANDIDATE, LifecycleState.VALIDATED)).toBe(true);
    });

    it('should allow VALIDATED → APPROVED', () => {
      expect(isValidTransition(LifecycleState.VALIDATED, LifecycleState.APPROVED)).toBe(true);
    });

    it('should deny DRAFT → APPROVED (skip states)', () => {
      expect(isValidTransition(LifecycleState.DRAFT, LifecycleState.APPROVED)).toBe(false);
    });

    it('should deny DRAFT → VALIDATED (skip states)', () => {
      expect(isValidTransition(LifecycleState.DRAFT, LifecycleState.VALIDATED)).toBe(false);
    });

    it('should deny backward transition APPROVED → VALIDATED', () => {
      expect(isValidTransition(LifecycleState.APPROVED, LifecycleState.VALIDATED)).toBe(false);
    });

    it('should deny backward transition CANDIDATE → DRAFT', () => {
      expect(isValidTransition(LifecycleState.CANDIDATE, LifecycleState.DRAFT)).toBe(false);
    });

    it('should deny self transition', () => {
      expect(isValidTransition(LifecycleState.DRAFT, LifecycleState.DRAFT)).toBe(false);
    });
  });

  describe('assertValidTransition', () => {
    it('should not throw for valid transition', () => {
      expect(() =>
        assertValidTransition(LifecycleState.DRAFT, LifecycleState.CANDIDATE)
      ).not.toThrow();
    });

    it('should throw InvalidTransitionError for invalid transition', () => {
      expect(() => assertValidTransition(LifecycleState.DRAFT, LifecycleState.APPROVED)).toThrow(
        InvalidTransitionError
      );
    });

    it('should include states in error message', () => {
      try {
        assertValidTransition(LifecycleState.DRAFT, LifecycleState.APPROVED);
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidTransitionError);
        expect((error as InvalidTransitionError).message).toContain('DRAFT');
        expect((error as InvalidTransitionError).message).toContain('APPROVED');
      }
    });
  });

  describe('getNextValidStates', () => {
    it('should return CANDIDATE for DRAFT', () => {
      expect(getNextValidStates(LifecycleState.DRAFT)).toEqual([LifecycleState.CANDIDATE]);
    });

    it('should return VALIDATED for CANDIDATE', () => {
      expect(getNextValidStates(LifecycleState.CANDIDATE)).toEqual([LifecycleState.VALIDATED]);
    });

    it('should return APPROVED for VALIDATED', () => {
      expect(getNextValidStates(LifecycleState.VALIDATED)).toEqual([LifecycleState.APPROVED]);
    });

    it('should return empty array for APPROVED (terminal)', () => {
      expect(getNextValidStates(LifecycleState.APPROVED)).toEqual([]);
    });
  });

  describe('isTerminalState', () => {
    it('should return true for APPROVED', () => {
      expect(isTerminalState(LifecycleState.APPROVED)).toBe(true);
    });

    it('should return false for DRAFT', () => {
      expect(isTerminalState(LifecycleState.DRAFT)).toBe(false);
    });

    it('should return false for CANDIDATE', () => {
      expect(isTerminalState(LifecycleState.CANDIDATE)).toBe(false);
    });

    it('should return false for VALIDATED', () => {
      expect(isTerminalState(LifecycleState.VALIDATED)).toBe(false);
    });
  });

  describe('canTransition', () => {
    it('should return true for non-terminal states', () => {
      expect(canTransition(LifecycleState.DRAFT)).toBe(true);
      expect(canTransition(LifecycleState.CANDIDATE)).toBe(true);
      expect(canTransition(LifecycleState.VALIDATED)).toBe(true);
    });

    it('should return false for terminal state', () => {
      expect(canTransition(LifecycleState.APPROVED)).toBe(false);
    });
  });

  describe('getStateOrder', () => {
    it('should return correct order', () => {
      expect(getStateOrder(LifecycleState.DRAFT)).toBe(0);
      expect(getStateOrder(LifecycleState.CANDIDATE)).toBe(1);
      expect(getStateOrder(LifecycleState.VALIDATED)).toBe(2);
      expect(getStateOrder(LifecycleState.APPROVED)).toBe(3);
    });
  });

  describe('isStateAfter', () => {
    it('should return true for later state', () => {
      expect(isStateAfter(LifecycleState.APPROVED, LifecycleState.DRAFT)).toBe(true);
      expect(isStateAfter(LifecycleState.CANDIDATE, LifecycleState.DRAFT)).toBe(true);
    });

    it('should return false for earlier state', () => {
      expect(isStateAfter(LifecycleState.DRAFT, LifecycleState.APPROVED)).toBe(false);
    });

    it('should return false for same state', () => {
      expect(isStateAfter(LifecycleState.DRAFT, LifecycleState.DRAFT)).toBe(false);
    });
  });
});
