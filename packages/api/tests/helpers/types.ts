export interface RegisterResponse {
  userId: string;
  email: string;
  role: 'learner' | 'operator';
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: 'learner' | 'operator';
  };
}

export interface UserProfileResponse {
  id: string;
  email: string;
  role: 'learner' | 'operator';
  createdAt: string;
}

export interface RefreshResponse {
  accessToken: string;
}

export interface SuccessResponse {
  success: boolean;
  message?: string;
}

export interface ErrorResponse {
  error: {
    statusCode: number;
    message: string;
    requestId: string;
    code?: string;
  };
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  service: string;
  timestamp: string;
  version: string;
  uptime?: number;
  database: {
    connected: boolean;
    latencyMs?: number;
  };
  memory?: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
  };
}

export interface ApiInfoResponse {
  service: string;
  version: string;
  endpoints: {
    health: string;
    auth: string;
    learning: string;
    operational: string;
  };
}

export interface PipelineHealthResponse {
  pipeline: {
    draft: number;
    candidate: number;
    validated: number;
    approved: number;
  };
  byTable: Array<{
    tableName: string;
    draft: number;
    candidate: number;
    validated: number;
    approved: number;
  }>;
  recentActivity: {
    last24h: {
      created: number;
      approved: number;
      failed: number;
    };
  };
  serviceStatus: {
    refinementService: {
      status: 'healthy' | 'unhealthy' | 'unknown';
      lastCheckpoint: string | null;
    };
  };
}

export interface ReviewQueueItem {
  itemId: string;
  dataType: string;
  priority: number;
  queuedAt: string;
  assignedTo: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ItemDetailResponse {
  id: string;
  dataType: string;
  data: Record<string, unknown>;
  createdAt: string;
  gateResults: Array<{
    gateName: string;
    status: string;
    errorMessage: string | null;
    attemptNumber: number;
    createdAt: string;
  }>;
}

export interface FailureItem {
  id: string;
  itemId: string;
  dataType: string;
  state: string;
  errorMessage: string;
  failedAt: string;
}
