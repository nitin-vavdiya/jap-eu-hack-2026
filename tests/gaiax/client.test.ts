import { GaiaXClient } from '../../backend/src/services/gaiax/client';

describe('GaiaXClient', () => {
  it('should initialize with default config', () => {
    const client = new GaiaXClient();
    const config = client.getConfig();
    expect(config.endpointSets).toHaveLength(3);
    expect(config.timeout).toBeGreaterThan(0);
    expect(config.retryAttempts).toBeGreaterThanOrEqual(1);
  });

  it('should accept config overrides', () => {
    const client = new GaiaXClient({ timeout: 5000, mockMode: false });
    expect(client.getConfig().timeout).toBe(5000);
    expect(client.isMockMode).toBe(false);
  });

  it('should report mock mode status', () => {
    const mockClient = new GaiaXClient({ mockMode: true });
    expect(mockClient.isMockMode).toBe(true);

    const liveClient = new GaiaXClient({ mockMode: false });
    expect(liveClient.isMockMode).toBe(false);
  });

  it('should have 3 endpoint sets ordered by priority', () => {
    const client = new GaiaXClient();
    const sets = client.getConfig().endpointSets;
    expect(sets[0].name).toBe('CISPE CloudDataEngine');
    expect(sets[1].name).toBe('Pfalzkom GXDCH');
    expect(sets[2].name).toBe('Aerospace Digital Exchange');
    expect(sets[0].priority).toBeLessThan(sets[1].priority);
    expect(sets[1].priority).toBeLessThan(sets[2].priority);
  });

  it('should check health for a single endpoint set', async () => {
    const client = new GaiaXClient({ timeout: 3000 });
    const sets = client.getConfig().endpointSets;
    const health = await client.checkHealth(sets[0]);
    expect(health.endpointSet).toBe(sets[0].name);
    expect(typeof health.compliance.healthy).toBe('boolean');
    expect(typeof health.compliance.latencyMs).toBe('number');
    expect(typeof health.overall).toBe('boolean');
    expect(health.checkedAt).toBeTruthy();
  }, 10000);

  it('should check all endpoint sets health', async () => {
    const client = new GaiaXClient({ timeout: 3000 });
    const results = await client.checkAllHealth();
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.endpointSet).toBeTruthy();
    }
  }, 30000);
});
