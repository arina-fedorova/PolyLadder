import { describe, it, expect } from 'vitest';
import { VERSION, Language, CEFRLevel, UserRole, UserSchema, MeaningSchema, z } from '../src/index';

describe('core', () => {
  it('exports VERSION', () => {
    expect(VERSION).toBe('0.1.0');
  });

  it('exports enums', () => {
    expect(Language.EN).toBe('EN');
    expect(CEFRLevel.A1).toBe('A1');
    expect(UserRole.LEARNER).toBe('learner');
  });

  it('exports Zod schemas', () => {
    expect(UserSchema).toBeDefined();
    expect(MeaningSchema).toBeDefined();
  });

  it('exports Zod for consumers', () => {
    expect(z).toBeDefined();
    expect(z.string).toBeDefined();
  });
});
