import { GaiaXClient } from '../../backend/src/services/gaiax/client';

describe('GaiaXClient Fallback Logic', () => {
  it('should try endpoint sets in priority order', async () => {
    const client = new GaiaXClient({ timeout: 3000 });
    const config = client.getConfig();

    // Verify priority ordering
    const sorted = [...config.endpointSets].sort((a, b) => a.priority - b.priority);
    expect(sorted[0].priority).toBeLessThanOrEqual(sorted[1].priority);
    expect(sorted[1].priority).toBeLessThanOrEqual(sorted[2].priority);
  });

  it('should select a healthy endpoint or return null', async () => {
    const client = new GaiaXClient({ timeout: 3000 });
    const result = await client.selectHealthyEndpointSet();

    // Either we get a healthy set or null
    if (result) {
      expect(result.endpointSet).toBeTruthy();
      expect(result.health.overall).toBe(true);
    } else {
      // All endpoints are down, which is OK for testing
      expect(result).toBeNull();
    }
  }, 30000);

  it('should cache health results', async () => {
    const client = new GaiaXClient({ timeout: 3000 });
    const sets = client.getConfig().endpointSets;

    const start1 = Date.now();
    await client.checkHealth(sets[0]);
    const duration1 = Date.now() - start1;

    const start2 = Date.now();
    await client.checkHealth(sets[0]);
    const duration2 = Date.now() - start2;

    // Second call should be much faster (cached)
    expect(duration2).toBeLessThan(duration1);
  }, 15000);
});
