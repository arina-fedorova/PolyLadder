import { describe, it, expect } from 'vitest';
import { assertMutable, ImmutabilityViolationError } from '../../src/lifecycle/immutability';

describe('Immutability', () => {
  describe('assertMutable', () => {
    it('should not throw for non-approved items', () => {
      expect(() => assertMutable(false, 'item-1', 'UPDATE')).not.toThrow();
      expect(() => assertMutable(false, 'item-1', 'DELETE')).not.toThrow();
    });

    it('should throw for approved items on UPDATE', () => {
      expect(() => assertMutable(true, 'item-1', 'UPDATE')).toThrow(ImmutabilityViolationError);
    });

    it('should throw for approved items on DELETE', () => {
      expect(() => assertMutable(true, 'item-1', 'DELETE')).toThrow(ImmutabilityViolationError);
    });

    it('should include item id in error', () => {
      try {
        assertMutable(true, 'my-item-123', 'UPDATE');
      } catch (error) {
        expect(error).toBeInstanceOf(ImmutabilityViolationError);
        expect((error as ImmutabilityViolationError).itemId).toBe('my-item-123');
        expect((error as ImmutabilityViolationError).message).toContain('my-item-123');
      }
    });

    it('should include operation in error', () => {
      try {
        assertMutable(true, 'item-1', 'DELETE');
      } catch (error) {
        expect(error).toBeInstanceOf(ImmutabilityViolationError);
        expect((error as ImmutabilityViolationError).operation).toBe('DELETE');
        expect((error as ImmutabilityViolationError).message).toContain('delete');
      }
    });

    it('should suggest deprecation in error message', () => {
      try {
        assertMutable(true, 'item-1', 'UPDATE');
      } catch (error) {
        expect((error as ImmutabilityViolationError).message).toContain('deprecation');
      }
    });
  });

  describe('ImmutabilityViolationError', () => {
    it('should have correct name', () => {
      const error = new ImmutabilityViolationError('item-1', 'UPDATE');
      expect(error.name).toBe('ImmutabilityViolationError');
    });

    it('should expose itemId and operation', () => {
      const error = new ImmutabilityViolationError('item-123', 'DELETE');
      expect(error.itemId).toBe('item-123');
      expect(error.operation).toBe('DELETE');
    });
  });
});
