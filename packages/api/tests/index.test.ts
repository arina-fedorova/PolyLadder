import { describe, it, expect } from 'vitest';
import { API_VERSION } from '../src/index';

describe('api', () => {
  it('exports API_VERSION', () => {
    expect(API_VERSION).toBe('0.1.0');
  });
});
