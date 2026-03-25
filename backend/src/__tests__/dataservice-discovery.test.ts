/**
 * Tests for DataService Discovery
 * Validates parsing of DSP URL and BPNL from DID document DataService entries.
 */

import {
  discoverDataService,
  parseDataServiceEndpoint,
  DataServiceDiscoveryError,
} from '../services/dataservice-discovery';
import { buildCompanyDidDocument } from '../services/did-resolver';
import type { DidDocument, ServiceEndpoint } from '../services/did-resolver';

// Mock VPSigner
jest.mock('../services/gaiax/vp-signer', () => ({
  getVPSigner: () => ({
    getPublicKeyJwk: () => ({
      kty: 'RSA',
      n: 'test-n',
      e: 'AQAB',
      kid: 'did:web:test:v1#key-1',
      alg: 'RS256',
    }),
  }),
}));

const TOYOTA_COMPANY = {
  id: 'company-toyota-001',
  did: 'did:web:jeh-api.tx.the-sense.io:company:company-toyota-001',
  bpn: 'BPNL00000000024R',
  name: 'Toyota Motor Europe',
  createdAt: new Date('2024-01-01'),
};

const TOKIO_COMPANY = {
  id: 'company-tokiomarine-001',
  did: 'did:web:jeh-api.tx.the-sense.io:company:company-tokiomarine-001',
  bpn: 'BPNLTokio0000001',
  name: 'Tokio Marine',
  createdAt: new Date('2024-01-01'),
};

describe('discoverDataService', () => {
  it('should discover DataService from company with ready EDC', () => {
    const doc = buildCompanyDidDocument(TOYOTA_COMPANY, {
      status: 'ready',
      protocolUrl: 'https://toyota-protocol.tx.the-sense.io/api/v1/dsp',
    });
    const result = discoverDataService(doc);

    expect(result.dspUrl).toBe('https://toyota-protocol.tx.the-sense.io/api/v1/dsp');
    expect(result.issuerBpnl).toBe('BPNL00000000024R');
    expect(result.serviceId).toContain('#data-service');
    expect(result.serviceEndpoint).toBe(
      'https://toyota-protocol.tx.the-sense.io/api/v1/dsp#BPNL00000000024R',
    );
  });

  it('should throw NO_DATASERVICE for company without EDC', () => {
    const doc = buildCompanyDidDocument(TOKIO_COMPANY, null);
    expect(() => discoverDataService(doc)).toThrow(DataServiceDiscoveryError);

    try {
      discoverDataService(doc);
    } catch (err) {
      expect(err).toBeInstanceOf(DataServiceDiscoveryError);
      expect((err as DataServiceDiscoveryError).code).toBe('NO_DATASERVICE');
    }
  });

  it('should handle DID document with no services at all', () => {
    const doc: DidDocument = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: 'did:test:no-services',
    };
    expect(() => discoverDataService(doc)).toThrow(DataServiceDiscoveryError);
  });

  it('should use first DataService when multiple exist', () => {
    const doc: DidDocument = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: 'did:test:multi',
      service: [
        {
          id: 'did:test:multi#ds1',
          type: 'DataService',
          serviceEndpoint: 'https://first.example.com/dsp#BPNL000000000001',
        },
        {
          id: 'did:test:multi#ds2',
          type: 'DataService',
          serviceEndpoint: 'https://second.example.com/dsp#BPNL000000000002',
        },
      ],
    };

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const result = discoverDataService(doc);

    expect(result.dspUrl).toBe('https://first.example.com/dsp');
    expect(result.issuerBpnl).toBe('BPNL000000000001');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Multiple DataService entries'),
    );
    consoleSpy.mockRestore();
  });
});

