import { SourceAdapter, SourceRequest } from './source-adapter.interface';
import { logger } from '../utils/logger';

export class SourceRegistry {
  private adapters: Map<string, SourceAdapter> = new Map();

  register(adapter: SourceAdapter): void {
    this.adapters.set(adapter.name, adapter);
    logger.info({ adapterName: adapter.name }, 'Registered source adapter');
  }

  unregister(adapterName: string): void {
    this.adapters.delete(adapterName);
    logger.info({ adapterName }, 'Unregistered source adapter');
  }

  async selectAdapter(request: SourceRequest): Promise<SourceAdapter | null> {
    const candidates = Array.from(this.adapters.values()).filter((adapter) =>
      adapter.canHandle(request)
    );

    if (candidates.length === 0) {
      logger.warn({ request }, 'No adapter found for request');
      return null;
    }

    for (const candidate of candidates) {
      const isHealthy = await candidate.healthCheck();
      if (isHealthy) {
        return candidate;
      }
      logger.warn({ adapterName: candidate.name }, 'Adapter failed health check, trying next');
    }

    logger.error({ request }, 'All adapters failed health check');
    return null;
  }

  listAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }

  getAdapter(name: string): SourceAdapter | undefined {
    return this.adapters.get(name);
  }
}
