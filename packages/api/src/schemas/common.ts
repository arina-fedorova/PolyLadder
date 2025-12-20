import { Type, Static, TSchema } from '@sinclair/typebox';

export const UuidSchema = Type.String({
  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  description: 'UUID identifier',
});

export const ErrorResponseSchema = Type.Object({
  error: Type.Object({
    statusCode: Type.Number(),
    message: Type.String(),
    requestId: Type.String(),
    code: Type.Optional(Type.String()),
    details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  }),
});

export type ErrorResponse = Static<typeof ErrorResponseSchema>;

export const PaginationQuerySchema = Type.Object({
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Number({ minimum: 0, default: 0 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

export function PaginatedResponseSchema<T extends TSchema>(itemSchema: T) {
  return Type.Object({
    items: Type.Array(itemSchema),
    total: Type.Number(),
    limit: Type.Number(),
    offset: Type.Number(),
    hasMore: Type.Boolean(),
  });
}

export const SuccessResponseSchema = Type.Object({
  success: Type.Literal(true),
  message: Type.Optional(Type.String()),
});

export type SuccessResponse = Static<typeof SuccessResponseSchema>;

export const HealthResponseSchema = Type.Object({
  status: Type.Union([Type.Literal('healthy'), Type.Literal('unhealthy')]),
  timestamp: Type.String(),
  service: Type.String(),
  version: Type.String(),
  database: Type.Optional(
    Type.Object({
      connected: Type.Boolean(),
      latencyMs: Type.Optional(Type.Number()),
    })
  ),
});

export type HealthResponse = Static<typeof HealthResponseSchema>;

export const LanguageSchema = Type.Union([
  Type.Literal('EN'),
  Type.Literal('ES'),
  Type.Literal('IT'),
  Type.Literal('PT'),
  Type.Literal('SL'),
]);

export const CEFRLevelSchema = Type.Union([
  Type.Literal('A1'),
  Type.Literal('A2'),
  Type.Literal('B1'),
  Type.Literal('B2'),
  Type.Literal('C1'),
  Type.Literal('C2'),
]);
