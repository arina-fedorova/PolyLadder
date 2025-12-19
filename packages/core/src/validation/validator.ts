import { z } from 'zod';

export interface SchemaValidationResult {
  valid: boolean;
  errors?: ValidationIssue[];
  data?: unknown;
}

export interface ValidationIssue {
  field: string;
  message: string;
  code: string;
  expected?: string;
  received?: string;
}

export function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): SchemaValidationResult {
  const result = schema.safeParse(data);

  if (result.success) {
    return { valid: true, data: result.data };
  }

  const issues = result.error.issues ?? [];
  const errors: ValidationIssue[] = issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
    expected: 'expected' in issue ? String(issue.expected) : undefined,
    received: 'received' in issue ? String(issue.received) : undefined,
  }));

  return { valid: false, errors };
}

export function assertValidSchema<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

export function isValidSchema<T>(schema: z.ZodSchema<T>, data: unknown): data is T {
  return schema.safeParse(data).success;
}

export class SchemaValidationError extends Error {
  public readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    const message = issues.map((e) => `${e.field}: ${e.message}`).join('; ');
    super(`Schema validation failed: ${message}`);
    this.name = 'SchemaValidationError';
    this.issues = issues;
  }
}

export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = validateSchema(schema, data);
  if (!result.valid && result.errors) {
    throw new SchemaValidationError(result.errors);
  }
  return result.data as T;
}
