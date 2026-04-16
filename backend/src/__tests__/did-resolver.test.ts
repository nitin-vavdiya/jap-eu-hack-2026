/**
 * Tests for DID Resolution & Service Endpoint Discovery
 * Tests use mocked Prisma to simulate DB-backed DID resolution.
 */

import {
  resolveDid,
  selectEndpoint,
  getServiceEndpoints,
  buildCompanyDidDocument,
  buildCompanyDidWeb,
  SERVICE_TYPES,
  CompanyWalletNotProvisionedError,
} from '../services/did-resolver';

// Mock prisma
jest.mock('../db', () => ({
  __esModule: true,
  default: {
    company: {
      findFirst: jest.fn(),
    },
  },
}));

import prisma from '../db';
const mockFindFirst = prisma.company.findFirst as jest.Mock;

const TOYOTA_COMPANY = {
  id: 'company-toyota-001',
  did: 'did:web:jeh-api.tx.the-sense.io:company:company-toyota-001',
  bpn: 'BPNL00000000024R',
  name: 'Toyota Motor Europe',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-06-01'),
  edcProvisioning: {
    status: 'ready',
    protocolUrl: 'https://toyota-protocol.tx.the-sense.io/api/v1/dsp',
  },
};

const TOKIO_COMPANY = {
  id: 'company-tokiomarine-001',
  did: 'did:web:jeh-api.tx.the-sense.io:company:company-tokiomarine-001',
  bpn: 'BPNLTokio0000001',
  name: 'Tokio Marine',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-06-01'),
  edcProvisioning: null, // No EDC provisioned
};

const TOYOTA_WALLET = {
  ...TOYOTA_COMPANY,
  walletProvisioned: true,
  ed25519PublicJwk: { kty: 'OKP', crv: 'Ed25519', x: 'dGVzdC14LWJ5dGVzLWZvci1lZDI1NTE5LWtleQ' },
  rsaPublicJwk: { kty: 'RSA', n: 'dGVzdC1u', e: 'AQAB' },
};

const TOKIO_WALLET = {
  ...TOKIO_COMPANY,
  walletProvisioned: true,
  ed25519PublicJwk: { kty: 'OKP', crv: 'Ed25519', x: 'dGVzdC14LWJ5dGVzLWZvci1lZDI1NTE5LWtleQ' },
  rsaPublicJwk: { kty: 'RSA', n: 'dGVzdC1u', e: 'AQAB' },
};

describe('buildCompanyDidWeb', () => {
  it('should build a did:web identifier for a company', () => {
    const did = buildCompanyDidWeb('abc-123');
    expect(did).toMatch(/^did:web:.+:company:abc-123$/);
  });
});

describe('buildCompanyDidDocument', () => {
  it('throws when wallet is not provisioned', () => {
    expect(() => buildCompanyDidDocument(TOYOTA_COMPANY, TOYOTA_COMPANY.edcProvisioning)).toThrow(
      CompanyWalletNotProvisionedError,
    );
  });

  it('should include DataService when EDC provisioning is ready', () => {
    const doc = buildCompanyDidDocument(TOYOTA_WALLET, TOYOTA_WALLET.edcProvisioning);
    expect(doc.id).toBe(TOYOTA_WALLET.did);
    expect(doc['@context']).toContain('https://www.w3.org/ns/did/v1');
    expect(doc.verificationMethod).toHaveLength(2);
    expect(doc.verificationMethod!.every((v) => v.type === 'JsonWebKey2020')).toBe(true);

    const dataService = (doc.service || []).find(s => s.type === 'DataService');
    expect(dataService).toBeDefined();
    expect(dataService!.serviceEndpoint).toBe(
      'https://toyota-protocol.tx.the-sense.io/api/v1/dsp#BPNL00000000024R',
    );
  });

  it('should NOT include DataService when EDC is not provisioned', () => {
    const doc = buildCompanyDidDocument(TOKIO_WALLET, TOKIO_WALLET.edcProvisioning);
    expect(doc.id).toBe(TOKIO_WALLET.did);
    expect(doc.service).toBeUndefined();
  });

  it('should NOT include DataService when EDC status is not ready', () => {
    const doc = buildCompanyDidDocument(TOYOTA_WALLET, { status: 'pending', protocolUrl: null });
    expect(doc.service).toBeUndefined();
  });

  it('should expose Ed25519 + RSA verification methods when wallet is provisioned', () => {
    const doc = buildCompanyDidDocument(TOYOTA_WALLET, TOYOTA_WALLET.edcProvisioning);
    expect(doc.verificationMethod).toHaveLength(2);
    expect(doc.verificationMethod!.map((v) => v.id)).toEqual(
      expect.arrayContaining([`${TOYOTA_WALLET.did}#key-ed25519`, `${TOYOTA_WALLET.did}#key-rsa`]),
    );
    expect(doc.authentication).toEqual([`${TOYOTA_WALLET.did}#key-ed25519`]);
    expect(doc.assertionMethod).toEqual(
      expect.arrayContaining([`${TOYOTA_WALLET.did}#key-ed25519`, `${TOYOTA_WALLET.did}#key-rsa`]),
    );
  });
});