describe('parseDataServiceEndpoint', () => {
  it('should parse valid endpoint with DSP URL and BPNL', () => {
    const service: ServiceEndpoint = {
      id: 'did:test:123#data-service',
      type: 'DataService',
      serviceEndpoint: 'https://provider.example.com/api/v1/dsp#BPNL00000000024R',
    };

    const result = parseDataServiceEndpoint(service, 'did:test:123');
    expect(result.dspUrl).toBe('https://provider.example.com/api/v1/dsp');
    expect(result.issuerBpnl).toBe('BPNL00000000024R');
    expect(result.serviceId).toBe('did:test:123#data-service');
  });

  it('should throw MISSING_FRAGMENT when no # in endpoint', () => {
    const service: ServiceEndpoint = {
      id: 'did:test:123#ds',
      type: 'DataService',
      serviceEndpoint: 'https://provider.example.com/api/v1/dsp',
    };

    try {
      parseDataServiceEndpoint(service, 'did:test:123');
      fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DataServiceDiscoveryError);
      expect((err as DataServiceDiscoveryError).code).toBe('MISSING_FRAGMENT');
    }
  });

  it('should throw INVALID_BPNL for malformed BPNL', () => {
    const service: ServiceEndpoint = {
      id: 'did:test:123#ds',
      type: 'DataService',
      serviceEndpoint: 'https://provider.example.com/dsp#INVALID_BPN',
    };

    try {
      parseDataServiceEndpoint(service, 'did:test:123');
      fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DataServiceDiscoveryError);
      expect((err as DataServiceDiscoveryError).code).toBe('INVALID_BPNL');
    }
  });

  it('should throw INVALID_BPNL for short BPNL', () => {
    const service: ServiceEndpoint = {
      id: 'did:test:123#ds',
      type: 'DataService',
      serviceEndpoint: 'https://provider.example.com/dsp#BPNL123',
    };

    try {
      parseDataServiceEndpoint(service, 'did:test:123');
      fail('Should have thrown');
    } catch (err) {
      expect((err as DataServiceDiscoveryError).code).toBe('INVALID_BPNL');
    }
  });

  it('should throw INVALID_DSP_URL for non-URL DSP', () => {
    const service: ServiceEndpoint = {
      id: 'did:test:123#ds',
      type: 'DataService',
      serviceEndpoint: 'not-a-url#BPNL00000000024R',
    };

    try {
      parseDataServiceEndpoint(service, 'did:test:123');
      fail('Should have thrown');
    } catch (err) {
      expect((err as DataServiceDiscoveryError).code).toBe('INVALID_DSP_URL');
    }
  });

  it('should throw MALFORMED_ENDPOINT for empty endpoint', () => {
    const service: ServiceEndpoint = {
      id: 'did:test:123#ds',
      type: 'DataService',
      serviceEndpoint: '',
    };

    try {
      parseDataServiceEndpoint(service, 'did:test:123');
      fail('Should have thrown');
    } catch (err) {
      expect((err as DataServiceDiscoveryError).code).toBe('MALFORMED_ENDPOINT');
    }
  });

  it('should throw INVALID_BPNL for empty BPNL after fragment', () => {
    const service: ServiceEndpoint = {
      id: 'did:test:123#ds',
      type: 'DataService',
      serviceEndpoint: 'https://provider.example.com/dsp#',
    };

    try {
      parseDataServiceEndpoint(service, 'did:test:123');
      fail('Should have thrown');
    } catch (err) {
      expect((err as DataServiceDiscoveryError).code).toBe('INVALID_BPNL');
    }
  });

  it('should accept valid BPNL formats', () => {
    const validBpnls = ['BPNL00000000024R', 'BPNLABCDEF123456', 'BPNL000000000001'];

    for (const bpnl of validBpnls) {
      const service: ServiceEndpoint = {
        id: 'did:test:123#ds',
        type: 'DataService',
        serviceEndpoint: `https://provider.example.com/dsp#${bpnl}`,
      };
      const result = parseDataServiceEndpoint(service);
      expect(result.issuerBpnl).toBe(bpnl);
    }
  });
});

describe('end-to-end: buildCompanyDidDocument → DataService discovery', () => {
  it('should extract DSP URL and BPNL from company with ready EDC', () => {
    const doc = buildCompanyDidDocument(TOYOTA_COMPANY, {
      status: 'ready',
      protocolUrl: 'https://toyota-protocol.tx.the-sense.io/api/v1/dsp',
    });

    const result = discoverDataService(doc);
    expect(result.dspUrl).toMatch(/^https:\/\/.+\/dsp$/);
    expect(result.issuerBpnl).toMatch(/^BPNL[A-Z0-9]{12}$/);
  });

  it('should fail gracefully for company without DataService', () => {
    const doc = buildCompanyDidDocument(TOKIO_COMPANY, null);

    expect(() => discoverDataService(doc)).toThrow(DataServiceDiscoveryError);
    try {
      discoverDataService(doc);
    } catch (err) {
      expect((err as DataServiceDiscoveryError).code).toBe('NO_DATASERVICE');
    }
  });
});
