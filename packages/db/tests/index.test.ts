import { describe, it, expect } from 'vitest';
import { DB_VERSION, query, getClient, close } from '../src/index';

describe('db', () => {
  it('exports DB_VERSION', () => {
    expect(DB_VERSION).toBe('0.1.0');
  });

  it('exports connection functions', () => {
    expect(query).toBeDefined();
    expect(getClient).toBeDefined();
    expect(close).toBeDefined();
  });
});