describe('resolveDid', () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
  });

  it('should resolve a company DID from DB', async () => {
    mockFindFirst.mockResolvedValue(TOYOTA_WALLET);

    const result = await resolveDid(TOYOTA_WALLET.did);
    expect(result.didDocument).not.toBeNull();
    expect(result.didDocument!.id).toBe(TOYOTA_WALLET.did);
    expect(result.didResolutionMetadata.contentType).toBe('application/did+ld+json');
  });

  it('should return companyWalletNotProvisioned when wallet is missing', async () => {
    mockFindFirst.mockResolvedValue(TOYOTA_COMPANY);

    const result = await resolveDid(TOYOTA_COMPANY.did);
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe('companyWalletNotProvisioned');
  });

  it('should include DataService for company with ready EDC', async () => {
    mockFindFirst.mockResolvedValue(TOYOTA_WALLET);

    const result = await resolveDid(TOYOTA_WALLET.did);
    const services = result.didDocument!.service || [];
    const dataService = services.find(s => s.type === SERVICE_TYPES.DATA_SERVICE);
    expect(dataService).toBeDefined();
    expect(dataService!.serviceEndpoint).toContain('#BPNL');
    expect(dataService!.serviceEndpoint).toContain('https://');
  });

  it('should NOT include DataService for company without EDC', async () => {
    mockFindFirst.mockResolvedValue(TOKIO_WALLET);

    const result = await resolveDid(TOKIO_WALLET.did);
    expect(result.didDocument).not.toBeNull();
    expect(result.didDocument!.service).toBeUndefined();
  });

  it('should resolve user DIDs (did:smartsense:*)', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await resolveDid('did:smartsense:mario-sanchez');
    expect(result.didDocument).not.toBeNull();
    expect(result.didDocument!.id).toBe('did:smartsense:mario-sanchez');
  });

  it('should return notFound for unknown DIDs', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await resolveDid('did:unknown:xyz');
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe('notFound');
  });

  it('should include verification methods with publicKeyJwk', async () => {
    mockFindFirst.mockResolvedValue(TOYOTA_WALLET);

    const result = await resolveDid(TOYOTA_WALLET.did);
    expect(result.didDocument!.verificationMethod).toBeDefined();
    expect(result.didDocument!.verificationMethod!.length).toBeGreaterThan(0);
    expect(result.didDocument!.verificationMethod![0].publicKeyJwk).toBeDefined();
  });
});

describe('selectEndpoint', () => {
  it('should find DataService endpoint', () => {
    const doc = buildCompanyDidDocument(TOYOTA_WALLET, TOYOTA_WALLET.edcProvisioning);
    const endpoint = selectEndpoint(doc, SERVICE_TYPES.DATA_SERVICE);
    expect(endpoint).not.toBeNull();
    expect(endpoint!.type).toBe('DataService');
    expect(endpoint!.serviceEndpoint).toContain('#BPNL');
  });

  it('should return null for unknown service type', () => {
    const doc = buildCompanyDidDocument(TOYOTA_WALLET, TOYOTA_WALLET.edcProvisioning);
    const endpoint = selectEndpoint(doc, 'UnknownServiceType');
    expect(endpoint).toBeNull();
  });
});

describe('getServiceEndpoints', () => {
  it('should return all service endpoints for company with EDC', () => {
    const doc = buildCompanyDidDocument(TOYOTA_WALLET, TOYOTA_WALLET.edcProvisioning);
    const endpoints = getServiceEndpoints(doc);
    expect(endpoints.length).toBe(1);
    expect(endpoints[0].type).toBe(SERVICE_TYPES.DATA_SERVICE);
  });

  it('should return empty array for company without EDC', () => {
    const doc = buildCompanyDidDocument(TOKIO_WALLET, TOKIO_WALLET.edcProvisioning);
    const endpoints = getServiceEndpoints(doc);
    expect(endpoints).toHaveLength(0);
  });

  it('should return empty array for user DIDs', async () => {
    mockFindFirst.mockResolvedValue(null);

    const { didDocument } = await resolveDid('did:smartsense:mario-sanchez');
    const endpoints = getServiceEndpoints(didDocument!);
    expect(endpoints).toHaveLength(0);
  });
});
