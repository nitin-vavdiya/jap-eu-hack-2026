import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

// EDC config from env
const EDC_BASE_URL = process.env.EDC_BASE_URL || '';
const EDC_API_KEY = process.env.EDC_API_KEY || '';
const APP_BASE_URL = process.env.APP_BASE_URL || '';
const EDC_ACCESS_POLICY_ID = process.env.EDC_ACCESS_POLICY_ID || '';
const EDC_CONTRACT_POLICY_ID = process.env.EDC_CONTRACT_POLICY_ID || '';
const ENABLE_EDC = process.env.ENABLE_EDC !== 'false';

async function registerEdcAsset(vin: string): Promise<void> {
  if (!ENABLE_EDC || !EDC_BASE_URL) return;

  const assetPayload = {
    '@context': {
      edc: 'https://w3id.org/edc/v0.0.1/ns/',
      'cx-common': 'https://w3id.org/catenax/ontology/common#',
      'cx-taxo': 'https://w3id.org/catenax/taxonomy#',
      dct: 'https://purl.org/dc/terms/',
    },
    '@id': `asset_${vin}`,
    properties: { type: { '@id': 'Asset' } },
    dataAddress: {
      '@type': 'DataAddress',
      type: 'HttpData',
      baseUrl: `${APP_BASE_URL}/api/cars/${vin}`,
      proxyQueryParams: 'true',
      proxyPath: 'true',
      proxyMethod: 'true',
      proxyBody: 'true',
      method: 'POST',
    },
  };

  try {
    const assetResp = await axios.post(
      `${EDC_BASE_URL}/management/v3/assets`,
      assetPayload,
      { headers: { 'Content-Type': 'application/json', 'x-api-key': EDC_API_KEY }, timeout: 10000 },
    );
    const assetId = assetResp.data['@id'] || `asset_${vin}`;

    const contractPayload = {
      '@context': { '@vocab': 'https://w3id.org/edc/v0.0.1/ns/' },
      '@type': 'ContractDefinition',
      '@id': `contract_${assetId}`,
      accessPolicyId: EDC_ACCESS_POLICY_ID,
      contractPolicyId: EDC_CONTRACT_POLICY_ID,
      assetsSelector: {
        operandLeft: 'https://w3id.org/edc/v0.0.1/ns/id',
        operator: '=',
        operandRight: assetId,
      },
    };

    await axios.post(
      `${EDC_BASE_URL}/management/v3/contractdefinitions`,
      contractPayload,
      { headers: { 'Content-Type': 'application/json', 'x-api-key': EDC_API_KEY }, timeout: 10000 },
    );

    console.log(`  EDC: registered asset + contract for ${vin}`);
  } catch (err: any) {
    // 409 = already exists, that's fine
    if (err.response?.status === 409) {
      console.log(`  EDC: asset ${vin} already registered (409), skipping`);
    } else {
      console.warn(`  EDC: failed to register ${vin}: ${err.response?.data?.message || err.message}`);
    }
  }
}

