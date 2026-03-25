/**
 * Tests for DID Resolution & Service Endpoint Discovery
 */

import {
  resolveDid,
  selectEndpoint,
  getServiceEndpoints,
  SERVICE_TYPES,
} from '../services/did-resolver';

describe('resolveDid', () => {
  it('should resolve Toyota Motor Corporation DID', () => {
    const result = resolveDid('did:eu-dataspace:company-toyota-001');
    expect(result.didDocument).not.toBeNull();
    expect(result.didDocument!.id).toBe('did:eu-dataspace:company-toyota-001');
    expect(result.didResolutionMetadata.error).toBeUndefined();
  });

  it('should resolve Tokio Marine DID', () => {
    const result = resolveDid('did:eu-dataspace:company-tokiomarine-001');
    expect(result.didDocument).not.toBeNull();
    expect(result.didDocument!.id).toBe('did:eu-dataspace:company-tokiomarine-001');
  });

  it('should resolve user DIDs', () => {
    const result = resolveDid('did:smartsense:mario-sanchez');
    expect(result.didDocument).not.toBeNull();
    expect(result.didDocument!.id).toBe('did:smartsense:mario-sanchez');
  });

  it('should return notFound for unknown DIDs', () => {
    const result = resolveDid('did:unknown:xyz');
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe('notFound');
  });

  it('should include verification methods', () => {
    const result = resolveDid('did:eu-dataspace:company-toyota-001');
    expect(result.didDocument!.verificationMethod).toBeDefined();
    expect(result.didDocument!.verificationMethod!.length).toBeGreaterThan(0);
  });

  it('should include DataService and VehicleRegistryService for Toyota', () => {
    const result = resolveDid('did:eu-dataspace:company-toyota-001');
    const services = result.didDocument!.service || [];
    expect(services.length).toBeGreaterThanOrEqual(3);

    const serviceTypes = services.map(s => s.type);
    expect(serviceTypes).toContain(SERVICE_TYPES.VEHICLE_REGISTRY);
    expect(serviceTypes).toContain(SERVICE_TYPES.VP_VERIFICATION);
    expect(serviceTypes).toContain(SERVICE_TYPES.DATA_SERVICE);
  });

  it('should NOT include removed direct-fetch service types', () => {
    const result = resolveDid('did:eu-dataspace:company-toyota-001');
    const serviceTypes = (result.didDocument!.service || []).map(s => s.type);
    expect(serviceTypes).not.toContain(SERVICE_TYPES.VEHICLE_INSURANCE_DATA);
    expect(serviceTypes).not.toContain(SERVICE_TYPES.VEHICLE_DPP);
    expect(serviceTypes).not.toContain(SERVICE_TYPES.VEHICLE_CREDENTIALS);
  });

  it('should have DataService with DSP URL and BPNL in fragment', () => {
    const result = resolveDid('did:eu-dataspace:company-toyota-001');
    const dataService = (result.didDocument!.service || []).find(s => s.type === 'DataService');
    expect(dataService).toBeDefined();
    expect(dataService!.serviceEndpoint).toContain('#BPNL');
    expect(dataService!.serviceEndpoint).toContain('https://');
    expect(dataService!.id).toBe('did:eu-dataspace:company-toyota-001#data-service');
  });
});

describe('selectEndpoint', () => {
  it('should find DataService endpoint', () => {
    const { didDocument } = resolveDid('did:eu-dataspace:company-toyota-001');
    const endpoint = selectEndpoint(didDocument!, SERVICE_TYPES.DATA_SERVICE);
    expect(endpoint).not.toBeNull();
    expect(endpoint!.type).toBe('DataService');
    expect(endpoint!.serviceEndpoint).toContain('#BPNL');
  });

  it('should find VehicleRegistryService endpoint', () => {
    const { didDocument } = resolveDid('did:eu-dataspace:company-toyota-001');
    const endpoint = selectEndpoint(didDocument!, SERVICE_TYPES.VEHICLE_REGISTRY);
    expect(endpoint).not.toBeNull();
    expect(endpoint!.serviceEndpoint).toContain('/vehicle-registry');
  });

  it('should return null for unknown service type', () => {
    const { didDocument } = resolveDid('did:eu-dataspace:company-toyota-001');
    const endpoint = selectEndpoint(didDocument!, 'UnknownServiceType');
    expect(endpoint).toBeNull();
  });

  it('should return null for removed VehicleInsuranceDataService', () => {
    const { didDocument } = resolveDid('did:eu-dataspace:company-toyota-001');
    const endpoint = selectEndpoint(didDocument!, SERVICE_TYPES.VEHICLE_INSURANCE_DATA);
    expect(endpoint).toBeNull();
  });
});

describe('getServiceEndpoints', () => {
  it('should return all service endpoints', () => {
    const { didDocument } = resolveDid('did:eu-dataspace:company-toyota-001');
    const endpoints = getServiceEndpoints(didDocument!);
    expect(endpoints.length).toBe(3);
    endpoints.forEach(ep => {
      expect(ep.id).toBeTruthy();
      expect(ep.type).toBeTruthy();
      expect(ep.serviceEndpoint).toBeTruthy();
    });
  });

  it('should return empty array for user DIDs', () => {
    const { didDocument } = resolveDid('did:smartsense:mario-sanchez');
    const endpoints = getServiceEndpoints(didDocument!);
    expect(endpoints).toHaveLength(0);
  });
});
