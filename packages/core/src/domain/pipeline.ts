import { z } from 'zod';
import { ApprovalType, DataType } from './enums';

export const DraftSchema = z.object({
  id: z.string().uuid(),
  dataType: z.nativeEnum(DataType),
  rawData: z.record(z.string(), z.unknown()),
  source: z.string().max(100),
  createdAt: z.date(),
});

export type Draft = z.infer<typeof DraftSchema>;

export const CandidateSchema = z.object({
  id: z.string().uuid(),
  dataType: z.nativeEnum(DataType),
  normalizedData: z.record(z.string(), z.unknown()),
  draftId: z.string().uuid(),
  createdAt: z.date(),
});

export type Candidate = z.infer<typeof CandidateSchema>;

export const ValidationResultSchema = z.object({
  gateName: z.string(),
  passed: z.boolean(),
  message: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export const ValidatedSchema = z.object({
  id: z.string().uuid(),
  dataType: z.nativeEnum(DataType),
  validatedData: z.record(z.string(), z.unknown()),
  candidateId: z.string().uuid(),
  validationResults: z.array(ValidationResultSchema),
  createdAt: z.date(),
});

export type Validated = z.infer<typeof ValidatedSchema>;

export const ValidationFailureSchema = z.object({
  id: z.string().uuid(),
  candidateId: z.string().uuid(),
  gateName: z.string().max(100),
  failureReason: z.string(),
  failureDetails: z.record(z.string(), z.unknown()),
  retryCount: z.number().int().nonnegative(),
  createdAt: z.date(),
});

export type ValidationFailure = z.infer<typeof ValidationFailureSchema>;

export const ApprovalEventSchema = z.object({
  id: z.string().uuid(),
  validatedId: z.string().uuid(),
  approvedTable: z.string().max(50),
  approvedId: z.string().max(100),
  operatorId: z.string().uuid().nullable(),
  approvalType: z.nativeEnum(ApprovalType),
  notes: z.string().nullable(),
  createdAt: z.date(),
});

export type ApprovalEvent = z.infer<typeof ApprovalEventSchema>;

export const ServiceStateSchema = z.object({
  id: z.string().max(50),
  stateData: z.record(z.string(), z.unknown()),
  lastCheckpoint: z.date(),
  updatedAt: z.date(),
});

export type ServiceState = z.infer<typeof ServiceStateSchema>;
