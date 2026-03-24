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
      id: 'company-tata-001',
      name: 'TATA Motors',
      vatId: 'IN-TATA-VAT-2024',
      eoriNumber: 'INEORI0012345',
      cin: 'L28920MH1945PLC004520',
      gstNumber: '27AAACT2727Q1ZW',
      country: 'India',
      city: 'Mumbai',
      address: 'Bombay House, 24 Homi Mody Street, Mumbai 400001',
      adminName: 'Ratan Tata',
      adminEmail: 'admin@tatamotors.com',
      did: 'did:eu-dataspace:company-tata-001',
      registeredAt: new Date('2024-01-15T09:00:00.000Z'),
    },
    {
      id: 'company-digit-001',
      name: 'Digit Insurance',
      vatId: 'IN-DIGIT-VAT-2024',
      country: 'IN',
      city: 'Bengaluru',
      address: 'Embassy Tech Village, Outer Ring Road, Bengaluru 560103',
      adminName: 'Kamesh Goyal',
      adminEmail: 'admin@godigit.com',
      did: 'did:eu-dataspace:company-digit-001',
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
      id: 'cred-org-tata-001',
      type: 'OrgVC',
      issuerId: 'eu-dataspace',
      issuerName: 'EU APAC Dataspace',
      subjectId: 'company-tata-001',
      companyId: 'company-tata-001',
      issuedAt: new Date('2024-01-15T09:00:00.000Z'),
      status: 'active',
      credentialSubject: {
        companyName: 'TATA Motors',
        companyDid: 'did:eu-dataspace:company-tata-001',
        registrationNumber: 'L28920MH1945PLC004520',
        vatId: 'IN-TATA-VAT-2024',
        eoriNumber: 'INEORI0012345',
        cin: 'L28920MH1945PLC004520',
        gstNumber: '27AAACT2727Q1ZW',
        country: 'India',
        city: 'Mumbai',
        address: 'Bombay House, 24 Homi Mody Street, Mumbai 400001',
        adminName: 'Ratan Tata',
        adminEmail: 'admin@tatamotors.com',
        incorporationDate: '1945-09-01T00:00:00.000Z',
      },
    },
    {
      id: 'cred-org-digit-001',
      type: 'OrgVC',
      issuerId: 'eu-dataspace',
      issuerName: 'EU APAC Dataspace',
      subjectId: 'company-digit-001',
      companyId: 'company-digit-001',
      issuedAt: new Date('2024-02-01T09:00:00.000Z'),
      status: 'active',
      credentialSubject: {
        companyName: 'Digit Insurance',
        companyDid: 'did:eu-dataspace:company-digit-001',
        registrationNumber: 'U66000KA2016PTC126215',
        vatId: 'IN-DIGIT-VAT-2024',
        country: 'IN',
        city: 'Bengaluru',
        address: 'Embassy Tech Village, Outer Ring Road, Bengaluru 560103',
        adminName: 'Kamesh Goyal',
        adminEmail: 'admin@godigit.com',
        incorporationDate: '2016-09-20T00:00:00.000Z',
        insuranceLicense: 'IRDAI/HLT/2017/001',
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
    credentialId: 'cred-org-tata-001',
    legalParticipantId: 'org-cred-tata-001',
    issuer: 'TATA Motors Limited',
    type: 'OrgVC',
    issuedAt: '2024-01-15T09:00:00.000Z',
    status: 'active',
  };

  // Seed Cars — diverse vehicles for demo
  const cars = [
    // 1. Brand new — pristine, 0 owners, 5 km — should score Premium Plus (~90+)
    {
      id: 'car-nexon-ev-001',
      vin: 'TATA2025NEXONEV001',
      make: 'TATA',
      model: 'Nexon EV',
      variant: 'Max LR',
      year: 2025,
      price: 22500,
      status: 'available',
      dpp: {
        stateOfHealth: { batteryHealth: 100, batteryCapacity: '40.5 kWh', range: '437 km', overallRating: 9.8, mileageKm: 5, lastInspectionDate: '2025-03-01T10:00:00.000Z' },
        damageHistory: { hasDamage: false, totalIncidents: 0, incidents: [] },
        serviceHistory: { totalServiceRecords: 1, services: [{ date: '2025-03-01T10:00:00.000Z', type: 'Pre-delivery Inspection', dealer: 'TATA Motors Mumbai', mileage: 5 }] },
        ownershipChain: { manufacturer: 'TATA Motors', manufacturingDate: '2025-01-10T00:00:00.000Z', manufacturingPlant: 'Pune Plant, Maharashtra', currentOwner: null, previousOwners: [] },
        performance: { motorType: 'BEV', maxPowerKw: 105, topSpeedKmh: 150 },
        emissions: { co2GPerKm: 0, energyLabel: 'A+++' },
        compliance: { euTypeApprovalNumber: 'e11*2024/0001*0001', safetyRatingNcap: 5, homologationStatus: 'Approved', roadworthyCertificateExpiry: '2027-03-01T00:00:00.000Z' },
        sustainability: { recyclabilityPercent: 85 },
        manufacturerCredential: mfgCredential,
      },
    },
    // 2. Lightly used — 1 owner, 12k km, 1 minor incident — should score Premium (~75)
    {
      id: 'car-curvv-ev-001',
      vin: 'TATA2024CURVVEV001',
      make: 'TATA',
      model: 'Curvv EV',
      variant: 'Creative+',
      year: 2024,
      price: 26000,
      status: 'available',
      dpp: {
        stateOfHealth: { batteryHealth: 97, batteryCapacity: '55 kWh', range: '485 km', overallRating: 9.2, mileageKm: 12400, lastInspectionDate: '2025-01-15T10:00:00.000Z' },
        damageHistory: { hasDamage: true, totalIncidents: 1, incidents: [{ date: '2024-09-10', type: 'Parking dent', severity: 'minor', repaired: true, cost: 320 }] },
        serviceHistory: { totalServiceRecords: 2, services: [
          { date: '2024-06-15T10:00:00.000Z', type: 'First Service', dealer: 'TATA Motors Bangalore', mileage: 5200 },
          { date: '2025-01-15T10:00:00.000Z', type: 'Annual Service', dealer: 'TATA Motors Bangalore', mileage: 12400 },
        ] },
        ownershipChain: { manufacturer: 'TATA Motors', manufacturingDate: '2024-03-20T00:00:00.000Z', manufacturingPlant: 'Sanand Plant, Gujarat', currentOwner: { name: 'Priya Sharma', since: '2024-04-01' }, previousOwners: [] },
        performance: { motorType: 'BEV', maxPowerKw: 125, topSpeedKmh: 160 },
        emissions: { co2GPerKm: 0, energyLabel: 'A+++' },
        compliance: { euTypeApprovalNumber: 'e11*2024/0012*0001', safetyRatingNcap: 5, homologationStatus: 'Approved', roadworthyCertificateExpiry: '2026-12-01T00:00:00.000Z' },
        sustainability: { recyclabilityPercent: 82 },
        manufacturerCredential: mfgCredential,
      },
    },
    // 3. Moderate use — 2 owners, 35k km, 2 minor incidents — should score Standard (~60)
    {
      id: 'car-harrier-001',
      vin: 'TATA2023HARRIER001',
      make: 'TATA',
      model: 'Harrier',
      variant: 'Fearless+',
      year: 2023,
      price: 24000,
      status: 'available',
      dpp: {
        stateOfHealth: { engineHealth: 88, overallRating: 8.0, mileageKm: 35200, lastInspectionDate: '2025-02-10T10:00:00.000Z' },
        damageHistory: { hasDamage: true, totalIncidents: 2, incidents: [
          { date: '2023-08-15', type: 'Rear bumper scratch', severity: 'minor', repaired: true, cost: 450 },
          { date: '2024-11-20', type: 'Side mirror replacement', severity: 'minor', repaired: true, cost: 280 },
        ] },
        serviceHistory: { totalServiceRecords: 3, services: [
          { date: '2023-06-01T10:00:00.000Z', type: 'First Service', dealer: 'TATA Motors Pune', mileage: 8000 },
          { date: '2024-01-15T10:00:00.000Z', type: 'Second Service', dealer: 'TATA Motors Pune', mileage: 20000 },
          { date: '2025-02-10T10:00:00.000Z', type: 'Third Service', dealer: 'TATA Motors Mumbai', mileage: 35200 },
        ] },
        ownershipChain: { manufacturer: 'TATA Motors', manufacturingDate: '2023-02-15T00:00:00.000Z', manufacturingPlant: 'Pune Plant, Maharashtra', currentOwner: { name: 'Rajesh Kumar', since: '2024-06-01' }, previousOwners: [{ name: 'Amit Patel', from: '2023-03-01', to: '2024-05-30' }] },
        performance: { motorType: 'ICE', maxPowerKw: 125, topSpeedKmh: 180 },
        emissions: { co2GPerKm: 142, euroStandard: 'Euro 6d' },
        compliance: { euTypeApprovalNumber: 'e11*2023/0045*0001', safetyRatingNcap: 5, homologationStatus: 'Approved', roadworthyCertificateExpiry: '2026-08-01T00:00:00.000Z' },
        sustainability: { recyclabilityPercent: 78 },
        manufacturerCredential: mfgCredential,
      },
    },
    // 4. Well-used — 2 owners, 62k km, 3 incidents (1 major), lowered condition — should score Basic Plus (~45)
    {
      id: 'car-safari-001',
      vin: 'TATA2022SAFARI0001',
      make: 'TATA',
      model: 'Safari',
      variant: 'Adventure',
      year: 2022,
      price: 21000,
      status: 'available',
      dpp: {
        stateOfHealth: { engineHealth: 75, overallRating: 6.8, mileageKm: 62300, lastInspectionDate: '2025-01-20T10:00:00.000Z' },
        damageHistory: { hasDamage: true, totalIncidents: 3, incidents: [
          { date: '2022-11-05', type: 'Front fender dent', severity: 'minor', repaired: true, cost: 600 },
          { date: '2023-07-18', type: 'Rear collision repair', severity: 'major', repaired: true, cost: 3200 },
          { date: '2024-09-25', type: 'Windshield replacement', severity: 'minor', repaired: true, cost: 450 },
        ] },
        serviceHistory: { totalServiceRecords: 3, services: [
          { date: '2022-09-01T10:00:00.000Z', type: 'First Service', dealer: 'TATA Motors Chennai', mileage: 10000 },
          { date: '2023-06-15T10:00:00.000Z', type: 'Second Service', dealer: 'TATA Motors Chennai', mileage: 30000 },
          { date: '2025-01-20T10:00:00.000Z', type: 'Third Service', dealer: 'TATA Motors Hyderabad', mileage: 62300 },
        ] },
        ownershipChain: { manufacturer: 'TATA Motors', manufacturingDate: '2022-03-10T00:00:00.000Z', manufacturingPlant: 'Pune Plant, Maharashtra', currentOwner: { name: 'Vikram Singh', since: '2024-02-01' }, previousOwners: [{ name: 'Deepak Reddy', from: '2022-04-01', to: '2024-01-25' }] },
        performance: { motorType: 'ICE', maxPowerKw: 125, topSpeedKmh: 180 },
        emissions: { co2GPerKm: 155, euroStandard: 'Euro 6' },
        compliance: { safetyRatingNcap: 5, homologationStatus: 'Approved', roadworthyCertificateExpiry: '2026-03-01T00:00:00.000Z' },
        sustainability: { recyclabilityPercent: 75 },
        manufacturerCredential: mfgCredential,
      },
    },
    // 5. Heavily used — 3 owners, 105k km, 4 incidents (2 major, 1 unrepaired), poor condition — should score Basic (~30)
    {
      id: 'car-nexon-002',
      vin: 'TATA2020NEXON00002',
      make: 'TATA',
      model: 'Nexon',
      variant: 'XZ+',
      year: 2020,
      price: 11500,
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
          { date: '2020-12-01T10:00:00.000Z', type: 'First Service', dealer: 'TATA Motors Delhi', mileage: 12000 },
          { date: '2021-08-01T10:00:00.000Z', type: 'Second Service', dealer: 'TATA Motors Delhi', mileage: 30000 },
          { date: '2022-09-01T10:00:00.000Z', type: 'Third Service', dealer: 'TATA Motors Jaipur', mileage: 58000 },
          { date: '2024-12-05T10:00:00.000Z', type: 'Annual Service', dealer: 'TATA Motors Lucknow', mileage: 105800 },
        ] },
        ownershipChain: { manufacturer: 'TATA Motors', manufacturingDate: '2020-04-15T00:00:00.000Z', manufacturingPlant: 'Pune Plant, Maharashtra', currentOwner: { name: 'Suresh Yadav', since: '2023-10-01' }, previousOwners: [
          { name: 'Rahul Gupta', from: '2020-05-01', to: '2021-12-15' },
          { name: 'Manoj Tiwari', from: '2022-01-01', to: '2023-09-20' },
        ] },
        performance: { motorType: 'ICE', maxPowerKw: 88, topSpeedKmh: 160 },
        emissions: { co2GPerKm: 135, euroStandard: 'Euro 6' },
        compliance: { safetyRatingNcap: 4, homologationStatus: 'Approved' },
        sustainability: { recyclabilityPercent: 72 },
        manufacturerCredential: mfgCredential,
      },
    },
    // 6. Brand new Punch EV — 0 owners, factory fresh — Premium Plus candidate
    {
      id: 'car-punch-ev-001',
      vin: 'TATA2025PUNCHEV001',
      make: 'TATA',
      model: 'Punch EV',
      variant: 'Empowered+ LR',
      year: 2025,
      price: 15500,
      status: 'available',
      dpp: {
        stateOfHealth: { batteryHealth: 100, batteryCapacity: '35 kWh', range: '421 km', overallRating: 9.9, mileageKm: 3, lastInspectionDate: '2025-03-10T10:00:00.000Z' },
        damageHistory: { hasDamage: false, totalIncidents: 0, incidents: [] },
        serviceHistory: { totalServiceRecords: 1, services: [{ date: '2025-03-10T10:00:00.000Z', type: 'Pre-delivery Inspection', dealer: 'TATA Motors Delhi', mileage: 3 }] },
        ownershipChain: { manufacturer: 'TATA Motors', manufacturingDate: '2025-02-20T00:00:00.000Z', manufacturingPlant: 'Sanand Plant, Gujarat', currentOwner: null, previousOwners: [] },
        performance: { motorType: 'BEV', maxPowerKw: 90, topSpeedKmh: 140 },
        emissions: { co2GPerKm: 0, energyLabel: 'A+++' },
        compliance: { euTypeApprovalNumber: 'e11*2025/0003*0001', safetyRatingNcap: 5, homologationStatus: 'Approved', roadworthyCertificateExpiry: '2027-03-10T00:00:00.000Z' },
        sustainability: { recyclabilityPercent: 88 },
        manufacturerCredential: mfgCredential,
      },
    },
    // 7. Older Safari — 4 owners, 158k km, 5 incidents (3 major), very poor — Basic/Manual Review (~20)
    {
      id: 'car-safari-002',
      vin: 'TATA2018SAFARI0002',
      make: 'TATA',
      model: 'Safari Storme',
      variant: 'VX 4x4',
      year: 2018,
      price: 8500,
      status: 'sold',
      ownerId: 'mario-sanchez',
      dpp: {
        stateOfHealth: { engineHealth: 42, overallRating: 3.8, mileageKm: 158400, lastInspectionDate: '2024-06-15T10:00:00.000Z' },
        damageHistory: { hasDamage: true, totalIncidents: 5, incidents: [
          { date: '2019-02-10', type: 'Front collision', severity: 'major', repaired: true, cost: 8500 },
          { date: '2020-05-22', type: 'Side panel damage', severity: 'minor', repaired: true, cost: 1200 },
          { date: '2021-09-15', type: 'Chassis damage — flood', severity: 'major', repaired: true, cost: 12000 },
          { date: '2022-12-01', type: 'Rear bumper hit', severity: 'minor', repaired: false, cost: 0 },
          { date: '2024-01-18', type: 'Engine overheating damage', severity: 'major', repaired: true, cost: 7800 },
        ] },
        serviceHistory: { totalServiceRecords: 5, services: [
          { date: '2018-12-01T10:00:00.000Z', type: 'First Service', dealer: 'TATA Motors Kolkata', mileage: 15000 },
          { date: '2019-12-01T10:00:00.000Z', type: 'Annual Service', dealer: 'TATA Motors Kolkata', mileage: 38000 },
          { date: '2021-01-01T10:00:00.000Z', type: 'Service', dealer: 'TATA Motors Patna', mileage: 72000 },
          { date: '2022-06-01T10:00:00.000Z', type: 'Service', dealer: 'TATA Motors Ranchi', mileage: 110000 },
          { date: '2024-06-15T10:00:00.000Z', type: 'Service', dealer: 'TATA Motors Kolkata', mileage: 158400 },
        ] },
        ownershipChain: { manufacturer: 'TATA Motors', manufacturingDate: '2018-06-01T00:00:00.000Z', manufacturingPlant: 'Pune Plant, Maharashtra', currentOwner: { name: 'Mario Sanchez', since: '2024-03-01' }, previousOwners: [
          { name: 'Arun Joshi', from: '2018-07-01', to: '2019-11-30' },
          { name: 'Prakash Das', from: '2020-01-01', to: '2021-08-15' },
          { name: 'Sanjay Mishra', from: '2021-09-01', to: '2024-02-20' },
        ] },
        performance: { motorType: 'ICE', maxPowerKw: 103, topSpeedKmh: 165 },
        emissions: { co2GPerKm: 195, euroStandard: 'Euro 5' },
        compliance: { safetyRatingNcap: 3, homologationStatus: 'Approved' },
        sustainability: { recyclabilityPercent: 65 },
        manufacturerCredential: mfgCredential,
      },
    },
    // 8. Mid-range EV — 1 owner, 28k km, 0 incidents, good battery — Premium (~72)
    {
      id: 'car-tiago-ev-001',
      vin: 'TATA2024TIAGOEV01',
      make: 'TATA',
      model: 'Tiago EV',
      variant: 'XZ+ Tech Lux',
      year: 2024,
      price: 12800,
      status: 'sold',
      ownerId: 'mario-sanchez',
      dpp: {
        stateOfHealth: { batteryHealth: 95, batteryCapacity: '24 kWh', range: '290 km', overallRating: 8.8, mileageKm: 28300, lastInspectionDate: '2025-02-20T10:00:00.000Z' },
        damageHistory: { hasDamage: false, totalIncidents: 0, incidents: [] },
        serviceHistory: { totalServiceRecords: 2, services: [
          { date: '2024-07-01T10:00:00.000Z', type: 'First Service', dealer: 'TATA Motors Ahmedabad', mileage: 10500 },
          { date: '2025-02-20T10:00:00.000Z', type: 'Annual Service', dealer: 'TATA Motors Ahmedabad', mileage: 28300 },
        ] },
        ownershipChain: { manufacturer: 'TATA Motors', manufacturingDate: '2024-01-10T00:00:00.000Z', manufacturingPlant: 'Sanand Plant, Gujarat', currentOwner: { name: 'Mario Sanchez', since: '2024-02-01' }, previousOwners: [] },
        performance: { motorType: 'BEV', maxPowerKw: 55, topSpeedKmh: 120 },
        emissions: { co2GPerKm: 0, energyLabel: 'A++' },
        compliance: { euTypeApprovalNumber: 'e11*2024/0020*0001', safetyRatingNcap: 4, homologationStatus: 'Approved', roadworthyCertificateExpiry: '2026-06-01T00:00:00.000Z' },
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
      id: 'org-cred-tata-001',
      companyId: 'company-tata-001',
      legalName: 'TATA Motors Limited',
      legalRegistrationNumber: { vatId: 'IN27AAACT2727Q1ZW', eoriNumber: 'IN987654321000', localId: 'L28920MH1945PLC004415', taxId: 'AAACT2727Q' },
      legalAddress: { streetAddress: 'Bombay House, 24 Homi Mody Street', locality: 'Mumbai', postalCode: '400001', countryCode: 'IN', countrySubdivisionCode: 'IN-MH' },
      headquartersAddress: { streetAddress: 'Bombay House, 24 Homi Mody Street', locality: 'Mumbai', postalCode: '400001', countryCode: 'IN', countrySubdivisionCode: 'IN-MH' },
      website: 'https://www.tatamotors.com',
      contactEmail: 'admin@tatamotors.com',
      did: 'did:web:participant.gxdch.io:tata-motors',
      validFrom: new Date('2024-01-15T09:00:00.000Z'),
      validUntil: new Date('2027-01-15T09:00:00.000Z'),
      verificationStatus: 'draft',
      verificationAttempts: [],
      issuedVCs: [],
    },
    {
      id: 'org-cred-digit-001',
      companyId: 'company-digit-001',
      legalName: 'Go Digit General Insurance Limited',
      legalRegistrationNumber: { vatId: 'IN29AADCG1234R1ZN', localId: 'U66000KA2016PTC126215', taxId: 'AADCG1234R' },
      legalAddress: { streetAddress: 'Embassy Tech Village, Outer Ring Road', locality: 'Bengaluru', postalCode: '560103', countryCode: 'IN', countrySubdivisionCode: 'IN-KA' },
      headquartersAddress: { streetAddress: 'Embassy Tech Village, Outer Ring Road', locality: 'Bengaluru', postalCode: '560103', countryCode: 'IN', countrySubdivisionCode: 'IN-KA' },
      website: 'https://www.godigit.com',
      contactEmail: 'admin@godigit.com',
      did: 'did:web:participant.gxdch.io:digit-insurance',
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
