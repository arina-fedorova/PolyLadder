export enum PipelineStage {
  DRAFT = 'DRAFT',
  CANDIDATE = 'CANDIDATE',
  VALIDATED = 'VALIDATED',
  APPROVED = 'APPROVED',
}

export interface PipelineItem {
  id: string;
  dataType: string;
  currentState: PipelineStage;
  data: Record<string, unknown>;
}

export interface StepResult {
  success: boolean;
  errors?: string[];
}

export interface PipelineResult {
  success: boolean;
  newState: PipelineStage;
  errors?: string[];
  metrics?: {
    durationMs: number;
    stage: string;
  };
}

export interface PipelineConfig {
  autoApproval: boolean;
  retryAttempts: number;
  batchSize: number;
}
