import { GaiaXConfig, GaiaXEndpointSet } from './types';

/**
 * Gaia-X Lab (lab.gaia-x.eu) — the official GXDCH lab environment.
 * These are the real, live v2 endpoints for the Loire trust framework.
 */
/**
 * Using the development compliance endpoint which accepts self-signed certificates.
 * The v2 production endpoint requires certificates trusted in the Gaia-X Registry.
 */
const LAB_SET: GaiaXEndpointSet = {
  name: 'Gaia-X Lab (Loire development)',
  compliance: process.env.GAIAX_LAB_COMPLIANCE_URL || 'https://compliance.lab.gaia-x.eu/development',
  registry: process.env.GAIAX_LAB_REGISTRY_URL || 'https://registry.lab.gaia-x.eu/v2',
  notary: process.env.GAIAX_LAB_NOTARY_URL || 'https://registrationnumber.notary.lab.gaia-x.eu/v2',
  priority: 0,
};

const CISPE_SET: GaiaXEndpointSet = {
  name: 'CISPE CloudDataEngine',
  compliance: 'https://compliance.cispe.gxdch.clouddataengine.io/v2',
  registry: 'https://registry.cispe.gxdch.clouddataengine.io/v2',
  notary: 'https://notary.cispe.gxdch.clouddataengine.io/v2',
  priority: 1,
};

const PFALZKOM_SET: GaiaXEndpointSet = {
  name: 'Pfalzkom GXDCH',
  compliance: 'https://compliance.pfalzkom-gxdch.de/v2',
  registry: 'https://portal.pfalzkom-gxdch.de/v2',
  notary: 'https://trust-anker.pfalzkom-gxdch.de/v2',
  priority: 2,
};

export function getGaiaXConfig(): GaiaXConfig {
  return {
    endpointSets: [LAB_SET, CISPE_SET, PFALZKOM_SET],
    timeout: parseInt(process.env.GAIAX_TIMEOUT || '60000', 10),
    retryAttempts: parseInt(process.env.GAIAX_RETRY_ATTEMPTS || '2', 10),
    retryDelay: parseInt(process.env.GAIAX_RETRY_DELAY || '1000', 10),
    mockMode: process.env.GAIAX_MOCK_MODE === 'true',
  };
}
