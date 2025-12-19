import { describe, it, expect } from 'vitest';
import { SERVICE_VERSION } from '../src/index';

describe('refinement-service', () => {
  it('exports SERVICE_VERSION', () => {
    expect(SERVICE_VERSION).toBe('0.1.0');
  });
});
