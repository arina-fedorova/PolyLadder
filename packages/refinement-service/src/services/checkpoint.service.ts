import { Pool } from 'pg';

export interface CheckpointState {
  lastProcessedId?: string;
  lastProcessedType?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface CheckpointRepository {
  saveState(serviceName: string, state: CheckpointState): Promise<void>;
  restoreState(serviceName: string): Promise<CheckpointState | null>;
  saveError(serviceName: string, error: Error, metadata?: Record<string, unknown>): Promise<void>;
  getLastCheckpointTime(serviceName: string): Promise<Date | null>;
}

const SERVICE_NAME = 'refinement_service';
const HEALTH_THRESHOLD_MS = 5 * 60 * 1000;

export class CheckpointService {
  private repository: CheckpointRepository;

  constructor(repository: CheckpointRepository) {
    this.repository = repository;
  }

  async saveState(state: CheckpointState): Promise<void> {
    await this.repository.saveState(SERVICE_NAME, state);
  }

  async restoreState(): Promise<CheckpointState | null> {
    return this.repository.restoreState(SERVICE_NAME);
  }

  async saveErrorState(error: Error, metadata?: Record<string, unknown>): Promise<void> {
    await this.repository.saveError(SERVICE_NAME, error, metadata);
  }

  async getLastCheckpointTime(): Promise<Date | null> {
    return this.repository.getLastCheckpointTime(SERVICE_NAME);
  }

  async isServiceHealthy(): Promise<boolean> {
    const lastCheckpoint = await this.getLastCheckpointTime();

    if (!lastCheckpoint) {
      return false;
    }

    const threshold = new Date(Date.now() - HEALTH_THRESHOLD_MS);
    return lastCheckpoint > threshold;
  }
}

export function createCheckpointRepository(pool: Pool): CheckpointRepository {
  return {
    async saveState(serviceName: string, state: CheckpointState): Promise<void> {
      await pool.query(
        `INSERT INTO service_state (service_name, state, last_checkpoint)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (service_name)
         DO UPDATE SET state = $2, last_checkpoint = CURRENT_TIMESTAMP`,
        [serviceName, JSON.stringify(state)]
      );
    },

    async restoreState(serviceName: string): Promise<CheckpointState | null> {
      const result = await pool.query<{ state: string | Record<string, unknown> }>(
        `SELECT state FROM service_state WHERE service_name = $1`,
        [serviceName]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const stateData = result.rows[0].state;
      const parsed =
        typeof stateData === 'string'
          ? (JSON.parse(stateData) as unknown as CheckpointState)
          : (stateData as unknown as CheckpointState);

      if (!parsed.timestamp) {
        throw new Error('Invalid checkpoint state: missing timestamp');
      }

      return {
        ...parsed,
        timestamp: new Date(parsed.timestamp),
      };
    },

    async saveError(
      serviceName: string,
      error: Error,
      metadata?: Record<string, unknown>
    ): Promise<void> {
      await pool.query(
        `INSERT INTO service_errors (service_name, error_message, error_stack, metadata)
         VALUES ($1, $2, $3, $4)`,
        [serviceName, error.message, error.stack ?? null, JSON.stringify(metadata ?? {})]
      );
    },

    async getLastCheckpointTime(serviceName: string): Promise<Date | null> {
      const result = await pool.query<{ last_checkpoint: Date }>(
        `SELECT last_checkpoint FROM service_state WHERE service_name = $1`,
        [serviceName]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return new Date(result.rows[0].last_checkpoint);
    },
  };
}
