import axios, { AxiosInstance } from 'axios';
import { GaiaXConfig, GaiaXEndpointSet, GaiaXHealthStatus } from './types';
import { getGaiaXConfig } from './config';
import logger from '../../lib/logger';

export class GaiaXClient {
  private config: GaiaXConfig;
  private httpClient: AxiosInstance;
  private healthCache: Map<string, { status: GaiaXHealthStatus; cachedAt: number }> = new Map();
  private readonly HEALTH_CACHE_TTL = 60000;

  constructor(configOverride?: Partial<GaiaXConfig>) {
    this.config = { ...getGaiaXConfig(), ...configOverride };
    this.httpClient = axios.create({
      timeout: this.config.timeout,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });
  }

  get isMockMode(): boolean {
    return this.config.mockMode;
  }

  async checkHealth(endpointSet: GaiaXEndpointSet): Promise<GaiaXHealthStatus> {
    const cached = this.healthCache.get(endpointSet.name);
    if (cached && Date.now() - cached.cachedAt < this.HEALTH_CACHE_TTL) {
      return cached.status;
    }

    const checkEndpoint = async (url: string) => {
      const start = Date.now();
      try {
        await this.httpClient.get(url, { timeout: 5000 });
        return { healthy: true, latencyMs: Date.now() - start };
      } catch (e: unknown) {
        const err = e as Error;
        return { healthy: false, latencyMs: Date.now() - start, error: err.message };
      }
    };

    const [compliance, registry, notary] = await Promise.all([
      checkEndpoint(endpointSet.compliance),
      checkEndpoint(endpointSet.registry),
      checkEndpoint(endpointSet.notary),
    ]);

    const status: GaiaXHealthStatus = {
      endpointSet: endpointSet.name,
      compliance,
      registry,
      notary,
      overall: compliance.healthy || registry.healthy || notary.healthy,
      checkedAt: new Date().toISOString(),
    };

    this.healthCache.set(endpointSet.name, { status, cachedAt: Date.now() });
    return status;
  }

  async checkAllHealth(): Promise<GaiaXHealthStatus[]> {
    return Promise.all(this.config.endpointSets.map(s => this.checkHealth(s)));
  }

  async selectHealthyEndpointSet(): Promise<{ endpointSet: GaiaXEndpointSet; health: GaiaXHealthStatus } | null> {
    for (const endpointSet of this.config.endpointSets.sort((a, b) => a.priority - b.priority)) {
      const health = await this.checkHealth(endpointSet);
      if (health.overall) {
        return { endpointSet, health };
      }
      logger.info({ component: 'gaiax', endpointSet: endpointSet.name }, 'Endpoint set unhealthy, trying next');
    }
    return null;
  }

  async postWithRetry<T>(url: string, data: unknown, attempts?: number): Promise<T> {
    const maxAttempts = attempts || this.config.retryAttempts;
    let lastError: Error | null = null;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await this.httpClient.post<T>(url, data);
        return response.data;
      } catch (e: unknown) {
        lastError = e as Error;
        logger.info({ component: 'gaiax', attempt: i + 1, maxAttempts, url, err: lastError.message }, 'Request attempt failed');
        if (i < maxAttempts - 1) {
          await new Promise(r => setTimeout(r, this.config.retryDelay * (i + 1)));
        }
      }
    }
    throw lastError || new Error('Request failed after retries');
  }

  async getWithRetry<T>(url: string, attempts?: number): Promise<T> {
    const maxAttempts = attempts || this.config.retryAttempts;
    let lastError: Error | null = null;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await this.httpClient.get<T>(url);
        return response.data;
      } catch (e: unknown) {
        lastError = e as Error;
        if (i < maxAttempts - 1) {
          await new Promise(r => setTimeout(r, this.config.retryDelay * (i + 1)));
        }
      }
    }
    throw lastError || new Error('Request failed after retries');
  }

  getConfig(): GaiaXConfig {
    return this.config;
  }
}