async function main() {
  console.log('Seeding database...');

  // Seed Companies
  const companies = [
    {
      id: 'company-toyota-001',
      name: 'Toyota Motor Corporation',
      vatId: 'JP-TOYOTA-VAT-2024',
      eoriNumber: 'JPEORI0012345',
      cin: 'JP-0180-01-008234',
      gstNumber: 'T1234567890123',
      country: 'JP',
      city: 'Toyota City',
      address: '1 Toyota-cho, Toyota City, Aichi 471-8571, Japan',
      adminName: 'Akio Toyoda',
      adminEmail: 'admin@toyota-global.com',
      did: 'did:eu-dataspace:company-toyota-001',
      registeredAt: new Date('2024-01-15T09:00:00.000Z'),
    },
    {
      id: 'company-tokiomarine-001',
      name: 'Tokio Marine & Nichido Fire Insurance Co., Ltd.',
      vatId: 'JP-TOKIOMARINE-VAT-2024',
      country: 'JP',
      city: 'Tokyo',
      address: '1-2-1 Marunouchi, Chiyoda-ku, Tokyo 100-0005, Japan',
      adminName: 'Satoru Komiya',
      adminEmail: 'admin@tokiomarine.com',
      did: 'did:eu-dataspace:company-tokiomarine-001',
      registeredAt: new Date('2024-02-01T09:00:00.000Z'),
    },
  ];

  for (const company of companies) {
    await prisma.company.upsert({
      where: { id: company.id },
      update: company,
      create: company,
    });
  }
  console.log(`Seeded ${companies.length} companies`);

  // Seed Credentials
  const credentials = [
    {
      id: 'cred-org-toyota-001',
      type: 'OrgVC',
      issuerId: 'eu-dataspace',
      issuerName: 'EU APAC Dataspace',
      subjectId: 'company-toyota-001',
      companyId: 'company-toyota-001',
      issuedAt: new Date('2024-01-15T09:00:00.000Z'),
      status: 'active',
      credentialSubject: {
        companyName: 'Toyota Motor Corporation',
        companyDid: 'did:eu-dataspace:company-toyota-001',
        registrationNumber: 'JP-0180-01-008234',
        vatId: 'JP-TOYOTA-VAT-2024',
        eoriNumber: 'JPEORI0012345',
        cin: 'JP-0180-01-008234',
        gstNumber: 'T1234567890123',
        country: 'JP',
        city: 'Toyota City',
        address: '1 Toyota-cho, Toyota City, Aichi 471-8571, Japan',
        adminName: 'Akio Toyoda',
        adminEmail: 'admin@toyota-global.com',
        incorporationDate: '1937-08-28T00:00:00.000Z',
      },
    },
    {
      id: 'cred-org-tokiomarine-001',
      type: 'OrgVC',
      issuerId: 'eu-dataspace',
      issuerName: 'EU APAC Dataspace',
      subjectId: 'company-tokiomarine-001',
      companyId: 'company-tokiomarine-001',
      issuedAt: new Date('2024-02-01T09:00:00.000Z'),
      status: 'active',
      credentialSubject: {
        companyName: 'Tokio Marine & Nichido Fire Insurance Co., Ltd.',
        companyDid: 'did:eu-dataspace:company-tokiomarine-001',
        registrationNumber: 'JP-0100-01-078900',
        vatId: 'JP-TOKIOMARINE-VAT-2024',
        country: 'JP',
        city: 'Tokyo',
        address: '1-2-1 Marunouchi, Chiyoda-ku, Tokyo 100-0005, Japan',
        adminName: 'Satoru Komiya',
        adminEmail: 'admin@tokiomarine.com',
        incorporationDate: '1879-08-01T00:00:00.000Z',
        insuranceLicense: 'FSA/INS/2024/001',
        authorizedEUDistributor: true,
      },
    },
    {
      id: 'cred-self-mario-001',
      type: 'SelfVC',
      issuerId: 'smartsense-idp',
      issuerName: 'SmartSense Identity Provider',
      subjectId: 'mario-sanchez',
      issuedAt: new Date('2024-01-10T10:00:00.000Z'),
      expiresAt: new Date('2027-01-10T10:00:00.000Z'),
      status: 'active',
      credentialSubject: {
        name: 'Mario Sanchez',
        email: 'mario.sanchez@email.it',
        nationality: 'Italian',
        dateOfBirth: '1985-06-15',
        did: 'did:smartsense:mario-sanchez',
      },
    },
  ];

  for (const cred of credentials) {
    await prisma.credential.upsert({
      where: { id: cred.id },
      update: cred,
      create: cred,
    });
  }
  console.log(`Seeded ${credentials.length} credentials`);

  const mfgCredential = {
    credentialId: 'cred-org-toyota-001',
    legalParticipantId: 'org-cred-toyota-001',
    issuer: 'Toyota Motor Corporation',
    type: 'OrgVC',
    issuedAt: '2024-01-15T09:00:00.000Z',
    status: 'active',
  };

  // Seed Cars — diverse vehicles for demo
  const cars = [
    // 1. Brand new EV — pristine, 0 owners, 5 km — should score Premium Plus (~90+)
    {
      id: 'car-bz4x-ev-001',
      vin: 'TOYO2025BZ4X000001',
      make: 'Toyota',
      manufacturerCompanyId: 'company-toyota-001',
      model: 'bZ4X',
      variant: 'Z Grade AWD',
      year: 2025,
      price: 44000,
      status: 'available',
      dpp: {
        stateOfHealth: { batteryHealth: 100, batteryCapacity: '71.4 kWh', range: '500 km', overallRating: 9.8, mileageKm: 5, lastInspectionDate: '2025-03-01T10:00:00.000Z' },
        damageHistory: { hasDamage: false, totalIncidents: 0, incidents: [] },
        serviceHistory: { totalServiceRecords: 1, services: [{ date: '2025-03-01T10:00:00.000Z', type: 'Pre-delivery Inspection', dealer: 'Toyota Dealer Tokyo Meguro', mileage: 5 }] },
        ownershipChain: { manufacturer: 'Toyota Motor Corporation', manufacturingDate: '2025-01-10T00:00:00.000Z', manufacturingPlant: 'Motomachi Plant, Toyota City, Aichi', currentOwner: null, previousOwners: [] },
        performance: { motorType: 'BEV', maxPowerKw: 160, topSpeedKmh: 160 },
        emissions: { co2GPerKm: 0, energyLabel: 'A+++' },
        compliance: { euTypeApprovalNumber: 'e11*2024/0001*0001', safetyRatingNcap: 5, homologationStatus: 'Approved', roadworthyCertificateExpiry: '2027-03-01T00:00:00.000Z' },
        sustainability: { recyclabilityPercent: 85 },
        manufacturerCredential: mfgCredential,
      },
    },
    // 2. Lightly used hybrid — 1 owner, 12k km, 1 minor incident — should score Premium (~75)
    {
      id: 'car-rav4-hyb-001',
      vin: 'TOYO2024RAV4HY0001',
      make: 'Toyota',
      manufacturerCompanyId: 'company-toyota-001',
      model: 'RAV4 Hybrid',
      variant: 'Adventure',
      year: 2024,
      price: 38000,
      status: 'available',
      dpp: {
        stateOfHealth: { batteryHealth: 97, batteryCapacity: '18.1 kWh', range: '95 km (EV) / 1000 km (total)', overallRating: 9.2, mileageKm: 12400, lastInspectionDate: '2025-01-15T10:00:00.000Z' },
        damageHistory: { hasDamage: true, totalIncidents: 1, incidents: [{ date: '2024-09-10', type: 'Parking dent', severity: 'minor', repaired: true, cost: 320 }] },
        serviceHistory: { totalServiceRecords: 2, services: [
          { date: '2024-06-15T10:00:00.000Z', type: 'First Service', dealer: 'Toyota Dealer Nagoya', mileage: 5200 },
          { date: '2025-01-15T10:00:00.000Z', type: 'Annual Service', dealer: 'Toyota Dealer Nagoya', mileage: 12400 },
        ] },
        ownershipChain: { manufacturer: 'Toyota Motor Corporation', manufacturingDate: '2024-03-20T00:00:00.000Z', manufacturingPlant: 'Takaoka Plant, Toyota City, Aichi', currentOwner: { name: 'Yuki Tanaka', since: '2024-04-01' }, previousOwners: [] },
        performance: { motorType: 'PHEV', maxPowerKw: 225, topSpeedKmh: 180 },
        emissions: { co2GPerKm: 22, energyLabel: 'A++' },
        compliance: { euTypeApprovalNumber: 'e11*2024/0012*0001', safetyRatingNcap: 5, homologationStatus: 'Approved', roadworthyCertificateExpiry: '2026-12-01T00:00:00.000Z' },
        sustainability: { recyclabilityPercent: 82 },
        manufacturerCredential: mfgCredential,
      },
    },
    // 3. Moderate use — 2 owners, 35k km, 2 minor incidents — should score Standard (~60)
    {
      id: 'car-camry-hyb-001',
      vin: 'TOYO2023CAMRYH0001',
      make: 'Toyota',
      manufacturerCompanyId: 'company-toyota-001',
      model: 'Camry Hybrid',
      variant: 'G Leather Package',
      year: 2023,
      price: 35000,
      status: 'available',
      dpp: {
        stateOfHealth: { engineHealth: 88, overallRating: 8.0, mileageKm: 35200, lastInspectionDate: '2025-02-10T10:00:00.000Z' },
        damageHistory: { hasDamage: true, totalIncidents: 2, incidents: [
          { date: '2023-08-15', type: 'Rear bumper scratch', severity: 'minor', repaired: true, cost: 450 },
          { date: '2024-11-20', type: 'Side mirror replacement', severity: 'minor', repaired: true, cost: 280 },
        ] },
        serviceHistory: { totalServiceRecords: 3, services: [
          { date: '2023-06-01T10:00:00.000Z', type: 'First Service', dealer: 'Toyota Dealer Osaka', mileage: 8000 },
          { date: '2024-01-15T10:00:00.000Z', type: 'Second Service', dealer: 'Toyota Dealer Osaka', mileage: 20000 },
          { date: '2025-02-10T10:00:00.000Z', type: 'Third Service', dealer: 'Toyota Dealer Tokyo Shibuya', mileage: 35200 },
        ] },
        ownershipChain: { manufacturer: 'Toyota Motor Corporation', manufacturingDate: '2023-02-15T00:00:00.000Z', manufacturingPlant: 'Tsutsumi Plant, Toyota City, Aichi', currentOwner: { name: 'Kenji Yamamoto', since: '2024-06-01' }, previousOwners: [{ name: 'Haruto Sato', from: '2023-03-01', to: '2024-05-30' }] },
        performance: { motorType: 'HEV', maxPowerKw: 160, topSpeedKmh: 180 },
        emissions: { co2GPerKm: 102, euroStandard: 'Euro 6d' },
        compliance: { euTypeApprovalNumber: 'e11*2023/0045*0001', safetyRatingNcap: 5, homologationStatus: 'Approved', roadworthyCertificateExpiry: '2026-08-01T00:00:00.000Z' },
        sustainability: { recyclabilityPercent: 78 },
        manufacturerCredential: mfgCredential,
      },
    },
    // 4. Well-used — 2 owners, 62k km, 3 incidents (1 major), lowered condition — should score Basic Plus (~45)
    {
      id: 'car-landcruiser-001',
      vin: 'TOYO2022LANDCR0001',
      make: 'Toyota',
      manufacturerCompanyId: 'company-toyota-001',
      model: 'Land Cruiser',
      variant: 'GR Sport',
      year: 2022,
      price: 52000,
      status: 'available',
      dpp: {
        stateOfHealth: { engineHealth: 75, overallRating: 6.8, mileageKm: 62300, lastInspectionDate: '2025-01-20T10:00:00.000Z' },
        damageHistory: { hasDamage: true, totalIncidents: 3, incidents: [
          { date: '2022-11-05', type: 'Front fender dent', severity: 'minor', repaired: true, cost: 600 },
          { date: '2023-07-18', type: 'Rear collision repair', severity: 'major', repaired: true, cost: 3200 },
          { date: '2024-09-25', type: 'Windshield replacement', severity: 'minor', repaired: true, cost: 450 },
        ] },
        serviceHistory: { totalServiceRecords: 3, services: [
          { date: '2022-09-01T10:00:00.000Z', type: 'First Service', dealer: 'Toyota Dealer Yokohama', mileage: 10000 },
          { date: '2023-06-15T10:00:00.000Z', type: 'Second Service', dealer: 'Toyota Dealer Yokohama', mileage: 30000 },
          { date: '2025-01-20T10:00:00.000Z', type: 'Third Service', dealer: 'Toyota Dealer Sapporo', mileage: 62300 },
        ] },
        ownershipChain: { manufacturer: 'Toyota Motor Corporation', manufacturingDate: '2022-03-10T00:00:00.000Z', manufacturingPlant: 'Tahara Plant, Aichi', currentOwner: { name: 'Takeshi Nakamura', since: '2024-02-01' }, previousOwners: [{ name: 'Sakura Watanabe', from: '2022-04-01', to: '2024-01-25' }] },
        performance: { motorType: 'ICE', maxPowerKw: 227, topSpeedKmh: 210 },
        emissions: { co2GPerKm: 155, euroStandard: 'Euro 6' },
        compliance: { safetyRatingNcap: 5, homologationStatus: 'Approved', roadworthyCertificateExpiry: '2026-03-01T00:00:00.000Z' },
        sustainability: { recyclabilityPercent: 75 },
        manufacturerCredential: mfgCredential,
      },
    },
    // 5. Heavily used — 3 owners, 105k km, 4 incidents (2 major, 1 unrepaired), poor condition — should score Basic (~30)
    {
      id: 'car-corolla-cross-001',
      vin: 'TOYO2020COROLL0001',
      make: 'Toyota',
      manufacturerCompanyId: 'company-toyota-001',
      model: 'Corolla Cross',
      variant: 'Z Hybrid',
      year: 2020,
      price: 18500,
      status: 'available',
      dpp: {
        stateOfHealth: { engineHealth: 58, overallRating: 5.2, mileageKm: 105800, lastInspectionDate: '2024-12-05T10:00:00.000Z' },
        damageHistory: { hasDamage: true, totalIncidents: 4, incidents: [
          { date: '2021-03-10', type: 'Front bumper collision', severity: 'major', repaired: true, cost: 4500 },
          { date: '2022-01-22', type: 'Door panel dent', severity: 'minor', repaired: true, cost: 800 },
          { date: '2023-06-14', type: 'Rear axle damage', severity: 'major', repaired: true, cost: 6200 },
          { date: '2024-08-30', type: 'Fender rust and crack', severity: 'minor', repaired: false, cost: 0 },
        ] },
        serviceHistory: { totalServiceRecords: 4, services: [
          { date: '2020-12-01T10:00:00.000Z', type: 'First Service', dealer: 'Toyota Dealer Fukuoka', mileage: 12000 },
          { date: '2021-08-01T10:00:00.000Z', type: 'Second Service', dealer: 'Toyota Dealer Fukuoka', mileage: 30000 },
          { date: '2022-09-01T10:00:00.000Z', type: 'Third Service', dealer: 'Toyota Dealer Kobe', mileage: 58000 },
          { date: '2024-12-05T10:00:00.000Z', type: 'Annual Service', dealer: 'Toyota Dealer Hiroshima', mileage: 105800 },
        ] },
        ownershipChain: { manufacturer: 'Toyota Motor Corporation', manufacturingDate: '2020-04-15T00:00:00.000Z', manufacturingPlant: 'Miyata Plant, Fukuoka', currentOwner: { name: 'Hiroshi Suzuki', since: '2023-10-01' }, previousOwners: [
          { name: 'Yuki Tanaka', from: '2020-05-01', to: '2021-12-15' },
          { name: 'Kenji Yamamoto', from: '2022-01-01', to: '2023-09-20' },
        ] },
        performance: { motorType: 'HEV', maxPowerKw: 103, topSpeedKmh: 170 },
        emissions: { co2GPerKm: 118, euroStandard: 'Euro 6' },
        compliance: { safetyRatingNcap: 4, homologationStatus: 'Approved' },
        sustainability: { recyclabilityPercent: 72 },
        manufacturerCredential: mfgCredential,
      },
    },
    // 6. Brand new Yaris Cross — 0 owners, factory fresh — Premium Plus candidate
    {
      id: 'car-yaris-cross-001',
      vin: 'TOYO2025YARISCR001',
      make: 'Toyota',
      manufacturerCompanyId: 'company-toyota-001',
      model: 'Yaris Cross',
      variant: 'Z Adventure',
      year: 2025,
      price: 28000,
      status: 'available',
      dpp: {
        stateOfHealth: { batteryHealth: 100, batteryCapacity: '4.3 kWh (HEV)', range: '1200 km', overallRating: 9.9, mileageKm: 3, lastInspectionDate: '2025-03-10T10:00:00.000Z' },
        damageHistory: { hasDamage: false, totalIncidents: 0, incidents: [] },
        serviceHistory: { totalServiceRecords: 1, services: [{ date: '2025-03-10T10:00:00.000Z', type: 'Pre-delivery Inspection', dealer: 'Toyota Dealer Tokyo Ginza', mileage: 3 }] },
        ownershipChain: { manufacturer: 'Toyota Motor Corporation', manufacturingDate: '2025-02-20T00:00:00.000Z', manufacturingPlant: 'Iwate Plant, Iwate', currentOwner: null, previousOwners: [] },
        performance: { motorType: 'HEV', maxPowerKw: 85, topSpeedKmh: 170 },
        emissions: { co2GPerKm: 105, energyLabel: 'A+' },
        compliance: { euTypeApprovalNumber: 'e11*2025/0003*0001', safetyRatingNcap: 5, homologationStatus: 'Approved', roadworthyCertificateExpiry: '2027-03-10T00:00:00.000Z' },
        sustainability: { recyclabilityPercent: 88 },
        manufacturerCredential: mfgCredential,
      },
    },
    // 7. Older Prius — 4 owners, 158k km, 5 incidents (3 major), very poor — Basic/Manual Review (~20)
    {
      id: 'car-prius-001',
      vin: 'TOYO2018PRIUSH0001',
      make: 'Toyota',
      manufacturerCompanyId: 'company-toyota-001',
      model: 'Prius',
      variant: 'S Touring Selection',
      year: 2018,
      price: 12500,
      status: 'sold',
      ownerId: 'mario-sanchez',
      dpp: {
        stateOfHealth: { batteryHealth: 62, batteryCapacity: '8.8 kWh (HEV, degraded)', range: '680 km', overallRating: 3.8, mileageKm: 158400, lastInspectionDate: '2024-06-15T10:00:00.000Z' },
        damageHistory: { hasDamage: true, totalIncidents: 5, incidents: [
          { date: '2019-02-10', type: 'Front collision', severity: 'major', repaired: true, cost: 8500 },
          { date: '2020-05-22', type: 'Side panel damage', severity: 'minor', repaired: true, cost: 1200 },
          { date: '2021-09-15', type: 'Chassis damage — flood', severity: 'major', repaired: true, cost: 12000 },
          { date: '2022-12-01', type: 'Rear bumper hit', severity: 'minor', repaired: false, cost: 0 },
          { date: '2024-01-18', type: 'Hybrid battery cell failure', severity: 'major', repaired: true, cost: 7800 },
        ] },
        serviceHistory: { totalServiceRecords: 5, services: [
          { date: '2018-12-01T10:00:00.000Z', type: 'First Service', dealer: 'Toyota Dealer Sendai', mileage: 15000 },
          { date: '2019-12-01T10:00:00.000Z', type: 'Annual Service', dealer: 'Toyota Dealer Sendai', mileage: 38000 },
          { date: '2021-01-01T10:00:00.000Z', type: 'Service', dealer: 'Toyota Dealer Niigata', mileage: 72000 },
          { date: '2022-06-01T10:00:00.000Z', type: 'Service', dealer: 'Toyota Dealer Kanazawa', mileage: 110000 },
          { date: '2024-06-15T10:00:00.000Z', type: 'Service', dealer: 'Toyota Dealer Sendai', mileage: 158400 },
        ] },
        ownershipChain: { manufacturer: 'Toyota Motor Corporation', manufacturingDate: '2018-06-01T00:00:00.000Z', manufacturingPlant: 'Tsutsumi Plant, Toyota City, Aichi', currentOwner: { name: 'Mario Sanchez', since: '2024-03-01' }, previousOwners: [
          { name: 'Takeshi Nakamura', from: '2018-07-01', to: '2019-11-30' },
          { name: 'Sakura Watanabe', from: '2020-01-01', to: '2021-08-15' },
          { name: 'Hiroshi Suzuki', from: '2021-09-01', to: '2024-02-20' },
        ] },
        performance: { motorType: 'HEV', maxPowerKw: 90, topSpeedKmh: 180 },
        emissions: { co2GPerKm: 70, euroStandard: 'Euro 6' },
        compliance: { safetyRatingNcap: 5, homologationStatus: 'Approved' },
        sustainability: { recyclabilityPercent: 65 },
        manufacturerCredential: mfgCredential,
      },
    },
    // 8. Mid-range EV — 1 owner, 28k km, 0 incidents, good battery — Premium (~72)
    {
      id: 'car-chr-hyb-001',
      vin: 'TOYO2024CHRHYB0001',
      make: 'Toyota',
      manufacturerCompanyId: 'company-toyota-001',
      model: 'C-HR Hybrid',
      variant: 'G Mode Nero',
      year: 2024,
      price: 32000,
      status: 'sold',
      ownerId: 'mario-sanchez',
      dpp: {
        stateOfHealth: { batteryHealth: 95, batteryCapacity: '4.0 kWh (HEV)', range: '1100 km', overallRating: 8.8, mileageKm: 28300, lastInspectionDate: '2025-02-20T10:00:00.000Z' },
        damageHistory: { hasDamage: false, totalIncidents: 0, incidents: [] },
        serviceHistory: { totalServiceRecords: 2, services: [
          { date: '2024-07-01T10:00:00.000Z', type: 'First Service', dealer: 'Toyota Dealer Kyoto', mileage: 10500 },
          { date: '2025-02-20T10:00:00.000Z', type: 'Annual Service', dealer: 'Toyota Dealer Kyoto', mileage: 28300 },
        ] },
        ownershipChain: { manufacturer: 'Toyota Motor Corporation', manufacturingDate: '2024-01-10T00:00:00.000Z', manufacturingPlant: 'Iwate Plant, Iwate', currentOwner: { name: 'Mario Sanchez', since: '2024-02-01' }, previousOwners: [] },
        performance: { motorType: 'HEV', maxPowerKw: 103, topSpeedKmh: 170 },
        emissions: { co2GPerKm: 108, energyLabel: 'A+' },
        compliance: { euTypeApprovalNumber: 'e11*2024/0020*0001', safetyRatingNcap: 5, homologationStatus: 'Approved', roadworthyCertificateExpiry: '2026-06-01T00:00:00.000Z' },
        sustainability: { recyclabilityPercent: 80 },
        manufacturerCredential: mfgCredential,
      },
    },
  ];

  // Clear existing cars and related records, then re-seed
  await prisma.insurancePolicy.deleteMany({});
  await prisma.purchase.deleteMany({});
  await prisma.car.deleteMany({});
  for (const car of cars) {
    await prisma.car.create({ data: car });
    await registerEdcAsset(car.vin);
  }
  console.log(`Seeded ${cars.length} cars`);

  // Seed Wallet for mario-sanchez
  const wallet = await prisma.wallet.upsert({
    where: { userId: 'mario-sanchez' },
    update: {},
    create: { userId: 'mario-sanchez' },
  });

  await prisma.walletCredential.upsert({
    where: { walletId_credentialId: { walletId: wallet.id, credentialId: 'cred-self-mario-001' } },
    update: {},
    create: { walletId: wallet.id, credentialId: 'cred-self-mario-001' },
  });
  console.log('Seeded wallet for mario-sanchez');

  // Seed OrgCredentials
  const orgCredentials = [
    {
      id: 'org-cred-toyota-001',
      companyId: 'company-toyota-001',
      legalName: 'Toyota Motor Corporation',
      legalRegistrationNumber: { vatId: 'JP0300010008234', eoriNumber: 'JP987654321000', localId: 'JP-0180-01-008234', taxId: '7180301018771' },
      legalAddress: { streetAddress: '1 Toyota-cho', locality: 'Toyota City', postalCode: '471-8571', countryCode: 'JP', countrySubdivisionCode: 'JP-23' },
      headquartersAddress: { streetAddress: '1 Toyota-cho', locality: 'Toyota City', postalCode: '471-8571', countryCode: 'JP', countrySubdivisionCode: 'JP-23' },
      website: 'https://www.toyota-global.com',
      contactEmail: 'admin@toyota-global.com',
      did: 'did:web:participant.gxdch.io:toyota-motors',
      validFrom: new Date('2024-01-15T09:00:00.000Z'),
      validUntil: new Date('2027-01-15T09:00:00.000Z'),
      verificationStatus: 'draft',
      verificationAttempts: [],
      issuedVCs: [],
    },
    {
      id: 'org-cred-tokiomarine-001',
      companyId: 'company-tokiomarine-001',
      legalName: 'Tokio Marine & Nichido Fire Insurance Co., Ltd.',
      legalRegistrationNumber: { vatId: 'JP0100010078900', localId: 'JP-0100-01-078900', taxId: '9010001028492' },
      legalAddress: { streetAddress: '1-2-1 Marunouchi, Chiyoda-ku', locality: 'Tokyo', postalCode: '100-0005', countryCode: 'JP', countrySubdivisionCode: 'JP-13' },
      headquartersAddress: { streetAddress: '1-2-1 Marunouchi, Chiyoda-ku', locality: 'Tokyo', postalCode: '100-0005', countryCode: 'JP', countrySubdivisionCode: 'JP-13' },
      website: 'https://www.tokiomarine-nichido.co.jp',
      contactEmail: 'admin@tokiomarine.com',
      did: 'did:web:participant.gxdch.io:tokio-marine',
      validFrom: new Date('2024-02-01T09:00:00.000Z'),
      validUntil: new Date('2027-02-01T09:00:00.000Z'),
      verificationStatus: 'draft',
      verificationAttempts: [],
      issuedVCs: [],
    },
  ];

  for (const org of orgCredentials) {
    await prisma.orgCredential.upsert({
      where: { id: org.id },
      update: org,
      create: org,
    });
  }
  console.log(`Seeded ${orgCredentials.length} org credentials`);

  // Seed EdcProvisioning for seeded companies so their DID documents include a DataService entry
  const edcProvisionings = [
    {
      companyId: 'company-toyota-001',
      status: 'ready',
      protocolUrl: 'https://toyota-protocol.tx.the-sense.io/api/v1/dsp#BPNL00000000024R',
      managementUrl: 'https://toyota-motor-corporation-controlplane.tx.the-sense.io/management',
      dataplaneUrl: 'https://toyota-motor-corporation-dataplane.tx.the-sense.io',
      apiKey: 'toyota-motor-corporation',
      helmRelease: 'edc-toyota-motor-corporation',
      argoAppName: 'edc-toyota-motor-corporation',
      k8sNamespace: 'edc-toyota-motor-corporation',
      dbName: 'edc_toyota_motor_corporation',
      dbUser: 'edc_toyota_motor_corporation',
      provisionedAt: new Date('2024-01-15T09:00:00.000Z'),
    },
    {
      companyId: 'company-tokiomarine-001',
      status: 'ready',
      protocolUrl: 'https://toyota-protocol.tx.the-sense.io/api/v1/dsp#BPNL00000000024R',
      managementUrl: 'https://tokio-marine-europe-s-a-french-controlplane.tx.the-sense.io/management',
      dataplaneUrl: 'https://tokio-marine-europe-s-a-french-dataplane.tx.the-sense.io',
      apiKey: 'tokio-marine-europe-s-a-french',
      helmRelease: 'edc-tokio-marine-europe-s-a-french',
      argoAppName: 'edc-tokio-marine-europe-s-a-french',
      k8sNamespace: 'edc-tokio-marine-europe-s-a-french',
      dbName: 'edc_tokio_marine_europe_s_a_french',
      dbUser: 'edc_tokio_marine_europe_s_a_french',
      provisionedAt: new Date('2024-02-01T09:00:00.000Z'),
    },
  ];

  for (const edc of edcProvisionings) {
    await prisma.edcProvisioning.upsert({
      where: { companyId: edc.companyId },
      update: edc,
      create: edc,
    });
  }
  console.log(`Seeded ${edcProvisionings.length} EDC provisionings`);

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
